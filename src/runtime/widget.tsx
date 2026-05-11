import { React, type AllWidgetProps, type DataSource, DataSourceComponent, DataSourceStatus } from 'jimu-core'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import type { Config } from '../config'
import { parseStructureFieldMap, validateFieldMapAgainstAvailableFields, type FeatureAttributeConfig } from './lib/field-map'
import { buildStructureHierarchyFromRecords, getExpandableNodeKeys, getNodePathKeysForFeatureUid, type StructureNode } from './lib/structure-model'
import { getAvailableFieldNamesFromDataSource, getLoadedRecordCountFromDataSource, getLoadedRecordsFromDataSource } from './lib/datasource-utils'
import {
  clearDataSourceSelection,
  escapeSqlValue,
  getLayerFieldName,
  getSelectedFeatureUidFromDataSource,
  isConfiguredFeatureLayerMatch,
  normaliseUrl,
  resolveFeatureUidFromHitResult,
  selectLoadedRecordByFeatureUid
} from './lib/selection-utils'
import {
  getFeatureAttributeStateKey,
  parseFeatureAttributeStateKey,
  queryBasicLinkedTableFeatureAttributes,
  type BasicLinkedTableRecord
} from './lib/feature-attributes'
import WidgetStatusPanel from './components/WidgetStatusPanel'
import FieldMapPanel from './components/FieldMapPanel'
import StructureTree from './components/StructureTree'

const { useEffect, useRef, useState } = React

const ACTIVE_FEATURE_DS_PAGE_SIZE = 2000

interface ActiveFeatureDataSourceQuery
{
  outFields: string[]
  pageSize: number
}

interface ViewEventHandle
{
  remove: () => void
}

interface HighlightHandle
{
  remove: () => void
}

const getFeatureUidsFromNodes = (nodes: StructureNode[]): string[] => {
  return nodes.flatMap((node) => {
    const currentFeatureUid = node.feature_uid ? [node.feature_uid] : []
    const childFeatureUids = getFeatureUidsFromNodes(node.children)

    return [...currentFeatureUid, ...childFeatureUids]
  })
}

const Widget = (props: AllWidgetProps<Config>) => {
  const [activeFeatureDs, setActiveFeatureDs] = useState<DataSource | null>(null)
  const [jimuMapView, setJimuMapView] = useState<JimuMapView | null>(null)
  const [isLoadingFeatures, setIsLoadingFeatures] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [recordCount, setRecordCount] = useState(0)
  const [availableFieldNames, setAvailableFieldNames] = useState<string[]>([])
  const [structureHierarchy, setStructureHierarchy] = useState<StructureNode[]>([])
  const [expandedNodeKeys, setExpandedNodeKeys] = useState<string[]>([])
  const [selectedFeatureUid, setSelectedFeatureUid] = useState('')
  const [selectionError, setSelectionError] = useState('')
  const [expandedFeatureAttributeKeys, setExpandedFeatureAttributeKeys] = useState<string[]>([])
  const [loadingFeatureAttributeKeys, setLoadingFeatureAttributeKeys] = useState<{ [key: string]: boolean }>({})
  const [featureAttributeRecords, setFeatureAttributeRecords] = useState<{ [key: string]: BasicLinkedTableRecord[] }>({})
  const [featureAttributeErrors, setFeatureAttributeErrors] = useState<{ [key: string]: string }>({})

  const highlightHandleRef = useRef<HighlightHandle | null>(null)
  const mapClickHandleRef = useRef<ViewEventHandle | null>(null)
  const featureRowRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const lastAutoScrolledFeatureUidRef = useRef('')
  const featureAttributeRequestIdRef = useRef(0)
  const findMatchingJimuLayerViewRef = useRef<() => any | null>(() => null)
  const selectFeatureRef = useRef<(feature_uid: string) => void>(() => {})
  const clearSelectedFeatureRef = useRef<() => void>(() => {})

  const fieldMapParseResult = parseStructureFieldMap(props.config?.fieldMapJson)
  const structureFieldMap = fieldMapParseResult.fieldMap

  const fieldValidationResult = structureFieldMap
    ? validateFieldMapAgainstAvailableFields(structureFieldMap, availableFieldNames)
    : null

  const dataSourceQuery: ActiveFeatureDataSourceQuery = {
    outFields: ['*'],
    pageSize: ACTIVE_FEATURE_DS_PAGE_SIZE
  }

  const getConfiguredDataSourceId = (): string => {
    return String(
      (props.useDataSources &&
        props.useDataSources[0] &&
        (props.useDataSources[0] as any).dataSourceId) ||
      (activeFeatureDs as any)?.id ||
      ''
    )
  }

  const getConfiguredDataSourceUrl = (): string => {
    const dataSourceJson = activeFeatureDs && activeFeatureDs.getDataSourceJson
      ? activeFeatureDs.getDataSourceJson() as any
      : null

    return normaliseUrl(dataSourceJson?.url)
  }

  const getConfiguredDataSourceLabel = (): string => {
    if (!activeFeatureDs || !activeFeatureDs.getLabel)
    {
      return ''
    }

    return activeFeatureDs.getLabel()
  }

  const isConfiguredLayerMatch = (layerLike: any, dataSourceId?: string): boolean => {
    return isConfiguredFeatureLayerMatch(
      layerLike,
      dataSourceId || getConfiguredDataSourceId(),
      getConfiguredDataSourceUrl(),
      getConfiguredDataSourceLabel()
    )
  }

  const clearMapHighlight = () => {
    if (highlightHandleRef.current)
    {
      highlightHandleRef.current.remove()
      highlightHandleRef.current = null
    }
  }

  const clearMapClickHandle = () => {
    if (mapClickHandleRef.current)
    {
      mapClickHandleRef.current.remove()
      mapClickHandleRef.current = null
    }
  }

  const clearMapViewSelectionState = () => {
    const jsApiMapView = jimuMapView?.view as any
    const popup = jsApiMapView?.popup

    if (popup)
    {
      if (typeof popup.clear === 'function')
      {
        popup.clear()
      }

      if (typeof popup.close === 'function')
      {
        popup.close()
      }
    }

    if (jsApiMapView && typeof jsApiMapView.closePopup === 'function')
    {
      jsApiMapView.closePopup()
    }
  }

  const clearFeatureDataSourceSelection = () => {
    if (activeFeatureDs)
    {
      clearDataSourceSelection(activeFeatureDs)
    }

    const matchingJimuLayerView = findMatchingJimuLayerViewRef.current()
    const layerDataSource = matchingJimuLayerView?.layerDataSource || matchingJimuLayerView?.dataSource

    if (layerDataSource && typeof layerDataSource.clearSelection === 'function')
    {
      layerDataSource.clearSelection()
    }
  }

  const findMatchingJimuLayerView = (): any | null => {
    if (!jimuMapView || !activeFeatureDs)
    {
      return null
    }

    const dataSourceId = getConfiguredDataSourceId()

    if (dataSourceId === '')
    {
      return null
    }

    const layerViewEntries = Object.values((jimuMapView as any).jimuLayerViews || {})

    return layerViewEntries.find((entry: any) => {
      return isConfiguredLayerMatch(entry, dataSourceId)
    }) || null
  }

  const openFeatureInTree = (feature_uid: string) => {
    const nodePathKeys = getNodePathKeysForFeatureUid(structureHierarchy, feature_uid)

    if (nodePathKeys.length === 0)
    {
      return
    }

    setExpandedNodeKeys((previous) => {
      const mergedKeys = new Set([...previous, ...nodePathKeys])

      return Array.from(mergedKeys)
    })
  }

  const toggleNode = (nodeKey: string) => {
    setExpandedNodeKeys((previous) => {
      if (previous.includes(nodeKey))
      {
        return previous.filter((value) => value !== nodeKey)
      }

      return [...previous, nodeKey]
    })
  }

  const expandAll = () => {
    setExpandedNodeKeys(getExpandableNodeKeys(structureHierarchy))
  }

  const collapseAll = () => {
    setExpandedNodeKeys([])
  }

  const toggleFeatureAttribute = (feature_uid: string, featureAttribute: FeatureAttributeConfig) => {
    const stateKey = getFeatureAttributeStateKey(feature_uid, featureAttribute.key)

    setExpandedFeatureAttributeKeys((previous) => {
      if (previous.includes(stateKey))
      {
        return previous.filter((key) => key !== stateKey)
      }

      return [...previous, stateKey]
    })
  }

  const updateAvailableFieldNamesFromDataSource = (dataSource: DataSource): string[] => {
    const fieldNames = getAvailableFieldNamesFromDataSource(dataSource)

    setAvailableFieldNames(fieldNames)

    return fieldNames
  }

  const refreshRecordCountFromDataSource = (dataSource: DataSource) => {
    setRecordCount(getLoadedRecordCountFromDataSource(dataSource))
  }

  const refreshStructureHierarchyFromDataSource = (dataSource: DataSource, fieldNames: string[]) => {
    if (!structureFieldMap)
    {
      setStructureHierarchy([])
      return
    }

    const validationResult = validateFieldMapAgainstAvailableFields(structureFieldMap, fieldNames)

    if (!validationResult.isValid)
    {
      setStructureHierarchy([])
      return
    }

    const records = getLoadedRecordsFromDataSource(dataSource)
    const hierarchy = buildStructureHierarchyFromRecords(records, structureFieldMap)
    const availableExpandableNodeKeys = new Set(getExpandableNodeKeys(hierarchy))
    const availableFeatureUids = new Set(getFeatureUidsFromNodes(hierarchy))

    setStructureHierarchy(hierarchy)

    setExpandedNodeKeys((previous) => {
      return previous.filter((nodeKey) => availableExpandableNodeKeys.has(nodeKey))
    })

    setExpandedFeatureAttributeKeys((previous) => {
      return previous.filter((stateKey) => {
        const parsedStateKey = parseFeatureAttributeStateKey(stateKey)

        return availableFeatureUids.has(parsedStateKey.feature_uid)
      })
    })
  }

  const selectFeatureRecordInDataSource = (feature_uid: string) => {
    if (!activeFeatureDs || !structureFieldMap || feature_uid === '')
    {
      return
    }

    const result = selectLoadedRecordByFeatureUid(
      activeFeatureDs,
      structureFieldMap.identityFields.feature_uid.fieldName,
      feature_uid
    )

    if (result.errorMessage !== '')
    {
      setSelectionError(result.errorMessage)
    }
  }

  const syncSelectedFeatureUidFromDataSource = (dataSource: DataSource | null) => {
    if (!dataSource || !structureFieldMap)
    {
      return
    }

    const selectedFeatureUidFromDataSource = getSelectedFeatureUidFromDataSource(
      dataSource,
      structureFieldMap.identityFields.feature_uid.fieldName
    )

    if (selectedFeatureUidFromDataSource === '')
    {
      return
    }

    openFeatureInTree(selectedFeatureUidFromDataSource)
    setSelectedFeatureUid(selectedFeatureUidFromDataSource)
    setSelectionError('')
  }

  const syncMapToFeature = async (feature_uid: string) => {
    if (!jimuMapView || !activeFeatureDs || !structureFieldMap || feature_uid === '')
    {
      return
    }

    clearFeatureDataSourceSelection()
    clearMapHighlight()
    clearMapViewSelectionState()

    try
    {
      const jsApiMapView = jimuMapView.view as any
      const matchingJimuLayerView = findMatchingJimuLayerView()
      const jsApiLayerView = matchingJimuLayerView?.view
      const jsApiLayer = matchingJimuLayerView?.layer || jsApiLayerView?.layer

      if (!jsApiMapView || !jsApiLayerView || !jsApiLayer)
      {
        return
      }

      const requestedFeatureUidFieldName = structureFieldMap.identityFields.feature_uid.fieldName
      const featureUidFieldName = getLayerFieldName(jsApiLayer, requestedFeatureUidFieldName)

      const query = jsApiLayer.createQuery()
      query.where = `${featureUidFieldName} = '${escapeSqlValue(feature_uid)}'`
      query.outFields = ['*']
      query.returnGeometry = true

      const featureSet = await jsApiLayer.queryFeatures(query)
      const features = featureSet?.features || []

      if (features.length === 0)
      {
        return
      }

      if (typeof jsApiLayerView.highlight === 'function')
      {
        highlightHandleRef.current = jsApiLayerView.highlight(features)
      }

      if (typeof jsApiMapView.goTo === 'function')
      {
        await jsApiMapView.goTo(features)
      }

      if (jsApiMapView?.popup && typeof jsApiMapView.popup.close === 'function')
      {
        jsApiMapView.popup.close()
      }

      if (jsApiMapView && typeof jsApiMapView.closePopup === 'function')
      {
        jsApiMapView.closePopup()
      }
    }
    catch (error)
    {
      console.warn('Failed to highlight selected feature on map', error)
    }
  }

  const selectFeature = (feature_uid: string) => {
    openFeatureInTree(feature_uid)
    clearFeatureDataSourceSelection()
    selectFeatureRecordInDataSource(feature_uid)

    if (selectedFeatureUid === feature_uid)
    {
      void syncMapToFeature(feature_uid)
      return
    }

    setSelectedFeatureUid(feature_uid)
    setSelectionError('')
  }

  const clearSelectedFeature = () => {
    clearMapHighlight()
    clearFeatureDataSourceSelection()
    clearMapViewSelectionState()
    setSelectedFeatureUid('')
    setSelectionError('')
  }

  findMatchingJimuLayerViewRef.current = findMatchingJimuLayerView
  selectFeatureRef.current = selectFeature
  clearSelectedFeatureRef.current = clearSelectedFeature

  const handleFeatureClick = (node: StructureNode) => {
    if (!node.feature_uid)
    {
      return
    }

    selectFeature(node.feature_uid)
  }

  useEffect(() => {
    if (selectedFeatureUid === '')
    {
      clearMapHighlight()
      lastAutoScrolledFeatureUidRef.current = ''
      return
    }

    void syncMapToFeature(selectedFeatureUid)
  }, [selectedFeatureUid, jimuMapView, activeFeatureDs])

  useEffect(() => {
    if (selectedFeatureUid === '')
    {
      lastAutoScrolledFeatureUidRef.current = ''
      return
    }

    if (lastAutoScrolledFeatureUidRef.current === selectedFeatureUid)
    {
      return
    }

    const selectedRow = featureRowRefs.current[selectedFeatureUid]

    if (selectedRow && typeof selectedRow.scrollIntoView === 'function')
    {
      selectedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      lastAutoScrolledFeatureUidRef.current = selectedFeatureUid
    }
  }, [selectedFeatureUid, expandedNodeKeys])

  useEffect(() => {
    const featureAttributes = structureFieldMap?.featureAttributes || []

    if (featureAttributes.length === 0)
    {
      return
    }

    const featureAttributeByKey = new Map(
      featureAttributes.map((featureAttribute) => [featureAttribute.key, featureAttribute])
    )

    const stateKeysToLoad = expandedFeatureAttributeKeys.filter((stateKey) => {
      const parsedStateKey = parseFeatureAttributeStateKey(stateKey)

      return (
        parsedStateKey.feature_uid !== '' &&
        featureAttributeByKey.has(parsedStateKey.featureAttributeKey) &&
        featureAttributeRecords[stateKey] === undefined &&
        !loadingFeatureAttributeKeys[stateKey]
      )
    })

    if (stateKeysToLoad.length === 0)
    {
      return
    }

    const requestId = featureAttributeRequestIdRef.current + 1
    featureAttributeRequestIdRef.current = requestId

    setLoadingFeatureAttributeKeys((previous) => {
      const next = { ...previous }

      stateKeysToLoad.forEach((stateKey) => {
        next[stateKey] = true
      })

      return next
    })

    const loadFeatureAttributes = async () => {
      const settledResults = await Promise.allSettled(
        stateKeysToLoad.map(async (stateKey) => {
          const parsedStateKey = parseFeatureAttributeStateKey(stateKey)
          const featureAttribute = featureAttributeByKey.get(parsedStateKey.featureAttributeKey)

          if (!featureAttribute)
          {
            return {
              stateKey,
              result: {
                ok: false,
                data: [],
                errorMessage: 'Feature attribute configuration was not found.'
              }
            }
          }

          const result = await queryBasicLinkedTableFeatureAttributes(featureAttribute, parsedStateKey.feature_uid)

          return {
            stateKey,
            result
          }
        })
      )

      if (featureAttributeRequestIdRef.current !== requestId)
      {
        return
      }

      setFeatureAttributeRecords((previous) => {
        const next = { ...previous }

        settledResults.forEach((settledResult, index) => {
          const stateKey = stateKeysToLoad[index]

          if (settledResult.status !== 'fulfilled')
          {
            next[stateKey] = []
            return
          }

          if (settledResult.value.result.ok)
          {
            next[stateKey] = settledResult.value.result.data
          }
        })

        return next
      })

      setFeatureAttributeErrors((previous) => {
        const next = { ...previous }

        settledResults.forEach((settledResult, index) => {
          const stateKey = stateKeysToLoad[index]

          if (settledResult.status !== 'fulfilled')
          {
            next[stateKey] = 'Failed to load feature attributes.'
            return
          }

          next[stateKey] = settledResult.value.result.ok
            ? ''
            : settledResult.value.result.errorMessage
        })

        return next
      })

      setLoadingFeatureAttributeKeys((previous) => {
        const next = { ...previous }

        stateKeysToLoad.forEach((stateKey) => {
          next[stateKey] = false
        })

        return next
      })
    }

    void loadFeatureAttributes()
  }, [expandedFeatureAttributeKeys, structureFieldMap, featureAttributeRecords, loadingFeatureAttributeKeys])

  useEffect(() => {
    clearMapClickHandle()

    const jsApiMapView = jimuMapView?.view as any
    const matchingJimuLayerView = findMatchingJimuLayerViewRef.current()
    const targetLayer = matchingJimuLayerView?.layer || matchingJimuLayerView?.view?.layer

    if (!jsApiMapView || typeof jsApiMapView.on !== 'function')
    {
      return
    }

    mapClickHandleRef.current = jsApiMapView.on('click', async (event: any) => {
      try
      {
        if (typeof jsApiMapView.hitTest !== 'function')
        {
          return
        }

        const hitTestResult = await jsApiMapView.hitTest(event)
        const results = Array.isArray(hitTestResult?.results) ? hitTestResult.results : []

        let matchingResult: any = null

        for (const result of results)
        {
          const resultGraphic = (result as any)?.graphic
          const resultLayer = resultGraphic?.layer
          const resultFeatureUid = structureFieldMap
            ? await resolveFeatureUidFromHitResult(result, structureFieldMap.identityFields.feature_uid.fieldName)
            : ''

          if (
            resultFeatureUid !== '' &&
            (
              (
                targetLayer &&
                (
                  resultLayer === targetLayer ||
                  isConfiguredLayerMatch(resultLayer) ||
                  isConfiguredLayerMatch(resultGraphic) ||
                  String(resultLayer?.url || '').toLowerCase() === String(targetLayer?.url || '').toLowerCase() ||
                  String(resultLayer?.title || '').toLowerCase() === String(targetLayer?.title || '').toLowerCase()
                )
              ) ||
              (
                !targetLayer &&
                isConfiguredLayerMatch(resultLayer)
              )
            )
          )
          {
            matchingResult = {
              result,
              feature_uid: resultFeatureUid
            }

            break
          }
        }

        const feature_uid = matchingResult?.feature_uid || ''

        if (feature_uid !== '')
        {
          selectFeatureRef.current(feature_uid)
          return
        }

        clearSelectedFeatureRef.current()
      }
      catch (error)
      {
        console.warn('Failed to sync selected map feature back to TransactionDataSetTreeExplorer', error)
      }
    })

    return () => {
      clearMapClickHandle()
    }
  }, [jimuMapView, activeFeatureDs, props.config?.fieldMapJson])

  useEffect(() => {
    return () => {
      clearMapClickHandle()
      clearMapHighlight()
    }
  }, [])

  if (!props.useDataSources || props.useDataSources.length < 1)
  {
    return (
      <div className="p-3">
        <h3>Active Feature Explorer</h3>
        <p>Select the Active Feature Class data source in widget settings.</p>
      </div>
    )
  }

  return (
    <div
      className="p-3"
      style={{
        height: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box'
      }}
    >
      <DataSourceComponent
        useDataSource={props.useDataSources[0]}
        query={dataSourceQuery}
        widgetId={props.id}
        onDataSourceCreated={(dataSource: DataSource) => {
          setActiveFeatureDs(dataSource)
          setLoadError('')

          const fieldNames = updateAvailableFieldNamesFromDataSource(dataSource)

          refreshRecordCountFromDataSource(dataSource)
          refreshStructureHierarchyFromDataSource(dataSource, fieldNames)
          syncSelectedFeatureUidFromDataSource(dataSource)
        }}
        onDataSourceInfoChange={() => {
          if (activeFeatureDs)
          {
            const fieldNames = updateAvailableFieldNamesFromDataSource(activeFeatureDs)

            refreshRecordCountFromDataSource(activeFeatureDs)
            refreshStructureHierarchyFromDataSource(activeFeatureDs, fieldNames)
            syncSelectedFeatureUidFromDataSource(activeFeatureDs)
          }
        }}
        onSelectionChange={() => {
          if (activeFeatureDs)
          {
            syncSelectedFeatureUidFromDataSource(activeFeatureDs)
          }
        }}
        onDataSourceStatusChange={(status) => {
          setIsLoadingFeatures(status === DataSourceStatus.Loading)
        }}
        onCreateDataSourceFailed={(error) => {
          setLoadError(error?.message || 'Failed to connect to the Active Feature Class.')
          setRecordCount(0)
          setAvailableFieldNames([])
          setStructureHierarchy([])
          setExpandedNodeKeys([])
          setExpandedFeatureAttributeKeys([])
          setLoadingFeatureAttributeKeys({})
          setFeatureAttributeRecords({})
          setFeatureAttributeErrors({})
          setSelectedFeatureUid('')
          setSelectionError('')
          setIsLoadingFeatures(false)
        }}
      >
        {() => null}
      </DataSourceComponent>

      {props.useMapWidgetIds && props.useMapWidgetIds.length > 0 && (
        <JimuMapViewComponent
          useMapWidgetId={props.useMapWidgetIds[0]}
          onActiveViewChange={(view) => {
            setJimuMapView(view)
          }}
        />
      )}

      <h3>Active Feature Explorer</h3>

      <WidgetStatusPanel
        isDatasourceConnected={!!activeFeatureDs}
        isMapConnected={!!jimuMapView}
        isLoadingFeatures={isLoadingFeatures}
        loadError={loadError}
        recordCount={recordCount}
      />

      <FieldMapPanel
        fieldMapParseResult={fieldMapParseResult}
        fieldValidationResult={fieldValidationResult}
        availableFieldNames={availableFieldNames}
      />

      {selectionError !== '' && (
        <p style={{ color: '#c62828' }}>{selectionError}</p>
      )}

      {fieldValidationResult && fieldValidationResult.isValid && structureFieldMap && (
        <StructureTree
          structureHierarchy={structureHierarchy}
          structureFieldMap={structureFieldMap}
          selectedFeatureUid={selectedFeatureUid}
          expandedNodeKeys={expandedNodeKeys}
          expandedFeatureAttributeKeys={expandedFeatureAttributeKeys}
          loadingFeatureAttributeKeys={loadingFeatureAttributeKeys}
          featureAttributeRecords={featureAttributeRecords}
          featureAttributeErrors={featureAttributeErrors}
          onToggleNode={toggleNode}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          onFeatureClick={handleFeatureClick}
          onFeatureRowRef={(feature_uid, element) => {
            featureRowRefs.current[feature_uid] = element
          }}
          onToggleFeatureAttribute={toggleFeatureAttribute}
        />
      )}
    </div>
  )
}

export default Widget
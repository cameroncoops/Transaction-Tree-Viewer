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
import StructureTree from './components/StructureTree'

const { useEffect, useRef, useState } = React

const ACTIVE_FEATURE_DS_PAGE_SIZE = 2000
const ACCENT_COLOR = '#007ac2'

const PAGE_STYLE = {
  height: '100%',
  overflowY: 'auto' as const,
  boxSizing: 'border-box' as const,
  background: '#ffffff'
}

const CONTENT_STYLE = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.45rem',
  padding: '0.55rem'
}

const HEADER_STYLE = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '0.45rem',
  marginBottom: '0.35rem'
}

const HEADER_TITLE_STYLE = {
  margin: 0,
  fontSize: '1.15rem',
  fontWeight: 700,
  lineHeight: 1.2,
  color: '#202020'
}

const HEADER_SUBTITLE_STYLE = {
  color: '#999999',
  fontSize: '0.78rem'
}

const FILTER_ROW_STYLE = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: '0.45rem',
  alignItems: 'center',
  marginBottom: '0.35rem'
}

const FILTER_PLACEHOLDER_STYLE = {
  minWidth: '8.5rem',
  maxWidth: '11rem',
  padding: '0.45rem 0.6rem',
  border: '1px solid #d0d0d0',
  borderRadius: '3px',
  backgroundColor: '#f7f7f7',
  color: '#8a8a8a',
  fontSize: '0.82rem'
}

const ACTION_ROW_STYLE = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  alignItems: 'center',
  gap: '0.35rem',
  marginBottom: '0.25rem',
  color: '#777777',
  fontSize: '0.86rem'
}

const LINK_BUTTON_STYLE = {
  background: 'none',
  border: 'none',
  color: ACCENT_COLOR,
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: 0,
  fontSize: '0.86rem'
}

const ISOLATE_HEADER_STYLE = {
  display: 'grid',
  gridTemplateColumns: '3.25rem 1fr',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.25rem 0',
  borderBottom: '1px solid #e2e2e2',
  color: '#666666',
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const
}

const MESSAGE_PANEL_STYLE = {
  padding: '0.5rem 0.6rem',
  border: '1px solid #f0c8c8',
  backgroundColor: '#fff5f5',
  color: '#a12626',
  fontSize: '0.85rem'
}

const EMPTY_STATE_STYLE = {
  padding: '0.5rem',
  color: '#666666',
  fontSize: '0.9rem'
}

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
  const [isolatedTopLevelValues, setIsolatedTopLevelValues] = useState<string[]>([])
  const [expandedNodeKeys, setExpandedNodeKeys] = useState<string[]>([])
  const [selectedFeatureUid, setSelectedFeatureUid] = useState('')
  const [selectionError, setSelectionError] = useState('')
  const [expandedFeatureAttributeKeys, setExpandedFeatureAttributeKeys] = useState<string[]>([])
  const [loadingFeatureAttributeKeys, setLoadingFeatureAttributeKeys] = useState<{ [key: string]: boolean }>({})
  const [featureAttributeRecords, setFeatureAttributeRecords] = useState<{ [key: string]: BasicLinkedTableRecord[] }>({})
  const [featureAttributeErrors, setFeatureAttributeErrors] = useState<{ [key: string]: string }>({})

  const highlightHandleRef = useRef<HighlightHandle | null>(null)
  const mapClickHandleRef = useRef<ViewEventHandle | null>(null)
  const activeIsolateLayerViewRef = useRef<any | null>(null)
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

  const toggleTopLevelIsolation = (topLevelValue: string) => {
    setIsolatedTopLevelValues((previous) => {
      if (previous.includes(topLevelValue))
      {
        return previous.filter((value) => value !== topLevelValue)
      }

      return [...previous, topLevelValue]
    })
  }

  const clearIsolation = () => {
    setIsolatedTopLevelValues([])
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
    const previousIsolateLayerView = activeIsolateLayerViewRef.current

    if (previousIsolateLayerView)
    {
      try
      {
        previousIsolateLayerView.filter = null
      }
      catch (error)
      {
        console.warn('Failed to clear previous isolate filter', error)
      }

      activeIsolateLayerViewRef.current = null
    }

    if (!jimuMapView || !structureFieldMap || isolatedTopLevelValues.length === 0)
    {
      return
    }

    const topLevelField = structureFieldMap.hierarchyFields[0]

    if (!topLevelField)
    {
      return
    }

    const matchingJimuLayerView = findMatchingJimuLayerViewRef.current()
    const jsApiLayerView = matchingJimuLayerView?.view
    const jsApiLayer = matchingJimuLayerView?.layer || jsApiLayerView?.layer

    if (!jsApiLayerView || !jsApiLayer)
    {
      return
    }

    const requestedTopLevelFieldName = topLevelField.fieldName
    const topLevelFieldName = getLayerFieldName(jsApiLayer, requestedTopLevelFieldName)
    const escapedValues = isolatedTopLevelValues.map((value) => {
      return `'${escapeSqlValue(value)}'`
    })

    try
    {
      jsApiLayerView.filter = {
        where: `${topLevelFieldName} IN (${escapedValues.join(', ')})`
      }

      activeIsolateLayerViewRef.current = jsApiLayerView
    }
    catch (error)
    {
      console.warn('Failed to apply isolate filter', error)
    }
  }, [isolatedTopLevelValues, jimuMapView, activeFeatureDs, props.config?.fieldMapJson])

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

      if (activeIsolateLayerViewRef.current)
      {
        try
        {
          activeIsolateLayerViewRef.current.filter = null
        }
        catch (error)
        {
          console.warn('Failed to clear isolate filter during cleanup', error)
        }

        activeIsolateLayerViewRef.current = null
      }
    }
  }, [])

  if (!props.useDataSources || props.useDataSources.length < 1)
  {
    return (
      <div style={PAGE_STYLE}>
        <div style={CONTENT_STYLE}>
          <div style={HEADER_STYLE}>
            <h3 style={HEADER_TITLE_STYLE}>Transaction Tree Viewer</h3>
          </div>
          <div style={EMPTY_STATE_STYLE}>Select the Active Feature Class data source in widget settings.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={PAGE_STYLE}>
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
          setIsolatedTopLevelValues([])
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

      <div style={CONTENT_STYLE}>
        <div style={HEADER_STYLE}>
          <h3 style={HEADER_TITLE_STYLE}>Transaction Tree Viewer</h3>
          <span style={HEADER_SUBTITLE_STYLE}>
            {isLoadingFeatures ? 'Loading...' : `${recordCount.toLocaleString()} records`}
          </span>
        </div>

        <div style={FILTER_ROW_STYLE} aria-disabled="true">
          <div style={FILTER_PLACEHOLDER_STYLE}>Search coming soon</div>
          <div style={FILTER_PLACEHOLDER_STYLE}>Building / Zone</div>
          <div style={FILTER_PLACEHOLDER_STYLE}>Level</div>
          <div style={FILTER_PLACEHOLDER_STYLE}>Type / Status</div>
        </div>

        <div style={ACTION_ROW_STYLE}>
          <button
            type="button"
            onClick={clearIsolation}
            disabled={isolatedTopLevelValues.length === 0}
            style={{
              ...LINK_BUTTON_STYLE,
              color: isolatedTopLevelValues.length === 0 ? '#888888' : ACCENT_COLOR,
              cursor: isolatedTopLevelValues.length === 0 ? 'not-allowed' : 'pointer',
              textDecoration: isolatedTopLevelValues.length === 0 ? 'none' : 'underline'
            }}
          >
            Clear Isolate
          </button>
          <span>|</span>
          <button
            type="button"
            onClick={clearSelectedFeature}
            style={LINK_BUTTON_STYLE}
          >
            Clear Selection
          </button>
          <span>|</span>
          <button
            type="button"
            onClick={collapseAll}
            style={LINK_BUTTON_STYLE}
          >
            Collapse All
          </button>
          <span>|</span>
          <button
            type="button"
            onClick={expandAll}
            style={LINK_BUTTON_STYLE}
          >
            Expand All
          </button>
        </div>

        <div style={ISOLATE_HEADER_STYLE}>
          <span>Isolate</span>
          <span>Structure</span>
        </div>

        {loadError !== '' && (
          <div style={MESSAGE_PANEL_STYLE}>{loadError}</div>
        )}

        {selectionError !== '' && (
          <div style={MESSAGE_PANEL_STYLE}>{selectionError}</div>
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
            isolatedTopLevelValues={isolatedTopLevelValues}
            onToggleTopLevelIsolation={toggleTopLevelIsolation}
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
    </div>
  )
}

export default Widget

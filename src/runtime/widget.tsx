import {
  React,
  type AllWidgetProps,
  type DataSource,
  DataSourceComponent,
  DataSourceStatus,
} from 'jimu-core'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import type { Config } from '../config'
import {
  parseStructureFieldMap,
  validateFieldMapAgainstAvailableFields,
  type FeatureAttributeConfig,
  type StructureFieldMap,
} from './lib/field-map'
import {
  buildStructureHierarchyFromRecords,
  getExpandableNodeKeys,
  getNodePathKeysForFeatureUid,
  type StructureNode,
} from './lib/structure-model'
import {
  getAvailableFieldNamesFromDataSource,
  getLoadedRecordCountFromDataSource,
  getLoadedRecordsFromDataSource,
} from './lib/datasource-utils'
import {
  clearDataSourceSelection,
  escapeSqlValue,
  getLayerFieldName,
  getRecordStringValue,
  getSelectedFeatureUidFromDataSource,
  isConfiguredFeatureLayerMatch,
  normaliseUrl,
  resolveFeatureUidFromHitResult,
  selectLoadedRecordByFeatureUid,
} from './lib/selection-utils'
import {
  getFeatureAttributeStateKey,
  parseFeatureAttributeStateKey,
  queryBasicLinkedTableFeatureAttributes,
  type BasicLinkedTableRecord,
} from './lib/feature-attributes'
import StructureTree from './components/StructureTree'

const { useEffect, useRef, useState } = React

const ACTIVE_FEATURE_DS_PAGE_SIZE = 2000
const ACCENT_COLOR = '#007ac2'

const PAGE_STYLE = {
  height: '100%',
  overflowY: 'auto' as const,
  boxSizing: 'border-box' as const,
  background: '#f6faf7',
  padding: '0.6rem',
}

const CONTENT_STYLE = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.85rem',
  padding: '1.15rem',
  border: '1px solid #d7e5d8',
  borderRadius: '14px',
  backgroundColor: '#ffffff',
  boxShadow: '0 8px 22px rgba(25, 60, 35, 0.08)',
  boxSizing: 'border-box' as const,
}

const HEADER_STYLE = {
  display: 'block',
  paddingBottom: '0.85rem',
  borderBottom: '1px solid #dfe7df',
}

const HEADER_TITLE_STYLE = {
  margin: 0,
  fontSize: '1.45rem',
  fontWeight: 700,
  lineHeight: 1.2,
  color: '#203028',
}

const HEADER_SUBTITLE_STYLE = {
  display: 'block',
  marginTop: '0.25rem',
  color: '#6d766f',
  fontSize: '0.95rem',
  lineHeight: 1.35,
}

const FILTER_ROW_STYLE = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: '1rem',
  alignItems: 'flex-end',
  paddingBottom: '0.9rem',
  borderBottom: '1px solid #dfe7df',
}

const FILTER_GROUP_STYLE = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.35rem',
  minWidth: '12rem',
}

const FILTER_LABEL_STYLE = {
  fontSize: '0.92rem',
  fontWeight: 700,
  lineHeight: 1.2,
  color: '#24352b',
}

const FILTER_INPUT_ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.45rem',
}

const FILTER_COMBO_STYLE = {
  position: 'relative' as const,
  minWidth: '10.5rem',
  maxWidth: '15rem',
}

const FILTER_INPUT_STYLE = {
  width: '100%',
  padding: '0.52rem 0.6rem',
  border: '1px solid #c7d4c8',
  borderRadius: '6px',
  backgroundColor: '#ffffff',
  color: '#333333',
  fontSize: '0.9rem',
  lineHeight: 1.3,
  boxSizing: 'border-box' as const,
}

const FILTER_OPTIONS_STYLE = {
  position: 'absolute' as const,
  zIndex: 10,
  top: 'calc(100% + 2px)',
  left: 0,
  right: 0,
  maxHeight: '12rem',
  overflowY: 'auto' as const,
  margin: 0,
  padding: '0.15rem 0',
  border: '1px solid #c8c8c8',
  borderRadius: '3px',
  backgroundColor: '#ffffff',
  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
  listStyle: 'none' as const,
}

const FILTER_OPTION_BUTTON_STYLE = {
  width: '100%',
  display: 'block',
  padding: '0.25rem 0.4rem',
  border: 'none',
  background: 'none',
  color: '#333333',
  cursor: 'pointer',
  textAlign: 'left' as const,
  fontSize: '0.78rem',
  lineHeight: 1.3,
}

const FILTER_EMPTY_OPTION_STYLE = {
  padding: '0.25rem 0.4rem',
  color: '#777777',
  fontSize: '0.78rem',
  lineHeight: 1.3,
}

const FILTER_CLEAR_BUTTON_STYLE = {
  background: 'none',
  border: 'none',
  color: '#2f6f37',
  textDecoration: 'none',
  cursor: 'pointer',
  padding: 0,
  fontSize: '0.9rem',
}

const ACTION_ROW_STYLE = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  alignItems: 'center',
  gap: '0.65rem',
  color: '#8a8a8a',
  fontSize: '0.95rem',
}

const LINK_BUTTON_STYLE = {
  background: 'none',
  border: 'none',
  color: '#2f6f37',
  textDecoration: 'none',
  cursor: 'pointer',
  padding: 0,
  fontSize: '0.95rem',
}

const TREE_PANEL_STYLE = {
  border: '1px solid #dfe7df',
  borderRadius: '8px',
  overflow: 'hidden',
  backgroundColor: '#ffffff',
}

const ISOLATE_HEADER_STYLE = {
  display: 'grid',
  gridTemplateColumns: '5.5rem 1fr',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.65rem 0.85rem',
  borderBottom: '1px solid #dfe7df',
  color: '#666666',
  fontSize: '0.78rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  backgroundColor: '#fbfdfb',
}

const MESSAGE_PANEL_STYLE = {
  padding: '0.5rem 0.6rem',
  border: '1px solid #f0c8c8',
  backgroundColor: '#fff5f5',
  color: '#a12626',
  fontSize: '0.85rem',
}

const EMPTY_STATE_STYLE = {
  padding: '0.5rem',
  color: '#666666',
  fontSize: '0.9rem',
}

interface ActiveFeatureDataSourceQuery {
  outFields: string[]
  pageSize: number
}

interface ConfiguredFilterField {
  id: string
  label: string
  fieldName: string
}

interface ViewEventHandle {
  remove: () => void
}

interface HighlightHandle {
  remove: () => void
}

const getFeatureUidsFromNodes = (nodes: StructureNode[]): string[] => {
  return nodes.flatMap((node) => {
    const currentFeatureUid = node.feature_uid ? [node.feature_uid] : []
    const childFeatureUids = getFeatureUidsFromNodes(node.children)

    return [...currentFeatureUid, ...childFeatureUids]
  })
}

const getFilteredHierarchyFields = (
  fieldMap: StructureFieldMap,
): ConfiguredFilterField[] => {
  const filters: ConfiguredFilterField[] = []
  const seenFilterIds = new Set<string>()

  fieldMap.hierarchyFields.forEach((hierarchyField) => {
    const fieldAsAny = hierarchyField as any

    if (fieldAsAny.filter === true) {
      const id = `hierarchy:${hierarchyField.key}`

      if (!seenFilterIds.has(id)) {
        seenFilterIds.add(id)
        filters.push({
          id,
          label: hierarchyField.label,
          fieldName: hierarchyField.fieldName,
        })
      }
    }

    const appendFields = Array.isArray(fieldAsAny.appendFields)
      ? fieldAsAny.appendFields
      : []

    appendFields.forEach((appendField: any) => {
      if (appendField && appendField.filter === true) {
        const appendKey = String(
          appendField.key || appendField.fieldName || '',
        ).trim()
        const appendFieldName = String(appendField.fieldName || '').trim()
        const appendLabel = String(appendField.label || appendFieldName).trim()
        const id = `append:${hierarchyField.key}:${appendKey}`

        if (
          appendKey !== '' &&
          appendFieldName !== '' &&
          appendLabel !== '' &&
          !seenFilterIds.has(id)
        ) {
          seenFilterIds.add(id)
          filters.push({
            id,
            label: appendLabel,
            fieldName: appendFieldName,
          })
        }
      }
    })
  })

  return filters
}

const getRecordFilterValue = (record: any, fieldName: string): string => {
  const directValue = getRecordStringValue(record, fieldName)

  if (directValue !== '') {
    return directValue
  }

  const data =
    record && typeof record.getData === 'function' ? record.getData() : {}

  const requestedFieldName = fieldName.toLowerCase()
  const matchingKey = Object.keys(data || {}).find((key) => {
    const lowerKey = key.toLowerCase()

    return (
      lowerKey === requestedFieldName ||
      lowerKey.endsWith(`.${requestedFieldName}`)
    )
  })

  if (!matchingKey) {
    return ''
  }

  const value = data[matchingKey]

  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim()
}

const getFilterOptionsFromRecords = (
  records: any[],
  filterField: ConfiguredFilterField,
): string[] => {
  const values = new Set<string>()

  records.forEach((record) => {
    const value = getRecordFilterValue(record, filterField.fieldName)

    if (value !== '') {
      values.add(value)
    }
  })

  return Array.from(values).sort((first, second) => {
    return first.localeCompare(second, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

const getVisibleFilterOptions = (
  options: string[],
  searchText: string,
): string[] => {
  const cleanSearchText = String(searchText || '')
    .trim()
    .toLowerCase()

  if (cleanSearchText === '') {
    return options
  }

  return options.filter((optionValue) => {
    return optionValue.toLowerCase().includes(cleanSearchText)
  })
}

const getFilteredRecords = (
  records: any[],
  configuredFilters: ConfiguredFilterField[],
  selectedFilterValues: { [key: string]: string },
): any[] => {
  const activeFilters = configuredFilters.filter((filterField) => {
    return String(selectedFilterValues[filterField.id] || '').trim() !== ''
  })

  if (activeFilters.length === 0) {
    return records
  }

  return records.filter((record) => {
    return activeFilters.every((filterField) => {
      return (
        getRecordFilterValue(record, filterField.fieldName) ===
        selectedFilterValues[filterField.id]
      )
    })
  })
}

const buildTextEqualityClause = (fieldName: string, value: string): string => {
  return `${fieldName} = '${escapeSqlValue(value)}'`
}

const Widget = (props: AllWidgetProps<Config>) => {
  const [activeFeatureDs, setActiveFeatureDs] = useState<DataSource | null>(
    null,
  )
  const [jimuMapView, setJimuMapView] = useState<JimuMapView | null>(null)
  const [isLoadingFeatures, setIsLoadingFeatures] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [recordCount, setRecordCount] = useState(0)
  const [availableFieldNames, setAvailableFieldNames] = useState<string[]>([])
  const [structureHierarchy, setStructureHierarchy] = useState<StructureNode[]>(
    [],
  )
  const [isolatedTopLevelValues, setIsolatedTopLevelValues] = useState<
    string[]
  >([])
  const [selectedFilterValues, setSelectedFilterValues] = useState<{
    [key: string]: string
  }>({})
  const [filterSearchValues, setFilterSearchValues] = useState<{
    [key: string]: string
  }>({})
  const [openFilterIds, setOpenFilterIds] = useState<string[]>([])
  const [expandedNodeKeys, setExpandedNodeKeys] = useState<string[]>([])
  const [selectedFeatureUid, setSelectedFeatureUid] = useState('')
  const [selectionError, setSelectionError] = useState('')
  const [expandedFeatureAttributeKeys, setExpandedFeatureAttributeKeys] =
    useState<string[]>([])
  const [loadingFeatureAttributeKeys, setLoadingFeatureAttributeKeys] =
    useState<{ [key: string]: boolean }>({})
  const [featureAttributeRecords, setFeatureAttributeRecords] = useState<{
    [key: string]: BasicLinkedTableRecord[]
  }>({})
  const [featureAttributeErrors, setFeatureAttributeErrors] = useState<{
    [key: string]: string
  }>({})

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
    ? validateFieldMapAgainstAvailableFields(
        structureFieldMap,
        availableFieldNames,
      )
    : null
  const configuredFilterFields = structureFieldMap
    ? getFilteredHierarchyFields(structureFieldMap)
    : []

  const dataSourceQuery: ActiveFeatureDataSourceQuery = {
    outFields: ['*'],
    pageSize: ACTIVE_FEATURE_DS_PAGE_SIZE,
  }

  const getConfiguredDataSourceId = (): string => {
    return String(
      (props.useDataSources &&
        props.useDataSources[0] &&
        (props.useDataSources[0] as any).dataSourceId) ||
        (activeFeatureDs as any)?.id ||
        '',
    )
  }

  const getConfiguredDataSourceUrl = (): string => {
    const dataSourceJson =
      activeFeatureDs && activeFeatureDs.getDataSourceJson
        ? (activeFeatureDs.getDataSourceJson() as any)
        : null

    return normaliseUrl(dataSourceJson?.url)
  }

  const getConfiguredDataSourceLabel = (): string => {
    if (!activeFeatureDs || !activeFeatureDs.getLabel) {
      return ''
    }

    return activeFeatureDs.getLabel()
  }

  const isConfiguredLayerMatch = (
    layerLike: any,
    dataSourceId?: string,
  ): boolean => {
    return isConfiguredFeatureLayerMatch(
      layerLike,
      dataSourceId || getConfiguredDataSourceId(),
      getConfiguredDataSourceUrl(),
      getConfiguredDataSourceLabel(),
    )
  }

  const clearMapHighlight = () => {
    if (highlightHandleRef.current) {
      highlightHandleRef.current.remove()
      highlightHandleRef.current = null
    }
  }

  const clearMapClickHandle = () => {
    if (mapClickHandleRef.current) {
      mapClickHandleRef.current.remove()
      mapClickHandleRef.current = null
    }
  }

  const clearMapViewSelectionState = () => {
    const jsApiMapView = jimuMapView?.view as any
    const popup = jsApiMapView?.popup

    if (popup) {
      if (typeof popup.clear === 'function') {
        popup.clear()
      }

      if (typeof popup.close === 'function') {
        popup.close()
      }
    }

    if (jsApiMapView && typeof jsApiMapView.closePopup === 'function') {
      jsApiMapView.closePopup()
    }
  }

  const clearFeatureDataSourceSelection = () => {
    if (activeFeatureDs) {
      clearDataSourceSelection(activeFeatureDs)
    }

    const matchingJimuLayerView = findMatchingJimuLayerViewRef.current()
    const layerDataSource =
      matchingJimuLayerView?.layerDataSource ||
      matchingJimuLayerView?.dataSource

    if (
      layerDataSource &&
      typeof layerDataSource.clearSelection === 'function'
    ) {
      layerDataSource.clearSelection()
    }
  }

  const findMatchingJimuLayerView = (): any | null => {
    if (!jimuMapView || !activeFeatureDs) {
      return null
    }

    const dataSourceId = getConfiguredDataSourceId()

    if (dataSourceId === '') {
      return null
    }

    const layerViewEntries = Object.values(
      (jimuMapView as any).jimuLayerViews || {},
    )

    return (
      layerViewEntries.find((entry: any) => {
        return isConfiguredLayerMatch(entry, dataSourceId)
      }) || null
    )
  }

  const openFeatureInTree = (feature_uid: string) => {
    const nodePathKeys = getNodePathKeysForFeatureUid(
      structureHierarchy,
      feature_uid,
    )

    if (nodePathKeys.length === 0) {
      return
    }

    setExpandedNodeKeys((previous) => {
      const mergedKeys = new Set([...previous, ...nodePathKeys])

      return Array.from(mergedKeys)
    })
  }

  const toggleNode = (nodeKey: string) => {
    setExpandedNodeKeys((previous) => {
      if (previous.includes(nodeKey)) {
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
      if (previous.includes(topLevelValue)) {
        return previous.filter((value) => value !== topLevelValue)
      }

      return [...previous, topLevelValue]
    })
  }

  const clearIsolation = () => {
    setIsolatedTopLevelValues([])
  }

  const setConfiguredFilterValue = (filterId: string, value: string) => {
    setSelectedFilterValues((previous) => {
      return {
        ...previous,
        [filterId]: value,
      }
    })

    setFilterSearchValues((previous) => {
      return {
        ...previous,
        [filterId]: value,
      }
    })

    setOpenFilterIds((previous) => {
      return previous.filter((id) => id !== filterId)
    })
  }

  const setFilterSearchValue = (filterId: string, value: string) => {
    setFilterSearchValues((previous) => {
      return {
        ...previous,
        [filterId]: value,
      }
    })
  }

  const openConfiguredFilter = (filterId: string) => {
    setOpenFilterIds((previous) => {
      if (previous.includes(filterId)) {
        return previous
      }

      return [...previous, filterId]
    })
  }

  const closeConfiguredFilter = (filterId: string) => {
    setOpenFilterIds((previous) => {
      return previous.filter((id) => id !== filterId)
    })
  }

  const clearConfiguredFilter = (filterId: string) => {
    setSelectedFilterValues((previous) => {
      const next = { ...previous }

      delete next[filterId]

      return next
    })

    setFilterSearchValues((previous) => {
      const next = { ...previous }

      delete next[filterId]

      return next
    })

    closeConfiguredFilter(filterId)
  }

  const toggleFeatureAttribute = (
    feature_uid: string,
    featureAttribute: FeatureAttributeConfig,
  ) => {
    const stateKey = getFeatureAttributeStateKey(
      feature_uid,
      featureAttribute.key,
    )

    setExpandedFeatureAttributeKeys((previous) => {
      if (previous.includes(stateKey)) {
        return previous.filter((key) => key !== stateKey)
      }

      return [...previous, stateKey]
    })
  }

  const updateAvailableFieldNamesFromDataSource = (
    dataSource: DataSource,
  ): string[] => {
    const fieldNames = getAvailableFieldNamesFromDataSource(dataSource)

    setAvailableFieldNames(fieldNames)

    return fieldNames
  }

  const refreshRecordCountFromDataSource = (dataSource: DataSource) => {
    setRecordCount(getLoadedRecordCountFromDataSource(dataSource))
  }

  const refreshStructureHierarchyFromDataSource = (
    dataSource: DataSource,
    fieldNames: string[],
  ) => {
    if (!structureFieldMap) {
      setStructureHierarchy([])
      return
    }

    const validationResult = validateFieldMapAgainstAvailableFields(
      structureFieldMap,
      fieldNames,
    )

    if (!validationResult.isValid) {
      setStructureHierarchy([])
      return
    }

    const records = getLoadedRecordsFromDataSource(dataSource)
    const filteredRecords = getFilteredRecords(
      records,
      getFilteredHierarchyFields(structureFieldMap),
      selectedFilterValues,
    )
    const hierarchy = buildStructureHierarchyFromRecords(
      filteredRecords,
      structureFieldMap,
    )
    const availableExpandableNodeKeys = new Set(
      getExpandableNodeKeys(hierarchy),
    )
    const availableFeatureUids = new Set(getFeatureUidsFromNodes(hierarchy))

    setStructureHierarchy(hierarchy)

    setExpandedNodeKeys((previous) => {
      return previous.filter((nodeKey) =>
        availableExpandableNodeKeys.has(nodeKey),
      )
    })

    setExpandedFeatureAttributeKeys((previous) => {
      return previous.filter((stateKey) => {
        const parsedStateKey = parseFeatureAttributeStateKey(stateKey)

        return availableFeatureUids.has(parsedStateKey.feature_uid)
      })
    })
  }

  const selectFeatureRecordInDataSource = (feature_uid: string) => {
    if (!activeFeatureDs || !structureFieldMap || feature_uid === '') {
      return
    }

    const result = selectLoadedRecordByFeatureUid(
      activeFeatureDs,
      structureFieldMap.identityFields.feature_uid.fieldName,
      feature_uid,
    )

    if (result.errorMessage !== '') {
      setSelectionError(result.errorMessage)
    }
  }

  const syncSelectedFeatureUidFromDataSource = (
    dataSource: DataSource | null,
  ) => {
    if (!dataSource || !structureFieldMap) {
      return
    }

    const selectedFeatureUidFromDataSource =
      getSelectedFeatureUidFromDataSource(
        dataSource,
        structureFieldMap.identityFields.feature_uid.fieldName,
      )

    if (selectedFeatureUidFromDataSource === '') {
      return
    }

    openFeatureInTree(selectedFeatureUidFromDataSource)
    setSelectedFeatureUid(selectedFeatureUidFromDataSource)
    setSelectionError('')
  }

  const syncMapToFeature = async (feature_uid: string) => {
    if (
      !jimuMapView ||
      !activeFeatureDs ||
      !structureFieldMap ||
      feature_uid === ''
    ) {
      return
    }

    clearFeatureDataSourceSelection()
    clearMapHighlight()
    clearMapViewSelectionState()

    try {
      const jsApiMapView = jimuMapView.view as any
      const matchingJimuLayerView = findMatchingJimuLayerView()
      const jsApiLayerView = matchingJimuLayerView?.view
      const jsApiLayer = matchingJimuLayerView?.layer || jsApiLayerView?.layer

      if (!jsApiMapView || !jsApiLayerView || !jsApiLayer) {
        return
      }

      const requestedFeatureUidFieldName =
        structureFieldMap.identityFields.feature_uid.fieldName
      const featureUidFieldName = getLayerFieldName(
        jsApiLayer,
        requestedFeatureUidFieldName,
      )

      const query = jsApiLayer.createQuery()
      query.where = `${featureUidFieldName} = '${escapeSqlValue(feature_uid)}'`
      query.outFields = ['*']
      query.returnGeometry = true

      const featureSet = await jsApiLayer.queryFeatures(query)
      const features = featureSet?.features || []

      if (features.length === 0) {
        return
      }

      if (typeof jsApiLayerView.highlight === 'function') {
        highlightHandleRef.current = jsApiLayerView.highlight(features)
      }

      if (typeof jsApiMapView.goTo === 'function') {
        await jsApiMapView.goTo(features)
      }

      if (
        jsApiMapView?.popup &&
        typeof jsApiMapView.popup.close === 'function'
      ) {
        jsApiMapView.popup.close()
      }

      if (jsApiMapView && typeof jsApiMapView.closePopup === 'function') {
        jsApiMapView.closePopup()
      }
    } catch (error) {
      console.warn('Failed to highlight selected feature on map', error)
    }
  }

  const selectFeature = (feature_uid: string) => {
    openFeatureInTree(feature_uid)
    clearFeatureDataSourceSelection()
    selectFeatureRecordInDataSource(feature_uid)

    if (selectedFeatureUid === feature_uid) {
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
    if (!node.feature_uid) {
      return
    }

    selectFeature(node.feature_uid)
  }

  useEffect(() => {
    if (selectedFeatureUid === '') {
      clearMapHighlight()
      lastAutoScrolledFeatureUidRef.current = ''
      return
    }

    void syncMapToFeature(selectedFeatureUid)
  }, [selectedFeatureUid, jimuMapView, activeFeatureDs])

  useEffect(() => {
    if (selectedFeatureUid === '') {
      lastAutoScrolledFeatureUidRef.current = ''
      return
    }

    if (lastAutoScrolledFeatureUidRef.current === selectedFeatureUid) {
      return
    }

    const selectedRow = featureRowRefs.current[selectedFeatureUid]

    if (selectedRow && typeof selectedRow.scrollIntoView === 'function') {
      selectedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      lastAutoScrolledFeatureUidRef.current = selectedFeatureUid
    }
  }, [selectedFeatureUid, expandedNodeKeys])

  useEffect(() => {
    const featureAttributes = structureFieldMap?.featureAttributes || []

    if (featureAttributes.length === 0) {
      return
    }

    const featureAttributeByKey = new Map(
      featureAttributes.map((featureAttribute) => [
        featureAttribute.key,
        featureAttribute,
      ]),
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

    if (stateKeysToLoad.length === 0) {
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
          const featureAttribute = featureAttributeByKey.get(
            parsedStateKey.featureAttributeKey,
          )

          if (!featureAttribute) {
            return {
              stateKey,
              result: {
                ok: false,
                data: [],
                errorMessage: 'Feature attribute configuration was not found.',
              },
            }
          }

          const result = await queryBasicLinkedTableFeatureAttributes(
            featureAttribute,
            parsedStateKey.feature_uid,
          )

          return {
            stateKey,
            result,
          }
        }),
      )

      if (featureAttributeRequestIdRef.current !== requestId) {
        return
      }

      setFeatureAttributeRecords((previous) => {
        const next = { ...previous }

        settledResults.forEach((settledResult, index) => {
          const stateKey = stateKeysToLoad[index]

          if (settledResult.status !== 'fulfilled') {
            next[stateKey] = []
            return
          }

          if (settledResult.value.result.ok) {
            next[stateKey] = settledResult.value.result.data
          }
        })

        return next
      })

      setFeatureAttributeErrors((previous) => {
        const next = { ...previous }

        settledResults.forEach((settledResult, index) => {
          const stateKey = stateKeysToLoad[index]

          if (settledResult.status !== 'fulfilled') {
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
  }, [
    expandedFeatureAttributeKeys,
    structureFieldMap,
    featureAttributeRecords,
    loadingFeatureAttributeKeys,
  ])

  useEffect(() => {
    if (!activeFeatureDs) {
      return
    }

    const fieldNames = updateAvailableFieldNamesFromDataSource(activeFeatureDs)

    refreshRecordCountFromDataSource(activeFeatureDs)
    refreshStructureHierarchyFromDataSource(activeFeatureDs, fieldNames)
  }, [selectedFilterValues, activeFeatureDs, props.config?.fieldMapJson])

  useEffect(() => {
    const previousIsolateLayerView = activeIsolateLayerViewRef.current

    if (previousIsolateLayerView) {
      try {
        previousIsolateLayerView.filter = null
      } catch (error) {
        console.warn('Failed to clear previous isolate filter', error)
      }

      activeIsolateLayerViewRef.current = null
    }

    if (!jimuMapView || !structureFieldMap) {
      return
    }

    const matchingJimuLayerView = findMatchingJimuLayerViewRef.current()
    const jsApiLayerView = matchingJimuLayerView?.view
    const jsApiLayer = matchingJimuLayerView?.layer || jsApiLayerView?.layer

    if (!jsApiLayerView || !jsApiLayer) {
      return
    }

    const whereParts: string[] = []
    const topLevelField = structureFieldMap.hierarchyFields[0]

    if (topLevelField && isolatedTopLevelValues.length > 0) {
      const topLevelFieldName = getLayerFieldName(
        jsApiLayer,
        topLevelField.fieldName,
      )
      const escapedValues = isolatedTopLevelValues.map((value) => {
        return `'${escapeSqlValue(value)}'`
      })

      whereParts.push(`${topLevelFieldName} IN (${escapedValues.join(', ')})`)
    }

    configuredFilterFields.forEach((filterField) => {
      const selectedValue = String(
        selectedFilterValues[filterField.id] || '',
      ).trim()

      if (selectedValue === '') {
        return
      }

      const layerFieldName = getLayerFieldName(
        jsApiLayer,
        filterField.fieldName,
      )

      whereParts.push(buildTextEqualityClause(layerFieldName, selectedValue))
    })

    if (whereParts.length === 0) {
      return
    }

    try {
      jsApiLayerView.filter = {
        where: whereParts.join(' AND '),
      }

      activeIsolateLayerViewRef.current = jsApiLayerView
    } catch (error) {
      console.warn('Failed to apply tree viewer filter', error)
    }
  }, [
    isolatedTopLevelValues,
    selectedFilterValues,
    jimuMapView,
    activeFeatureDs,
    props.config?.fieldMapJson,
  ])

  useEffect(() => {
    clearMapClickHandle()

    const jsApiMapView = jimuMapView?.view as any
    const matchingJimuLayerView = findMatchingJimuLayerViewRef.current()
    const targetLayer =
      matchingJimuLayerView?.layer || matchingJimuLayerView?.view?.layer

    if (!jsApiMapView || typeof jsApiMapView.on !== 'function') {
      return
    }

    mapClickHandleRef.current = jsApiMapView.on('click', async (event: any) => {
      try {
        if (typeof jsApiMapView.hitTest !== 'function') {
          return
        }

        const hitTestResult = await jsApiMapView.hitTest(event)
        const results = Array.isArray(hitTestResult?.results)
          ? hitTestResult.results
          : []

        let matchingResult: any = null

        for (const result of results) {
          const resultGraphic = (result as any)?.graphic
          const resultLayer = resultGraphic?.layer
          const resultFeatureUid = structureFieldMap
            ? await resolveFeatureUidFromHitResult(
                result,
                structureFieldMap.identityFields.feature_uid.fieldName,
              )
            : ''

          if (
            resultFeatureUid !== '' &&
            ((targetLayer &&
              (resultLayer === targetLayer ||
                isConfiguredLayerMatch(resultLayer) ||
                isConfiguredLayerMatch(resultGraphic) ||
                String(resultLayer?.url || '').toLowerCase() ===
                  String(targetLayer?.url || '').toLowerCase() ||
                String(resultLayer?.title || '').toLowerCase() ===
                  String(targetLayer?.title || '').toLowerCase())) ||
              (!targetLayer && isConfiguredLayerMatch(resultLayer)))
          ) {
            matchingResult = {
              result,
              feature_uid: resultFeatureUid,
            }

            break
          }
        }

        const feature_uid = matchingResult?.feature_uid || ''

        if (feature_uid !== '') {
          selectFeatureRef.current(feature_uid)
          return
        }

        clearSelectedFeatureRef.current()
      } catch (error) {
        console.warn(
          'Failed to sync selected map feature back to TransactionDataSetTreeExplorer',
          error,
        )
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

      if (activeIsolateLayerViewRef.current) {
        try {
          activeIsolateLayerViewRef.current.filter = null
        } catch (error) {
          console.warn('Failed to clear isolate filter during cleanup', error)
        }

        activeIsolateLayerViewRef.current = null
      }
    }
  }, [])

  if (!props.useDataSources || props.useDataSources.length < 1) {
    return (
      <div style={PAGE_STYLE}>
        <div style={CONTENT_STYLE}>
          <div style={HEADER_STYLE}>
            <h3 style={HEADER_TITLE_STYLE}>Transaction Tree Viewer</h3>
          </div>
          <div style={EMPTY_STATE_STYLE}>
            Select the Active Feature Class data source in widget settings.
          </div>
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
          if (activeFeatureDs) {
            const fieldNames =
              updateAvailableFieldNamesFromDataSource(activeFeatureDs)

            refreshRecordCountFromDataSource(activeFeatureDs)
            refreshStructureHierarchyFromDataSource(activeFeatureDs, fieldNames)
            syncSelectedFeatureUidFromDataSource(activeFeatureDs)
          }
        }}
        onSelectionChange={() => {
          if (activeFeatureDs) {
            syncSelectedFeatureUidFromDataSource(activeFeatureDs)
          }
        }}
        onDataSourceStatusChange={(status) => {
          setIsLoadingFeatures(status === DataSourceStatus.Loading)
        }}
        onCreateDataSourceFailed={(error) => {
          setLoadError(
            error?.message || 'Failed to connect to the Active Feature Class.',
          )
          setRecordCount(0)
          setAvailableFieldNames([])
          setStructureHierarchy([])
          setIsolatedTopLevelValues([])
          setSelectedFilterValues({})
          setFilterSearchValues({})
          setOpenFilterIds([])
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
            Explore and filter active features
          </span>
        </div>

        {configuredFilterFields.length > 0 && activeFeatureDs && (
          <div style={FILTER_ROW_STYLE}>
            {configuredFilterFields.map((filterField) => {
              const records = getLoadedRecordsFromDataSource(activeFeatureDs)
              const options = getFilterOptionsFromRecords(records, filterField)
              const selectedValue = selectedFilterValues[filterField.id] || ''
              const searchValue =
                filterSearchValues[filterField.id] ?? selectedValue
              const visibleOptions = getVisibleFilterOptions(
                options,
                searchValue,
              )
              const isOpen = openFilterIds.includes(filterField.id)

              return (
                <div key={filterField.id} style={FILTER_GROUP_STYLE}>
                  <label style={FILTER_LABEL_STYLE}>{filterField.label}</label>
                  <div style={FILTER_INPUT_ROW_STYLE}>
                    <div style={FILTER_COMBO_STYLE}>
                      <input
                        aria-label={`${filterField.label} filter`}
                        value={searchValue}
                        placeholder={`Select ${filterField.label.toLowerCase()}`}
                        style={FILTER_INPUT_STYLE}
                        onFocus={() => {
                          openConfiguredFilter(filterField.id)
                        }}
                        onBlur={() => {
                          window.setTimeout(() => {
                            closeConfiguredFilter(filterField.id)
                          }, 150)
                        }}
                        onChange={(event) => {
                          setFilterSearchValue(
                            filterField.id,
                            event.target.value,
                          )
                          openConfiguredFilter(filterField.id)
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.key === 'Enter' &&
                            visibleOptions.length === 1
                          ) {
                            setConfiguredFilterValue(
                              filterField.id,
                              visibleOptions[0],
                            )
                          }

                          if (event.key === 'Escape') {
                            setFilterSearchValue(filterField.id, selectedValue)
                            closeConfiguredFilter(filterField.id)
                          }
                        }}
                      />

                      {isOpen && (
                        <ul style={FILTER_OPTIONS_STYLE}>
                          {visibleOptions.length === 0 && (
                            <li style={FILTER_EMPTY_OPTION_STYLE}>
                              No matches
                            </li>
                          )}

                          {visibleOptions.map((optionValue) => {
                            return (
                              <li key={optionValue}>
                                <button
                                  type="button"
                                  style={{
                                    ...FILTER_OPTION_BUTTON_STYLE,
                                    fontWeight:
                                      optionValue === selectedValue ? 700 : 400,
                                  }}
                                  onMouseDown={(event) => {
                                    event.preventDefault()
                                    setConfiguredFilterValue(
                                      filterField.id,
                                      optionValue,
                                    )
                                  }}
                                >
                                  {optionValue}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>

                    {selectedValue !== '' && (
                      <button
                        type="button"
                        style={FILTER_CLEAR_BUTTON_STYLE}
                        onClick={() => {
                          clearConfiguredFilter(filterField.id)
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={ACTION_ROW_STYLE}>
          <button
            type="button"
            onClick={clearIsolation}
            disabled={isolatedTopLevelValues.length === 0}
            style={{
              ...LINK_BUTTON_STYLE,
              color:
                isolatedTopLevelValues.length === 0 ? '#888888' : ACCENT_COLOR,
              cursor:
                isolatedTopLevelValues.length === 0 ? 'not-allowed' : 'pointer',
              textDecoration:
                isolatedTopLevelValues.length === 0 ? 'none' : 'underline',
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
          <button type="button" onClick={collapseAll} style={LINK_BUTTON_STYLE}>
            Collapse All
          </button>
          <span>|</span>
          <button type="button" onClick={expandAll} style={LINK_BUTTON_STYLE}>
            Expand All
          </button>
        </div>

        {loadError !== '' && <div style={MESSAGE_PANEL_STYLE}>{loadError}</div>}

        {selectionError !== '' && (
          <div style={MESSAGE_PANEL_STYLE}>{selectionError}</div>
        )}

        {fieldValidationResult &&
          fieldValidationResult.isValid &&
          structureFieldMap && (
            <div style={TREE_PANEL_STYLE}>
              <div style={ISOLATE_HEADER_STYLE}>
                <span>Isolate</span>
                <span>Structure</span>
              </div>
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
            </div>
          )}
      </div>
    </div>
  )
}

export default Widget

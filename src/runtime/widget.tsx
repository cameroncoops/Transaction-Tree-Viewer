/**
 * Transaction Tree Viewer widget
 *
 * Purpose
 * -------
 * This ArcGIS Experience Builder runtime widget displays a configurable tree of active
 * spatial features. In the Living Places / Garden Beds context, the main spatial feature
 * is a garden bed, and the tree normally groups beds by configured hierarchy fields such
 * as zone, level, bed, room, type, or other project-specific structure fields.
 *
 * The widget is intentionally read-focused. It does not edit geometry, plant stock, or
 * transaction rows. Its job is to make the active/current feature dataset easier to
 * navigate, filter, select, isolate on the map, and inspect alongside related records.
 *
 * Architecture
 * ------------
 * 1. Configuration is read from the Experience Builder widget settings through
 *    `props.config`. The important setting is `fieldMapJson`, which is parsed into a
 *    `StructureFieldMap`. That field map tells the widget which datasource fields define
 *    identity, hierarchy, append values, related summaries, related breakdowns, filters,
 *    and optional linked feature-attribute panels.
 *
 * 2. `props.useDataSources[0]` is treated as the main active feature datasource. This is
 *    the datasource used to build the tree, resolve feature identity, provide direct
 *    filter options, and coordinate map selection.
 *
 * 3. Any additional datasource slots, starting at `props.useDataSources[1]`, are treated
 *    as related or lookup datasources. The code derives the required related datasource
 *    keys from the field map, then maps those keys to the datasource slots in first-seen
 *    order. This keeps the widget generic rather than hard-coding Garden Beds, Parking
 *    Bays, or any other dataset into the runtime logic.
 *
 * 4. Main datasource records are converted into a nested `StructureNode` hierarchy by
 *    `buildStructureHierarchyFromRecords`. Related summaries can be queried first and
 *    injected into the hierarchy so tree rows can show derived totals such as stock count.
 *
 * 5. Related breakdowns are lazy-loaded per selected or expanded feature. This is
 *    important for performance: the widget does not query every child stock/species/cost
 *    line for every feature upfront. It queries detailed related breakdown rows only when
 *    the user expands a relevant feature node or expands a branch.
 *
 * 6. Filtering has three paths:
 *    - direct filters compare values already present on the main datasource records;
 *    - related-breakdown filters query a related datasource and resolve matching main
 *      feature IDs or join values;
 *    - resolved-lookup filters let one datasource provide clean dropdown labels while a
 *      different datasource resolves the selected lookup value back to main feature IDs.
 *
 * 7. Map interaction is deliberately separated from visibility filtering. A selected
 *    feature can be highlighted and zoomed to, but it is not used as the map visibility
 *    filter. Filters and top-level isolation are the only map visibility drivers. This
 *    prevents Experience Builder shared datasource selection from causing looped
 *    selection/filter updates or hiding records that should remain visible.
 *
 * 8. The rendered UI is split into:
 *    - hidden `DataSourceComponent` bindings for main and related datasources;
 *    - optional `JimuMapViewComponent` binding for the connected map;
 *    - filter controls;
 *    - action controls for isolate/selection/collapse;
 *    - validation/error panels;
 *    - the `StructureTree` component, which receives the prepared tree state and user
 *      interaction callbacks.
 *
 * Business rules and invariants
 * -----------------------------
 * - The configured identity field, normally `feature_uid` or a dataset-specific equivalent,
 *   is the permanent feature identity used for selection, tree lookup, related joins, and
 *   map synchronisation.
 * - Display labels such as bed number, room number, or operational names are not treated
 *   as permanent identity. They can change without replacing the underlying feature.
 * - The main active datasource represents the current active feature set. Retired features
 *   should already be excluded upstream by the active datasource/view/table design.
 * - Related current-state values such as stock counts are derived/display values. They are
 *   not written by this widget.
 * - Shared Experience Builder datasource selection is treated as an input signal only. Once
 *   captured, it is cleared so local widget state remains the source of truth.
 * - SQL where clauses are assembled using `escapeSqlValue` for text values before they are
 *   sent to ArcGIS query or layer-view filter calls.
 * - Query request IDs are used for async work that can be superseded. If a newer request is
 *   started before an older one finishes, the older result is ignored.
 *
 * Maintenance notes
 * -----------------
 * This file is intentionally generic. Avoid adding dataset-specific field names or Garden
 * Beds-only assumptions directly into this runtime file. Prefer adding those details to the
 * field-map configuration or to small library helpers that are designed to be configured.
 */

/** Core Experience Builder runtime imports. */
import {
  React,
  type AllWidgetProps,
  type DataSource,
  DataSourceComponent,
  DataSourceStatus,
} from 'jimu-core'
/** ArcGIS map-view bridge used to listen for map clicks, highlight features, and apply layer-view filters. */
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
/** Widget setting shape produced by the setting UI. */
import type { Config } from '../config'
/** Field-map parser and types that make this widget dataset-configurable. */
import {
  parseStructureFieldMap,
  validateFieldMapAgainstAvailableFields,
  type FeatureAttributeConfig,
  type RelatedBreakdownConfig,
  type RelatedBreakdownGroupField,
  type RelatedSummaryConfig,
  type StructureFieldMap,
} from './lib/field-map'
/** Structure model helpers that convert flat records into the nested tree model used by StructureTree. */
import {
  buildStructureHierarchyFromRecords,
  getExpandableNodeKeys,
  getNodePathKeysForFeatureUid,
  type RelatedBreakdownNodesByFeatureUid,
  type RelatedSummaryValuesByFeatureUid,
  type StructureNode,
} from './lib/structure-model'
/** Small datasource helpers that hide Experience Builder record/datasource API differences. */
import {
  getAvailableFieldNamesFromDataSource,
  getLoadedRecordCountFromDataSource,
  getLoadedRecordsFromDataSource,
} from './lib/datasource-utils'
/** Selection and SQL helper functions used when synchronising tree state, map clicks, and datasource selection. */
import {
  clearDataSourceSelection,
  escapeSqlValue,
  getLayerFieldName,
  getRecordStringValue,
  getSelectedFeatureUidFromDataSource,
  isConfiguredFeatureLayerMatch,
  normaliseUrl,
  resolveFeatureUidFromHitResult,
} from './lib/selection-utils'
/** Linked feature-attribute helpers for optional expandable child panels under feature rows. */
import {
  getFeatureAttributeStateKey,
  parseFeatureAttributeStateKey,
  queryBasicLinkedTableFeatureAttributes,
  type BasicLinkedTableRecord,
} from './lib/feature-attributes'
/** Presentational tree component. This file prepares state and callbacks, while StructureTree renders the rows. */
import StructureTree from './components/StructureTree'

/** Pull React hooks from the Experience Builder-bundled React object. */
const { useEffect, useRef, useState } = React

/** Number of main active-feature records requested per datasource page. */
const ACTIVE_FEATURE_DS_PAGE_SIZE = 2000
/** Number of related/lookup records requested per query page. */
const RELATED_QUERY_PAGE_SIZE = 2000
/** Accent colour used for active action links. Do not rely on colour alone for meaning. */
const ACCENT_COLOR = '#007ac2'
/** Default header title used when the widget setting does not provide a custom title. */
const DEFAULT_WIDGET_TITLE = 'Transaction Tree Viewer'
/** Default header subtitle used when the widget setting does not provide a custom subtitle. */
const DEFAULT_WIDGET_SUBTITLE = 'Explore and filter active features'

/** Full-widget scroll container style. */
const PAGE_STYLE = {
  height: '100%',
  overflowY: 'auto' as const,
  boxSizing: 'border-box' as const,
  background: '#f6faf7',
  padding: '0.6rem',
}

/** Main white card style that contains filters, actions, messages, and tree content. */
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

/** Header wrapper style. */
const HEADER_STYLE = {
  display: 'block',
  paddingBottom: '0.85rem',
  borderBottom: '1px solid #dfe7df',
}

/** Header title text style. */
const HEADER_TITLE_STYLE = {
  margin: 0,
  fontSize: '1.45rem',
  fontWeight: 700,
  lineHeight: 1.2,
  color: '#203028',
}

/** Header subtitle text style. */
const HEADER_SUBTITLE_STYLE = {
  display: 'block',
  marginTop: '0.25rem',
  color: '#6d766f',
  fontSize: '0.95rem',
  lineHeight: 1.35,
}

/** Filter bar layout style. */
const FILTER_ROW_STYLE = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: '1rem',
  alignItems: 'flex-end',
  paddingBottom: '0.9rem',
  borderBottom: '1px solid #dfe7df',
}

/** Wrapper style for a single configured filter control. */
const FILTER_GROUP_STYLE = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.35rem',
  minWidth: '12rem',
}

/** Label style for filter captions. */
const FILTER_LABEL_STYLE = {
  fontSize: '0.92rem',
  fontWeight: 700,
  lineHeight: 1.2,
  color: '#24352b',
}

/** Horizontal layout for filter input and Clear button. */
const FILTER_INPUT_ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.45rem',
}

/** Relative-positioned wrapper so dropdown options can sit under the filter input. */
const FILTER_COMBO_STYLE = {
  position: 'relative' as const,
  minWidth: '10.5rem',
  maxWidth: '15rem',
}

/** Text input style for searchable filter controls. */
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

/** Dropdown list style for visible filter options. */
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

/** Button style for each dropdown option. */
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

/** Empty-dropdown message style shown when no option matches search text. */
const FILTER_EMPTY_OPTION_STYLE = {
  padding: '0.25rem 0.4rem',
  color: '#777777',
  fontSize: '0.78rem',
  lineHeight: 1.3,
}

/** Inline Clear button style used beside active filters. */
const FILTER_CLEAR_BUTTON_STYLE = {
  background: 'none',
  border: 'none',
  color: '#2f6f37',
  textDecoration: 'none',
  cursor: 'pointer',
  padding: 0,
  fontSize: '0.9rem',
}

/** Action row layout for Clear Isolate, Clear Selection, and Collapse All. */
const ACTION_ROW_STYLE = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  alignItems: 'center',
  gap: '0.65rem',
  color: '#8a8a8a',
  fontSize: '0.95rem',
}

/** Link-like button style for non-primary actions. */
const LINK_BUTTON_STYLE = {
  background: 'none',
  border: 'none',
  color: '#2f6f37',
  textDecoration: 'none',
  cursor: 'pointer',
  padding: 0,
  fontSize: '0.95rem',
}

/** Border panel around the rendered StructureTree. */
const TREE_PANEL_STYLE = {
  border: '1px solid #dfe7df',
  borderRadius: '8px',
  overflow: 'hidden',
  backgroundColor: '#ffffff',
}

/** Header row above the tree showing the isolate column and structure column labels. */
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

/** Error/warning panel style. */
const MESSAGE_PANEL_STYLE = {
  padding: '0.5rem 0.6rem',
  border: '1px solid #f0c8c8',
  backgroundColor: '#fff5f5',
  color: '#a12626',
  fontSize: '0.85rem',
}

/** Generic empty-state text style. Currently retained for simple fallback messages. */
const EMPTY_STATE_STYLE = {
  padding: '0.5rem',
  color: '#666666',
  fontSize: '0.9rem',
}

/**
 * Query shape passed to the main active-feature DataSourceComponent.
 * `outFields` controls which attributes are loaded and `pageSize` controls
 * Experience Builder's datasource page size.
 */
interface ActiveFeatureDataSourceQuery {
  /** Attribute fields requested from the active feature datasource. */
  outFields: string[]
  /** Maximum records requested per page from the active feature datasource. */
  pageSize: number
}

/**
 * Runtime description of one filter control generated from the field map.
 *
 * Direct filters read from the main datasource. Related-breakdown filters query
 * a related datasource to work out which main records match. Resolved-lookup
 * filters split the dropdown label source from the datasource used to resolve
 * the selected lookup value back to main feature IDs.
 */
interface ConfiguredFilterField {
  /** Stable runtime key for this filter. */
  id: string
  /** User-facing filter label displayed above the input. */
  label: string
  /** Main datasource field used by direct filters, or target/join field fallback for related filters. */
  fieldName: string
  /** Tells the filtering pipeline which resolution path to use. */
  source: 'direct' | 'relatedBreakdown' | 'resolvedLookup'
  /** Related datasource key for related-breakdown filters. */
  relatedSourceKey?: string
  /** Field on the related datasource that links back to the main datasource. */
  relatedJoinField?: string
  /** Field on the main datasource that related values are matched against. */
  joinField?: string
  /** Field used as the visible dropdown label for related/resolved filter options. */
  filterDisplayField?: string
  /** Field used as the stored selected value for related/resolved filter options. */
  filterValueField?: string
  /** Datasource key used to load dropdown options for resolved-lookup filters. */
  filterOptionsSourceKey?: string
  /** Datasource key used to resolve a selected lookup value into main feature join values. */
  filterResolveSourceKey?: string
  /** Field queried in the resolve datasource when a resolved-lookup option is selected. */
  filterResolveValueField?: string
  /** Field returned from the resolve datasource and matched to the main datasource. */
  filterResolveJoinField?: string
  /** Optional explicit main datasource target field for resolved filters. */
  targetField?: string
}

/** Single selectable value shown in a searchable filter dropdown. */
interface FilterOption {
  /** User-facing option label. */
  label: string
  /** Stored option value used when filtering. */
  value: string
}

/** Runtime lookup of configured related datasource key to actual Experience Builder datasource instance. */
interface RelatedDataSourceRuntimeMap {
  /** Key is the field-map source key, value is the connected datasource object. */
  [key: string]: DataSource
}

/** Related summary config plus the hierarchy field that owns it. */
interface RelatedSummaryDefinition extends RelatedSummaryConfig {
  /** Hierarchy field key that declared this summary. */
  hierarchyFieldKey: string
}

/** Related breakdown config plus the hierarchy field that owns it. */
interface RelatedBreakdownDefinition extends RelatedBreakdownConfig {
  /** Hierarchy field key that declared this breakdown. */
  hierarchyFieldKey: string
}

/** ArcGIS event-handle shape used by map click listeners. */
interface ViewEventHandle {
  /** Removes the event listener from the map view. */
  remove: () => void
}

/** ArcGIS highlight-handle shape used by selected feature highlighting. */
interface HighlightHandle {
  /** Clears the highlight from the map view. */
  remove: () => void
}

/**
 * Adds a non-empty related datasource key to a list, preserving first-seen order and avoiding duplicates.
 */
const addSourceKeyIfPresent = (sourceKeys: string[], value: unknown) => {
  const sourceKey = String(value || '').trim()

  if (sourceKey !== '' && !sourceKeys.includes(sourceKey)) {
    sourceKeys.push(sourceKey)
  }
}

/**
 * Flattens all related summary definitions from the hierarchy field map and records which hierarchy field each summary came from.
 */
const getRelatedSummaryDefinitions = (fieldMap: StructureFieldMap): RelatedSummaryDefinition[] => {
  return fieldMap.hierarchyFields.flatMap((hierarchyField) => {
    const relatedSummaries = Array.isArray(hierarchyField.relatedSummaries)
      ? hierarchyField.relatedSummaries
      : []

    return relatedSummaries.map((summary) => {
      return {
        ...summary,
        hierarchyFieldKey: hierarchyField.key,
      }
    })
  })
}


/**
 * Flattens all related breakdown definitions from the hierarchy field map and records which hierarchy field each breakdown came from.
 */
const getRelatedBreakdownDefinitions = (fieldMap: StructureFieldMap): RelatedBreakdownDefinition[] => {
  return fieldMap.hierarchyFields.flatMap((hierarchyField) => {
    const relatedBreakdowns = Array.isArray(hierarchyField.relatedBreakdowns)
      ? hierarchyField.relatedBreakdowns
      : []

    return relatedBreakdowns.map((breakdown) => {
      return {
        ...breakdown,
        hierarchyFieldKey: hierarchyField.key,
      }
    })
  })
}

/**
 * Collects every related datasource key required by summaries, breakdowns, filter option sources, and filter resolve sources.
 */
const getRelatedSourceKeysFromFieldMap = (fieldMap: StructureFieldMap | null): string[] => {
  if (!fieldMap) {
    return []
  }

  const sourceKeys: string[] = []

  getRelatedSummaryDefinitions(fieldMap).forEach((summary) => {
    addSourceKeyIfPresent(sourceKeys, summary.relatedSourceKey)
  })
  getRelatedBreakdownDefinitions(fieldMap).forEach((breakdown) => {
    addSourceKeyIfPresent(sourceKeys, breakdown.relatedSourceKey)
    addSourceKeyIfPresent(sourceKeys, breakdown.filterOptionsSourceKey)
    addSourceKeyIfPresent(sourceKeys, breakdown.filterResolveSourceKey)
  })

  return sourceKeys
}

// `useDataSources[0]` is always the main tree source. Additional configured
// source keys are mapped onto `useDataSources[1..]` in first-seen order so
// future keys can claim the next available datasource slots without inventing
// a parallel config system.
/**
 * Maps each related datasource key to its Experience Builder useDataSources slot index. Index 0 is reserved for the main datasource.
 */
const getRelatedSourceKeyIndexMap = (
  fieldMap: StructureFieldMap | null,
): { [sourceKey: string]: number } => {
  const sourceKeys = getRelatedSourceKeysFromFieldMap(fieldMap)

  return sourceKeys.reduce((accumulator, sourceKey, index) => {
    accumulator[sourceKey] = index + 1
    return accumulator
  }, {} as { [sourceKey: string]: number })
}

/**
 * Recursively extracts every feature UID from a tree branch or full tree.
 */
const getFeatureUidsFromNodes = (nodes: StructureNode[]): string[] => {
  return nodes.flatMap((node) => {
    const currentFeatureUid = node.feature_uid ? [node.feature_uid] : []
    const childFeatureUids = getFeatureUidsFromNodes(node.children)

    return [...currentFeatureUid, ...childFeatureUids]
  })
}

/**
 * Recursively lists all node keys below a branch so the whole branch can be expanded at once.
 */
const getExpandableNodeKeysForBranch = (node: StructureNode): string[] => {
  const childKeys = node.children.flatMap((childNode) => {
    return getExpandableNodeKeysForBranch(childNode)
  })

  return [node.nodeKey, ...childKeys]
}

/**
 * Recursively searches the structure tree for the node with the supplied node key.
 */
const findNodeByKey = (
  nodes: StructureNode[],
  nodeKey: string,
): StructureNode | null => {
  for (const node of nodes)
  {
    if (node.nodeKey === nodeKey)
    {
      return node
    }

    const childMatch = findNodeByKey(node.children, nodeKey)

    if (childMatch)
    {
      return childMatch
    }
  }

  return null
}

/**
 * Returns all feature-level nodes under a branch. Group-only nodes are skipped unless they carry a feature UID.
 */
const getFeatureNodesFromBranch = (node: StructureNode): StructureNode[] => {
  const childFeatureNodes = node.children.flatMap((childNode) => {
    return getFeatureNodesFromBranch(childNode)
  })

  return node.feature_uid ? [node, ...childFeatureNodes] : childFeatureNodes
}

/**
 * Builds a compact snapshot of active direct and resolved filters for trace logging.
 */
const getActiveFilterDebugState = (
  configuredFilters: ConfiguredFilterField[],
  selectedFilterValues: { [key: string]: string },
) => {
  const activeDirectFilters = configuredFilters
    .filter((filterField) => {
      return (
        filterField.source === 'direct' &&
        String(selectedFilterValues[filterField.id] || '').trim() !== ''
      )
    })
    .map((filterField) => {
      return {
        id: filterField.id,
        value: String(selectedFilterValues[filterField.id] || '').trim(),
      }
    })

  const activeResolvedFilters = configuredFilters
    .filter((filterField) => {
      return (
        filterField.source !== 'direct' &&
        String(selectedFilterValues[filterField.id] || '').trim() !== ''
      )
    })
    .map((filterField) => {
      return {
        id: filterField.id,
        value: String(selectedFilterValues[filterField.id] || '').trim(),
      }
    })

  return {
    activeDirectFilters,
    activeResolvedFilters,
  }
}

/**
 * Builds a compact snapshot of loaded and selected datasource record counts for trace logging.
 */
const getDataSourceSelectionDebugState = (dataSource: DataSource | null) => {
  const loadedRecords = dataSource ? getLoadedRecordsFromDataSource(dataSource) : []
  const selectedRecords = dataSource && typeof dataSource.getSelectedRecords === 'function'
    ? dataSource.getSelectedRecords() || []
    : []

  return {
    loadedRecordCount: loadedRecords.length,
    selectedRecordCount: selectedRecords.length,
  }
}

/**
 * Converts field-map filter flags into runtime filter definitions used by the filter bar and filtering pipeline.
 */
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
            source: 'direct',
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
            source: 'direct',
          })
        }
      }
    })

    const relatedBreakdowns = Array.isArray(fieldAsAny.relatedBreakdowns)
      ? fieldAsAny.relatedBreakdowns
      : []

    relatedBreakdowns.forEach((relatedBreakdown: any) => {
      if (relatedBreakdown && relatedBreakdown.filter === true) {
        const id = `relatedBreakdown:${hierarchyField.key}:${String(relatedBreakdown.key || '').trim()}`
        const firstGroupField = Array.isArray(relatedBreakdown.groupBy) && relatedBreakdown.groupBy.length > 0
          ? relatedBreakdown.groupBy[0]
          : null
        const filterDisplayField = String(
          relatedBreakdown.filterDisplayField ||
          firstGroupField?.fieldName ||
          '',
        ).trim()
        const filterValueField = String(
          relatedBreakdown.filterValueField ||
          firstGroupField?.fieldName ||
          '',
        ).trim()

        if (
          id !== 'relatedBreakdown::' &&
          filterDisplayField !== '' &&
          filterValueField !== '' &&
          !seenFilterIds.has(id)
        ) {
          seenFilterIds.add(id)
          filters.push({
            id,
            label: String(relatedBreakdown.label || hierarchyField.label).trim(),
            fieldName: String(
              relatedBreakdown.targetField ||
              relatedBreakdown.joinField ||
              '',
            ).trim(),
            source:
              String(relatedBreakdown.filterType || '').trim() === 'resolved'
                ? 'resolvedLookup'
                : 'relatedBreakdown',
            relatedSourceKey: String(relatedBreakdown.relatedSourceKey || '').trim(),
            relatedJoinField: String(relatedBreakdown.relatedJoinField || '').trim(),
            joinField: String(relatedBreakdown.joinField || '').trim(),
            filterDisplayField,
            filterValueField,
            filterOptionsSourceKey: String(
              relatedBreakdown.filterOptionsSourceKey || '',
            ).trim(),
            filterResolveSourceKey: String(
              relatedBreakdown.filterResolveSourceKey || '',
            ).trim(),
            filterResolveValueField: String(
              relatedBreakdown.filterResolveValueField || '',
            ).trim(),
            filterResolveJoinField: String(
              relatedBreakdown.filterResolveJoinField || '',
            ).trim(),
            targetField: String(relatedBreakdown.targetField || '').trim(),
          })
        }
      }
    })
  })

  return filters
}

/**
 * Reads a field value from an Experience Builder record as trimmed text, allowing for exact or layer-qualified field names.
 */
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

/**
 * Reads a field value from an Experience Builder record without converting it to text.
 */
const getRecordRawValue = (record: any, fieldName: string): unknown => {
  const data = record && typeof record.getData === 'function' ? record.getData() : {}

  if (Object.prototype.hasOwnProperty.call(data, fieldName)) {
    return data[fieldName]
  }

  const requestedFieldName = fieldName.toLowerCase()
  const matchingKey = Object.keys(data || {}).find((key) => {
    const lowerKey = key.toLowerCase()

    return (
      lowerKey === requestedFieldName ||
      lowerKey.endsWith(`.${requestedFieldName}`)
    )
  })

  if (!matchingKey) {
    return undefined
  }

  return data[matchingKey]
}

/**
 * Normalises different ArcGIS/Experience Builder query result shapes into a simple record array.
 */
const getQueryRecords = (queryResult: any): any[] => {
  if (Array.isArray(queryResult)) {
    return queryResult
  }

  if (Array.isArray(queryResult?.records)) {
    return queryResult.records
  }

  if (Array.isArray(queryResult?.features)) {
    return queryResult.features
  }

  return []
}

/**
 * Runs a related datasource query with the project page-size defaults and returns a normalised record array.
 */
const queryRelatedRecords = async (
  relatedDataSource: any,
  query: any,
): Promise<any[]> => {
  const queryResult = await relatedDataSource.query({
    ...query,
    pageSize: Math.max(
      Number(query?.pageSize) || 0,
      RELATED_QUERY_PAGE_SIZE,
    ),
    resultRecordCount: Math.max(
      Number(query?.resultRecordCount) || 0,
      RELATED_QUERY_PAGE_SIZE,
    ),
  })

  return getQueryRecords(queryResult)
}

// Lookup option and resolved-filter queries may need more than one page of
// results. Keep this on `dataSource.query(...)` so the widget does not depend
// on `queryAll(...)` support or return-shape differences.
/**
 * Runs repeated related datasource queries until all pages have been fetched.
 */
const queryPagedRelatedRecords = async (
  relatedDataSource: any,
  query: any,
): Promise<any[]> => {
  const allRecords: any[] = []
  let page = 1

  while (true) {
    const pageQuery = {
      ...query,
      page,
      pageSize: RELATED_QUERY_PAGE_SIZE,
      resultRecordCount: RELATED_QUERY_PAGE_SIZE,
    }
    const queryResult = await relatedDataSource.query(pageQuery)
    const pageRecords = getQueryRecords(queryResult)

    allRecords.push(...pageRecords)

    if (pageRecords.length < RELATED_QUERY_PAGE_SIZE) {
      return allRecords
    }

    page += 1
  }
}

/**
 * Builds a text SQL IN clause from a list of values, escaping each value for safe query use.
 */
const buildTextInClause = (fieldName: string, values: string[]): string => {
  const cleanValues = values
    .map((value) => String(value || '').trim())
    .filter((value) => value !== '')

  if (cleanValues.length === 0) {
    return '1 = 0'
  }

  const escapedValues = cleanValues.map((value) => {
    return `'${escapeSqlValue(value)}'`
  })

  return `${fieldName} IN (${escapedValues.join(', ')})`
}

/**
 * Combines an existing where clause with a numeric non-zero test for summary/breakdown rows.
 */
const buildNonZeroRelatedWhereClause = (baseWhere: string, fieldName: string): string => {
  return `(${baseWhere}) AND ${fieldName} <> 0`
}

/**
 * Splits a long value list into smaller chunks to keep ArcGIS SQL IN clauses manageable.
 */
const chunkValues = (values: string[], chunkSize: number): string[][] => {
  const chunks: string[][] = []

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize))
  }

  return chunks
}

/**
 * Queries configured related summary totals and returns them by feature UID for injection into the tree model.
 */
const queryRelatedSummaryValuesByFeatureUid = async (
  mainRecords: any[],
  fieldMap: StructureFieldMap,
  relatedDataSourceByKey: RelatedDataSourceRuntimeMap,
): Promise<RelatedSummaryValuesByFeatureUid> => {
  const summaryDefinitions = getRelatedSummaryDefinitions(fieldMap)
  const summaryValuesByFeatureUid: RelatedSummaryValuesByFeatureUid = {}

  if (summaryDefinitions.length === 0) {
    return summaryValuesByFeatureUid
  }

  for (const summary of summaryDefinitions) {
    if (summary.operation !== 'sum') {
      continue
    }

    const relatedDataSource = relatedDataSourceByKey[summary.relatedSourceKey]

    if (!relatedDataSource || typeof (relatedDataSource as any).query !== 'function') {
      continue
    }

    // Maps the related join value back to one or more main feature UIDs.
    const joinValueToFeatureUids: { [joinValue: string]: string[] } = {}

    mainRecords.forEach((record) => {
      const featureUid = getRecordFilterValue(
        record,
        fieldMap.identityFields.feature_uid.fieldName,
      )
      const joinValue = getRecordFilterValue(record, summary.joinField)

      if (featureUid === '' || joinValue === '') {
        return
      }

      if (!joinValueToFeatureUids[joinValue]) {
        joinValueToFeatureUids[joinValue] = []
      }

      if (!joinValueToFeatureUids[joinValue].includes(featureUid)) {
        joinValueToFeatureUids[joinValue].push(featureUid)
      }
    })

    const joinValues = Object.keys(joinValueToFeatureUids)
    // ArcGIS returns statistics under this generated field name.
    const statisticFieldName = `${summary.key}_sum`

    for (const joinValueChunk of chunkValues(joinValues, 75)) {
      const query = {
        where: buildTextInClause(summary.relatedJoinField, joinValueChunk),
        outFields: [summary.relatedJoinField],
        returnGeometry: false,
        groupByFieldsForStatistics: [summary.relatedJoinField],
        outStatistics: [
          {
            statisticType: 'sum',
            onStatisticField: summary.fieldName,
            outStatisticFieldName: statisticFieldName,
          },
        ],
      }

      const relatedRecords = await queryRelatedRecords(relatedDataSource, query)

      relatedRecords.forEach((relatedRecord) => {
        const relatedJoinValue = getRecordFilterValue(
          relatedRecord,
          summary.relatedJoinField,
        )
        const matchingFeatureUids = joinValueToFeatureUids[relatedJoinValue] || []

        if (matchingFeatureUids.length === 0) {
          return
        }

        const rawValue = getRecordRawValue(relatedRecord, statisticFieldName)
        const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue)

        if (Number.isNaN(numericValue)) {
          return
        }

        matchingFeatureUids.forEach((featureUid) => {
          if (!summaryValuesByFeatureUid[featureUid]) {
            summaryValuesByFeatureUid[featureUid] = {}
          }

          const existingValue = Number(
            summaryValuesByFeatureUid[featureUid][summary.key] || 0,
          )

          summaryValuesByFeatureUid[featureUid][summary.key] =
            existingValue + numericValue
        })
      })
    }
  }

  return summaryValuesByFeatureUid
}


/**
 * Reads a related breakdown group field as trimmed text.
 */
const getRelatedGroupFieldValue = (record: any, groupField: RelatedBreakdownGroupField): string => {
  const value = getRecordRawValue(record, groupField.fieldName)

  if (value === null || value === undefined)
  {
    return ''
  }

  return String(value).trim()
}

/**
 * Creates a stable internal grouping key from one or more related group fields.
 */
const getRelatedGroupKey = (record: any, groupBy: RelatedBreakdownGroupField[]): string => {
  return groupBy.map((groupField) => {
    return `${groupField.fieldName}=${getRelatedGroupFieldValue(record, groupField)}`
  }).join('|||')
}

/**
 * Creates the user-facing label for a related breakdown group from one or more group fields.
 */
const getRelatedGroupDisplayValue = (record: any, groupBy: RelatedBreakdownGroupField[]): string => {
  return groupBy.map((groupField) => {
    return getRelatedGroupFieldValue(record, groupField)
  }).filter((value) => {
    return value !== ''
  }).join(' / ')
}

/**
 * Converts a raw field value to a number and returns zero when conversion fails.
 */
const getNumberValue = (value: unknown): number => {
  const numericValue = typeof value === 'number' ? value : Number(value)

  return Number.isNaN(numericValue) ? 0 : numericValue
}

/**
 * Collects every field needed to query a related breakdown, including parent and child grouping fields.
 */
const getBreakdownOutFields = (breakdown: RelatedBreakdownDefinition): string[] => {
  const fieldNames = new Set<string>()

  fieldNames.add(breakdown.relatedJoinField)
  fieldNames.add(breakdown.sumField)

  breakdown.groupBy.forEach((groupField) => {
    fieldNames.add(groupField.fieldName)
  })

  ;(breakdown.children || []).forEach((child) => {
    if (child.sumField)
    {
      fieldNames.add(child.sumField)
    }

    child.groupBy.forEach((groupField) => {
      fieldNames.add(groupField.fieldName)
    })
  })

  return Array.from(fieldNames)
}

/**
 * Creates a related breakdown StructureNode with a summed value displayed as an appended value.
 */
const makeRelatedBreakdownNode = (
  featureUid: string,
  breakdownKey: string,
  nodeKeyPart: string,
  label: string,
  value: string,
  sumField: string,
  sumLabel: string,
  sumValue: number,
  format: any,
  children: StructureNode[]
): StructureNode => {
  return {
    nodeKey: `related|||feature_uid=${featureUid}|||${breakdownKey}|||${nodeKeyPart}`,
    fieldKey: `related:${breakdownKey}`,
    fieldName: '',
    label,
    value,
    depth: 0,
    children,
    appendedDisplayValues: [
      {
        key: 'count',
        fieldName: sumField,
        label: sumLabel,
        value: sumValue,
        format: format || 'number',
      },
    ],
  }
}

/**
 * Formats related count numbers using Australian number formatting.
 */
const formatRelatedCount = (value: number): string => {
  return value.toLocaleString('en-AU')
}

/**
 * Formats a cost/unit string into the display suffix used for stock-line child rows.
 */
const formatCostUnitDisplay = (value: string): string => {
  const parts = String(value || '').split('/').map((part) => {
    return part.trim()
  }).filter((part) => {
    return part !== ''
  })

  if (parts.length === 0)
  {
    return ''
  }

  if (parts.length === 1)
  {
    return `$${parts[0]}`
  }

  return `$${parts[0]} ${parts.slice(1).join(' ')}`
}

/**
 * Creates a display-only related StructureNode whose value is already fully formatted for the tree.
 */
const makeRelatedDisplayNode = (
  featureUid: string,
  breakdownKey: string,
  nodeKeyPart: string,
  value: string,
  children: StructureNode[]
): StructureNode => {
  return {
    nodeKey: `related|||feature_uid=${featureUid}|||${breakdownKey}|||${nodeKeyPart}`,
    fieldKey: `related:${breakdownKey}`,
    fieldName: '',
    label: '',
    value,
    depth: 0,
    children,
    appendedDisplayValues: [],
  }
}

/**
 * Queries configured related breakdown rows and builds per-feature child tree nodes.
 */
const queryRelatedBreakdownNodesByFeatureUid = async (
  mainRecords: any[],
  fieldMap: StructureFieldMap,
  relatedDataSourceByKey: RelatedDataSourceRuntimeMap,
): Promise<RelatedBreakdownNodesByFeatureUid> => {
  const breakdownDefinitions = getRelatedBreakdownDefinitions(fieldMap)
  const breakdownNodesByFeatureUid: RelatedBreakdownNodesByFeatureUid = {}

  if (breakdownDefinitions.length === 0)
  {
    return breakdownNodesByFeatureUid
  }

  for (const breakdown of breakdownDefinitions)
  {
    const relatedDataSource = relatedDataSourceByKey[breakdown.relatedSourceKey]

    if (!relatedDataSource || typeof (relatedDataSource as any).query !== 'function')
    {
      continue
    }

    const joinValueToFeatureUids: { [joinValue: string]: string[] } = {}

    mainRecords.forEach((record) => {
      const featureUid = getRecordFilterValue(
        record,
        fieldMap.identityFields.feature_uid.fieldName,
      )
      const joinValue = getRecordFilterValue(record, breakdown.joinField)

      if (featureUid === '' || joinValue === '')
      {
        return
      }

      if (!joinValueToFeatureUids[joinValue])
      {
        joinValueToFeatureUids[joinValue] = []
      }

      if (!joinValueToFeatureUids[joinValue].includes(featureUid))
      {
        joinValueToFeatureUids[joinValue].push(featureUid)
      }
    })

    const joinValues = Object.keys(joinValueToFeatureUids)

    if (joinValues.length === 0)
    {
      continue
    }

    const parentStatisticFieldName = `${breakdown.key}_sum`
    const parentGroupFieldNames = breakdown.groupBy.map((groupField) => {
      return groupField.fieldName
    })

    const firstChild = breakdown.children && breakdown.children.length > 0
      ? breakdown.children[0]
      : null

    const childStatisticFieldName = firstChild
      ? `${firstChild.key}_sum`
      : ''

    const childGroupFieldNames = firstChild
      ? firstChild.groupBy.map((groupField) => {
        return groupField.fieldName
      })
      : []

    // Intermediate nested aggregate store used before converting query results
    // into StructureNode children. The shape is feature -> parent group -> child group.
    const featureUidAggregates: {
      [featureUid: string]: {
        [parentGroupKey: string]: {
          label: string
          value: string
          sum: number
          children: {
            [childNodeKey: string]: {
              breakdownKey: string
              label: string
              value: string
              sumField: string
              sumLabel: string
              format: any
              sum: number
            }
          }
        }
      }
    } = {}

    for (const joinValueChunk of chunkValues(joinValues, 75))
    {
      const parentQuery = {
        where: buildNonZeroRelatedWhereClause(buildTextInClause(breakdown.relatedJoinField, joinValueChunk), breakdown.sumField),
        outFields: [breakdown.relatedJoinField, ...parentGroupFieldNames],
        returnGeometry: false,
        groupByFieldsForStatistics: [
          breakdown.relatedJoinField,
          ...parentGroupFieldNames,
        ],
        outStatistics: [
          {
            statisticType: 'sum',
            onStatisticField: breakdown.sumField,
            outStatisticFieldName: parentStatisticFieldName,
          },
        ],
      }

      console.log(
        '[TransactionDataSetTreeExplorer] stock parent query',
        {
          relatedSourceKey: breakdown.relatedSourceKey,
          joinField: breakdown.joinField,
          relatedJoinField: breakdown.relatedJoinField,
          gardenUidValues: joinValueChunk,
          where: parentQuery.where,
        },
      )

      const parentRecords = await queryRelatedRecords(relatedDataSource, parentQuery)

      console.log(
        '[TransactionDataSetTreeExplorer] stock parent query result',
        {
          relatedSourceKey: breakdown.relatedSourceKey,
          gardenUidValues: joinValueChunk,
          recordCount: parentRecords.length,
        },
      )

      parentRecords.forEach((relatedRecord) => {
        const relatedJoinValue = getRecordFilterValue(
          relatedRecord,
          breakdown.relatedJoinField,
        )
        const matchingFeatureUids = joinValueToFeatureUids[relatedJoinValue] || []

        if (matchingFeatureUids.length === 0)
        {
          return
        }

        const parentGroupKey = getRelatedGroupKey(relatedRecord, breakdown.groupBy)
        const parentGroupValue = getRelatedGroupDisplayValue(relatedRecord, breakdown.groupBy)
        const parentSumValue = getNumberValue(getRecordRawValue(relatedRecord, parentStatisticFieldName))

        if (parentSumValue === 0)
        {
          return
        }

        if (parentGroupKey === '' || parentGroupValue === '')
        {
          return
        }

        matchingFeatureUids.forEach((featureUid) => {
          if (!featureUidAggregates[featureUid])
          {
            featureUidAggregates[featureUid] = {}
          }

          if (!featureUidAggregates[featureUid][parentGroupKey])
          {
            featureUidAggregates[featureUid][parentGroupKey] = {
              label: breakdown.label,
              value: parentGroupValue,
              sum: 0,
              children: {},
            }
          }

          featureUidAggregates[featureUid][parentGroupKey].sum += parentSumValue
        })
      })

      if (firstChild)
      {
        const childQuery = {
          where: buildNonZeroRelatedWhereClause(buildTextInClause(breakdown.relatedJoinField, joinValueChunk), firstChild.sumField || breakdown.sumField),
          outFields: [
            breakdown.relatedJoinField,
            ...parentGroupFieldNames,
            ...childGroupFieldNames,
          ],
          returnGeometry: false,
          groupByFieldsForStatistics: [
            breakdown.relatedJoinField,
            ...parentGroupFieldNames,
            ...childGroupFieldNames,
          ],
          outStatistics: [
            {
              statisticType: 'sum',
              onStatisticField: firstChild.sumField || breakdown.sumField,
              outStatisticFieldName: childStatisticFieldName,
            },
          ],
        }

        console.log(
          '[TransactionDataSetTreeExplorer] stock child query',
          {
            relatedSourceKey: breakdown.relatedSourceKey,
            joinField: breakdown.joinField,
            relatedJoinField: breakdown.relatedJoinField,
            gardenUidValues: joinValueChunk,
            where: childQuery.where,
          },
        )

        const childRecords = await queryRelatedRecords(relatedDataSource, childQuery)

        console.log(
          '[TransactionDataSetTreeExplorer] stock child query result',
          {
            relatedSourceKey: breakdown.relatedSourceKey,
            gardenUidValues: joinValueChunk,
            recordCount: childRecords.length,
          },
        )

        childRecords.forEach((relatedRecord) => {
          const relatedJoinValue = getRecordFilterValue(
            relatedRecord,
            breakdown.relatedJoinField,
          )
          const matchingFeatureUids = joinValueToFeatureUids[relatedJoinValue] || []

          if (matchingFeatureUids.length === 0)
          {
            return
          }

          const parentGroupKey = getRelatedGroupKey(relatedRecord, breakdown.groupBy)
          const parentGroupValue = getRelatedGroupDisplayValue(relatedRecord, breakdown.groupBy)
          const childGroupKey = getRelatedGroupKey(relatedRecord, firstChild.groupBy)
          const childGroupValue = getRelatedGroupDisplayValue(relatedRecord, firstChild.groupBy)
          const childSumField = firstChild.sumField || breakdown.sumField
          const childSumValue = getNumberValue(getRecordRawValue(relatedRecord, childStatisticFieldName))

          if (childSumValue === 0)
          {
            return
          }

          if (
            parentGroupKey === '' ||
            parentGroupValue === '' ||
            childGroupKey === '' ||
            childGroupValue === ''
          )
          {
            return
          }

          matchingFeatureUids.forEach((featureUid) => {
            if (!featureUidAggregates[featureUid])
            {
              featureUidAggregates[featureUid] = {}
            }

            if (!featureUidAggregates[featureUid][parentGroupKey])
            {
              featureUidAggregates[featureUid][parentGroupKey] = {
                label: breakdown.label,
                value: parentGroupValue,
                sum: 0,
                children: {},
              }
            }

            if (!featureUidAggregates[featureUid][parentGroupKey].children[childGroupKey])
            {
              featureUidAggregates[featureUid][parentGroupKey].children[childGroupKey] = {
                breakdownKey: firstChild.key,
                label: firstChild.label,
                value: childGroupValue,
                sumField: childSumField,
                sumLabel: firstChild.sumLabel || breakdown.sumLabel || 'Count',
                format: firstChild.format || breakdown.format || 'number',
                sum: 0,
              }
            }

            featureUidAggregates[featureUid][parentGroupKey].children[childGroupKey].sum += childSumValue
          })
        })
      }
    }

    Object.keys(featureUidAggregates).forEach((featureUid) => {
      if (!breakdownNodesByFeatureUid[featureUid])
      {
        breakdownNodesByFeatureUid[featureUid] = []
      }

      Object.keys(featureUidAggregates[featureUid]).sort((first, second) => {
        return featureUidAggregates[featureUid][first].value.localeCompare(
          featureUidAggregates[featureUid][second].value,
          undefined,
          { numeric: true, sensitivity: 'base' },
        )
      }).forEach((parentGroupKey) => {
        const parentAggregate = featureUidAggregates[featureUid][parentGroupKey]
        const childNodes = Object.keys(parentAggregate.children).sort((first, second) => {
          return parentAggregate.children[first].value.localeCompare(
            parentAggregate.children[second].value,
            undefined,
            { numeric: true, sensitivity: 'base' },
          )
        }).map((childGroupKey) => {
          const childAggregate = parentAggregate.children[childGroupKey]
          const costUnitDisplay = formatCostUnitDisplay(childAggregate.value)
          const childValue = `${formatRelatedCount(childAggregate.sum)} x ${parentAggregate.value}${costUnitDisplay !== '' ? ` - ${costUnitDisplay}` : ''}`

          return makeRelatedDisplayNode(
            featureUid,
            childAggregate.breakdownKey,
            `${parentGroupKey}|||${childGroupKey}`,
            childValue,
            [],
          )
        })

        const parentTotal = childNodes.reduce((total, childNode) => {
          const countText = String(childNode.value || '').split(' x ')[0]
          const countValue = Number(countText.replace(/,/g, ''))

          return Number.isNaN(countValue) ? total : total + countValue
        }, 0)
        const parentValue = `${formatRelatedCount(parentTotal || parentAggregate.sum)} x ${parentAggregate.value}`

        breakdownNodesByFeatureUid[featureUid].push(
          makeRelatedDisplayNode(
            featureUid,
            breakdown.key,
            parentGroupKey,
            parentValue,
            childNodes,
          ),
        )
      })
    })
  }

  return breakdownNodesByFeatureUid
}

/**
 * Builds sorted direct-filter options from records already loaded in the main datasource.
 */
const getFilterOptionsFromRecords = (
  records: any[],
  filterField: ConfiguredFilterField,
): FilterOption[] => {
  const values = new Map<string, FilterOption>()

  records.forEach((record) => {
    const value = getRecordFilterValue(record, filterField.fieldName)

    if (value !== '' && !values.has(value)) {
      values.set(value, {
        label: value,
        value,
      })
    }
  })

  return Array.from(values.values()).sort((first, second) => {
    return first.label.localeCompare(second.label, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

/**
 * Applies the current search text to a filter option list.
 */
const getVisibleFilterOptions = (
  options: FilterOption[],
  searchText: string,
): FilterOption[] => {
  const cleanSearchText = String(searchText || '')
    .trim()
    .toLowerCase()

  if (cleanSearchText === '') {
    return options
  }

  return options.filter((optionValue) => {
    return optionValue.label.toLowerCase().includes(cleanSearchText)
  })
}

/**
 * Applies active direct filters to the main datasource records in memory.
 */
const getMainSourceFilteredRecords = (
  records: any[],
  configuredFilters: ConfiguredFilterField[],
  selectedFilterValues: { [key: string]: string },
): any[] => {
  const activeFilters = configuredFilters.filter((filterField) => {
    return (
      filterField.source === 'direct' &&
      String(selectedFilterValues[filterField.id] || '').trim() !== ''
    )
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

// Direct filters read options and values from the main datasource. Resolved
// filters keep the dropdown options source separate from the resolve source so
// a lookup table can provide clean labels while a related/summary table maps
// the selected value back to main-tree IDs.
/**
 * Queries related or lookup datasources to build dropdown options for non-direct filters.
 */
const queryRelatedFilterOptions = async (
  filterField: ConfiguredFilterField,
  relatedDataSourceByKey: RelatedDataSourceRuntimeMap,
): Promise<FilterOption[]> => {
  if (
    (filterField.source !== 'relatedBreakdown' &&
      filterField.source !== 'resolvedLookup') ||
    !filterField.filterDisplayField ||
    !filterField.filterValueField
  ) {
    return []
  }

  const optionsSourceKey = filterField.source === 'resolvedLookup'
    ? filterField.filterOptionsSourceKey
    : filterField.relatedSourceKey
  const relatedDataSource = optionsSourceKey
    ? relatedDataSourceByKey[optionsSourceKey]
    : null

  if (!relatedDataSource || typeof (relatedDataSource as any).query !== 'function') {
    return []
  }

  const relatedRecords = await queryPagedRelatedRecords(relatedDataSource, {
    where: '1 = 1',
    outFields: [
      filterField.filterDisplayField,
      filterField.filterValueField,
    ],
    returnGeometry: false,
  })

  const optionsByValue = new Map<string, FilterOption>()

  relatedRecords.forEach((relatedRecord) => {
    const optionValue = getRecordFilterValue(
      relatedRecord,
      filterField.filterValueField || '',
    )
    const optionLabel = getRecordFilterValue(
      relatedRecord,
      filterField.filterDisplayField || '',
    )

    if (optionValue === '' || optionLabel === '' || optionsByValue.has(optionValue)) {
      return
    }

    optionsByValue.set(optionValue, {
      label: optionLabel,
      value: optionValue,
    })
  })

  return Array.from(optionsByValue.values()).sort((first, second) => {
    return first.label.localeCompare(second.label, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

/**
 * Finds the main datasource field that a non-direct filter should ultimately constrain.
 */
const resolveFilterTargetField = (
  filterField: ConfiguredFilterField,
  structureFieldMap: StructureFieldMap,
): string => {
  if (filterField.source === 'resolvedLookup') {
    const configuredTargetField = String(filterField.targetField || '').trim()

    if (configuredTargetField !== '') {
      return configuredTargetField
    }

    return structureFieldMap.identityFields.feature_uid.fieldName
  }

  return String(filterField.joinField || '').trim()
}

/**
 * Returns a readable datasource name for debug logs.
 */
const getRelatedDataSourceDebugName = (relatedDataSource: any): string => {
  if (typeof relatedDataSource?.getLabel === 'function') {
    return String(relatedDataSource.getLabel() || '').trim()
  }

  return String(relatedDataSource?.id || '').trim()
}

/**
 * Resolves a selected related/lookup filter value into main datasource join values.
 */
const resolveFilterJoinValues = async (
  filterField: ConfiguredFilterField,
  selectedValue: string,
  relatedDataSourceByKey: RelatedDataSourceRuntimeMap,
  structureFieldMap: StructureFieldMap,
): Promise<{
  targetField: string
  resolvedWhereClause: string
  resolvedJoinValues: string[]
}> => {
  const resolveSourceKey = filterField.source === 'resolvedLookup'
    ? filterField.filterResolveSourceKey
    : filterField.relatedSourceKey
  const resolveValueField = filterField.source === 'resolvedLookup'
    ? filterField.filterResolveValueField
    : filterField.filterValueField
  const resolveJoinField = filterField.source === 'resolvedLookup'
    ? filterField.filterResolveJoinField
    : filterField.relatedJoinField
  const targetField = resolveFilterTargetField(filterField, structureFieldMap)

  if (!resolveSourceKey || !resolveValueField || !resolveJoinField || !targetField) {
    return {
      targetField,
      resolvedWhereClause: '',
      resolvedJoinValues: [],
    }
  }

  const relatedDataSource = relatedDataSourceByKey[resolveSourceKey]
  const resolvedWhereClause = buildTextEqualityClause(resolveValueField, selectedValue)

  if (!relatedDataSource || typeof (relatedDataSource as any).query !== 'function') {
    console.warn('[TransactionDataSetTreeExplorer] resolved filter datasource unavailable', {
      filterId: filterField.id,
      selectedSpeciesUid: selectedValue,
      resolveSourceKey,
      targetField,
    })

    return {
      targetField,
      resolvedWhereClause,
      resolvedJoinValues: [],
    }
  }

  const relatedRecords = await queryPagedRelatedRecords(relatedDataSource, {
    where: resolvedWhereClause,
    outFields: [resolveJoinField],
    returnGeometry: false,
  })
  const resolvedJoinValues = Array.from(new Set(
    relatedRecords
      .map((relatedRecord) => {
        return getRecordFilterValue(relatedRecord, resolveJoinField)
      })
      .filter((value) => value !== ''),
  ))

  console.log('[TransactionDataSetTreeExplorer] resolved filter debug', {
    filterId: filterField.id,
    selectedSpeciesUid: selectedValue,
    resolveDataSourceId: String((relatedDataSource as any)?.id || ''),
    resolveDataSourceName: getRelatedDataSourceDebugName(relatedDataSource),
    resolveWhereClause: resolvedWhereClause,
    resolveRecordCount: relatedRecords.length,
    firstResolvedGardenUids: resolvedJoinValues.slice(0, 5),
    mainTargetField: targetField,
  })

  return {
    targetField,
    resolvedWhereClause,
    resolvedJoinValues,
  }
}

/**
 * Applies active non-direct filters by resolving them into join-value sets and filtering main records.
 */
const getRelatedBreakdownFilteredRecords = async (
  records: any[],
  configuredFilters: ConfiguredFilterField[],
  selectedFilterValues: { [key: string]: string },
  relatedDataSourceByKey: RelatedDataSourceRuntimeMap,
  structureFieldMap: StructureFieldMap,
): Promise<any[]> => {
  // Direct filters have already been applied against the main datasource.
  // Any non-direct filter resolves the selected lookup value into a set of
  // target IDs, then the main records must satisfy every active resolved set.
  const activeRelatedFilters = configuredFilters.filter((filterField) => {
    return (
      filterField.source !== 'direct' &&
      String(selectedFilterValues[filterField.id] || '').trim() !== ''
    )
  })

  if (activeRelatedFilters.length === 0) {
    return records
  }

  const matchingJoinValuesByFilterId: { [filterId: string]: Set<string> } = {}
  const targetFieldByFilterId: { [filterId: string]: string } = {}

  for (const filterField of activeRelatedFilters) {
    const selectedValue = String(selectedFilterValues[filterField.id] || '').trim()
    const resolvedFilter = await resolveFilterJoinValues(
      filterField,
      selectedValue,
      relatedDataSourceByKey,
      structureFieldMap,
    )

    targetFieldByFilterId[filterField.id] = resolvedFilter.targetField
    matchingJoinValuesByFilterId[filterField.id] = new Set(
      resolvedFilter.resolvedJoinValues,
    )
  }

  const filteredRecords = records.filter((record) => {
    return activeRelatedFilters.every((filterField) => {
      const targetField =
        targetFieldByFilterId[filterField.id] ||
        resolveFilterTargetField(filterField, structureFieldMap)
      const joinFieldValue = getRecordFilterValue(record, targetField)
      const matchingJoinValues = matchingJoinValuesByFilterId[filterField.id]

      if (!matchingJoinValues || matchingJoinValues.size === 0) {
        return false
      }

      return matchingJoinValues.has(joinFieldValue)
    })
  })

  activeRelatedFilters.forEach((filterField) => {
    console.log('[TransactionDataSetTreeExplorer] resolved filter client-side result', {
      filterId: filterField.id,
      selectedSpeciesUid: String(selectedFilterValues[filterField.id] || '').trim(),
      mainTargetFieldUsed:
        targetFieldByFilterId[filterField.id] ||
        resolveFilterTargetField(filterField, structureFieldMap),
      finalRecordCountAfterFilter: filteredRecords.length,
    })
  })

  return filteredRecords
}

/**
 * Builds an escaped text equality where clause for ArcGIS queries and layer-view filters.
 */
const buildTextEqualityClause = (fieldName: string, value: string): string => {
  return `${fieldName} = '${escapeSqlValue(value)}'`
}

/**
 * Main Experience Builder runtime component for the Transaction Tree Viewer widget.
 */
const Widget = (props: AllWidgetProps<Config>) => {
  // -----------------------------
  // React state: datasource connections
  // -----------------------------
  // `activeFeatureDs` is the main active/current feature datasource. It is the
  // source used to build the hierarchy, provide direct filters, and coordinate
  // map selection.
  const [activeFeatureDs, setActiveFeatureDs] = useState<DataSource | null>(
    null,
  )
  // `relatedDataSourceByKey` stores connected related/lookup datasources by
  // field-map source key, for example stock summary, species lookup, or other
  // project-specific related tables.
  const [relatedDataSourceByKey, setRelatedDataSourceByKey] =
    useState<RelatedDataSourceRuntimeMap>({})
  // `relatedDataSourceError` holds the latest related datasource connection or query error shown in the UI.
  const [relatedDataSourceError, setRelatedDataSourceError] = useState('')
  // `relatedBreakdownNodesByFeatureUid` caches lazy-loaded related child nodes, keyed by feature UID.
  const [relatedBreakdownNodesByFeatureUid, setRelatedBreakdownNodesByFeatureUid] =
    useState<RelatedBreakdownNodesByFeatureUid>({})
  // Tracks which feature UIDs are currently loading related breakdown rows.
  const [loadingRelatedBreakdownFeatureUids, setLoadingRelatedBreakdownFeatureUids] =
    useState<{ [feature_uid: string]: boolean }>({})
  // Stores lazy-load related breakdown errors per feature UID.
  const [relatedBreakdownErrorsByFeatureUid, setRelatedBreakdownErrorsByFeatureUid] =
    useState<{ [feature_uid: string]: string }>({})

  // -----------------------------
  // React state: map, loading, and hierarchy model
  // -----------------------------
  // `jimuMapView` is the active Experience Builder map view connected to this widget.
  const [jimuMapView, setJimuMapView] = useState<JimuMapView | null>(null)
  // `isLoadingFeatures` controls main datasource loading state messages.
  const [isLoadingFeatures, setIsLoadingFeatures] = useState(false)
  // `loadError` stores main datasource load/validation errors shown in the UI.
  const [loadError, setLoadError] = useState('')
  // `recordCount` stores the count of records currently loaded in the main datasource.
  const [recordCount, setRecordCount] = useState(0)
  // `availableFieldNames` is the current field list from the main datasource, used to validate the field map.
  const [availableFieldNames, setAvailableFieldNames] = useState<string[]>([])
  // `structureHierarchy` is the nested tree model rendered by StructureTree.
  const [structureHierarchy, setStructureHierarchy] = useState<StructureNode[]>(
    [],
  )
  // `isolatedTopLevelValues` stores selected first-level groups used to filter map visibility.
  const [isolatedTopLevelValues, setIsolatedTopLevelValues] = useState<
    string[]
  >([])

  // -----------------------------
  // React state: filters and tree interaction
  // -----------------------------
  // `selectedFilterValues` stores the active selected value for each configured filter ID.
  const [selectedFilterValues, setSelectedFilterValues] = useState<{
    [key: string]: string
  }>({})
  // `relatedFilterOptionsById` caches dropdown options for filters that need related/lookup datasource queries.
  const [relatedFilterOptionsById, setRelatedFilterOptionsById] = useState<{
    [key: string]: FilterOption[]
  }>({})
  // `filterSearchValues` stores the text currently typed into each searchable filter input.
  const [filterSearchValues, setFilterSearchValues] = useState<{
    [key: string]: string
  }>({})
  // `openFilterIds` tracks which filter dropdowns are currently open.
  const [openFilterIds, setOpenFilterIds] = useState<string[]>([])
  // `expandedNodeKeys` stores the structure tree nodes currently expanded.
  const [expandedNodeKeys, setExpandedNodeKeys] = useState<string[]>([])
  // `selectedFeatureUid` is the widget-local selected feature identity. It remains independent of shared ExB selection.
  const [selectedFeatureUid, setSelectedFeatureUid] = useState('')
  // `selectionError` stores selection/map synchronisation errors shown in the UI.
  const [selectionError, setSelectionError] = useState('')

  // -----------------------------
  // React state: optional linked feature attributes
  // -----------------------------
  // `expandedFeatureAttributeKeys` stores opened feature-attribute panels using a compound feature/attribute key.
  const [expandedFeatureAttributeKeys, setExpandedFeatureAttributeKeys] =
    useState<string[]>([])
  // Tracks which feature-attribute panels are currently loading linked records.
  const [loadingFeatureAttributeKeys, setLoadingFeatureAttributeKeys] =
    useState<{ [key: string]: boolean }>({})
  // Caches linked feature-attribute records by compound feature/attribute key.
  const [featureAttributeRecords, setFeatureAttributeRecords] = useState<{
    [key: string]: BasicLinkedTableRecord[]
  }>({})
  // Stores linked feature-attribute load errors by compound feature/attribute key.
  const [featureAttributeErrors, setFeatureAttributeErrors] = useState<{
    [key: string]: string
  }>({})

  // -----------------------------
  // Refs: ArcGIS handles, DOM nodes, request guards, and stable callback bridges
  // -----------------------------
  // Active map highlight handle. Stored in a ref so it can be removed without causing a render.
  const highlightHandleRef = useRef<HighlightHandle | null>(null)
  // Active map click event handle. Cleared and recreated as map/datasource dependencies change.
  const mapClickHandleRef = useRef<ViewEventHandle | null>(null)
  // Layer view currently carrying a map visibility filter, so that filter can be cleared before applying the next one.
  const activeIsolateLayerViewRef = useRef<any | null>(null)
  // DOM references to feature rows, keyed by feature UID, used for auto-scrolling to selection.
  const featureRowRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  // Last selected feature UID that was auto-scrolled, preventing repeated scroll calls for the same selection.
  const lastAutoScrolledFeatureUidRef = useRef('')
  // Monotonic request ID used to ignore stale feature-attribute async results.
  const featureAttributeRequestIdRef = useRef(0)
  // Monotonic request ID used to ignore stale hierarchy/related-summary async results.
  const relatedSummaryRequestIdRef = useRef(0)
  // Monotonic request ID used to ignore stale related-filter option async results.
  const relatedFilterOptionsRequestIdRef = useRef(0)
  // Monotonic request ID used to ignore stale async map-filter results.
  const mapFilterRequestIdRef = useRef(0)
  // Last map visibility where clause applied by filters/isolation, kept for diagnostics.
  const lastVisibilityWhereRef = useRef('')
  // Marker used to ignore the next datasource-selection event caused by deliberate selection clearing.
  const ignoredSelectionChangeReasonRef = useRef('')
  // Stable bridge to the latest layer-view lookup function from async/event callbacks.
  const findMatchingJimuLayerViewRef = useRef<() => any | null>(() => null)
  // Stable bridge used by map-click handlers to select a feature with the latest component state.
  const selectFeatureRef = useRef<(feature_uid: string) => void>(() => {})
  // Stable bridge used by event handlers to clear selection with the latest component state.
  const clearSelectedFeatureRef = useRef<() => void>(() => {})

  // -----------------------------
  // Derived configuration
  // -----------------------------
  // Parse and validate the JSON field map supplied by the setting panel.
  const fieldMapParseResult = parseStructureFieldMap(props.config?.fieldMapJson)
  // Parsed field-map object. Null means the JSON is missing or invalid.
  const structureFieldMap = fieldMapParseResult.fieldMap
  // Related datasource keys required by summaries, breakdowns, and filters.
  const configuredRelatedSourceKeys = getRelatedSourceKeysFromFieldMap(
    structureFieldMap,
  )
  // Map of related source key to useDataSources slot index.
  const relatedSourceKeyIndexMap = getRelatedSourceKeyIndexMap(structureFieldMap)
  // Experience Builder datasource slot assumptions:
  // useDataSources[0] = main tree datasource
  // useDataSources[1..] = configured related/lookup sources in first-seen key order
  const getUseDataSourceAtIndex = (index: number) => {
    return props.useDataSources && props.useDataSources.length > index
      ? props.useDataSources[index]
      : null
  }
  // Runtime binding plan for each configured related datasource.
  const configuredRelatedUseDataSources = configuredRelatedSourceKeys.map((sourceKey) => {
    const dataSourceIndex = relatedSourceKeyIndexMap[sourceKey]

    return {
      sourceKey,
      dataSourceIndex,
      useDataSource: getUseDataSourceAtIndex(dataSourceIndex),
    }
  })
  // True when at least one related datasource has been configured in Experience Builder.
  const hasConfiguredRelatedDataSource = configuredRelatedUseDataSources.some((entry) => {
    return !!entry.useDataSource
  })
  // Header text values, using configured values when present and defaults otherwise.
  const rawWidgetTitle = props.config?.widgetTitle
  const rawWidgetSubtitle = props.config?.widgetSubtitle
  const configuredWidgetTitle = String(rawWidgetTitle || '').trim()
  const configuredWidgetSubtitle = String(rawWidgetSubtitle || '').trim()
  const widgetTitle = configuredWidgetTitle !== '' ? configuredWidgetTitle : DEFAULT_WIDGET_TITLE
  const widgetSubtitle = rawWidgetSubtitle === undefined
    ? DEFAULT_WIDGET_SUBTITLE
    : configuredWidgetSubtitle

  // Validation result used to block rendering when configured fields are missing from the datasource.
  const fieldValidationResult = structureFieldMap
    ? validateFieldMapAgainstAvailableFields(
        structureFieldMap,
        availableFieldNames,
      )
    : null
  // Filter controls generated from the field map.
  const configuredFilterFields = structureFieldMap
    ? getFilteredHierarchyFields(structureFieldMap)
    : []

  // Main datasource query used by the DataSourceComponent.
  const dataSourceQuery: ActiveFeatureDataSourceQuery = {
    outFields: ['*'],
    pageSize: ACTIVE_FEATURE_DS_PAGE_SIZE,
  }

  /**
   * Returns the configured main datasource ID, falling back to the active datasource instance when needed.
   */
  const getConfiguredDataSourceId = (): string => {
    return String(
      (props.useDataSources &&
        props.useDataSources[0] &&
        (props.useDataSources[0] as any).dataSourceId) ||
        (activeFeatureDs as any)?.id ||
        '',
    )
  }

  /**
   * Returns the normalised URL for the main datasource layer.
   */
  const getConfiguredDataSourceUrl = (): string => {
    const dataSourceJson =
      activeFeatureDs && activeFeatureDs.getDataSourceJson
        ? (activeFeatureDs.getDataSourceJson() as any)
        : null

    return normaliseUrl(dataSourceJson?.url)
  }

  /**
   * Returns the user-facing label for the main datasource.
   */
  const getConfiguredDataSourceLabel = (): string => {
    if (!activeFeatureDs || !activeFeatureDs.getLabel) {
      return ''
    }

    return activeFeatureDs.getLabel()
  }

  /**
   * Checks whether a Jimu layer view/layer belongs to the configured main datasource.
   */
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

  /**
   * Removes the current map highlight, if one exists.
   */
  const clearMapHighlight = () => {
    if (highlightHandleRef.current) {
      highlightHandleRef.current.remove()
      highlightHandleRef.current = null
    }
  }

  /**
   * Removes the current map click listener, if one exists.
   */
  const clearMapClickHandle = () => {
    if (mapClickHandleRef.current) {
      mapClickHandleRef.current.remove()
      mapClickHandleRef.current = null
    }
  }

  /**
   * Closes map popups and clears popup state so selection highlighting stays clean.
   */
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

  /**
   * Clears shared Experience Builder datasource selection after the widget has captured the selected UID.
   */
  const clearFeatureDataSourceSelection = (reason: string) => {
    console.log('[TransactionDataSetTreeExplorer] clearing shared selection', {
      source: reason,
      selectedUid: selectedFeatureUid,
      selectedFilterValues,
      finalVisibilityWhere: lastVisibilityWhereRef.current,
      ...getDataSourceSelectionDebugState(activeFeatureDs),
    })

    ignoredSelectionChangeReasonRef.current = reason
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

  /**
   * Finds the Jimu layer view associated with the configured main datasource.
   */
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

  /**
   * Expands the tree path needed to reveal a feature by UID.
   */
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


  /**
   * Lazy-loads related breakdown child nodes for one feature node.
   */
  const loadRelatedBreakdownsForFeatureNode = async (node: StructureNode) => {
    const featureUid = String(node.feature_uid || '').trim()

    if (!activeFeatureDs || !structureFieldMap || featureUid === '') {
      return
    }

    if (relatedBreakdownNodesByFeatureUid[featureUid] || loadingRelatedBreakdownFeatureUids[featureUid]) {
      return
    }

    const records = getLoadedRecordsFromDataSource(activeFeatureDs)
    const matchingRecord = records.find((record) => {
      return getRecordFilterValue(record, structureFieldMap.identityFields.feature_uid.fieldName) === featureUid
    })

    if (!matchingRecord) {
      return
    }

    const queriedGardenUid = getRecordFilterValue(
      matchingRecord,
      structureFieldMap.hierarchyFields.find((field) => {
        return (field.relatedBreakdowns || []).length > 0
      })?.relatedBreakdowns?.[0]?.joinField || '',
    )

    console.log(
      '[TransactionDataSetTreeExplorer] lazy-load stock breakdown start',
      {
        featureUid,
        gardenUid: queriedGardenUid,
      },
    )

    setLoadingRelatedBreakdownFeatureUids((previous) => {
      return {
        ...previous,
        [featureUid]: true,
      }
    })
    setRelatedBreakdownErrorsByFeatureUid((previous) => {
      const next = { ...previous }
      delete next[featureUid]
      return next
    })

    try {
      const breakdownNodesByFeatureUid = await queryRelatedBreakdownNodesByFeatureUid(
        [matchingRecord],
        structureFieldMap,
        relatedDataSourceByKey,
      )

      setRelatedBreakdownNodesByFeatureUid((previous) => {
        return {
          ...previous,
          [featureUid]: breakdownNodesByFeatureUid[featureUid] || [],
        }
      })

      console.log(
        '[TransactionDataSetTreeExplorer] lazy-load stock breakdown complete',
        {
          featureUid,
          gardenUid: queriedGardenUid,
          renderedRowCount: (breakdownNodesByFeatureUid[featureUid] || []).length,
        },
      )
    } catch (error) {
      console.warn(
        '[TransactionDataSetTreeExplorer] lazy-load stock breakdown failed',
        {
          featureUid,
          gardenUid: queriedGardenUid,
          error,
        },
      )
      setRelatedBreakdownErrorsByFeatureUid((previous) => {
        return {
          ...previous,
          [featureUid]: error instanceof Error
            ? error.message
            : 'Failed to load plant breakdown lines.',
        }
      })
    } finally {
      setLoadingRelatedBreakdownFeatureUids((previous) => {
        const next = { ...previous }
        delete next[featureUid]
        return next
      })
    }
  }

  /**
   * Expands or collapses one tree node.
   */
  const toggleNode = (nodeKey: string) => {
    setExpandedNodeKeys((previous) => {
      if (previous.includes(nodeKey)) {
        return previous.filter((value) => value !== nodeKey)
      }

      return [...previous, nodeKey]
    })
  }

  /**
   * Collapses the whole tree.
   */
  const collapseAll = () => {
    setExpandedNodeKeys([])
  }

  /**
   * Expands a branch and preloads related breakdowns for all feature nodes under that branch.
   */
  const expandBranch = (nodeKey: string) => {
    const matchingNode = findNodeByKey(structureHierarchy, nodeKey)

    if (!matchingNode) {
      return
    }

    setExpandedNodeKeys((previous) => {
      const mergedKeys = new Set([
        ...previous,
        ...getExpandableNodeKeysForBranch(matchingNode),
      ])

      return Array.from(mergedKeys)
    })

    getFeatureNodesFromBranch(matchingNode).forEach((featureNode) => {
      void loadRelatedBreakdownsForFeatureNode(featureNode)
    })
  }

  /**
   * Toggles a first-level hierarchy value in the map isolation filter.
   */
  const toggleTopLevelIsolation = (topLevelValue: string) => {
    setIsolatedTopLevelValues((previous) => {
      if (previous.includes(topLevelValue)) {
        return previous.filter((value) => value !== topLevelValue)
      }

      return [...previous, topLevelValue]
    })
  }

  /**
   * Clears all active top-level isolation values.
   */
  const clearIsolation = () => {
    setIsolatedTopLevelValues([])
  }

  /**
   * Stores a selected filter value, mirrors the label into the search text, and closes the dropdown.
   */
  const setConfiguredFilterValue = (
    filterField: ConfiguredFilterField,
    value: string,
    label?: string,
  ) => {
    console.log('[TransactionDataSetTreeExplorer] setSelectedFilterValues invoked', {
      source: 'setConfiguredFilterValue',
      filterId: filterField.id,
      nextValue: value,
    })
    setSelectedFilterValues((previous) => {
      return {
        ...previous,
        [filterField.id]: value,
      }
    })

    setFilterSearchValues((previous) => {
      return {
        ...previous,
        [filterField.id]: label || value,
      }
    })

    setOpenFilterIds((previous) => {
      return previous.filter((id) => id !== filterField.id)
    })
  }

  /**
   * Stores the current typed search text for a filter input.
   */
  const setFilterSearchValue = (filterId: string, value: string) => {
    setFilterSearchValues((previous) => {
      return {
        ...previous,
        [filterId]: value,
      }
    })
  }

  /**
   * Marks one filter dropdown as open.
   */
  const openConfiguredFilter = (filterId: string) => {
    setOpenFilterIds((previous) => {
      if (previous.includes(filterId)) {
        return previous
      }

      return [...previous, filterId]
    })
  }

  /**
   * Marks one filter dropdown as closed.
   */
  const closeConfiguredFilter = (filterId: string) => {
    setOpenFilterIds((previous) => {
      return previous.filter((id) => id !== filterId)
    })
  }

  /**
   * Clears one selected filter and its search text.
   */
  const clearConfiguredFilter = (filterId: string) => {
    console.log('[TransactionDataSetTreeExplorer] setSelectedFilterValues invoked', {
      source: 'clearConfiguredFilter',
      filterId,
      nextValue: null,
    })
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

  /**
   * Expands or collapses an optional linked feature-attribute panel.
   */
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

  /**
   * Reads available fields from the main datasource and stores them for field-map validation.
   */
  const updateAvailableFieldNamesFromDataSource = (
    dataSource: DataSource,
  ): string[] => {
    const fieldNames = getAvailableFieldNamesFromDataSource(dataSource)

    setAvailableFieldNames(fieldNames)

    return fieldNames
  }

  /**
   * Updates the loaded main-record count shown by the widget.
   */
  const refreshRecordCountFromDataSource = (dataSource: DataSource) => {
    setRecordCount(getLoadedRecordCountFromDataSource(dataSource))
  }

  /**
   * Adds or removes a related datasource instance in the runtime datasource map.
   */
  const setRelatedDataSourceForKey = (key: string, dataSource: DataSource | null) => {
    setRelatedDataSourceByKey((previous) => {
      const next = { ...previous }

      if (dataSource) {
        next[key] = dataSource
      } else {
        delete next[key]
      }

      return next
    })
  }

  /**
   * Rebuilds the visible tree from loaded main records, active filters, and related summary values.
   */
  const refreshStructureHierarchyFromDataSource = async (
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
    const mainSourceFilteredRecords = getMainSourceFilteredRecords(
      records,
      getFilteredHierarchyFields(structureFieldMap),
      selectedFilterValues,
    )

    // Request guard: if filters/config change while async queries are running,
    // later code checks this ID and ignores stale results.
    const requestId = relatedSummaryRequestIdRef.current + 1
    relatedSummaryRequestIdRef.current = requestId
    let filteredRecords = mainSourceFilteredRecords

    let relatedSummaryValuesByFeatureUid: RelatedSummaryValuesByFeatureUid = {}

    try {
      filteredRecords = await getRelatedBreakdownFilteredRecords(
        mainSourceFilteredRecords,
        getFilteredHierarchyFields(structureFieldMap),
        selectedFilterValues,
        relatedDataSourceByKey,
        structureFieldMap,
      )

      if (relatedSummaryRequestIdRef.current !== requestId) {
        return
      }

      relatedSummaryValuesByFeatureUid =
        await queryRelatedSummaryValuesByFeatureUid(
          filteredRecords,
          structureFieldMap,
          relatedDataSourceByKey,
        )

      setRelatedDataSourceError('')
    } catch (error) {
      console.warn('Failed to query related summary values.', error)
      setRelatedDataSourceError(
        error instanceof Error
          ? error.message
          : 'Failed to query the Summary Attribute View Table.',
      )
    }

    if (relatedSummaryRequestIdRef.current !== requestId) {
      return
    }

    const hierarchy = buildStructureHierarchyFromRecords(
      filteredRecords,
      structureFieldMap,
      relatedSummaryValuesByFeatureUid,
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

  /**
   * Captures an external Experience Builder datasource selection and converts it into local widget selection.
   */
  const acceptExternalSelectedUid = (
    dataSource: DataSource | null,
    source: 'datasource-selection',
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

    const filterDebugState = getActiveFilterDebugState(
      configuredFilterFields,
      selectedFilterValues,
    )
    console.log('[TransactionDataSetTreeExplorer] external selection captured', {
      source,
      selectedUid: selectedFeatureUidFromDataSource,
      activeDirectFiltersBeforeSelection: filterDebugState.activeDirectFilters,
      activeResolvedFiltersBeforeSelection: filterDebugState.activeResolvedFilters,
      activeIsolateBeforeSelection: [...isolatedTopLevelValues],
      finalVisibilityWhereBeforeSelection: lastVisibilityWhereRef.current,
      selectedUidExcludedFromVisibilityFiltering: true,
      ...getDataSourceSelectionDebugState(dataSource),
    })

    if (selectedFeatureUid === selectedFeatureUidFromDataSource) {
      clearFeatureDataSourceSelection('clear-shared-selection')
      console.log('[TransactionDataSetTreeExplorer] external selection ignored', {
        source,
        selectedUid: selectedFeatureUidFromDataSource,
        reason: 'uid-already-stored-shared-selection-cleared',
      })
      return
    }

    // Shared ExB datasource selection must not become the visibility source of
    // truth for this widget. Capture the selected UID, then clear the shared
    // selection so filters and isolate remain the only visibility drivers.
    clearFeatureDataSourceSelection('clear-shared-selection')

    openFeatureInTree(selectedFeatureUidFromDataSource)
    setSelectedFeatureUid(selectedFeatureUidFromDataSource)
    setSelectionError('')

    console.log('[TransactionDataSetTreeExplorer] local selection applied', {
      source,
      selectedUid: selectedFeatureUidFromDataSource,
      activeDirectFiltersAfterSelection: filterDebugState.activeDirectFilters,
      activeResolvedFiltersAfterSelection: filterDebugState.activeResolvedFilters,
      activeIsolateAfterSelection: [...isolatedTopLevelValues],
      finalVisibilityWhereAfterSelection: lastVisibilityWhereRef.current,
      selectedUidExcludedFromVisibilityFiltering: true,
    })
  }

  /**
   * Highlights and zooms the connected map to the selected feature UID.
   */
  const syncMapToFeature = async (feature_uid: string) => {
    if (
      !jimuMapView ||
      !activeFeatureDs ||
      !structureFieldMap ||
      feature_uid === ''
    ) {
      return
    }

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

  /**
   * Stores a user-initiated feature selection from the tree or map and opens the feature path in the tree.
   */
  const userSelectFeature = (
    feature_uid: string,
    source: 'tree-click' | 'map-click',
  ) => {
    const filterDebugState = getActiveFilterDebugState(
      configuredFilterFields,
      selectedFilterValues,
    )

    console.log('[TransactionDataSetTreeExplorer] local selection requested', {
      source,
      selectedUid: feature_uid,
      activeDirectFiltersBeforeSelection: filterDebugState.activeDirectFilters,
      activeResolvedFiltersBeforeSelection: filterDebugState.activeResolvedFilters,
      activeIsolateBeforeSelection: [...isolatedTopLevelValues],
      finalVisibilityWhereBeforeSelection: lastVisibilityWhereRef.current,
      selectedUidExcludedFromVisibilityFiltering: true,
      ...getDataSourceSelectionDebugState(activeFeatureDs),
    })

    openFeatureInTree(feature_uid)

    if (selectedFeatureUid === feature_uid) {
      void syncMapToFeature(feature_uid)
      return
    }

    setSelectedFeatureUid(feature_uid)
    setSelectionError('')

    console.log('[TransactionDataSetTreeExplorer] local selection stored', {
      source,
      selectedUid: feature_uid,
      activeDirectFiltersAfterSelection: filterDebugState.activeDirectFilters,
      activeResolvedFiltersAfterSelection: filterDebugState.activeResolvedFilters,
      activeIsolateAfterSelection: [...isolatedTopLevelValues],
      finalVisibilityWhereAfterSelection: lastVisibilityWhereRef.current,
      selectedUidExcludedFromVisibilityFiltering: true,
    })
  }

  /**
   * Clears widget selection, map highlight, popup state, and shared datasource selection.
   */
  const clearSelectedFeature = () => {
    const filterDebugState = getActiveFilterDebugState(
      configuredFilterFields,
      selectedFilterValues,
    )

    clearMapHighlight()
    clearFeatureDataSourceSelection('clear-shared-selection')
    clearMapViewSelectionState()
    setSelectedFeatureUid('')
    setSelectionError('')

    console.log('[TransactionDataSetTreeExplorer] selection cleared', {
      selectedUid: '',
      activeDirectFiltersAfterSelection: filterDebugState.activeDirectFilters,
      activeResolvedFiltersAfterSelection: filterDebugState.activeResolvedFilters,
      activeIsolateAfterSelection: [...isolatedTopLevelValues],
      finalVisibilityWhereAfterSelection: lastVisibilityWhereRef.current,
      selectedUidExcludedFromVisibilityFiltering: true,
      ...getDataSourceSelectionDebugState(activeFeatureDs),
    })
  }

  findMatchingJimuLayerViewRef.current = findMatchingJimuLayerView
  selectFeatureRef.current = (feature_uid: string) => {
    userSelectFeature(feature_uid, 'map-click')
  }
  clearSelectedFeatureRef.current = clearSelectedFeature

  /**
   * Handles a feature-row click from StructureTree.
   */
  const handleFeatureClick = (node: StructureNode) => {
    if (!node.feature_uid) {
      return
    }

    userSelectFeature(node.feature_uid, 'tree-click')
  }

  /**
   * Keeps the connected map highlight/zoom synchronised with the widget-local selected feature UID.
   */
  useEffect(() => {
    if (selectedFeatureUid === '') {
      clearMapHighlight()
      lastAutoScrolledFeatureUidRef.current = ''
      return
    }

    void syncMapToFeature(selectedFeatureUid)
  }, [selectedFeatureUid, jimuMapView, activeFeatureDs])

  /**
   * Auto-scrolls the selected feature row into view after the tree path has been expanded.
   */
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

  /**
   * Loads optional linked feature-attribute records when their panels are expanded.
   */
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

    // Request guard for linked attribute loading.
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

  /**
   * Rebuilds available fields, record count, and tree hierarchy whenever datasource, filters, related data, or field-map config change.
   */
  useEffect(() => {
    if (!activeFeatureDs) {
      return
    }

    const fieldNames = updateAvailableFieldNamesFromDataSource(activeFeatureDs)

    refreshRecordCountFromDataSource(activeFeatureDs)
    refreshStructureHierarchyFromDataSource(activeFeatureDs, fieldNames)
  }, [
    selectedFilterValues,
    activeFeatureDs,
    relatedDataSourceByKey,
    props.config?.fieldMapJson,
  ])

  /**
   * Loads dropdown options for filters that rely on related or lookup datasources.
   */
  useEffect(() => {
    if (!structureFieldMap) {
      setRelatedFilterOptionsById({})
      return
    }

    const configuredFilters = getFilteredHierarchyFields(structureFieldMap)
    const relatedBreakdownFilters = configuredFilters.filter((filterField) => {
      return filterField.source !== 'direct'
    })

    if (relatedBreakdownFilters.length === 0) {
      setRelatedFilterOptionsById({})
      return
    }

    // Request guard for related filter option loading.
    const requestId = relatedFilterOptionsRequestIdRef.current + 1
    relatedFilterOptionsRequestIdRef.current = requestId

    const loadRelatedFilterOptions = async () => {
      try {
        const settledResults = await Promise.allSettled(
          relatedBreakdownFilters.map(async (filterField) => {
            return {
              filterId: filterField.id,
              options: await queryRelatedFilterOptions(
                filterField,
                relatedDataSourceByKey,
              ),
            }
          }),
        )

        if (relatedFilterOptionsRequestIdRef.current !== requestId) {
          return
        }

        const nextOptionsById: { [key: string]: FilterOption[] } = {}

        settledResults.forEach((settledResult, index) => {
          const filterField = relatedBreakdownFilters[index]

          if (settledResult.status !== 'fulfilled') {
            nextOptionsById[filterField.id] = []
            return
          }

          nextOptionsById[settledResult.value.filterId] = settledResult.value.options
        })

        setRelatedFilterOptionsById(nextOptionsById)
      } catch (error) {
        if (relatedFilterOptionsRequestIdRef.current !== requestId) {
          return
        }

        console.warn('Failed to load related breakdown filter options.', error)
        setRelatedFilterOptionsById({})
      }
    }

    void loadRelatedFilterOptions()
  }, [relatedDataSourceByKey, props.config?.fieldMapJson])

  /**
   * Applies map visibility filtering from top-level isolation and configured filters. Selection is deliberately excluded from this visibility filter.
   */
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

    // Request guard for asynchronous map filter resolution.
    const requestId = mapFilterRequestIdRef.current + 1
    mapFilterRequestIdRef.current = requestId

    const applyMapFilter = async () => {
      // Individual filter/isolation clauses. Joined with AND to become the layer-view filter.
      const whereParts: string[] = []
      const topLevelField = structureFieldMap.hierarchyFields[0]
      const filterDebugState = getActiveFilterDebugState(
        configuredFilterFields,
        selectedFilterValues,
      )

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

      for (const filterField of configuredFilterFields) {
        const selectedValue = String(
          selectedFilterValues[filterField.id] || '',
        ).trim()

        if (selectedValue === '') {
          continue
        }

        if (filterField.source === 'direct') {
          const layerFieldName = getLayerFieldName(
            jsApiLayer,
            filterField.fieldName,
          )

          whereParts.push(buildTextEqualityClause(layerFieldName, selectedValue))
          continue
        }

        const resolvedFilter = await resolveFilterJoinValues(
          filterField,
          selectedValue,
          relatedDataSourceByKey,
          structureFieldMap,
        )

        if (mapFilterRequestIdRef.current !== requestId) {
          return
        }

        const layerFieldName = getLayerFieldName(
          jsApiLayer,
          resolvedFilter.targetField,
        )

        if (resolvedFilter.resolvedJoinValues.length === 0) {
          whereParts.push('1 = 0')
        } else {
          const escapedValues = resolvedFilter.resolvedJoinValues.map((value) => {
            return `'${escapeSqlValue(value)}'`
          })

          whereParts.push(`${layerFieldName} IN (${escapedValues.join(', ')})`)
        }

        console.log('[TransactionDataSetTreeExplorer] resolved filter map expression', {
          filterId: filterField.id,
          selectedSpeciesUid: selectedValue,
          mainTargetFieldUsed: resolvedFilter.targetField,
          finalMainFilterWhere:
            whereParts.length > 0 ? whereParts.join(' AND ') : '',
        })
      }

      if (mapFilterRequestIdRef.current !== requestId) {
        return
      }

      if (whereParts.length === 0) {
        lastVisibilityWhereRef.current = ''
        return
      }

      try {
        lastVisibilityWhereRef.current = whereParts.join(' AND ')
        jsApiLayerView.filter = {
          where: lastVisibilityWhereRef.current,
        }

        activeIsolateLayerViewRef.current = jsApiLayerView

        console.log('[TransactionDataSetTreeExplorer] visibility state applied', {
          activeDirectFilters: filterDebugState.activeDirectFilters,
          activeResolvedFilters: filterDebugState.activeResolvedFilters,
          activeIsolate: [...isolatedTopLevelValues],
          selectedUid: selectedFeatureUid,
          finalVisibilityWhere: lastVisibilityWhereRef.current,
          selectedUidExcludedFromVisibilityFiltering: true,
        })
      } catch (error) {
        console.warn('Failed to apply tree viewer filter', error)
      }
    }

    void applyMapFilter()
  }, [
    isolatedTopLevelValues,
    selectedFilterValues,
    jimuMapView,
    activeFeatureDs,
    relatedDataSourceByKey,
    props.config?.fieldMapJson,
  ])

  /**
   * Registers the map click handler and resolves clicked graphics into feature UIDs.
   */
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

  /**
   * Cleans up the map click handler when the component unmounts.
   */
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
            <h3 style={HEADER_TITLE_STYLE}>{widgetTitle}</h3>
            {widgetSubtitle !== '' && (
              <span style={HEADER_SUBTITLE_STYLE}>
                {widgetSubtitle}
              </span>
            )}
          </div>
          <div style={EMPTY_STATE_STYLE}>
            Select the Active Feature Class data source in widget settings.
          </div>
        </div>
      </div>
    )
  }

  // -----------------------------
  // Render
  // -----------------------------
  // The hidden DataSourceComponents establish datasource connections. The visible
  // UI then renders configuration status, filters, action buttons, and StructureTree.
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
        }}
        onDataSourceInfoChange={() => {
          if (activeFeatureDs) {
            const dataSourceDebugState = getDataSourceSelectionDebugState(activeFeatureDs)
            console.log('[TransactionDataSetTreeExplorer] onDataSourceInfoChange', {
              source: 'visibility-effect',
              reason: ignoredSelectionChangeReasonRef.current || 'dataSourceInfoChange',
              selectedFilterValues,
              ...dataSourceDebugState,
            })

            if (ignoredSelectionChangeReasonRef.current !== '') {
              return
            }

            const fieldNames =
              updateAvailableFieldNamesFromDataSource(activeFeatureDs)

            refreshRecordCountFromDataSource(activeFeatureDs)
            refreshStructureHierarchyFromDataSource(activeFeatureDs, fieldNames)
          }
        }}
        onSelectionChange={() => {
          if (activeFeatureDs) {
            console.log('[TransactionDataSetTreeExplorer] onSelectionChange', {
              source: ignoredSelectionChangeReasonRef.current || 'datasource-selection',
              reason: 'selectionChange',
              selectedFilterValues,
              ...getDataSourceSelectionDebugState(activeFeatureDs),
            })

            if (ignoredSelectionChangeReasonRef.current !== '') {
              ignoredSelectionChangeReasonRef.current = ''
              return
            }

            acceptExternalSelectedUid(activeFeatureDs, 'datasource-selection')
          }
        }}
        onDataSourceStatusChange={(status) => {
          setIsLoadingFeatures(status === DataSourceStatus.Loading)
        }}
        onCreateDataSourceFailed={(error) => {
          console.log('[TransactionDataSetTreeExplorer] setSelectedFilterValues invoked', {
            source: 'onCreateDataSourceFailed',
            nextValue: {},
          })
          setLoadError(
            error?.message || 'Failed to connect to the Active Feature Class.',
          )
          setRecordCount(0)
          setAvailableFieldNames([])
          setStructureHierarchy([])
          setRelatedDataSourceByKey({})
          setRelatedDataSourceError('')
          setRelatedBreakdownNodesByFeatureUid({})
          setLoadingRelatedBreakdownFeatureUids({})
          setRelatedBreakdownErrorsByFeatureUid({})
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

      {configuredRelatedUseDataSources.map((relatedUseDataSource) => {
        if (!relatedUseDataSource.useDataSource) {
          return null
        }

        return (
          <DataSourceComponent
            key={relatedUseDataSource.sourceKey}
            useDataSource={relatedUseDataSource.useDataSource}
            widgetId={props.id}
            onDataSourceCreated={(dataSource: DataSource) => {
              // Source keys from the field map drive which configured datasource
              // slot each helper source binds to at runtime.
              setRelatedDataSourceForKey(relatedUseDataSource.sourceKey, dataSource)
              setRelatedDataSourceError('')

              if (activeFeatureDs) {
                const fieldNames = updateAvailableFieldNamesFromDataSource(activeFeatureDs)

                refreshStructureHierarchyFromDataSource(activeFeatureDs, fieldNames)
              }
            }}
            onCreateDataSourceFailed={(error) => {
              setRelatedDataSourceForKey(relatedUseDataSource.sourceKey, null)
              setRelatedDataSourceError(
                error?.message ||
                  `Failed to connect to the configured related datasource ${relatedUseDataSource.sourceKey}.`,
              )
            }}
          >
            {() => null}
          </DataSourceComponent>
        )
      })}

      {/* Optional map binding. If a map widget is configured, this exposes the active JimuMapView. */}
      {props.useMapWidgetIds && props.useMapWidgetIds.length > 0 && (
        <JimuMapViewComponent
          useMapWidgetId={props.useMapWidgetIds[0]}
          onActiveViewChange={(view) => {
            setJimuMapView(view)
          }}
        />
      )}

        <div
        style={CONTENT_STYLE}
        data-related-source-configured={hasConfiguredRelatedDataSource ? 'true' : 'false'}
      >
        <div style={HEADER_STYLE}>
          <h3 style={HEADER_TITLE_STYLE}>{widgetTitle}</h3>
          {widgetSubtitle !== '' && (
            <span style={HEADER_SUBTITLE_STYLE}>
              {widgetSubtitle}
            </span>
          )}
        </div>

        {/* Filter bar generated from the field map. Direct filters use main records; related filters use cached option queries. */}
        {configuredFilterFields.length > 0 && activeFeatureDs && (
          <div style={FILTER_ROW_STYLE}>
            {configuredFilterFields.map((filterField) => {
              const records = getLoadedRecordsFromDataSource(activeFeatureDs)
              const options = filterField.source !== 'direct'
                ? (relatedFilterOptionsById[filterField.id] || [])
                : getFilterOptionsFromRecords(records, filterField)
              const selectedValue = selectedFilterValues[filterField.id] || ''
              const selectedOption = options.find((option) => {
                return option.value === selectedValue
              })
              const searchValue =
                filterSearchValues[filterField.id] ?? selectedOption?.label ?? selectedValue
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
                              filterField,
                              visibleOptions[0].value,
                              visibleOptions[0].label,
                            )
                          }

                          if (event.key === 'Escape') {
                            setFilterSearchValue(
                              filterField.id,
                              selectedOption?.label ?? selectedValue,
                            )
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

                          {visibleOptions.map((option) => {
                            return (
                              <li key={option.value}>
                                <button
                                  type="button"
                                  style={{
                                    ...FILTER_OPTION_BUTTON_STYLE,
                                    fontWeight:
                                      option.value === selectedValue ? 700 : 400,
                                  }}
                                  onMouseDown={(event) => {
                                    event.preventDefault()
                                    setConfiguredFilterValue(
                                      filterField,
                                      option.value,
                                      option.label,
                                    )
                                  }}
                                >
                                  {option.label}
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

        {/* Basic tree and map interaction actions. */}
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
        </div>

        {loadError !== '' && <div style={MESSAGE_PANEL_STYLE}>{loadError}</div>}

        {selectionError !== '' && (
          <div style={MESSAGE_PANEL_STYLE}>{selectionError}</div>
        )}

        {relatedDataSourceError !== '' && (
          <div style={MESSAGE_PANEL_STYLE}>{relatedDataSourceError}</div>
        )}

        {/* Main tree panel. Only renders after the field map validates against the main datasource fields. */}
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
                relatedBreakdownNodesByFeatureUid={relatedBreakdownNodesByFeatureUid}
                loadingRelatedBreakdownFeatureUids={loadingRelatedBreakdownFeatureUids}
                relatedBreakdownErrorsByFeatureUid={relatedBreakdownErrorsByFeatureUid}
                isolatedTopLevelValues={isolatedTopLevelValues}
                onToggleTopLevelIsolation={toggleTopLevelIsolation}
                onToggleNode={toggleNode}
                onFeatureNodeExpanded={loadRelatedBreakdownsForFeatureNode}
                onExpandBranch={expandBranch}
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

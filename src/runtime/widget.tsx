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
  type RelatedBreakdownConfig,
  type RelatedBreakdownGroupField,
  type RelatedSummaryConfig,
  type StructureFieldMap,
} from './lib/field-map'
import {
  buildStructureHierarchyFromRecords,
  getExpandableNodeKeys,
  getNodePathKeysForFeatureUid,
  type RelatedBreakdownNodesByFeatureUid,
  type RelatedSummaryValuesByFeatureUid,
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
const RELATED_QUERY_PAGE_SIZE = 2000
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

interface RelatedDataSourceRuntimeMap {
  [key: string]: DataSource
}

interface RelatedSummaryDefinition extends RelatedSummaryConfig {
  hierarchyFieldKey: string
}

interface RelatedBreakdownDefinition extends RelatedBreakdownConfig {
  hierarchyFieldKey: string
}

interface ViewEventHandle {
  remove: () => void
}

interface HighlightHandle {
  remove: () => void
}

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

const getRelatedSourceKeysFromFieldMap = (fieldMap: StructureFieldMap | null): string[] => {
  if (!fieldMap) {
    return []
  }

  const summaryKeys = getRelatedSummaryDefinitions(fieldMap).map((summary) => {
    return summary.relatedSourceKey
  })
  const breakdownKeys = getRelatedBreakdownDefinitions(fieldMap).map((breakdown) => {
    return breakdown.relatedSourceKey
  })

  return Array.from(new Set([...summaryKeys, ...breakdownKeys]))
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

const buildNonZeroRelatedWhereClause = (baseWhere: string, fieldName: string): string => {
  return `(${baseWhere}) AND ${fieldName} <> 0`
}

const chunkValues = (values: string[], chunkSize: number): string[][] => {
  const chunks: string[][] = []

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize))
  }

  return chunks
}

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


const getRelatedGroupFieldValue = (record: any, groupField: RelatedBreakdownGroupField): string => {
  const value = getRecordRawValue(record, groupField.fieldName)

  if (value === null || value === undefined)
  {
    return ''
  }

  return String(value).trim()
}

const getRelatedGroupKey = (record: any, groupBy: RelatedBreakdownGroupField[]): string => {
  return groupBy.map((groupField) => {
    return `${groupField.fieldName}=${getRelatedGroupFieldValue(record, groupField)}`
  }).join('|||')
}

const getRelatedGroupDisplayValue = (record: any, groupBy: RelatedBreakdownGroupField[]): string => {
  return groupBy.map((groupField) => {
    return getRelatedGroupFieldValue(record, groupField)
  }).filter((value) => {
    return value !== ''
  }).join(' / ')
}

const getNumberValue = (value: unknown): number => {
  const numericValue = typeof value === 'number' ? value : Number(value)

  return Number.isNaN(numericValue) ? 0 : numericValue
}

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

const formatRelatedCount = (value: number): string => {
  return value.toLocaleString('en-AU')
}

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
  const [relatedDataSourceByKey, setRelatedDataSourceByKey] =
    useState<RelatedDataSourceRuntimeMap>({})
  const [relatedDataSourceError, setRelatedDataSourceError] = useState('')
  const [relatedBreakdownNodesByFeatureUid, setRelatedBreakdownNodesByFeatureUid] =
    useState<RelatedBreakdownNodesByFeatureUid>({})
  const [loadingRelatedBreakdownFeatureUids, setLoadingRelatedBreakdownFeatureUids] =
    useState<{ [feature_uid: string]: boolean }>({})
  const [relatedBreakdownErrorsByFeatureUid, setRelatedBreakdownErrorsByFeatureUid] =
    useState<{ [feature_uid: string]: string }>({})
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
  const relatedSummaryRequestIdRef = useRef(0)
  const findMatchingJimuLayerViewRef = useRef<() => any | null>(() => null)
  const selectFeatureRef = useRef<(feature_uid: string) => void>(() => {})
  const clearSelectedFeatureRef = useRef<() => void>(() => {})

  const fieldMapParseResult = parseStructureFieldMap(props.config?.fieldMapJson)
  const structureFieldMap = fieldMapParseResult.fieldMap
  const configuredRelatedSourceKeys = getRelatedSourceKeysFromFieldMap(
    structureFieldMap,
  )
  const summaryAttributeViewUseDataSource =
    props.useDataSources && props.useDataSources.length > 1
      ? props.useDataSources[1]
      : null
  const hasStockViewRelatedDataSource = !!summaryAttributeViewUseDataSource

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
    const filteredRecords = getFilteredRecords(
      records,
      getFilteredHierarchyFields(structureFieldMap),
      selectedFilterValues,
    )

    const requestId = relatedSummaryRequestIdRef.current + 1
    relatedSummaryRequestIdRef.current = requestId

    let relatedSummaryValuesByFeatureUid: RelatedSummaryValuesByFeatureUid = {}

    try {
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
  }, [
    selectedFilterValues,
    activeFeatureDs,
    relatedDataSourceByKey,
    props.config?.fieldMapJson,
  ])

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

      {summaryAttributeViewUseDataSource && configuredRelatedSourceKeys.includes('stockView') && (
        <DataSourceComponent
          useDataSource={summaryAttributeViewUseDataSource}
          widgetId={props.id}
          onDataSourceCreated={(dataSource: DataSource) => {
            setRelatedDataSourceForKey('stockView', dataSource)
            setRelatedDataSourceError('')

            if (activeFeatureDs) {
              const fieldNames = updateAvailableFieldNamesFromDataSource(activeFeatureDs)

              refreshStructureHierarchyFromDataSource(activeFeatureDs, fieldNames)
            }
          }}
          onCreateDataSourceFailed={(error) => {
            setRelatedDataSourceForKey('stockView', null)
            setRelatedDataSourceError(
              error?.message || 'Failed to connect to the Summary Attribute View Table.',
            )
          }}
        >
          {() => null}
        </DataSourceComponent>
      )}

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
        data-stock-view-configured={hasStockViewRelatedDataSource ? 'true' : 'false'}
      >
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

        {relatedDataSourceError !== '' && (
          <div style={MESSAGE_PANEL_STYLE}>{relatedDataSourceError}</div>
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
                relatedBreakdownNodesByFeatureUid={relatedBreakdownNodesByFeatureUid}
                loadingRelatedBreakdownFeatureUids={loadingRelatedBreakdownFeatureUids}
                relatedBreakdownErrorsByFeatureUid={relatedBreakdownErrorsByFeatureUid}
                isolatedTopLevelValues={isolatedTopLevelValues}
                onToggleTopLevelIsolation={toggleTopLevelIsolation}
                onToggleNode={toggleNode}
                onFeatureNodeExpanded={loadRelatedBreakdownsForFeatureNode}
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

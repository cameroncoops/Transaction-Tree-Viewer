import type { DataRecord } from 'jimu-core'
import type { FieldValueFormat, HierarchyFieldMapping, RelatedSummaryConfig, StructureFieldMap } from './field-map'

export interface AppendedDisplayValue
{
  key: string
  fieldName: string
  label: string
  value: unknown
  format?: FieldValueFormat
}

export interface RelatedSummaryValuesByFeatureUid
{
  [feature_uid: string]: {
    [summaryKey: string]: unknown
  }
}

export interface StructureNode
{
  nodeKey: string
  fieldKey: string
  fieldName: string
  label: string
  value: string
  depth: number
  children: StructureNode[]
  appendedDisplayValues?: AppendedDisplayValue[]
  feature_uid?: string
  featureLabel?: string
}

const getRecordData = (record: DataRecord): { [key: string]: unknown } => {
  return record && typeof record.getData === 'function'
    ? record.getData() as { [key: string]: unknown }
    : {}
}

const getRecordRawValue = (record: DataRecord, fieldName: string): unknown => {
  const data = getRecordData(record)

  if (Object.prototype.hasOwnProperty.call(data, fieldName))
  {
    return data[fieldName]
  }

  const requestedFieldName = fieldName.toLowerCase()
  const matchingKey = Object.keys(data).find((key) => {
    const lowerKey = key.toLowerCase()

    return lowerKey === requestedFieldName || lowerKey.endsWith(`.${requestedFieldName}`)
  })

  if (!matchingKey)
  {
    return undefined
  }

  return data[matchingKey]
}

const getRecordStringValue = (record: DataRecord, fieldName: string): string => {
  const value = getRecordRawValue(record, fieldName)

  if (value === null || value === undefined)
  {
    return ''
  }

  return String(value).trim()
}

const hasRawValue = (value: unknown): boolean => {
  if (value === null || value === undefined)
  {
    return false
  }

  if (typeof value === 'string' && value.trim() === '')
  {
    return false
  }

  return true
}

const makeNodeKey = (parentKey: string, field: HierarchyFieldMapping, value: string, feature_uid?: string): string => {
  const keyPart = `${field.key}=${value}`

  if (feature_uid)
  {
    return parentKey === ''
      ? `${keyPart}|||feature_uid=${feature_uid}`
      : `${parentKey}|||${keyPart}|||feature_uid=${feature_uid}`
  }

  return parentKey === ''
    ? keyPart
    : `${parentKey}|||${keyPart}`
}

const findChildNode = (nodes: StructureNode[], nodeKey: string): StructureNode | null => {
  return nodes.find((node) => node.nodeKey === nodeKey) || null
}

const sortNodes = (nodes: StructureNode[]): StructureNode[] => {
  return nodes
    .map((node) => {
      return {
        ...node,
        children: sortNodes(node.children)
      }
    })
    .sort((a, b) => a.value.localeCompare(b.value, undefined, {
      numeric: true,
      sensitivity: 'base'
    }))
}

const getSelectableFieldKeyForRecord = (fieldMap: StructureFieldMap, activeHierarchyFields: HierarchyFieldMapping[]): string => {
  const configuredSelectableFieldKey = String(fieldMap.selectableFieldKey || '').trim()

  if (configuredSelectableFieldKey !== '')
  {
    const selectableField = activeHierarchyFields.find((field) => field.key === configuredSelectableFieldKey)

    if (selectableField)
    {
      return configuredSelectableFieldKey
    }
  }

  return activeHierarchyFields[activeHierarchyFields.length - 1].key
}

const buildAppendedDisplayValues = (
  record: DataRecord,
  field: HierarchyFieldMapping,
  feature_uid: string,
  isSelectableField: boolean,
  relatedSummaryValuesByFeatureUid?: RelatedSummaryValuesByFeatureUid
): AppendedDisplayValue[] => {
  const appendedValues: AppendedDisplayValue[] = []

  ;(field.appendFields || []).forEach((appendField) => {
    const value = getRecordRawValue(record, appendField.fieldName)

    if (!hasRawValue(value))
    {
      return
    }

    appendedValues.push({
      key: appendField.key,
      fieldName: appendField.fieldName,
      label: appendField.label,
      value,
      format: appendField.format || 'text'
    })
  })

  if (isSelectableField)
  {
    const featureSummaryValues = relatedSummaryValuesByFeatureUid
      ? relatedSummaryValuesByFeatureUid[feature_uid]
      : null

    ;(field.relatedSummaries || []).forEach((summary: RelatedSummaryConfig) => {
      if (!featureSummaryValues || !hasRawValue(featureSummaryValues[summary.key]))
      {
        return
      }

      appendedValues.push({
        key: summary.key,
        fieldName: summary.fieldName,
        label: summary.label,
        value: featureSummaryValues[summary.key],
        format: summary.format || 'text'
      })
    })
  }

  return appendedValues
}

export const buildStructureHierarchyFromRecords = (
  records: DataRecord[],
  fieldMap: StructureFieldMap,
  relatedSummaryValuesByFeatureUid?: RelatedSummaryValuesByFeatureUid
): StructureNode[] => {
  const rootNodes: StructureNode[] = []

  records.forEach((record) => {
    const feature_uid = getRecordStringValue(record, fieldMap.identityFields.feature_uid.fieldName)

    if (feature_uid === '')
    {
      return
    }

    const activeHierarchyFields = fieldMap.hierarchyFields.filter((field) => {
      const value = getRecordStringValue(record, field.fieldName)

      if (value !== '')
      {
        return true
      }

      return !field.optional
    })

    const hasMissingRequiredField = activeHierarchyFields.some((field) => {
      return getRecordStringValue(record, field.fieldName) === ''
    })

    if (activeHierarchyFields.length < 1 || hasMissingRequiredField)
    {
      return
    }

    const featureLabelField = fieldMap.hierarchyFields.find((field) => field.key === fieldMap.featureLabelFieldKey)
    const featureLabel = featureLabelField
      ? getRecordStringValue(record, featureLabelField.fieldName)
      : ''
    const selectableFieldKey = getSelectableFieldKeyForRecord(fieldMap, activeHierarchyFields)

    let currentChildren = rootNodes
    let parentKey = ''
    let selectableNodeFound = false

    activeHierarchyFields.forEach((field, index) => {
      const value = getRecordStringValue(record, field.fieldName)
      const isSelectableField = field.key === selectableFieldKey && !selectableNodeFound
      const nodeFeatureUid = isSelectableField ? feature_uid : undefined
      const nodeKey = makeNodeKey(parentKey, field, value, nodeFeatureUid)
      const appendedDisplayValues = buildAppendedDisplayValues(
        record,
        field,
        feature_uid,
        isSelectableField,
        relatedSummaryValuesByFeatureUid
      )

      let node = findChildNode(currentChildren, nodeKey)

      if (!node)
      {
        node = {
          nodeKey,
          fieldKey: field.key,
          fieldName: field.fieldName,
          label: field.label,
          value,
          depth: index,
          children: [],
          appendedDisplayValues,
          feature_uid: nodeFeatureUid,
          featureLabel: isSelectableField ? (featureLabel || value) : undefined
        }

        currentChildren.push(node)
      }
      else if (appendedDisplayValues.length > 0)
      {
        node.appendedDisplayValues = appendedDisplayValues
      }

      if (isSelectableField)
      {
        selectableNodeFound = true
      }

      currentChildren = node.children
      parentKey = nodeKey
    })
  })

  return sortNodes(rootNodes)
}

export const getExpandableNodeKeys = (nodes: StructureNode[]): string[] => {
  return nodes.flatMap((node) => {
    const childKeys = getExpandableNodeKeys(node.children)

    if (node.children.length > 0)
    {
      return [node.nodeKey, ...childKeys]
    }

    return childKeys
  })
}

export const getNodePathKeysForFeatureUid = (nodes: StructureNode[], feature_uid: string): string[] => {
  for (const node of nodes)
  {
    if (node.feature_uid === feature_uid)
    {
      return [node.nodeKey]
    }

    const childPath = getNodePathKeysForFeatureUid(node.children, feature_uid)

    if (childPath.length > 0)
    {
      return [node.nodeKey, ...childPath]
    }
  }

  return []
}

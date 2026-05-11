import type { DataRecord } from 'jimu-core'
import type { AppendFieldFormat, AppendFieldMapping, HierarchyFieldMapping, StructureFieldMap } from './field-map'

export interface AppendedDisplayValue {
  key: string
  fieldName: string
  label: string
  format?: AppendFieldFormat
  value: unknown
}

export interface StructureNode {
  nodeKey: string
  fieldKey: string
  fieldName: string
  label: string
  value: string
  depth: number
  children: StructureNode[]
  feature_uid?: string
  featureLabel?: string
  appendedDisplayValues?: AppendedDisplayValue[]
}

const getRecordStringValue = (record: DataRecord, fieldName: string): string => {
  const value = record.getData()[fieldName]

  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim()
}

const getRecordValue = (record: DataRecord, fieldName: string): unknown => {
  return record.getData()[fieldName]
}

const hasDisplayValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'string') {
    return value.trim() !== ''
  }

  return true
}

const makeNodeKey = (parentKey: string, field: HierarchyFieldMapping, value: string, featureUid?: string): string => {
  const keyPart = `${field.key}=${value}`

  if (featureUid) {
    return parentKey === ''
      ? `${keyPart}|||feature_uid=${featureUid}`
      : `${parentKey}|||${keyPart}|||feature_uid=${featureUid}`
  }

  return parentKey === ''
    ? keyPart
    : `${parentKey}|||${keyPart}`
}

const getAppendedDisplayValues = (record: DataRecord, appendFields: AppendFieldMapping[] | undefined): AppendedDisplayValue[] | undefined => {
  if (!appendFields || appendFields.length < 1) {
    return undefined
  }

  const appendedDisplayValues = appendFields.flatMap((appendField) => {
    const value = getRecordValue(record, appendField.fieldName)

    if (!hasDisplayValue(value)) {
      return []
    }

    return [{
      key: appendField.key,
      fieldName: appendField.fieldName,
      label: appendField.label,
      format: appendField.format,
      value
    }]
  })

  return appendedDisplayValues.length > 0
    ? appendedDisplayValues
    : undefined
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
    .sort((a, b) => a.value.localeCompare(b.value))
}

export const buildStructureHierarchyFromRecords = (records: DataRecord[], fieldMap: StructureFieldMap): StructureNode[] => {
  const rootNodes: StructureNode[] = []
  const featureLabelField = fieldMap.hierarchyFields.find((field) => field.key === fieldMap.featureLabelFieldKey)

  records.forEach((record) => {
    const featureUid = getRecordStringValue(record, fieldMap.identityFields.feature_uid.fieldName)

    if (featureUid === '') {
      return
    }

    const activeHierarchyFields = fieldMap.hierarchyFields.filter((field) => {
      const value = getRecordStringValue(record, field.fieldName)

      if (value !== '') {
        return true
      }

      return !field.optional
    })

    const hasMissingRequiredField = activeHierarchyFields.some((field) => {
      return getRecordStringValue(record, field.fieldName) === ''
    })

    if (activeHierarchyFields.length < 1 || hasMissingRequiredField) {
      return
    }

    const featureLabel = featureLabelField
      ? getRecordStringValue(record, featureLabelField.fieldName)
      : ''
    const configuredSelectableField = fieldMap.selectableFieldKey
      ? activeHierarchyFields.find((field) => field.key === fieldMap.selectableFieldKey)
      : null
    const selectableField = configuredSelectableField || activeHierarchyFields[activeHierarchyFields.length - 1]
    const selectableFieldKey = selectableField.key

    let currentChildren = rootNodes
    let parentKey = ''
    let isWithinSelectableBranch = false

    activeHierarchyFields.forEach((field, index) => {
      const value = getRecordStringValue(record, field.fieldName)
      const isSelectableField = field.key === selectableFieldKey
      const scopeNodeKeyByFeatureUid = isWithinSelectableBranch || isSelectableField
      const nodeKey = makeNodeKey(parentKey, field, value, scopeNodeKeyByFeatureUid ? featureUid : undefined)

      let node = findChildNode(currentChildren, nodeKey)

      if (!node) {
        node = {
          nodeKey,
          fieldKey: field.key,
          fieldName: field.fieldName,
          label: field.label,
          value,
          depth: index,
          children: [],
          feature_uid: isSelectableField ? featureUid : undefined,
          featureLabel: isSelectableField ? (featureLabel || value) : undefined,
          appendedDisplayValues: getAppendedDisplayValues(record, field.appendFields)
        }

        currentChildren.push(node)
      } else if (!node.appendedDisplayValues) {
        node.appendedDisplayValues = getAppendedDisplayValues(record, field.appendFields)
      }

      currentChildren = node.children
      parentKey = nodeKey
      isWithinSelectableBranch = isWithinSelectableBranch || isSelectableField
    })
  })

  return sortNodes(rootNodes)
}

export const getExpandableNodeKeys = (nodes: StructureNode[]): string[] => {
  return nodes.flatMap((node) => {
    const childKeys = getExpandableNodeKeys(node.children)

    if (node.children.length > 0) {
      return [node.nodeKey, ...childKeys]
    }

    return childKeys
  })
}

export const getNodePathKeysForFeatureUid = (nodes: StructureNode[], featureUid: string): string[] => {
  for (const node of nodes) {
    if (node.feature_uid === featureUid) {
      return [node.nodeKey]
    }

    const childPath = getNodePathKeysForFeatureUid(node.children, featureUid)

    if (childPath.length > 0) {
      return [node.nodeKey, ...childPath]
    }
  }

  return []
}

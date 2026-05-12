import { React } from 'jimu-core'
import type { FeatureAttributeConfig, HierarchyFieldMapping, StructureFieldMap } from '../lib/field-map'
import type { BasicLinkedTableRecord } from '../lib/feature-attributes'
import type { StructureNode } from '../lib/structure-model'
import FeatureAttributes from './FeatureAttributes'

interface RelatedBreakdownNodesByFeatureUid
{
  [feature_uid: string]: StructureNode[]
}

interface StructureTreeProps
{
  structureHierarchy: StructureNode[]
  structureFieldMap: StructureFieldMap
  selectedFeatureUid: string
  expandedNodeKeys: string[]
  expandedFeatureAttributeKeys: string[]
  loadingFeatureAttributeKeys: { [key: string]: boolean }
  featureAttributeRecords: { [key: string]: BasicLinkedTableRecord[] }
  featureAttributeErrors: { [key: string]: string }
  relatedBreakdownNodesByFeatureUid?: RelatedBreakdownNodesByFeatureUid
  loadingRelatedBreakdownFeatureUids?: { [feature_uid: string]: boolean }
  relatedBreakdownErrorsByFeatureUid?: { [feature_uid: string]: string }
  isolatedTopLevelValues?: string[]
  onToggleNode: (nodeKey: string) => void
  onExpandBranch: (nodeKey: string) => void
  onFeatureClick: (node: StructureNode) => void
  onFeatureRowRef: (feature_uid: string, element: HTMLDivElement | null) => void
  onToggleFeatureAttribute: (feature_uid: string, featureAttribute: FeatureAttributeConfig) => void
  onToggleTopLevelIsolation?: (value: string) => void
  onFeatureNodeExpanded?: (node: StructureNode) => void
}

const ACCENT_COLOR = '#007ac2'
const CONNECTOR_COLOR = '#d6e4d7'
const TREE_COLUMN_WIDTH = 22
const TOP_LEVEL_ISOLATE_COLUMN_WIDTH = 34
const NON_TOP_LEVEL_PREFIX_WIDTH = TOP_LEVEL_ISOLATE_COLUMN_WIDTH
const EXPAND_ACTION_COLUMN_WIDTH = 68

const TREE_WRAPPER_STYLE = {
  padding: '0.45rem 0.35rem 0.8rem 0.35rem',
}

const LINK_BUTTON_STYLE = {
  background: 'none',
  border: 'none',
  color: ACCENT_COLOR,
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: 0,
}

const BRANCH_ACTION_STYLE = {
  ...LINK_BUTTON_STYLE,
  fontSize: '0.78rem',
  lineHeight: 1.2,
  color: '#4e6c57',
  justifySelf: 'end' as const,
}

const TREE_TOGGLE_STYLE = {
  background: 'none',
  border: 'none',
  color: '#486152',
  textDecoration: 'none',
  fontWeight: 700,
  width: `${TREE_COLUMN_WIDTH}px`,
  height: `${TREE_COLUMN_WIDTH}px`,
  minWidth: `${TREE_COLUMN_WIDTH}px`,
  padding: 0,
  fontSize: '0.72rem',
  lineHeight: 1,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const FEATURE_BUTTON_STYLE = {
  display: 'inline-block',
  textAlign: 'left' as const,
  border: 'none',
  background: 'transparent',
  padding: '0.1rem 0',
  cursor: 'pointer',
}

const APPENDED_VALUE_STYLE = {
  color: '#5f6c64',
  fontWeight: 400,
  fontSize: '0.86rem',
}

const EMPTY_STATE_STYLE = {
  margin: 0,
  color: '#6a746d',
}

const getHierarchyFieldForNode = (node: StructureNode, structureFieldMap: StructureFieldMap) => {
  return structureFieldMap.hierarchyFields.find((field) => {
    return field.key === node.fieldKey
  })
}

const getFeatureIdentityKey = (node: StructureNode): string => {
  if (node.feature_uid)
  {
    return `feature_uid:${node.feature_uid}`
  }

  return `leaf:${node.nodeKey}`
}

const getBreakdownValueText = (value: unknown): string => {
  if (value === null || value === undefined)
  {
    return 'Unknown'
  }

  const textValue = String(value).trim()

  return textValue !== ''
    ? textValue
    : 'Unknown'
}

const getFeatureFieldValue = (node: StructureNode, fieldName: string): unknown => {
  const requestedFieldName = fieldName.toLowerCase()
  const featureFieldValues = node.featureFieldValues || {}

  if (Object.prototype.hasOwnProperty.call(featureFieldValues, fieldName))
  {
    return featureFieldValues[fieldName]
  }

  const matchingFieldName = Object.keys(featureFieldValues).find((key) => {
    const lowerKey = key.toLowerCase()

    return lowerKey === requestedFieldName || lowerKey.endsWith(`.${requestedFieldName}`)
  })

  return matchingFieldName
    ? featureFieldValues[matchingFieldName]
    : undefined
}

const collectDescendantFeatureDetails = (
  node: StructureNode,
  breakdownFieldName?: string
): Map<string, string> => {
  const featureDetailsByIdentity = new Map<string, string>()

  if (node.feature_uid)
  {
    const featureIdentity = getFeatureIdentityKey(node)
    const breakdownValue = breakdownFieldName
      ? getBreakdownValueText(getFeatureFieldValue(node, breakdownFieldName))
      : ''

    featureDetailsByIdentity.set(featureIdentity, breakdownValue)
    return featureDetailsByIdentity
  }

  if (!Array.isArray(node.children) || node.children.length === 0)
  {
    return featureDetailsByIdentity
  }

  node.children.forEach((childNode) => {
    const childFeatureDetails = collectDescendantFeatureDetails(childNode, breakdownFieldName)

    childFeatureDetails.forEach((breakdownValue, identity) => {
      if (!featureDetailsByIdentity.has(identity))
      {
        featureDetailsByIdentity.set(identity, breakdownValue)
      }
    })
  })

  return featureDetailsByIdentity
}

const getSortedBreakdownEntries = (
  breakdownCountsByLabel: Map<string, number>,
  sortMode: 'label' | 'count'
): Array<[string, number]> => {
  return Array.from(breakdownCountsByLabel.entries()).sort((a, b) => {
    if (sortMode === 'count' && b[1] !== a[1])
    {
      return b[1] - a[1]
    }

    return a[0].localeCompare(b[0], undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  })
}

const getGroupNodeDisplayText = (node: StructureNode, hierarchyField?: HierarchyFieldMapping): string => {
  const defaultDisplayText = `${node.label}: ${node.value}`

  if (!hierarchyField?.showChildCount)
  {
    return defaultDisplayText
  }

  const descendantFeatureDetails = collectDescendantFeatureDetails(
    node,
    hierarchyField.childCountBreakdownFieldName
  )
  const descendantCount = descendantFeatureDetails.size
  const childCountLabel = String(hierarchyField.childCountLabel || 'Items').trim() || 'Items'
  const childCountPrefixLabel = String(hierarchyField.childCountPrefixLabel || '').trim()
  const countText = descendantCount.toLocaleString('en-AU')

  if (childCountPrefixLabel === '')
  {
    let displayText = `${defaultDisplayText} (${countText} ${childCountLabel})`

    if (hierarchyField.childCountBreakdownFieldName)
    {
      const breakdownText = getGroupNodeBreakdownText(descendantFeatureDetails, hierarchyField)

      if (breakdownText !== '')
      {
        displayText += ` ${breakdownText}`
      }
    }

    return displayText
  }

  let displayText = `${childCountPrefixLabel}: ${node.value} - ${childCountLabel}: ${countText}`

  if (hierarchyField.childCountBreakdownFieldName)
  {
    const breakdownText = getGroupNodeBreakdownText(descendantFeatureDetails, hierarchyField)

    if (breakdownText !== '')
    {
      displayText += ` ${breakdownText}`
    }
  }

  return displayText
}

const getGroupNodeBreakdownText = (
  descendantFeatureDetails: Map<string, string>,
  hierarchyField: HierarchyFieldMapping
): string => {
  if (!hierarchyField.childCountBreakdownFieldName)
  {
    return ''
  }

  const breakdownCountsByLabel = new Map<string, number>()

  descendantFeatureDetails.forEach((breakdownValue) => {
    const nextCount = (breakdownCountsByLabel.get(breakdownValue) || 0) + 1
    breakdownCountsByLabel.set(breakdownValue, nextCount)
  })

  const sortMode = hierarchyField.childCountBreakdownSort || 'label'
  const breakdownParts = getSortedBreakdownEntries(breakdownCountsByLabel, sortMode).map(([label, count]) => {
    return `${count.toLocaleString('en-AU')} ${label}`
  })

  return breakdownParts.length > 0
    ? `(${breakdownParts.join(', ')})`
    : ''
}

const getGroupNodeDisplayLabel = (node: StructureNode, structureFieldMap: StructureFieldMap): string => {
  const hierarchyField = getHierarchyFieldForNode(node, structureFieldMap)

  return getGroupNodeDisplayText(node, hierarchyField)
}

const getTreeToggleIcon = (isExpanded: boolean): string => {
  return isExpanded ? '▼' : '▶'
}

const formatDisplayValue = (value: unknown, format?: string): string => {
  if (value === null || value === undefined)
  {
    return ''
  }

  const textValue = String(value).trim()

  if (textValue === '')
  {
    return ''
  }

  if (format === 'number')
  {
    const numericValue = typeof value === 'number' ? value : Number(value)

    if (!Number.isNaN(numericValue))
    {
      return numericValue.toLocaleString('en-AU')
    }
  }

  if (format === 'date' || format === 'datetime')
  {
    const dateValue = typeof value === 'number'
      ? new Date(value)
      : new Date(textValue)

    if (!Number.isNaN(dateValue.getTime()))
    {
      const datePart = dateValue.toLocaleDateString('en-AU')

      if (format === 'date')
      {
        return datePart
      }

      return `${datePart} ${dateValue.toLocaleTimeString('en-AU', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })}`
    }
  }

  return textValue
}

const renderAppendedDisplayValues = (node: StructureNode): JSX.Element | null => {
  const values = (node.appendedDisplayValues || [])
    .map((displayValue) => {
      const formattedValue = formatDisplayValue(displayValue.value, displayValue.format)

      if (formattedValue === '')
      {
        return null
      }

      return `${displayValue.label}: ${formattedValue}`
    })
    .filter((displayText): displayText is string => {
      return displayText !== null
    })

  if (values.length === 0)
  {
    return null
  }

  return (
    <span style={APPENDED_VALUE_STYLE}>
      {' | '}
      {values.join(' | ')}
    </span>
  )
}

const hasConfiguredRelatedBreakdowns = (node: StructureNode, props: StructureTreeProps): boolean => {
  if (!node.feature_uid)
  {
    return false
  }

  const hierarchyField = getHierarchyFieldForNode(node, props.structureFieldMap) as any

  return Array.isArray(hierarchyField?.relatedBreakdowns) && hierarchyField.relatedBreakdowns.length > 0
}

const getNodeIndent = (node: StructureNode): number => {
  if (String(node.fieldKey || '').startsWith('related:'))
  {
    return node.children.length > 0 ? 48 : 72
  }

  if (node.depth <= 0)
  {
    return 8
  }

  if (node.depth === 1)
  {
    return 24
  }

  return 48
}

const getNodeTextStyle = (node: StructureNode, isSelected: boolean, hasChildren: boolean) => {
  if (String(node.fieldKey || '').startsWith('related:'))
  {
    return {
      fontSize: node.children.length > 0 ? '0.9rem' : '0.82rem',
      fontWeight: node.children.length > 0 ? 500 : 400,
      color: node.children.length > 0 ? '#24312a' : '#6a746d',
    }
  }

  if (node.depth <= 1)
  {
    return {
      fontSize: node.depth === 0 ? '0.94rem' : '0.88rem',
      fontWeight: 600,
      color: '#203028',
    }
  }

  return {
    fontSize: '0.88rem',
    fontWeight: isSelected ? 600 : hasChildren ? 500 : 400,
    color: '#24312a',
  }
}

const getSelectedFeatureRowStyle = (isSelected: boolean) => {
  return {
    borderLeft: isSelected ? `3px solid ${ACCENT_COLOR}` : '3px solid transparent',
    backgroundColor: isSelected ? '#f5fbff' : 'transparent',
    borderRadius: '6px',
    padding: isSelected ? '0.08rem 0.3rem 0.08rem 0.45rem' : '0.08rem 0.3rem 0.08rem 0.45rem',
  }
}

const getConnectorGuideStyle = (
  indent: number,
  isLastChild: boolean,
) => {
  return {
    position: 'absolute' as const,
    left: `${indent + 10}px`,
    top: '-0.15rem',
    width: '1px',
    height: isLastChild ? '1.15rem' : undefined,
    bottom: isLastChild ? undefined : '-0.2rem',
    backgroundColor: CONNECTOR_COLOR,
    pointerEvents: 'none' as const,
  }
}

const getConnectorElbowStyle = (indent: number) => {
  return {
    position: 'absolute' as const,
    left: `${indent + 10}px`,
    top: '1rem',
    width: '14px',
    height: '1px',
    backgroundColor: CONNECTOR_COLOR,
    pointerEvents: 'none' as const,
  }
}

const renderRelatedNode = (
  node: StructureNode,
  props: StructureTreeProps,
  isLastChild: boolean,
): JSX.Element => {
  const isExpanded = props.expandedNodeKeys.includes(node.nodeKey)
  const hasChildren = node.children.length > 0
  const indent = getNodeIndent(node)
  const displayText = node.label && node.label.trim() !== ''
    ? `${node.label}: ${node.value}`
    : node.value
  const textStyle = getNodeTextStyle(node, false, hasChildren)

  return (
    <div key={node.nodeKey} style={{ position: 'relative', marginBottom: '0.08rem' }}>
      <span style={getConnectorGuideStyle(indent, isLastChild)} />
      <span style={getConnectorElbowStyle(indent)} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${TOP_LEVEL_ISOLATE_COLUMN_WIDTH}px ${TREE_COLUMN_WIDTH}px minmax(0, 1fr) ${EXPAND_ACTION_COLUMN_WIDTH}px`,
          alignItems: 'start',
          paddingLeft: `${indent}px`,
          minHeight: '1.55rem',
        }}
      >
        <span />

        {hasChildren ? (
          <button
            type="button"
            onClick={() => {
              props.onToggleNode(node.nodeKey)
            }}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${displayText}`}
            style={TREE_TOGGLE_STYLE}
          >
            {getTreeToggleIcon(isExpanded)}
          </button>
        ) : (
          <span style={{ ...TREE_TOGGLE_STYLE, cursor: 'default', color: '#98aaa0' }}>
            •
          </span>
        )}

        <div style={{ paddingTop: '0.08rem', ...textStyle }}>
          {displayText}
          {renderAppendedDisplayValues(node)}
        </div>

        <span />
      </div>

      {isExpanded && node.children.map((childNode, childIndex) => {
        return renderRelatedNode(
          childNode,
          props,
          childIndex === node.children.length - 1,
        )
      })}
    </div>
  )
}

const renderRelatedBreakdownArea = (node: StructureNode, props: StructureTreeProps): JSX.Element | null => {
  if (!node.feature_uid)
  {
    return null
  }

  const isExpanded = props.expandedNodeKeys.includes(node.nodeKey)

  if (!isExpanded)
  {
    return null
  }

  const isLoading = !!props.loadingRelatedBreakdownFeatureUids?.[node.feature_uid]
  const errorMessage = props.relatedBreakdownErrorsByFeatureUid?.[node.feature_uid] || ''
  const relatedNodes = props.relatedBreakdownNodesByFeatureUid?.[node.feature_uid] || []

  return (
    <div style={{ marginTop: '0.1rem' }}>
      {isLoading && (
        <div style={{ marginLeft: '72px', color: '#777', fontSize: '0.85rem' }}>
          Loading plant lines...
        </div>
      )}

      {errorMessage !== '' && (
        <div style={{ marginLeft: '72px', color: '#a12626', fontSize: '0.85rem' }}>
          {errorMessage}
        </div>
      )}

      {!isLoading && errorMessage === '' && relatedNodes.map((relatedNode, relatedIndex) => {
        return renderRelatedNode(
          relatedNode,
          props,
          relatedIndex === relatedNodes.length - 1,
        )
      })}
    </div>
  )
}

const renderNode = (
  node: StructureNode,
  props: StructureTreeProps,
  isLastChild: boolean,
): JSX.Element => {
  const isFeatureNode = !!node.feature_uid
  const isSelected = node.feature_uid === props.selectedFeatureUid
  const isExpanded = props.expandedNodeKeys.includes(node.nodeKey)
  const hasNormalChildren = node.children.length > 0
  const canExpandRelatedDetails = hasConfiguredRelatedBreakdowns(node, props)
  const hasChildren = hasNormalChildren || canExpandRelatedDetails
  const isTopLevel = node.depth === 0 && !String(node.fieldKey || '').startsWith('related:')
  const isIsolated = !!props.isolatedTopLevelValues?.includes(node.value)
  const indent = getNodeIndent(node)
  const textStyle = getNodeTextStyle(node, isSelected, hasChildren)
  const groupNodeDisplayText = getGroupNodeDisplayLabel(node, props.structureFieldMap)

  const handleToggle = () => {
    const willExpand = !isExpanded

    props.onToggleNode(node.nodeKey)

    if (willExpand && isFeatureNode)
    {
      props.onFeatureNodeExpanded?.(node)
    }
  }

  return (
    <div key={node.nodeKey} style={{ position: 'relative', marginBottom: '0.08rem' }}>
      {node.depth > 0 && <span style={getConnectorGuideStyle(indent, isLastChild)} />}
      {node.depth > 0 && <span style={getConnectorElbowStyle(indent)} />}

      <div
        ref={(element) => {
          if (node.feature_uid)
          {
            props.onFeatureRowRef(node.feature_uid, element)
          }
        }}
        style={{
          ...getSelectedFeatureRowStyle(isFeatureNode && isSelected),
          display: 'grid',
          gridTemplateColumns: `${TOP_LEVEL_ISOLATE_COLUMN_WIDTH}px ${TREE_COLUMN_WIDTH}px minmax(0, 1fr) ${EXPAND_ACTION_COLUMN_WIDTH}px`,
          alignItems: 'start',
          paddingLeft: `${indent}px`,
          minHeight: '1.7rem',
        }}
      >
        {isTopLevel && props.onToggleTopLevelIsolation && (
          <input
            type="checkbox"
            checked={isIsolated}
            onChange={() => {
              props.onToggleTopLevelIsolation?.(node.value)
            }}
            style={{ marginTop: '0.28rem' }}
          />
        )}

        {!isTopLevel && (
          <span style={{ width: `${NON_TOP_LEVEL_PREFIX_WIDTH}px` }} />
        )}

        {hasChildren ? (
          <button
            type="button"
            onClick={handleToggle}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.label} ${node.value}`}
            style={TREE_TOGGLE_STYLE}
          >
            {getTreeToggleIcon(isExpanded)}
          </button>
        ) : (
          <span style={{ ...TREE_TOGGLE_STYLE, cursor: 'default', color: '#b0bdb5' }} />
        )}

        <div style={{ minWidth: 0, paddingTop: '0.08rem' }}>
          {isFeatureNode ? (
            <button
              type="button"
              onClick={() => {
                props.onFeatureClick(node)
              }}
              style={{
                ...FEATURE_BUTTON_STYLE,
                ...textStyle,
              }}
            >
              {node.label}: {node.featureLabel || node.value}
              {renderAppendedDisplayValues(node)}
            </button>
          ) : (
            <div style={textStyle}>
              {groupNodeDisplayText}
              {renderAppendedDisplayValues(node)}
            </div>
          )}

          {node.feature_uid && (
            <FeatureAttributes
              feature_uid={node.feature_uid}
              featureAttributes={props.structureFieldMap.featureAttributes}
              expandedFeatureAttributeKeys={props.expandedFeatureAttributeKeys}
              loadingFeatureAttributeKeys={props.loadingFeatureAttributeKeys}
              featureAttributeRecords={props.featureAttributeRecords}
              featureAttributeErrors={props.featureAttributeErrors}
              onToggleFeatureAttribute={props.onToggleFeatureAttribute}
            />
          )}
        </div>

        {isTopLevel && hasChildren ? (
          <button
            type="button"
            onClick={() => {
              props.onExpandBranch(node.nodeKey)
            }}
            style={BRANCH_ACTION_STYLE}
          >
            Expand
          </button>
        ) : (
          <span />
        )}
      </div>

      {isExpanded && hasNormalChildren && node.children.map((childNode, childIndex) => {
        return renderNode(
          childNode,
          props,
          childIndex === node.children.length - 1,
        )
      })}

      {renderRelatedBreakdownArea(node, props)}
    </div>
  )
}

const StructureTree = (props: StructureTreeProps) => {
  return (
    <div style={TREE_WRAPPER_STYLE}>
      {props.structureHierarchy.length === 0 && (
        <p style={EMPTY_STATE_STYLE}>No structure records loaded.</p>
      )}

      {props.structureHierarchy.map((node, nodeIndex) => {
        return renderNode(
          node,
          props,
          nodeIndex === props.structureHierarchy.length - 1,
        )
      })}
    </div>
  )
}

export default StructureTree

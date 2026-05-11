import { React } from 'jimu-core'
import type { FeatureAttributeConfig, StructureFieldMap } from '../lib/field-map'
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
  onExpandAll: () => void
  onCollapseAll: () => void
  onFeatureClick: (node: StructureNode) => void
  onFeatureRowRef: (feature_uid: string, element: HTMLDivElement | null) => void
  onToggleFeatureAttribute: (feature_uid: string, featureAttribute: FeatureAttributeConfig) => void
  onToggleTopLevelIsolation?: (value: string) => void
  onFeatureNodeExpanded?: (node: StructureNode) => void
}

const ACCENT_COLOR = '#007ac2'

const TREE_TOGGLE_STYLE = {
  background: 'none',
  border: 'none',
  color: '#444',
  textDecoration: 'none',
  fontWeight: 700,
  minWidth: '0.8rem',
  width: '0.8rem',
  padding: 0,
  fontSize: '0.72rem',
  lineHeight: 1,
  cursor: 'pointer'
}

const LINK_BUTTON_STYLE = {
  background: 'none',
  border: 'none',
  color: ACCENT_COLOR,
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: 0
}

const FEATURE_BUTTON_STYLE = {
  display: 'inline-block',
  textAlign: 'left' as const,
  border: 'none',
  background: 'transparent',
  padding: '2px 0',
  cursor: 'pointer'
}

const APPENDED_VALUE_STYLE = {
  color: '#666',
  fontWeight: 400,
  fontSize: '0.88rem'
}

const DETAIL_ROW_STYLE = {
  color: '#222',
  fontSize: '0.9rem',
  padding: '2px 0'
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
        hour12: false
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

const getSelectedFeatureRowStyle = (isSelected: boolean) => {
  return {
    marginBottom: '0.2rem',
    padding: isSelected ? '0.25rem 0.5rem' : 0,
    marginLeft: isSelected ? '-0.5rem' : 0,
    borderLeft: isSelected ? `3px solid ${ACCENT_COLOR}` : '3px solid transparent',
    backgroundColor: isSelected ? '#eef7fd' : 'transparent',
    borderRadius: '4px'
  }
}

const hasConfiguredRelatedBreakdowns = (node: StructureNode, props: StructureTreeProps): boolean => {
  if (!node.feature_uid)
  {
    return false
  }

  const hierarchyField = props.structureFieldMap.hierarchyFields.find((field) => {
    return field.key === node.fieldKey
  }) as any

  return Array.isArray(hierarchyField?.relatedBreakdowns) && hierarchyField.relatedBreakdowns.length > 0
}

const renderRelatedNode = (
  node: StructureNode,
  props: StructureTreeProps,
  displayDepth: number
): JSX.Element => {
  const isExpanded = props.expandedNodeKeys.includes(node.nodeKey)
  const hasChildren = node.children.length > 0
  const displayText = node.label && node.label.trim() !== ''
    ? `${node.label}: ${node.value}`
    : node.value

  return (
    <div key={node.nodeKey} style={{ marginLeft: `${displayDepth}rem`, marginBottom: '0.15rem' }}>
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
        <span style={{ display: 'inline-block', width: '0.8rem', color: '#666' }}>•</span>
      )}

      <span style={DETAIL_ROW_STYLE}>
        <span style={{ fontWeight: hasChildren ? 600 : 400 }}>{displayText}</span>
        {renderAppendedDisplayValues(node)}
      </span>

      {isExpanded && node.children.map((childNode) => {
        return renderRelatedNode(childNode, props, displayDepth + 1)
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
    <div style={{ marginTop: '0.15rem' }}>
      {isLoading && (
        <div style={{ marginLeft: `${node.depth + 1}rem`, color: '#777', fontSize: '0.85rem' }}>
          Loading plant lines...
        </div>
      )}

      {errorMessage !== '' && (
        <div style={{ marginLeft: `${node.depth + 1}rem`, color: '#a12626', fontSize: '0.85rem' }}>
          {errorMessage}
        </div>
      )}

      {!isLoading && errorMessage === '' && relatedNodes.map((relatedNode) => {
        return renderRelatedNode(relatedNode, props, node.depth + 1)
      })}
    </div>
  )
}

const renderNode = (node: StructureNode, props: StructureTreeProps): JSX.Element => {
  const isFeatureNode = !!node.feature_uid
  const isSelected = node.feature_uid === props.selectedFeatureUid
  const isExpanded = props.expandedNodeKeys.includes(node.nodeKey)
  const hasNormalChildren = node.children.length > 0
  const canExpandRelatedDetails = hasConfiguredRelatedBreakdowns(node, props)
  const hasChildren = hasNormalChildren || canExpandRelatedDetails
  const isTopLevel = node.depth === 0 && !String(node.fieldKey || '').startsWith('related:')
  const isIsolated = !!props.isolatedTopLevelValues?.includes(node.value)

  const handleToggle = () => {
    const willExpand = !isExpanded

    props.onToggleNode(node.nodeKey)

    if (willExpand && isFeatureNode)
    {
      props.onFeatureNodeExpanded?.(node)
    }
  }

  return (
    <div key={node.nodeKey} style={{ marginBottom: '0.2rem', marginLeft: `${node.depth}rem` }}>
      <div
        ref={(element) => {
          if (node.feature_uid)
          {
            props.onFeatureRowRef(node.feature_uid, element)
          }
        }}
        style={isFeatureNode ? getSelectedFeatureRowStyle(isSelected) : undefined}
      >
        {isTopLevel && props.onToggleTopLevelIsolation && (
          <input
            type="checkbox"
            checked={isIsolated}
            onChange={() => {
              props.onToggleTopLevelIsolation?.(node.value)
            }}
            style={{ marginRight: '0.6rem' }}
          />
        )}

        {!isTopLevel && (
          <span style={{ display: 'inline-block', width: '1.35rem' }} />
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
          <span style={{ display: 'inline-block', width: '0.8rem' }} />
        )}

        {isFeatureNode ? (
          <button
            type="button"
            onClick={() => {
              props.onFeatureClick(node)
            }}
            style={{
              ...FEATURE_BUTTON_STYLE,
              fontWeight: isSelected ? 700 : 500
            }}
          >
            {node.label}: {node.featureLabel || node.value}
            {renderAppendedDisplayValues(node)}
          </button>
        ) : (
          <strong>
            {' '}
            {node.label}: {node.value}
            {renderAppendedDisplayValues(node)}
          </strong>
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

      {isExpanded && hasNormalChildren && node.children.map((childNode) => {
        return renderNode(childNode, props)
      })}

      {renderRelatedBreakdownArea(node, props)}
    </div>
  )
}

const StructureTree = (props: StructureTreeProps) => {
  return (
    <div className="mt-3">
      {props.structureHierarchy.length === 0 && (
        <p>No structure records loaded.</p>
      )}

      {props.structureHierarchy.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <button
            type="button"
            onClick={props.onExpandAll}
            style={LINK_BUTTON_STYLE}
          >
            Expand all
          </button>

          <span> | </span>

          <button
            type="button"
            onClick={props.onCollapseAll}
            style={LINK_BUTTON_STYLE}
          >
            Collapse all
          </button>
        </div>
      )}

      {props.structureHierarchy.map((node) => {
        return renderNode(node, props)
      })}
    </div>
  )
}

export default StructureTree

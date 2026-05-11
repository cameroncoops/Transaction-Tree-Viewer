import { React } from 'jimu-core'
import type { FeatureAttributeConfig, StructureFieldMap } from '../lib/field-map'
import type { BasicLinkedTableRecord } from '../lib/feature-attributes'
import type { AppendedDisplayValue, StructureNode } from '../lib/structure-model'
import FeatureAttributes from './FeatureAttributes'

interface StructureTreeProps {
  structureHierarchy: StructureNode[]
  structureFieldMap: StructureFieldMap
  selectedFeatureUid: string
  expandedNodeKeys: string[]
  expandedFeatureAttributeKeys: string[]
  loadingFeatureAttributeKeys: { [key: string]: boolean }
  featureAttributeRecords: { [key: string]: BasicLinkedTableRecord[] }
  featureAttributeErrors: { [key: string]: string }
  onToggleNode: (nodeKey: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onFeatureClick: (node: StructureNode) => void
  onFeatureRowRef: (feature_uid: string, element: HTMLDivElement | null) => void
  onToggleFeatureAttribute: (feature_uid: string, featureAttribute: FeatureAttributeConfig) => void
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
  display: 'block',
  textAlign: 'left' as const,
  border: 'none',
  background: 'transparent',
  padding: '2px 0',
  cursor: 'pointer'
}

const FEATURE_BUTTON_WITH_TOGGLE_STYLE = {
  ...FEATURE_BUTTON_STYLE,
  display: 'inline',
  padding: 0
}

const APPENDED_VALUES_STYLE = {
  fontWeight: 400,
  color: '#5f6b77'
}

const getTreeToggleIcon = (isExpanded: boolean): string => {
  return isExpanded ? '▼' : '▶'
}

const getSelectedFeatureRowStyle = (isSelected: boolean) => {
  return {
    marginBottom: '0.35rem',
    padding: isSelected ? '0.25rem 0.5rem' : 0,
    marginLeft: isSelected ? '-0.5rem' : 0,
    borderLeft: isSelected ? `3px solid ${ACCENT_COLOR}` : '3px solid transparent',
    backgroundColor: isSelected ? '#eef7fd' : 'transparent',
    borderRadius: '4px'
  }
}

const formatDateParts = (date: Date, includeTime: boolean): string => {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear())

  if (!includeTime) {
    return `${day}/${month}/${year}`
  }

  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${day}/${month}/${year} ${hours}:${minutes}`
}

const tryParseDateValue = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'number') {
    const date = new Date(value)

    return Number.isNaN(date.getTime()) ? null : date
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim()

    if (trimmedValue === '') {
      return null
    }

    const numericValue = Number(trimmedValue)

    if (!Number.isNaN(numericValue) && trimmedValue !== '') {
      const numericDate = new Date(numericValue)

      if (!Number.isNaN(numericDate.getTime())) {
        return numericDate
      }
    }

    const parsedDate = new Date(trimmedValue)

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
  }

  return null
}

const formatAppendedValue = (displayValue: AppendedDisplayValue): string => {
  const format = displayValue.format || 'text'

  if (format === 'number') {
    const numericValue = typeof displayValue.value === 'number'
      ? displayValue.value
      : Number(displayValue.value)

    if (!Number.isNaN(numericValue)) {
      return numericValue.toLocaleString('en-AU')
    }
  }

  if (format === 'date' || format === 'datetime') {
    const parsedDate = tryParseDateValue(displayValue.value)

    if (parsedDate) {
      return formatDateParts(parsedDate, format === 'datetime')
    }
  }

  if (typeof displayValue.value === 'string') {
    return displayValue.value
  }

  if (displayValue.value instanceof Date) {
    return Number.isNaN(displayValue.value.getTime())
      ? String(displayValue.value)
      : displayValue.value.toString()
  }

  return String(displayValue.value)
}

const renderAppendedDisplayValues = (node: StructureNode): JSX.Element | null => {
  if (!node.appendedDisplayValues || node.appendedDisplayValues.length < 1) {
    return null
  }

  return (
    <span style={APPENDED_VALUES_STYLE}>
      {node.appendedDisplayValues.map((displayValue) => {
        return ` | ${displayValue.label}: ${formatAppendedValue(displayValue)}`
      }).join('')}
    </span>
  )
}

const renderNode = (node: StructureNode, props: StructureTreeProps): JSX.Element => {
  const isFeatureNode = !!node.feature_uid
  const isSelected = node.feature_uid === props.selectedFeatureUid
  const isExpanded = props.expandedNodeKeys.includes(node.nodeKey)
  const hasChildren = node.children.length > 0

  if (isFeatureNode) {
    return (
      <div
        key={node.nodeKey}
        ref={(element) => {
          if (node.feature_uid) {
            props.onFeatureRowRef(node.feature_uid, element)
          }
        }}
        style={{
          ...getSelectedFeatureRowStyle(isSelected),
          marginLeft: `${node.depth}rem`
        }}
      >
        <div>
          {hasChildren && (
            <button
              type="button"
              onClick={() => {
                props.onToggleNode(node.nodeKey)
              }}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.label} ${node.value}`}
              style={TREE_TOGGLE_STYLE}
            >
              {getTreeToggleIcon(isExpanded)}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              props.onFeatureClick(node)
            }}
            style={{
              ...(hasChildren ? FEATURE_BUTTON_WITH_TOGGLE_STYLE : FEATURE_BUTTON_STYLE),
              fontWeight: isSelected ? 700 : 400
            }}
          >
            {node.label}: {node.featureLabel || node.value}
            {renderAppendedDisplayValues(node)}
          </button>
        </div>

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

        {isExpanded && node.children.map((childNode) => {
          return renderNode(childNode, props)
        })}
      </div>
    )
  }

  return (
    <div key={node.nodeKey} style={{ marginBottom: '0.35rem', marginLeft: `${node.depth}rem` }}>
      {hasChildren && (
        <button
          type="button"
          onClick={() => {
            props.onToggleNode(node.nodeKey)
          }}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.label} ${node.value}`}
          style={TREE_TOGGLE_STYLE}
        >
          {getTreeToggleIcon(isExpanded)}
        </button>
      )}

      <strong>
        {' '}
        {node.label}: {node.value}
        {renderAppendedDisplayValues(node)}
      </strong>

      {isExpanded && node.children.map((childNode) => {
        return renderNode(childNode, props)
      })}
    </div>
  )
}

const StructureTree = (props: StructureTreeProps) => {
  return (
    <div className="mt-3">
      <h4>Structure hierarchy</h4>

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

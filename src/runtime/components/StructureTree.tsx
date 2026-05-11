import { React } from 'jimu-core'
import type {
  FeatureAttributeConfig,
  StructureFieldMap,
} from '../lib/field-map'
import type { BasicLinkedTableRecord } from '../lib/feature-attributes'
import type {
  AppendedDisplayValue,
  StructureNode,
} from '../lib/structure-model'
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
  isolatedTopLevelValues: string[]
  onToggleTopLevelIsolation: (topLevelValue: string) => void
  onToggleNode: (nodeKey: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onFeatureClick: (node: StructureNode) => void
  onFeatureRowRef: (feature_uid: string, element: HTMLDivElement | null) => void
  onToggleFeatureAttribute: (
    feature_uid: string,
    featureAttribute: FeatureAttributeConfig,
  ) => void
}

const ACCENT_COLOR = '#1f6f8b'
const MUTED_TEXT_COLOR = '#666'
const SECONDARY_TEXT_COLOR = '#8a8a8a'

const PANEL_STYLE = {
  backgroundColor: '#ffffff',
  padding: 0,
}

const TREE_TOGGLE_STYLE = {
  background: 'none',
  border: 'none',
  color: '#24352b',
  textDecoration: 'none',
  fontWeight: 700,
  minWidth: '1rem',
  width: '1rem',
  padding: 0,
  fontSize: '0.8rem',
  lineHeight: 1,
  cursor: 'pointer',
}

const FEATURE_BUTTON_STYLE = {
  display: 'inline',
  textAlign: 'left' as const,
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
  color: '#1f2f26',
  lineHeight: 1.45,
  fontSize: '0.95rem',
}

const APPENDED_VALUES_STYLE = {
  fontWeight: 400,
  color: SECONDARY_TEXT_COLOR,
  fontSize: '0.9rem',
  marginLeft: '0.4rem',
}

const EMPTY_STATE_STYLE = {
  color: MUTED_TEXT_COLOR,
  lineHeight: 1.5,
  padding: '0.35rem 0',
}

const TOP_LEVEL_ROW_STYLE = {
  display: 'grid',
  gridTemplateColumns: '5.5rem 1fr',
  columnGap: '0.5rem',
  alignItems: 'start',
  borderBottom: '1px solid #edf1ed',
}

const TOP_LEVEL_ISOLATE_CELL_STYLE = {
  textAlign: 'center' as const,
  paddingTop: '0.75rem',
}

const CHECKBOX_STYLE = {
  width: '1.05rem',
  height: '1.05rem',
  accentColor: ACCENT_COLOR,
  cursor: 'pointer',
}

const CHILDREN_STYLE = {
  marginLeft: '1.75rem',
  marginTop: '0.25rem',
  paddingBottom: '0.55rem',
}

const getTreeToggleIcon = (isExpanded: boolean): string => {
  return isExpanded ? '▼' : '▶'
}

const getSelectedFeatureRowStyle = (isSelected: boolean) => {
  return {
    marginBottom: '0.18rem',
    padding: isSelected ? '0.45rem 0.65rem' : '0.18rem 0',
    marginLeft: isSelected ? '-0.65rem' : 0,
    backgroundColor: isSelected ? '#edf7e8' : 'transparent',
    borderRadius: '5px',
  }
}

const getGroupRowStyle = () => {
  return {
    marginBottom: '0.18rem',
    padding: '0.65rem 0 0.55rem 0',
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
    const numericValue =
      typeof displayValue.value === 'number'
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

const renderAppendedDisplayValues = (
  node: StructureNode,
): JSX.Element | null => {
  if (!node.appendedDisplayValues || node.appendedDisplayValues.length < 1) {
    return null
  }

  return (
    <span style={APPENDED_VALUES_STYLE}>
      {node.appendedDisplayValues
        .map((displayValue) => {
          return `  ${displayValue.label}: ${formatAppendedValue(displayValue)}`
        })
        .join('')}
    </span>
  )
}

const renderNodeContent = (
  node: StructureNode,
  props: StructureTreeProps,
): JSX.Element => {
  const isFeatureNode = !!node.feature_uid
  const isSelected = node.feature_uid === props.selectedFeatureUid
  const isExpanded = props.expandedNodeKeys.includes(node.nodeKey)
  const hasChildren = node.children.length > 0

  return (
    <div
      ref={(element) => {
        if (node.feature_uid) {
          props.onFeatureRowRef(node.feature_uid, element)
        }
      }}
      style={
        isFeatureNode
          ? getSelectedFeatureRowStyle(isSelected)
          : getGroupRowStyle()
      }
    >
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: '0.25rem' }}
      >
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

        {!hasChildren && (
          <span
            style={{ display: 'inline-block', width: '1rem', minWidth: '1rem' }}
          />
        )}

        {isFeatureNode && (
          <button
            type="button"
            onClick={() => {
              props.onFeatureClick(node)
            }}
            style={{
              ...FEATURE_BUTTON_STYLE,
              fontWeight: isSelected ? 700 : 500,
            }}
          >
            {node.label} {node.featureLabel || node.value}
            {renderAppendedDisplayValues(node)}
          </button>
        )}

        {!isFeatureNode && (
          <span style={{ color: '#1c2733', lineHeight: 1.35, fontWeight: 700 }}>
            {node.label} {node.value}
            {renderAppendedDisplayValues(node)}
          </span>
        )}
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

      {isExpanded && node.children.length > 0 && (
        <div style={CHILDREN_STYLE}>
          {node.children.map((childNode) => {
            return renderNode(childNode, props, false)
          })}
        </div>
      )}
    </div>
  )
}

const renderNode = (
  node: StructureNode,
  props: StructureTreeProps,
  isTopLevel: boolean,
): JSX.Element => {
  if (isTopLevel) {
    const isIsolated = props.isolatedTopLevelValues.includes(node.value)

    return (
      <div key={node.nodeKey} style={TOP_LEVEL_ROW_STYLE}>
        <div style={TOP_LEVEL_ISOLATE_CELL_STYLE}>
          <input
            type="checkbox"
            checked={isIsolated}
            aria-label={`Isolate ${node.label} ${node.value}`}
            title={`Isolate ${node.value}`}
            style={CHECKBOX_STYLE}
            onChange={() => {
              props.onToggleTopLevelIsolation(node.value)
            }}
          />
        </div>

        <div style={{ padding: '0 0.85rem 0 0' }}>
          {renderNodeContent(node, props)}
        </div>
      </div>
    )
  }

  return <div key={node.nodeKey}>{renderNodeContent(node, props)}</div>
}

const StructureTree = (props: StructureTreeProps) => {
  return (
    <section style={PANEL_STYLE}>
      {props.structureHierarchy.length === 0 && (
        <div style={EMPTY_STATE_STYLE}>No structure records loaded.</div>
      )}

      {props.structureHierarchy.map((node) => {
        return renderNode(node, props, true)
      })}
    </section>
  )
}

export default StructureTree

import { React } from 'jimu-core'
import type { FeatureAttributeConfig } from '../lib/field-map'
import type { BasicLinkedTableRecord } from '../lib/feature-attributes'
import { getFeatureAttributeStateKey } from '../lib/feature-attributes'

interface FeatureAttributesProps
{
  feature_uid: string
  featureAttributes: FeatureAttributeConfig[] | undefined
  expandedFeatureAttributeKeys: string[]
  loadingFeatureAttributeKeys: { [key: string]: boolean }
  featureAttributeRecords: { [key: string]: BasicLinkedTableRecord[] }
  featureAttributeErrors: { [key: string]: string }
  onToggleFeatureAttribute: (feature_uid: string, featureAttribute: FeatureAttributeConfig) => void
}

const TREE_TOGGLE_STYLE = {
  background: 'none',
  border: 'none',
  color: '#607080',
  textDecoration: 'none',
  fontWeight: 700,
  minWidth: '1rem',
  width: '1rem',
  padding: 0,
  fontSize: '0.8rem',
  lineHeight: 1,
  cursor: 'pointer'
}

const ATTRIBUTE_BUTTON_STYLE = {
  background: 'none',
  border: 'none',
  color: '#32586b',
  padding: 0,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.88rem'
}

const ATTRIBUTE_GROUP_STYLE = {
  marginTop: '0.45rem',
  marginLeft: '1.5rem',
  paddingLeft: '0.85rem',
  borderLeft: '2px solid #dbe6ed'
}

const ATTRIBUTE_RECORD_STYLE = {
  margin: '0.45rem 0 0.55rem 0',
  padding: '0.6rem 0.75rem',
  border: '1px solid #e2e9ee',
  backgroundColor: '#fbfcfd',
  borderRadius: '8px'
}

const ATTRIBUTE_ROW_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'minmax(130px, 180px) minmax(0, 1fr)',
  gap: '0.4rem 0.75rem',
  alignItems: 'start' as const,
  marginTop: '0.3rem'
}

const ATTRIBUTE_ROW_LABEL_STYLE = {
  color: '#607080',
  fontWeight: 700,
  fontSize: '0.84rem'
}

const ATTRIBUTE_ROW_VALUE_STYLE = {
  color: '#1c2733',
  fontSize: '0.88rem',
  lineHeight: 1.45
}

const MUTED_TEXT_STYLE = {
  color: '#607080',
  fontSize: '0.88rem'
}

const ERROR_TEXT_STYLE = {
  color: '#a12626',
  fontSize: '0.88rem'
}

const getTreeToggleIcon = (isExpanded: boolean): string => {
  return isExpanded ? '-' : '+'
}

const FeatureAttributes = (props: FeatureAttributesProps) => {
  if (!props.featureAttributes || props.featureAttributes.length === 0)
  {
    return null
  }

  return (
    <div style={{ marginTop: '0.5rem', marginLeft: '0.25rem' }}>
      {props.featureAttributes.map((featureAttribute) => {
        const stateKey = getFeatureAttributeStateKey(props.feature_uid, featureAttribute.key)
        const isExpanded = props.expandedFeatureAttributeKeys.includes(stateKey)
        const isLoading = !!props.loadingFeatureAttributeKeys[stateKey]
        const errorMessage = props.featureAttributeErrors[stateKey] || ''
        const records = props.featureAttributeRecords[stateKey] || []

        return (
          <div key={stateKey} style={{ marginBottom: '0.45rem' }}>
            <div>
              <button
                type="button"
                onClick={() => {
                  props.onToggleFeatureAttribute(props.feature_uid, featureAttribute)
                }}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${featureAttribute.label}`}
                style={TREE_TOGGLE_STYLE}
              >
                {getTreeToggleIcon(isExpanded)}
              </button>

              <button
                type="button"
                onClick={() => {
                  props.onToggleFeatureAttribute(props.feature_uid, featureAttribute)
                }}
                style={ATTRIBUTE_BUTTON_STYLE}
              >
                {featureAttribute.label}
              </button>
            </div>

            {isExpanded && (
              <div style={ATTRIBUTE_GROUP_STYLE}>
                {isLoading && (
                  <p style={MUTED_TEXT_STYLE}>Loading...</p>
                )}

                {!isLoading && errorMessage !== '' && (
                  <p style={ERROR_TEXT_STYLE}>{errorMessage}</p>
                )}

                {!isLoading && errorMessage === '' && records.length === 0 && (
                  <p style={MUTED_TEXT_STYLE}>No records found.</p>
                )}

                {!isLoading && errorMessage === '' && records.length > 0 && (
                  <div>
                    {records.map((record, recordIndex) => (
                      <div key={`${stateKey}-${recordIndex}`} style={ATTRIBUTE_RECORD_STYLE}>
                        {record.displayValues.map((displayValue) => (
                          <div key={`${stateKey}-${recordIndex}-${displayValue.fieldName}`} style={ATTRIBUTE_ROW_STYLE}>
                            <div style={ATTRIBUTE_ROW_LABEL_STYLE}>{displayValue.label}</div>
                            <div style={ATTRIBUTE_ROW_VALUE_STYLE}>{displayValue.value || ''}</div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default FeatureAttributes

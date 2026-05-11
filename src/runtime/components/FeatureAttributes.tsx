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

const ATTRIBUTE_BUTTON_STYLE = {
  background: 'none',
  border: 'none',
  color: '#333',
  padding: 0,
  cursor: 'pointer',
  fontWeight: 600
}

const ATTRIBUTE_RECORD_STYLE = {
  margin: '0.35rem 0 0.5rem 1rem',
  padding: '0.45rem 0.6rem',
  borderLeft: '2px solid #d6e7f2',
  backgroundColor: '#fafafa',
  borderRadius: '4px'
}

const MUTED_TEXT_STYLE = {
  color: '#666',
  fontSize: '0.88rem'
}

const getTreeToggleIcon = (isExpanded: boolean): string => {
  return isExpanded ? '▼' : '▶'
}

const FeatureAttributes = (props: FeatureAttributesProps) => {
  if (!props.featureAttributes || props.featureAttributes.length === 0)
  {
    return null
  }

  return (
    <div style={{ marginTop: '0.35rem', marginLeft: '1rem' }}>
      {props.featureAttributes.map((featureAttribute) => {
        const stateKey = getFeatureAttributeStateKey(props.feature_uid, featureAttribute.key)
        const isExpanded = props.expandedFeatureAttributeKeys.includes(stateKey)
        const isLoading = !!props.loadingFeatureAttributeKeys[stateKey]
        const errorMessage = props.featureAttributeErrors[stateKey] || ''
        const records = props.featureAttributeRecords[stateKey] || []

        return (
          <div key={stateKey} style={{ marginBottom: '0.35rem' }}>
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
              {' '}
              {featureAttribute.label}
            </button>

            {isExpanded && (
              <div>
                {isLoading && (
                  <p style={MUTED_TEXT_STYLE}>Loading...</p>
                )}

                {!isLoading && errorMessage !== '' && (
                  <p style={{ color: '#c62828' }}>{errorMessage}</p>
                )}

                {!isLoading && errorMessage === '' && records.length === 0 && (
                  <p style={MUTED_TEXT_STYLE}>No records found.</p>
                )}

                {!isLoading && errorMessage === '' && records.length > 0 && (
                  <div>
                    {records.map((record, recordIndex) => (
                      <div key={`${stateKey}-${recordIndex}`} style={ATTRIBUTE_RECORD_STYLE}>
                        {record.displayValues.map((displayValue) => (
                          <div key={`${stateKey}-${recordIndex}-${displayValue.fieldName}`}>
                            <strong>{displayValue.label}:</strong> {displayValue.value || ''}
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
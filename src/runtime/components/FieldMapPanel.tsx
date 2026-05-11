import { React } from 'jimu-core'
import type { FieldMapParseResult, FieldValidationResult } from '../lib/field-map'

interface FieldMapPanelProps
{
  fieldMapParseResult: FieldMapParseResult
  fieldValidationResult: FieldValidationResult | null
  availableFieldNames: string[]
}

const PANEL_STYLE = {
  border: '1px solid #d8e1e8',
  borderRadius: '12px',
  backgroundColor: '#ffffff',
  padding: '1rem 1.1rem',
  boxShadow: '0 6px 18px rgba(28, 39, 51, 0.05)'
}

const SECTION_TITLE_STYLE = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 700,
  color: '#1c2733'
}

const SECTION_DESCRIPTION_STYLE = {
  margin: '0.4rem 0 1rem 0',
  fontSize: '0.9rem',
  color: '#607080'
}

const GROUP_STYLE = {
  padding: '0.85rem 0.95rem',
  border: '1px solid #e2e9ee',
  borderRadius: '10px',
  backgroundColor: '#f9fbfc',
  marginBottom: '0.75rem'
}

const LABEL_STYLE = {
  margin: 0,
  fontSize: '0.82rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  color: '#607080'
}

const VALUE_STYLE = {
  margin: '0.3rem 0 0 0',
  color: '#1c2733',
  lineHeight: 1.5
}

const LIST_STYLE = {
  margin: '0.45rem 0 0 1.1rem',
  padding: 0,
  color: '#556371'
}

const INFO_BLOCK_STYLE = {
  padding: '0.8rem 0.9rem',
  borderRadius: '10px',
  border: '1px solid #d5e6ef',
  backgroundColor: '#f3f9fc',
  color: '#32586b'
}

const ERROR_BLOCK_STYLE = {
  padding: '0.8rem 0.9rem',
  borderRadius: '10px',
  border: '1px solid #f2d1d1',
  backgroundColor: '#fff7f7',
  color: '#a12626'
}

const FieldMapPanel = (props: FieldMapPanelProps) => {
  const structureFieldMap = props.fieldMapParseResult.fieldMap

  return (
    <section style={PANEL_STYLE}>
      <h4 style={SECTION_TITLE_STYLE}>Configured structure</h4>
      <p style={SECTION_DESCRIPTION_STYLE}>Current hierarchy, selection, and linked attribute field mapping.</p>

      {props.fieldMapParseResult.errorMessage !== '' && (
        <div style={ERROR_BLOCK_STYLE}>{props.fieldMapParseResult.errorMessage}</div>
      )}

      {structureFieldMap && (
        <div>
          {structureFieldMap.hierarchyFields.map((field) => (
            <div key={field.key} style={GROUP_STYLE}>
              <p style={LABEL_STYLE}>Hierarchy field</p>

              <p style={VALUE_STYLE}>
                {field.label}: {field.fieldName}{field.optional ? ' (optional)' : ''}
                {field.filter === true ? ' (filter)' : ''}
              </p>

              {field.appendFields && field.appendFields.length > 0 && (
                <ul style={LIST_STYLE}>
                  {field.appendFields.map((appendField) => (
                    <li key={appendField.key}>
                      {appendField.label}: {appendField.fieldName}{appendField.format ? ` (${appendField.format})` : ''}
                      {appendField.filter === true ? ' (filter)' : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          <div style={GROUP_STYLE}>
            <p style={LABEL_STYLE}>Feature label key</p>
            <p style={VALUE_STYLE}>{structureFieldMap.featureLabelFieldKey}</p>
            <p style={{ ...LABEL_STYLE, marginTop: '0.75rem' }}>Selectable field key</p>
            <p style={VALUE_STYLE}>{structureFieldMap.selectableFieldKey || 'final hierarchy field'}</p>
            <p style={{ ...LABEL_STYLE, marginTop: '0.75rem' }}>{structureFieldMap.identityFields.feature_uid.label}</p>
            <p style={VALUE_STYLE}>{structureFieldMap.identityFields.feature_uid.fieldName}</p>
          </div>

          <h4 style={{ ...SECTION_TITLE_STYLE, marginTop: '1rem' }}>Feature attributes</h4>

          {(!structureFieldMap.featureAttributes || structureFieldMap.featureAttributes.length === 0) && (
            <div style={INFO_BLOCK_STYLE}>No feature attributes configured.</div>
          )}

          {structureFieldMap.featureAttributes && structureFieldMap.featureAttributes.length > 0 && (
            <div>
              {structureFieldMap.featureAttributes.map((featureAttribute) => (
                <div key={featureAttribute.key} style={GROUP_STYLE}>
                  <p style={LABEL_STYLE}>Feature attribute</p>
                  <p style={VALUE_STYLE}>
                    <strong>{featureAttribute.label}</strong>: {featureAttribute.type}
                  </p>

                  <p style={{ ...LABEL_STYLE, marginTop: '0.75rem' }}>Linked feature UID field</p>
                  <p style={VALUE_STYLE}>{featureAttribute.featureUidFieldName}</p>

                  <ul style={LIST_STYLE}>
                    {featureAttribute.displayFields.map((displayField) => (
                      <li key={displayField.fieldName}>
                        {displayField.label}: {displayField.fieldName}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {props.fieldValidationResult && (
        <div style={{ marginTop: '1rem' }}>
          <h4 style={SECTION_TITLE_STYLE}>Datasource field validation</h4>

          {props.availableFieldNames.length === 0 && (
            <div style={INFO_BLOCK_STYLE}>No datasource fields have been loaded yet.</div>
          )}

          {props.availableFieldNames.length > 0 && props.fieldValidationResult.isValid && (
            <div style={INFO_BLOCK_STYLE}>All configured fields were found in the selected datasource.</div>
          )}

          {props.availableFieldNames.length > 0 && !props.fieldValidationResult.isValid && (
            <div style={ERROR_BLOCK_STYLE}>
              <p style={{ margin: 0 }}>Some configured fields were not found in the selected datasource:</p>

              <ul style={LIST_STYLE}>
                {props.fieldValidationResult.missingFieldNames.map((fieldName) => (
                  <li key={fieldName}>{fieldName}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default FieldMapPanel

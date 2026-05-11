import { React } from 'jimu-core'
import type { FieldMapParseResult, FieldValidationResult } from '../lib/field-map'

interface FieldMapPanelProps {
  fieldMapParseResult: FieldMapParseResult
  fieldValidationResult: FieldValidationResult | null
  availableFieldNames: string[]
}

const FieldMapPanel = (props: FieldMapPanelProps) => {
  const structureFieldMap = props.fieldMapParseResult.fieldMap

  return (
    <div className="mt-3">
      <h4>Configured structure</h4>

      {props.fieldMapParseResult.errorMessage !== '' && (
        <p>{props.fieldMapParseResult.errorMessage}</p>
      )}

      {structureFieldMap && (
        <div>
          {structureFieldMap.hierarchyFields.map((field) => (
            <div key={field.key} style={{ marginBottom: '0.5rem' }}>
              <p>
                {field.label}: {field.fieldName}{field.optional ? ' (optional)' : ''}
              </p>

              {field.appendFields && field.appendFields.length > 0 && (
                <ul>
                  {field.appendFields.map((appendField) => (
                    <li key={appendField.key}>
                      {appendField.label}: {appendField.fieldName}{appendField.format ? ` (${appendField.format})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          <p>Feature label key: {structureFieldMap.featureLabelFieldKey}</p>
          <p>Selectable field key: {structureFieldMap.selectableFieldKey || 'final hierarchy field'}</p>
          <p>{structureFieldMap.identityFields.feature_uid.label}: {structureFieldMap.identityFields.feature_uid.fieldName}</p>

          <h4>Feature attributes</h4>

          {(!structureFieldMap.featureAttributes || structureFieldMap.featureAttributes.length === 0) && (
            <p>No feature attributes configured.</p>
          )}

          {structureFieldMap.featureAttributes && structureFieldMap.featureAttributes.length > 0 && (
            <div>
              {structureFieldMap.featureAttributes.map((featureAttribute) => (
                <div key={featureAttribute.key} style={{ marginBottom: '0.75rem' }}>
                  <p>
                    <strong>{featureAttribute.label}</strong>: {featureAttribute.type}
                  </p>

                  <p>Linked feature UID field: {featureAttribute.featureUidFieldName}</p>

                  <ul>
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
        <div className="mt-3">
          <h4>Datasource field validation</h4>

          {props.availableFieldNames.length === 0 && (
            <p>No datasource fields have been loaded yet.</p>
          )}

          {props.availableFieldNames.length > 0 && props.fieldValidationResult.isValid && (
            <p>All configured fields were found in the selected datasource.</p>
          )}

          {props.availableFieldNames.length > 0 && !props.fieldValidationResult.isValid && (
            <div>
              <p>Some configured fields were not found in the selected datasource:</p>

              <ul>
                {props.fieldValidationResult.missingFieldNames.map((fieldName) => (
                  <li key={fieldName}>{fieldName}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default FieldMapPanel

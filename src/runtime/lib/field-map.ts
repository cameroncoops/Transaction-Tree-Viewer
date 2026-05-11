export interface FieldMapping {
  fieldName: string
  label: string
}

export interface HierarchyFieldMapping extends FieldMapping {
  key: string
  optional?: boolean
  appendFields?: AppendFieldMapping[]
}

export interface FeatureAttributeDisplayField extends FieldMapping {
}

export type AppendFieldFormat = 'text' | 'date' | 'datetime' | 'number'

export interface AppendFieldMapping extends FieldMapping {
  key: string
  format?: AppendFieldFormat
}

export interface FeatureAttributeConfig {
  key: string
  label: string
  type: 'basicLinkedTable'
  dataSourceUrl: string
  featureUidFieldName: string
  displayFields: FeatureAttributeDisplayField[]
}

export interface StructureFieldMap {
  fieldMapVersion: number
  hierarchyFields: HierarchyFieldMapping[]
  featureLabelFieldKey: string
  selectableFieldKey?: string
  identityFields: {
    feature_uid: FieldMapping
  }
  featureAttributes?: FeatureAttributeConfig[]
}

export interface FieldMapParseResult {
  fieldMap: StructureFieldMap | null
  errorMessage: string
}

export interface FieldValidationResult {
  configuredFieldNames: string[]
  availableFieldNames: string[]
  missingFieldNames: string[]
  isValid: boolean
}

const hasText = (value: unknown): boolean => {
  return typeof value === 'string' && value.trim() !== ''
}

const hasFieldName = (value: FieldMapping | undefined): boolean => {
  return !!value && hasText(value.fieldName)
}

const hasHierarchyField = (value: HierarchyFieldMapping | undefined): boolean => {
  return !!value && hasText(value.key) && hasText(value.fieldName) && hasText(value.label)
}

const hasDisplayField = (value: FeatureAttributeDisplayField | undefined): boolean => {
  return !!value && hasText(value.fieldName) && hasText(value.label)
}

const hasAppendField = (value: AppendFieldMapping | undefined): boolean => {
  if (!value || !hasText(value.key) || !hasText(value.fieldName) || !hasText(value.label)) {
    return false
  }

  if (value.format === undefined) {
    return true
  }

  return ['text', 'date', 'datetime', 'number'].includes(value.format)
}

const validateFeatureAttributes = (featureAttributes: FeatureAttributeConfig[] | undefined): string => {
  if (!featureAttributes) {
    return ''
  }

  if (!Array.isArray(featureAttributes)) {
    return 'featureAttributes must be an array.'
  }

  const featureAttributeKeys = featureAttributes.map((featureAttribute) => featureAttribute.key)
  const uniqueFeatureAttributeKeys = new Set(featureAttributeKeys)

  if (uniqueFeatureAttributeKeys.size !== featureAttributeKeys.length) {
    return 'Each featureAttributes key must be unique.'
  }

  for (const featureAttribute of featureAttributes) {
    if (!hasText(featureAttribute.key)) {
      return 'Each featureAttributes entry must include key.'
    }

    if (!hasText(featureAttribute.label)) {
      return 'Each featureAttributes entry must include label.'
    }

    if (featureAttribute.type !== 'basicLinkedTable') {
      return 'Only featureAttributes type basicLinkedTable is currently supported.'
    }

    if (!hasText(featureAttribute.dataSourceUrl)) {
      return 'Each featureAttributes entry must include dataSourceUrl.'
    }

    if (!hasText(featureAttribute.featureUidFieldName)) {
      return 'Each featureAttributes entry must include featureUidFieldName.'
    }

    if (!Array.isArray(featureAttribute.displayFields) || featureAttribute.displayFields.length < 1) {
      return 'Each featureAttributes entry must include at least one displayFields entry.'
    }

    const invalidDisplayField = featureAttribute.displayFields.find((displayField) => {
      return !hasDisplayField(displayField)
    })

    if (invalidDisplayField) {
      return 'Each featureAttributes displayFields entry must include fieldName and label.'
    }
  }

  return ''
}

export const parseStructureFieldMap = (fieldMapJson: string | undefined): FieldMapParseResult => {
  if (!fieldMapJson || fieldMapJson.trim() === '') {
    return {
      fieldMap: null,
      errorMessage: 'No field map JSON has been configured.'
    }
  }

  try {
    const parsedValue = JSON.parse(fieldMapJson) as StructureFieldMap

    if (!Array.isArray(parsedValue.hierarchyFields) || parsedValue.hierarchyFields.length < 1) {
      return {
        fieldMap: null,
        errorMessage: 'Field map JSON must include at least one hierarchyFields entry.'
      }
    }

    const invalidHierarchyField = parsedValue.hierarchyFields.find((field) => {
      return !hasHierarchyField(field)
    })

    if (invalidHierarchyField) {
      return {
        fieldMap: null,
        errorMessage: 'Each hierarchyFields entry must include key, fieldName, and label.'
      }
    }

    const hierarchyKeys = parsedValue.hierarchyFields.map((field) => field.key)
    const uniqueHierarchyKeys = new Set(hierarchyKeys)

    if (uniqueHierarchyKeys.size !== hierarchyKeys.length) {
      return {
        fieldMap: null,
        errorMessage: 'Each hierarchyFields key must be unique.'
      }
    }

    const invalidAppendField = parsedValue.hierarchyFields.find((field) => {
      if (!field.appendFields) {
        return false
      }

      if (!Array.isArray(field.appendFields)) {
        return true
      }

      return field.appendFields.some((appendField) => {
        return !hasAppendField(appendField)
      })
    })

    if (invalidAppendField) {
      return {
        fieldMap: null,
        errorMessage: 'Each appendFields entry must include key, fieldName, and label. Supported appendFields format values are text, date, datetime, and number.'
      }
    }

    if (!hasText(parsedValue.featureLabelFieldKey)) {
      return {
        fieldMap: null,
        errorMessage: 'Field map JSON is missing featureLabelFieldKey.'
      }
    }

    const featureLabelFieldExists = parsedValue.hierarchyFields.some((field) => {
      return field.key === parsedValue.featureLabelFieldKey
    })

    if (!featureLabelFieldExists) {
      return {
        fieldMap: null,
        errorMessage: 'featureLabelFieldKey must match one hierarchyFields key.'
      }
    }

    if (parsedValue.selectableFieldKey !== undefined) {
      if (!hasText(parsedValue.selectableFieldKey)) {
        return {
          fieldMap: null,
          errorMessage: 'selectableFieldKey must match one hierarchyFields key.'
        }
      }

      const selectableFieldExists = parsedValue.hierarchyFields.some((field) => {
        return field.key === parsedValue.selectableFieldKey
      })

      if (!selectableFieldExists) {
        return {
          fieldMap: null,
          errorMessage: 'selectableFieldKey must match one hierarchyFields key.'
        }
      }
    }

    if (!parsedValue.identityFields) {
      return {
        fieldMap: null,
        errorMessage: 'Field map JSON is missing identityFields.'
      }
    }

    if (!hasFieldName(parsedValue.identityFields.feature_uid)) {
      return {
        fieldMap: null,
        errorMessage: 'Field map JSON is missing identityFields.feature_uid.fieldName.'
      }
    }

    const featureAttributeValidationError = validateFeatureAttributes(parsedValue.featureAttributes)

    if (featureAttributeValidationError !== '') {
      return {
        fieldMap: null,
        errorMessage: featureAttributeValidationError
      }
    }

    return {
      fieldMap: parsedValue,
      errorMessage: ''
    }
  } catch {
    return {
      fieldMap: null,
      errorMessage: 'Field map JSON is not valid JSON.'
    }
  }
}

export const getConfiguredFieldNamesFromFieldMap = (fieldMap: StructureFieldMap): string[] => {
  const fieldNames = fieldMap.hierarchyFields.flatMap((field) => {
    const appendFieldNames = (field.appendFields || []).map((appendField) => appendField.fieldName)

    return [field.fieldName, ...appendFieldNames]
  })

  fieldNames.push(fieldMap.identityFields.feature_uid.fieldName)

  return Array.from(new Set(fieldNames))
}

export const validateFieldMapAgainstAvailableFields = (fieldMap: StructureFieldMap, availableFieldNames: string[]): FieldValidationResult => {
  const configuredFieldNames = getConfiguredFieldNamesFromFieldMap(fieldMap)
  const normalisedAvailableFieldNames = availableFieldNames.map((fieldName) => fieldName.toLowerCase())

  const missingFieldNames = configuredFieldNames.filter((configuredFieldName) => {
    return !normalisedAvailableFieldNames.includes(configuredFieldName.toLowerCase())
  })

  return {
    configuredFieldNames,
    availableFieldNames,
    missingFieldNames,
    isValid: missingFieldNames.length === 0
  }
}

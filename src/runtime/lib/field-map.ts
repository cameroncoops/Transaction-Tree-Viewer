export type FieldValueFormat = 'text' | 'date' | 'datetime' | 'number'

export interface FieldMapping
{
  fieldName: string
  label: string
}

export interface HierarchyAppendFieldMapping extends FieldMapping
{
  key: string
  format?: FieldValueFormat
  filter?: boolean
}

export interface RelatedSummaryConfig
{
  key: string
  label: string
  relatedSourceKey: string
  joinField: string
  relatedJoinField: string
  operation: 'sum'
  fieldName: string
  format?: FieldValueFormat
}

export interface HierarchyFieldMapping extends FieldMapping
{
  key: string
  optional?: boolean
  filter?: boolean
  appendFields?: HierarchyAppendFieldMapping[]
  relatedSummaries?: RelatedSummaryConfig[]
}

export interface FeatureAttributeDisplayField extends FieldMapping
{
}

export interface FeatureAttributeConfig
{
  key: string
  label: string
  type: 'basicLinkedTable'
  dataSourceUrl: string
  featureUidFieldName: string
  displayFields: FeatureAttributeDisplayField[]
}

export interface StructureFieldMap
{
  fieldMapVersion: number
  hierarchyFields: HierarchyFieldMapping[]
  featureLabelFieldKey: string
  selectableFieldKey?: string
  identityFields: {
    feature_uid: FieldMapping
  }
  featureAttributes?: FeatureAttributeConfig[]
}

export interface FieldMapParseResult
{
  fieldMap: StructureFieldMap | null
  errorMessage: string
}

export interface FieldValidationResult
{
  configuredFieldNames: string[]
  availableFieldNames: string[]
  missingFieldNames: string[]
  isValid: boolean
}

const SUPPORTED_FORMATS = ['text', 'date', 'datetime', 'number']

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

const hasValidFormat = (format: unknown): boolean => {
  if (format === undefined || format === null)
  {
    return true
  }

  return typeof format === 'string' && SUPPORTED_FORMATS.includes(format)
}

const validateFilterFlag = (filter: unknown, context: string): string => {
  if (filter === undefined || filter === null)
  {
    return ''
  }

  if (typeof filter !== 'boolean')
  {
    return `${context} filter must be a boolean when supplied.`
  }

  return ''
}

const validateAppendFields = (field: HierarchyFieldMapping): string => {
  if (field.appendFields === undefined || field.appendFields === null)
  {
    return ''
  }

  if (!Array.isArray(field.appendFields))
  {
    return `appendFields for hierarchy field ${field.key} must be an array.`
  }

  const appendKeys = field.appendFields.map((appendField) => appendField.key)
  const uniqueAppendKeys = new Set(appendKeys)

  if (uniqueAppendKeys.size !== appendKeys.length)
  {
    return `appendFields keys for hierarchy field ${field.key} must be unique.`
  }

  for (const appendField of field.appendFields)
  {
    if (!appendField || !hasText(appendField.key) || !hasText(appendField.fieldName) || !hasText(appendField.label))
    {
      return `Each appendFields entry for hierarchy field ${field.key} must include key, fieldName, and label.`
    }

    if (!hasValidFormat(appendField.format))
    {
      return `appendFields entry ${appendField.key} has unsupported format.`
    }

    const filterValidationError = validateFilterFlag(appendField.filter, `appendFields entry ${appendField.key}`)

    if (filterValidationError !== '')
    {
      return filterValidationError
    }
  }

  return ''
}

const validateRelatedSummaries = (field: HierarchyFieldMapping): string => {
  if (field.relatedSummaries === undefined || field.relatedSummaries === null)
  {
    return ''
  }

  if (!Array.isArray(field.relatedSummaries))
  {
    return `relatedSummaries for hierarchy field ${field.key} must be an array.`
  }

  const summaryKeys = field.relatedSummaries.map((summary) => summary.key)
  const uniqueSummaryKeys = new Set(summaryKeys)

  if (uniqueSummaryKeys.size !== summaryKeys.length)
  {
    return `relatedSummaries keys for hierarchy field ${field.key} must be unique.`
  }

  for (const summary of field.relatedSummaries)
  {
    if (!summary || !hasText(summary.key) || !hasText(summary.label))
    {
      return `Each relatedSummaries entry for hierarchy field ${field.key} must include key and label.`
    }

    if (!hasText(summary.relatedSourceKey))
    {
      return `relatedSummaries entry ${summary.key} must include relatedSourceKey.`
    }

    if (!hasText(summary.joinField))
    {
      return `relatedSummaries entry ${summary.key} must include joinField.`
    }

    if (!hasText(summary.relatedJoinField))
    {
      return `relatedSummaries entry ${summary.key} must include relatedJoinField.`
    }

    if (summary.operation !== 'sum')
    {
      return `Only relatedSummaries operation sum is currently supported.`
    }

    if (!hasText(summary.fieldName))
    {
      return `relatedSummaries entry ${summary.key} must include fieldName.`
    }

    if (!hasValidFormat(summary.format))
    {
      return `relatedSummaries entry ${summary.key} has unsupported format.`
    }
  }

  return ''
}

const validateFeatureAttributes = (featureAttributes: FeatureAttributeConfig[] | undefined): string => {
  if (!featureAttributes)
  {
    return ''
  }

  if (!Array.isArray(featureAttributes))
  {
    return 'featureAttributes must be an array.'
  }

  const featureAttributeKeys = featureAttributes.map((featureAttribute) => featureAttribute.key)
  const uniqueFeatureAttributeKeys = new Set(featureAttributeKeys)

  if (uniqueFeatureAttributeKeys.size !== featureAttributeKeys.length)
  {
    return 'Each featureAttributes key must be unique.'
  }

  for (const featureAttribute of featureAttributes)
  {
    if (!hasText(featureAttribute.key))
    {
      return 'Each featureAttributes entry must include key.'
    }

    if (!hasText(featureAttribute.label))
    {
      return 'Each featureAttributes entry must include label.'
    }

    if (featureAttribute.type !== 'basicLinkedTable')
    {
      return 'Only featureAttributes type basicLinkedTable is currently supported.'
    }

    if (!hasText(featureAttribute.dataSourceUrl))
    {
      return 'Each featureAttributes entry must include dataSourceUrl.'
    }

    if (!hasText(featureAttribute.featureUidFieldName))
    {
      return 'Each featureAttributes entry must include featureUidFieldName.'
    }

    if (!Array.isArray(featureAttribute.displayFields) || featureAttribute.displayFields.length < 1)
    {
      return 'Each featureAttributes entry must include at least one displayFields entry.'
    }

    const invalidDisplayField = featureAttribute.displayFields.find((displayField) => {
      return !hasDisplayField(displayField)
    })

    if (invalidDisplayField)
    {
      return 'Each featureAttributes displayFields entry must include fieldName and label.'
    }
  }

  return ''
}

export const parseStructureFieldMap = (fieldMapJson: string | undefined): FieldMapParseResult => {
  if (!fieldMapJson || fieldMapJson.trim() === '')
  {
    return {
      fieldMap: null,
      errorMessage: 'No field map JSON has been configured.'
    }
  }

  try
  {
    const parsedValue = JSON.parse(fieldMapJson) as StructureFieldMap

    if (!Array.isArray(parsedValue.hierarchyFields) || parsedValue.hierarchyFields.length < 1)
    {
      return {
        fieldMap: null,
        errorMessage: 'Field map JSON must include at least one hierarchyFields entry.'
      }
    }

    const invalidHierarchyField = parsedValue.hierarchyFields.find((field) => {
      return !hasHierarchyField(field)
    })

    if (invalidHierarchyField)
    {
      return {
        fieldMap: null,
        errorMessage: 'Each hierarchyFields entry must include key, fieldName, and label.'
      }
    }

    const hierarchyKeys = parsedValue.hierarchyFields.map((field) => field.key)
    const uniqueHierarchyKeys = new Set(hierarchyKeys)

    if (uniqueHierarchyKeys.size !== hierarchyKeys.length)
    {
      return {
        fieldMap: null,
        errorMessage: 'Each hierarchyFields key must be unique.'
      }
    }

    for (const hierarchyField of parsedValue.hierarchyFields)
    {
      const filterValidationError = validateFilterFlag(hierarchyField.filter, `hierarchyFields entry ${hierarchyField.key}`)

      if (filterValidationError !== '')
      {
        return {
          fieldMap: null,
          errorMessage: filterValidationError
        }
      }

      const appendValidationError = validateAppendFields(hierarchyField)

      if (appendValidationError !== '')
      {
        return {
          fieldMap: null,
          errorMessage: appendValidationError
        }
      }

      const relatedSummaryValidationError = validateRelatedSummaries(hierarchyField)

      if (relatedSummaryValidationError !== '')
      {
        return {
          fieldMap: null,
          errorMessage: relatedSummaryValidationError
        }
      }
    }

    if (!hasText(parsedValue.featureLabelFieldKey))
    {
      return {
        fieldMap: null,
        errorMessage: 'Field map JSON is missing featureLabelFieldKey.'
      }
    }

    const featureLabelFieldExists = parsedValue.hierarchyFields.some((field) => {
      return field.key === parsedValue.featureLabelFieldKey
    })

    if (!featureLabelFieldExists)
    {
      return {
        fieldMap: null,
        errorMessage: 'featureLabelFieldKey must match one hierarchyFields key.'
      }
    }

    if (hasText(parsedValue.selectableFieldKey))
    {
      const selectableFieldExists = parsedValue.hierarchyFields.some((field) => {
        return field.key === parsedValue.selectableFieldKey
      })

      if (!selectableFieldExists)
      {
        return {
          fieldMap: null,
          errorMessage: 'selectableFieldKey must match one hierarchyFields key when supplied.'
        }
      }
    }

    if (!parsedValue.identityFields)
    {
      return {
        fieldMap: null,
        errorMessage: 'Field map JSON is missing identityFields.'
      }
    }

    if (!hasFieldName(parsedValue.identityFields.feature_uid))
    {
      return {
        fieldMap: null,
        errorMessage: 'Field map JSON is missing identityFields.feature_uid.fieldName.'
      }
    }

    const featureAttributeValidationError = validateFeatureAttributes(parsedValue.featureAttributes)

    if (featureAttributeValidationError !== '')
    {
      return {
        fieldMap: null,
        errorMessage: featureAttributeValidationError
      }
    }

    return {
      fieldMap: parsedValue,
      errorMessage: ''
    }
  }
  catch
  {
    return {
      fieldMap: null,
      errorMessage: 'Field map JSON is not valid JSON.'
    }
  }
}

export const getConfiguredFieldNamesFromFieldMap = (fieldMap: StructureFieldMap): string[] => {
  const fieldNames = fieldMap.hierarchyFields.flatMap((field) => {
    const hierarchyFieldNames = [field.fieldName]
    const appendFieldNames = (field.appendFields || []).map((appendField) => appendField.fieldName)
    const relatedSummaryJoinFieldNames = (field.relatedSummaries || []).map((summary) => summary.joinField)

    return [...hierarchyFieldNames, ...appendFieldNames, ...relatedSummaryJoinFieldNames]
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

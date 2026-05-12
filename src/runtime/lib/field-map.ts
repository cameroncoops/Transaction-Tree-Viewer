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

export interface RelatedBreakdownGroupField
{
  key?: string
  fieldName: string
  label: string
  format?: FieldValueFormat
}

export interface RelatedBreakdownChildConfig
{
  key: string
  label: string
  groupBy: RelatedBreakdownGroupField[]
  sumField?: string
  sumLabel?: string
  format?: FieldValueFormat
}

export interface RelatedBreakdownConfig
{
  key: string
  label: string
  relatedSourceKey: string
  joinField: string
  relatedJoinField: string
  filter?: boolean
  filterType?: 'direct' | 'resolved'
  filterOptionsSourceKey?: string
  filterDisplayField?: string
  filterValueField?: string
  filterResolveSourceKey?: string
  filterResolveValueField?: string
  filterResolveJoinField?: string
  targetField?: string
  groupBy: RelatedBreakdownGroupField[]
  sumField: string
  sumLabel?: string
  format?: FieldValueFormat
  children?: RelatedBreakdownChildConfig[]
}

export interface HierarchyFieldMapping extends FieldMapping
{
  key: string
  optional?: boolean
  filter?: boolean
  showChildCount?: boolean
  childCountLabel?: string
  childCountPrefixLabel?: string
  childCountBreakdownFieldName?: string
  childCountBreakdownSort?: 'label' | 'count'
  appendFields?: HierarchyAppendFieldMapping[]
  relatedSummaries?: RelatedSummaryConfig[]
  relatedBreakdowns?: RelatedBreakdownConfig[]
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

const validateHierarchyChildCountSettings = (field: HierarchyFieldMapping): string => {
  if (field.showChildCount !== undefined && field.showChildCount !== null && typeof field.showChildCount !== 'boolean')
  {
    return `hierarchyFields entry ${field.key} showChildCount must be a boolean when supplied.`
  }

  if (
    field.childCountLabel !== undefined &&
    field.childCountLabel !== null &&
    !hasText(field.childCountLabel)
  )
  {
    return `hierarchyFields entry ${field.key} childCountLabel must be a non-empty string when supplied.`
  }

  if (
    field.childCountPrefixLabel !== undefined &&
    field.childCountPrefixLabel !== null &&
    !hasText(field.childCountPrefixLabel)
  )
  {
    return `hierarchyFields entry ${field.key} childCountPrefixLabel must be a non-empty string when supplied.`
  }

  if (
    field.childCountBreakdownFieldName !== undefined &&
    field.childCountBreakdownFieldName !== null &&
    !hasText(field.childCountBreakdownFieldName)
  )
  {
    return `hierarchyFields entry ${field.key} childCountBreakdownFieldName must be a non-empty string when supplied.`
  }

  if (
    field.childCountBreakdownSort !== undefined &&
    field.childCountBreakdownSort !== null &&
    field.childCountBreakdownSort !== 'label' &&
    field.childCountBreakdownSort !== 'count'
  )
  {
    return `hierarchyFields entry ${field.key} childCountBreakdownSort must be label or count when supplied.`
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

const validateRelatedBreakdownGroupFields = (groupBy: RelatedBreakdownGroupField[] | undefined, context: string): string => {
  if (!Array.isArray(groupBy) || groupBy.length < 1)
  {
    return `${context} must include at least one groupBy entry.`
  }

  for (const groupField of groupBy)
  {
    if (!groupField || !hasText(groupField.fieldName) || !hasText(groupField.label))
    {
      return `${context} groupBy entries must include fieldName and label.`
    }

    if (!hasValidFormat(groupField.format))
    {
      return `${context} groupBy entry ${groupField.fieldName} has unsupported format.`
    }
  }

  return ''
}

const validateRelatedBreakdowns = (field: HierarchyFieldMapping): string => {
  if (field.relatedBreakdowns === undefined || field.relatedBreakdowns === null)
  {
    return ''
  }

  if (!Array.isArray(field.relatedBreakdowns))
  {
    return `relatedBreakdowns for hierarchy field ${field.key} must be an array.`
  }

  const breakdownKeys = field.relatedBreakdowns.map((breakdown) => breakdown.key)
  const uniqueBreakdownKeys = new Set(breakdownKeys)

  if (uniqueBreakdownKeys.size !== breakdownKeys.length)
  {
    return `relatedBreakdowns keys for hierarchy field ${field.key} must be unique.`
  }

  for (const breakdown of field.relatedBreakdowns)
  {
    if (!breakdown || !hasText(breakdown.key) || !hasText(breakdown.label))
    {
      return `Each relatedBreakdowns entry for hierarchy field ${field.key} must include key and label.`
    }

    if (!hasText(breakdown.relatedSourceKey))
    {
      return `relatedBreakdowns entry ${breakdown.key} must include relatedSourceKey.`
    }

    if (!hasText(breakdown.joinField))
    {
      return `relatedBreakdowns entry ${breakdown.key} must include joinField.`
    }

    if (!hasText(breakdown.relatedJoinField))
    {
      return `relatedBreakdowns entry ${breakdown.key} must include relatedJoinField.`
    }

    const filterValidationError = validateFilterFlag(
      breakdown.filter,
      `relatedBreakdowns entry ${breakdown.key}`,
    )

    if (filterValidationError !== '')
    {
      return filterValidationError
    }

    if (
      breakdown.filterDisplayField !== undefined &&
      breakdown.filterDisplayField !== null &&
      !hasText(breakdown.filterDisplayField)
    )
    {
      return `relatedBreakdowns entry ${breakdown.key} filterDisplayField must be a non-empty string when supplied.`
    }

    if (
      breakdown.filterValueField !== undefined &&
      breakdown.filterValueField !== null &&
      !hasText(breakdown.filterValueField)
    )
    {
      return `relatedBreakdowns entry ${breakdown.key} filterValueField must be a non-empty string when supplied.`
    }

    if (
      breakdown.filterType !== undefined &&
      breakdown.filterType !== null &&
      breakdown.filterType !== 'direct' &&
      breakdown.filterType !== 'resolved'
    )
    {
      return `relatedBreakdowns entry ${breakdown.key} filterType must be direct or resolved when supplied.`
    }

    if (
      breakdown.filterOptionsSourceKey !== undefined &&
      breakdown.filterOptionsSourceKey !== null &&
      !hasText(breakdown.filterOptionsSourceKey)
    )
    {
      return `relatedBreakdowns entry ${breakdown.key} filterOptionsSourceKey must be a non-empty string when supplied.`
    }

    if (
      breakdown.filterResolveSourceKey !== undefined &&
      breakdown.filterResolveSourceKey !== null &&
      !hasText(breakdown.filterResolveSourceKey)
    )
    {
      return `relatedBreakdowns entry ${breakdown.key} filterResolveSourceKey must be a non-empty string when supplied.`
    }

    if (
      breakdown.filterResolveValueField !== undefined &&
      breakdown.filterResolveValueField !== null &&
      !hasText(breakdown.filterResolveValueField)
    )
    {
      return `relatedBreakdowns entry ${breakdown.key} filterResolveValueField must be a non-empty string when supplied.`
    }

    if (
      breakdown.filterResolveJoinField !== undefined &&
      breakdown.filterResolveJoinField !== null &&
      !hasText(breakdown.filterResolveJoinField)
    )
    {
      return `relatedBreakdowns entry ${breakdown.key} filterResolveJoinField must be a non-empty string when supplied.`
    }

    if (
      breakdown.targetField !== undefined &&
      breakdown.targetField !== null &&
      !hasText(breakdown.targetField)
    )
    {
      return `relatedBreakdowns entry ${breakdown.key} targetField must be a non-empty string when supplied.`
    }

    if (breakdown.filter === true && breakdown.filterType === 'resolved')
    {
      if (!hasText(breakdown.filterOptionsSourceKey))
      {
        return `relatedBreakdowns entry ${breakdown.key} filterOptionsSourceKey is required for resolved filters.`
      }

      if (!hasText(breakdown.filterDisplayField))
      {
        return `relatedBreakdowns entry ${breakdown.key} filterDisplayField is required for resolved filters.`
      }

      if (!hasText(breakdown.filterValueField))
      {
        return `relatedBreakdowns entry ${breakdown.key} filterValueField is required for resolved filters.`
      }

      if (!hasText(breakdown.filterResolveSourceKey))
      {
        return `relatedBreakdowns entry ${breakdown.key} filterResolveSourceKey is required for resolved filters.`
      }

      if (!hasText(breakdown.filterResolveValueField))
      {
        return `relatedBreakdowns entry ${breakdown.key} filterResolveValueField is required for resolved filters.`
      }

      if (!hasText(breakdown.filterResolveJoinField))
      {
        return `relatedBreakdowns entry ${breakdown.key} filterResolveJoinField is required for resolved filters.`
      }

      if (!hasText(breakdown.targetField))
      {
        return `relatedBreakdowns entry ${breakdown.key} targetField is required for resolved filters.`
      }
    }

    const groupValidationError = validateRelatedBreakdownGroupFields(breakdown.groupBy, `relatedBreakdowns entry ${breakdown.key}`)

    if (groupValidationError !== '')
    {
      return groupValidationError
    }

    if (!hasText(breakdown.sumField))
    {
      return `relatedBreakdowns entry ${breakdown.key} must include sumField.`
    }

    if (!hasValidFormat(breakdown.format))
    {
      return `relatedBreakdowns entry ${breakdown.key} has unsupported format.`
    }

    if (breakdown.children !== undefined && breakdown.children !== null)
    {
      if (!Array.isArray(breakdown.children))
      {
        return `relatedBreakdowns entry ${breakdown.key} children must be an array.`
      }

      const childKeys = breakdown.children.map((child) => child.key)
      const uniqueChildKeys = new Set(childKeys)

      if (uniqueChildKeys.size !== childKeys.length)
      {
        return `relatedBreakdowns entry ${breakdown.key} children keys must be unique.`
      }

      for (const child of breakdown.children)
      {
        if (!child || !hasText(child.key) || !hasText(child.label))
        {
          return `Each child entry for relatedBreakdowns entry ${breakdown.key} must include key and label.`
        }

        const childGroupValidationError = validateRelatedBreakdownGroupFields(child.groupBy, `relatedBreakdowns child entry ${child.key}`)

        if (childGroupValidationError !== '')
        {
          return childGroupValidationError
        }

        if (!hasValidFormat(child.format))
        {
          return `relatedBreakdowns child entry ${child.key} has unsupported format.`
        }
      }
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

      const childCountValidationError = validateHierarchyChildCountSettings(hierarchyField)

      if (childCountValidationError !== '')
      {
        return {
          fieldMap: null,
          errorMessage: childCountValidationError
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


      const relatedBreakdownValidationError = validateRelatedBreakdowns(hierarchyField)

      if (relatedBreakdownValidationError !== '')
      {
        return {
          fieldMap: null,
          errorMessage: relatedBreakdownValidationError
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
    const childCountBreakdownFieldNames = hasText(field.childCountBreakdownFieldName)
      ? [String(field.childCountBreakdownFieldName).trim()]
      : []
    const appendFieldNames = (field.appendFields || []).map((appendField) => appendField.fieldName)
    const relatedSummaryJoinFieldNames = (field.relatedSummaries || []).map((summary) => summary.joinField)
    const relatedBreakdownJoinFieldNames = (field.relatedBreakdowns || []).flatMap((breakdown) => {
      const targetFieldName = hasText(breakdown.targetField)
        ? [String(breakdown.targetField).trim()]
        : []

      return [breakdown.joinField, ...targetFieldName]
    })

    return [
      ...hierarchyFieldNames,
      ...childCountBreakdownFieldNames,
      ...appendFieldNames,
      ...relatedSummaryJoinFieldNames,
      ...relatedBreakdownJoinFieldNames
    ]
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

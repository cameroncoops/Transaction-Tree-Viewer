import Query from 'esri/rest/support/Query'
import { executeQueryJSON } from 'esri/rest/query'
import type { FeatureAttributeConfig } from './field-map'
import { escapeSqlValue, getAttributeValueByFieldName } from './selection-utils'

export interface FeatureAttributeDisplayValue
{
  fieldName: string
  label: string
  value: string
}

export interface BasicLinkedTableRecord
{
  displayValues: FeatureAttributeDisplayValue[]
}

export interface BasicLinkedTableQueryResult
{
  ok: boolean
  data: BasicLinkedTableRecord[]
  errorMessage: string
}

export const getFeatureAttributeStateKey = (feature_uid: string, featureAttributeKey: string): string => {
  return `${feature_uid}::${featureAttributeKey}`
}

export const parseFeatureAttributeStateKey = (stateKey: string): { feature_uid: string, featureAttributeKey: string } => {
  const separatorIndex = stateKey.indexOf('::')

  if (separatorIndex < 0)
  {
    return {
      feature_uid: '',
      featureAttributeKey: ''
    }
  }

  return {
    feature_uid: stateKey.substring(0, separatorIndex),
    featureAttributeKey: stateKey.substring(separatorIndex + 2)
  }
}

export const queryBasicLinkedTableFeatureAttributes = async (
  featureAttribute: FeatureAttributeConfig,
  feature_uid: string
): Promise<BasicLinkedTableQueryResult> => {
  if (feature_uid.trim() === '')
  {
    return {
      ok: true,
      data: [],
      errorMessage: ''
    }
  }

  try
  {
    const outFields = Array.from(new Set([
      featureAttribute.featureUidFieldName,
      ...featureAttribute.displayFields.map((displayField) => displayField.fieldName)
    ]))

    const query = new Query({
      where: `${featureAttribute.featureUidFieldName} = '${escapeSqlValue(feature_uid)}'`,
      outFields,
      returnGeometry: false
    })

    const result = await executeQueryJSON(featureAttribute.dataSourceUrl, query as any)
    const features = Array.isArray(result?.features) ? result.features : []

    const records = features.map((feature: any) => {
      const attributes = feature?.attributes || {}

      return {
        displayValues: featureAttribute.displayFields.map((displayField) => {
          return {
            fieldName: displayField.fieldName,
            label: displayField.label,
            value: getAttributeValueByFieldName(attributes, displayField.fieldName)
          }
        })
      }
    })

    return {
      ok: true,
      data: records,
      errorMessage: ''
    }
  }
  catch (error)
  {
    console.warn(`Failed to load feature attributes for ${featureAttribute.key} and feature_uid ${feature_uid}`, error)

    return {
      ok: false,
      data: [],
      errorMessage: `Failed to load ${featureAttribute.label}.`
    }
  }
}
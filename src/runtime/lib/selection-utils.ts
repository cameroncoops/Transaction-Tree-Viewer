import type { DataRecord, DataSource } from 'jimu-core'
import { getLoadedRecordsFromDataSource } from './datasource-utils'

export interface SelectRecordByFeatureUidResult
{
  selectedRecord: DataRecord | null
  errorMessage: string
}

export const normaliseText = (value: unknown): string => {
  return String(value || '').trim().toLowerCase()
}

export const normaliseUrl = (value: unknown): string => {
  return String(value || '').trim().toLowerCase().replace(/\/+$/, '')
}

export const escapeSqlValue = (value: string): string => {
  return value.replace(/'/g, "''")
}

export const getRecordStringValue = (record: DataRecord, fieldName: string): string => {
  const value = record.getData()[fieldName]

  if (value === null || value === undefined)
  {
    return ''
  }

  return String(value).trim()
}

export const getAttributeValueByFieldName = (attributes: any, fieldName: string): string => {
  if (!attributes || fieldName.trim() === '')
  {
    return ''
  }

  const directValue = attributes[fieldName]

  if (directValue !== null && directValue !== undefined)
  {
    return String(directValue).trim()
  }

  const lowerFieldName = fieldName.toLowerCase()

  const matchingKey = Object.keys(attributes).find((key) => {
    const lowerKey = key.toLowerCase()

    return lowerKey === lowerFieldName || lowerKey.endsWith(`.${lowerFieldName}`)
  })

  if (!matchingKey)
  {
    return ''
  }

  const value = attributes[matchingKey]

  if (value === null || value === undefined)
  {
    return ''
  }

  return String(value).trim()
}

export const getLayerFieldName = (layer: any, requestedFieldName: string): string => {
  const requestedLower = requestedFieldName.toLowerCase()
  const layerFields = Array.isArray(layer?.fields) ? layer.fields : []

  const matchingField = layerFields.find((field: any) => {
    const layerFieldName = String(field?.name || '').toLowerCase()

    return layerFieldName === requestedLower || layerFieldName.endsWith(`.${requestedLower}`)
  })

  return String(matchingField?.name || requestedFieldName).trim()
}

export const isConfiguredFeatureLayerMatch = (
  layerLike: any,
  configuredDataSourceId: string,
  configuredDataSourceUrl: string,
  configuredDataSourceLabel: string
): boolean => {
  const layerId = normaliseText(layerLike?.id)
  const layerDataSourceId = normaliseText(
    layerLike?.layerDataSourceId ||
    layerLike?.dataSourceId ||
    layerLike?.layerDataSource?.id ||
    layerLike?.dataSource?.id ||
    ''
  )

  const layerTitle = normaliseText(
    layerLike?.title ||
    layerLike?.layer?.title ||
    layerLike?.layerView?.layer?.title ||
    layerLike?.getLabel?.() ||
    layerLike?.layerDataSource?.getLabel?.() ||
    layerLike?.dataSource?.getLabel?.() ||
    ''
  )

  const layerUrl = normaliseUrl(
    layerLike?.url ||
    layerLike?.layer?.url ||
    layerLike?.layerView?.layer?.url ||
    layerLike?.layerDataSource?.getDataSourceJson?.()?.url ||
    layerLike?.dataSource?.getDataSourceJson?.()?.url ||
    layerLike?.parent?.url ||
    ''
  )

  const normalisedConfiguredDataSourceId = normaliseText(configuredDataSourceId)
  const normalisedConfiguredDataSourceUrl = normaliseUrl(configuredDataSourceUrl)
  const normalisedConfiguredDataSourceLabel = normaliseText(configuredDataSourceLabel)

  return (
    (normalisedConfiguredDataSourceId !== '' && (layerDataSourceId === normalisedConfiguredDataSourceId || layerId.includes(normalisedConfiguredDataSourceId))) ||
    (normalisedConfiguredDataSourceUrl !== '' && layerUrl !== '' && (layerUrl === normalisedConfiguredDataSourceUrl || layerUrl.includes(normalisedConfiguredDataSourceUrl) || normalisedConfiguredDataSourceUrl.includes(layerUrl))) ||
    (normalisedConfiguredDataSourceLabel !== '' && layerTitle.includes(normalisedConfiguredDataSourceLabel))
  )
}

export const getFeatureUidFromRecord = (record: DataRecord, featureUidFieldName: string): string => {
  return getRecordStringValue(record, featureUidFieldName)
}

export const findLoadedRecordByFeatureUid = (records: DataRecord[], featureUidFieldName: string, feature_uid: string): DataRecord | null => {
  const targetFeatureUid = feature_uid.trim()

  if (targetFeatureUid === '')
  {
    return null
  }

  return records.find((record) => {
    const recordFeatureUid = getFeatureUidFromRecord(record, featureUidFieldName)

    return recordFeatureUid === targetFeatureUid
  }) || null
}

export const selectLoadedRecordByFeatureUid = (dataSource: DataSource, featureUidFieldName: string, feature_uid: string): SelectRecordByFeatureUidResult => {
  const records = getLoadedRecordsFromDataSource(dataSource)
  const matchingRecord = findLoadedRecordByFeatureUid(records, featureUidFieldName, feature_uid)

  if (!matchingRecord)
  {
    return {
      selectedRecord: null,
      errorMessage: `No loaded record was found for feature_uid: ${feature_uid}`
    }
  }

  const recordId = matchingRecord.getId ? matchingRecord.getId() : ''

  if (recordId === '')
  {
    return {
      selectedRecord: null,
      errorMessage: `The matching record for feature_uid ${feature_uid} does not have a valid record ID.`
    }
  }

  ;(dataSource as any).selectRecordsByIds([String(recordId)], [matchingRecord])

  return {
    selectedRecord: matchingRecord,
    errorMessage: ''
  }
}

export const getSelectedFeatureUidFromDataSource = (dataSource: DataSource, featureUidFieldName: string): string => {
  const selectedRecords = dataSource.getSelectedRecords ? dataSource.getSelectedRecords() : []

  if (!selectedRecords || selectedRecords.length < 1)
  {
    return ''
  }

  return getFeatureUidFromRecord(selectedRecords[0], featureUidFieldName)
}

export const clearDataSourceSelection = (dataSource: DataSource) => {
  if ((dataSource as any).clearSelection && typeof (dataSource as any).clearSelection === 'function')
  {
    ;(dataSource as any).clearSelection()
    return
  }

  dataSource.selectRecordsByIds([])
}

export const resolveFeatureUidFromHitResult = async (result: any, featureUidFieldName: string): Promise<string> => {
  const resultGraphic = result?.graphic
  const resultAttributes = resultGraphic?.attributes || {}
  const directFeatureUid = getAttributeValueByFieldName(resultAttributes, featureUidFieldName)

  if (directFeatureUid !== '')
  {
    return directFeatureUid
  }

  const resultLayer = resultGraphic?.layer
  const objectIdField = String(resultLayer?.objectIdField || '').trim()
  const objectIdValue = objectIdField !== '' ? resultAttributes?.[objectIdField] : null
  const resolvedFeatureUidFieldName = getLayerFieldName(resultLayer, featureUidFieldName)

  if (
    !resultLayer ||
    typeof resultLayer.createQuery !== 'function' ||
    typeof resultLayer.queryFeatures !== 'function' ||
    resolvedFeatureUidFieldName === '' ||
    objectIdField === '' ||
    objectIdValue === null ||
    objectIdValue === undefined
  )
  {
    return ''
  }

  try
  {
    const query = resultLayer.createQuery()
    query.where = `${objectIdField} = ${Number(objectIdValue)}`
    query.outFields = [resolvedFeatureUidFieldName]
    query.returnGeometry = false

    const featureSet = await resultLayer.queryFeatures(query)
    const featureAttributes = featureSet?.features?.[0]?.attributes || {}

    return getAttributeValueByFieldName(featureAttributes, resolvedFeatureUidFieldName)
  }
  catch (error)
  {
    console.warn('Failed to resolve feature_uid from clicked map feature', error)
    return ''
  }
}
import type { DataRecord, DataSource } from 'jimu-core'

export const getAvailableFieldNamesFromDataSource = (dataSource: DataSource): string[] => {
  const schema = dataSource.getSchema()

  if (!schema || !schema.fields)
  {
    return []
  }

  return Object.keys(schema.fields)
}

export const getLoadedRecordsFromDataSource = (dataSource: DataSource): DataRecord[] => {
  if (!dataSource.getRecords)
  {
    return []
  }

  const records = dataSource.getRecords()

  if (!records)
  {
    return []
  }

  return records as DataRecord[]
}

export const getLoadedRecordCountFromDataSource = (dataSource: DataSource): number => {
  const records = getLoadedRecordsFromDataSource(dataSource)

  return records.length
}
export interface RelatedDataSourceConfig {
  key: string
  label: string
  dataSourceId: string
}

export interface Config {
  fieldMapJson?: string
  relatedDataSources?: RelatedDataSourceConfig[]
}

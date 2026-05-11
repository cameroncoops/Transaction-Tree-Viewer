import { React, Immutable, type UseDataSource, DataSourceTypes } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { DataSourceSelector } from 'jimu-ui/advanced/data-source-selector'
import { MapWidgetSelector } from 'jimu-ui/advanced/setting-components'
import { TextArea } from 'jimu-ui'
import type { Config, RelatedDataSourceConfig } from '../config'

const STOCK_VIEW_KEY = 'stockView'
const STOCK_VIEW_LABEL = 'Summary Attribute View Table'

const getPlainArray = <T,>(value: any): T[] => {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value
  }

  if (typeof value.asMutable === 'function') {
    return value.asMutable({ deep: true }) as T[]
  }

  if (typeof value[Symbol.iterator] === 'function') {
    return Array.from(value) as T[]
  }

  return []
}

const getRelatedDataSourcesArray = (config: Config | undefined): RelatedDataSourceConfig[] => {
  return getPlainArray<RelatedDataSourceConfig>((config as any)?.relatedDataSources)
}

const Setting = (props: AllWidgetSettingProps<Config>) => {
  const onDataSourceChange = (useDataSources: UseDataSource[]) => {
    props.onSettingChange({
      id: props.id,
      useDataSources
    })
  }

  const onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    props.onSettingChange({
      id: props.id,
      useMapWidgetIds
    })
  }

  const onFieldMapJsonChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    props.onSettingChange({
      id: props.id,
      config: props.config.set('fieldMapJson', event.target.value)
    })
  }

  const getSummaryAttributeViewUseDataSources = () => {
    const relatedDataSources = getRelatedDataSourcesArray(props.config)
    const summaryAttributeView = relatedDataSources.find((relatedDataSource) => {
      return relatedDataSource.key === STOCK_VIEW_KEY && String(relatedDataSource.dataSourceId || '').trim() !== ''
    })

    if (!summaryAttributeView) {
      return Immutable([])
    }

    return Immutable([
      {
        dataSourceId: summaryAttributeView.dataSourceId
      } as UseDataSource
    ])
  }

  const onSummaryAttributeViewDataSourceChange = (incomingUseDataSources: any) => {
    const useDataSources = getPlainArray<UseDataSource>(incomingUseDataSources)
    const selectedDataSource = useDataSources[0]
    const selectedDataSourceId = String(selectedDataSource?.dataSourceId || '').trim()

    const existingRelatedDataSources = getRelatedDataSourcesArray(props.config).filter((relatedDataSource) => {
      return relatedDataSource.key !== STOCK_VIEW_KEY
    })

    const nextRelatedDataSources = selectedDataSourceId === ''
      ? existingRelatedDataSources
      : [
        ...existingRelatedDataSources,
        {
          key: STOCK_VIEW_KEY,
          label: STOCK_VIEW_LABEL,
          dataSourceId: selectedDataSourceId
        }
      ]

    props.onSettingChange({
      id: props.id,
      config: props.config.set(
        'relatedDataSources',
        nextRelatedDataSources.length > 0 ? Immutable(nextRelatedDataSources) : undefined
      )
    })
  }

  return (
    <div className="p-3">
      <h4>Active Feature Explorer Settings</h4>

      <p>Select the active feature class data source, summary attribute view table, target map widget, and field map JSON.</p>

      <div className="mb-4">
        <div className="mb-2"><strong>Active Feature Class data source</strong></div>

        <DataSourceSelector
          mustUseDataSource
          types={Immutable([DataSourceTypes.FeatureLayer])}
          useDataSources={props.useDataSources}
          onChange={onDataSourceChange}
          widgetId={props.id}
        />
      </div>

      <div className="mb-4">
        <div className="mb-2"><strong>Summary Attribute View Table</strong></div>

        <DataSourceSelector
          mustUseDataSource
          types={Immutable([DataSourceTypes.FeatureLayer])}
          useDataSources={getSummaryAttributeViewUseDataSources()}
          onChange={onSummaryAttributeViewDataSourceChange}
          widgetId={props.id}
        />
      </div>

      <div className="mb-4">
        <div className="mb-2"><strong>Map widget</strong></div>

        <MapWidgetSelector
          useMapWidgetIds={props.useMapWidgetIds}
          onSelect={onMapWidgetSelected}
        />
      </div>

      <div>
        <div className="mb-2"><strong>Field map JSON</strong></div>

        <TextArea
          height={220}
          value={props.config?.fieldMapJson || ''}
          onChange={onFieldMapJsonChange}
          placeholder={`{
  "fieldMapVersion": 3,
  "hierarchyFields": [
    {
      "key": "zone",
      "fieldName": "zone",
      "label": "Zone",
      "filter": true
    },
    {
      "key": "bed",
      "fieldName": "bed_no",
      "label": "Bed"
    }
  ],
  "featureLabelFieldKey": "bed",
  "selectableFieldKey": "bed",
  "identityFields": {
    "feature_uid": {
      "fieldName": "garden_uid",
      "label": "Garden UID"
    }
  }
}`}
        />
      </div>
    </div>
  )
}

export default Setting

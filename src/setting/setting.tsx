import { React, Immutable, type UseDataSource, DataSourceTypes } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { DataSourceSelector } from 'jimu-ui/advanced/data-source-selector'
import { MapWidgetSelector } from 'jimu-ui/advanced/setting-components'
import { TextArea } from 'jimu-ui'
import type { Config } from '../config'

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

  return (
    <div className="p-3">
      <h4>Active Feature Explorer Settings</h4>

      <p>Select the active feature class data source, target map widget, and field map JSON.</p>

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
        "fieldMapVersion": 1,
        "structureFields": {
          "building": {
            "fieldName": "zone",
            "label": "Zone"
          },
          "level": {
            "fieldName": "level",
            "label": "Level"
          },
          "room": {
            "fieldName": "bed_no",
            "label": "Bed"
          }
        },
        "identityFields": {
          "assetId": {
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
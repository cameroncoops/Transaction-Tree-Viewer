import { React, Immutable, type UseDataSource, DataSourceTypes } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { DataSourceSelector } from 'jimu-ui/advanced/data-source-selector'
import { MapWidgetSelector } from 'jimu-ui/advanced/setting-components'
import { TextArea, TextInput } from 'jimu-ui'
import type { Config } from '../config'

const getUseDataSourcesArray = (useDataSources: any): UseDataSource[] => {
  if (!useDataSources) {
    return []
  }

  if (Array.isArray(useDataSources)) {
    return useDataSources
  }

  if (typeof useDataSources.asMutable === 'function') {
    return useDataSources.asMutable({ deep: true }) as UseDataSource[]
  }

  if (typeof useDataSources[Symbol.iterator] === 'function') {
    return Array.from(useDataSources) as UseDataSource[]
  }

  return []
}

const getSingleUseDataSource = (useDataSources: any, index: number): UseDataSource[] => {
  const values = getUseDataSourcesArray(useDataSources)
  const selected = values[index]

  if (!selected) {
    return []
  }

  return [selected]
}

const replaceUseDataSourceAtIndex = (
  existingUseDataSources: any,
  index: number,
  selectedUseDataSourcesInput: any,
): UseDataSource[] => {
  const nextUseDataSources = getUseDataSourcesArray(existingUseDataSources)
  const selectedUseDataSources = getUseDataSourcesArray(selectedUseDataSourcesInput)
  const selectedUseDataSource = selectedUseDataSources[0]

  if (selectedUseDataSource) {
    nextUseDataSources[index] = selectedUseDataSource
  } else {
    nextUseDataSources[index] = undefined as unknown as UseDataSource
  }

  while (nextUseDataSources.length > 0 && !nextUseDataSources[nextUseDataSources.length - 1]) {
    nextUseDataSources.pop()
  }

  return nextUseDataSources.filter((useDataSource) => !!useDataSource)
}

const Setting = (props: AllWidgetSettingProps<Config>) => {
  const onActiveFeatureDataSourceChange = (useDataSources: any) => {
    props.onSettingChange({
      id: props.id,
      useDataSources: replaceUseDataSourceAtIndex(props.useDataSources, 0, useDataSources),
    })
  }

  const onSummaryAttributeViewDataSourceChange = (useDataSources: any) => {
    props.onSettingChange({
      id: props.id,
      useDataSources: replaceUseDataSourceAtIndex(props.useDataSources, 1, useDataSources),
    })
  }

  const onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    props.onSettingChange({
      id: props.id,
      useMapWidgetIds,
    })
  }

  const onFieldMapJsonChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    props.onSettingChange({
      id: props.id,
      config: props.config.set('fieldMapJson', event.target.value),
    })
  }

  const onWidgetTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    props.onSettingChange({
      id: props.id,
      config: props.config.set('widgetTitle', event.target.value),
    })
  }

  const onWidgetSubtitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    props.onSettingChange({
      id: props.id,
      config: props.config.set('widgetSubtitle', event.target.value),
    })
  }

  return (
    <div className="p-3">
      <h4>Active Feature Explorer Settings</h4>

      <p>Select the active feature class data source, optional summary table, target map widget, and field map JSON.</p>

      <div className="mb-4">
        <div className="mb-2"><strong>Active Feature Class data source</strong></div>

        <DataSourceSelector
          mustUseDataSource
          types={Immutable([DataSourceTypes.FeatureLayer])}
          useDataSources={Immutable(getSingleUseDataSource(props.useDataSources, 0))}
          onChange={onActiveFeatureDataSourceChange}
          widgetId={props.id}
        />
      </div>

      <div className="mb-4">
        <div className="mb-2"><strong>Summary Attribute View Table</strong></div>

        <DataSourceSelector
          mustUseDataSource
          types={Immutable([DataSourceTypes.FeatureLayer])}
          useDataSources={Immutable(getSingleUseDataSource(props.useDataSources, 1))}
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

      <div className="mb-4">
        <div className="mb-2"><strong>Widget title</strong></div>

        <TextInput
          value={props.config?.widgetTitle || ''}
          onChange={onWidgetTitleChange}
          placeholder="Transaction Tree Viewer"
        />
      </div>

      <div className="mb-4">
        <div className="mb-2"><strong>Widget subtitle</strong></div>

        <TextInput
          value={props.config?.widgetSubtitle || ''}
          onChange={onWidgetSubtitleChange}
          placeholder="Explore and filter active features"
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
      "label": "Zone"
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

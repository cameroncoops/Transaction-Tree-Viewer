import { React } from 'jimu-core'

interface WidgetStatusPanelProps
{
  isDatasourceConnected: boolean
  isMapConnected: boolean
  isLoadingFeatures: boolean
  loadError: string
  recordCount: number
}

const WidgetStatusPanel = (props: WidgetStatusPanelProps) => {
  return (
    <div>
      {props.isLoadingFeatures && (
        <p>Loading features...</p>
      )}

      {props.loadError !== '' && (
        <p style={{ color: '#c62828' }}>{props.loadError}</p>
      )}

      {props.loadError === '' && (
        <div>
          <p>Active Feature Class datasource: {props.isDatasourceConnected ? 'Connected' : 'Not connected'}</p>
          <p>Map widget: {props.isMapConnected ? 'Connected' : 'Not connected'}</p>
          <p>Loaded records: {props.recordCount.toLocaleString()}</p>
        </div>
      )}
    </div>
  )
}

export default WidgetStatusPanel
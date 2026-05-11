import { React } from 'jimu-core'

interface WidgetStatusPanelProps
{
  isDatasourceConnected: boolean
  isMapConnected: boolean
  isLoadingFeatures: boolean
  loadError: string
  recordCount: number
}

const PANEL_STYLE = {
  border: '1px solid #d8e1e8',
  borderRadius: '12px',
  backgroundColor: '#ffffff',
  padding: '1rem 1.1rem',
  boxShadow: '0 6px 18px rgba(28, 39, 51, 0.05)'
}

const PANEL_TITLE_STYLE = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 700,
  color: '#1c2733'
}

const PANEL_DESCRIPTION_STYLE = {
  margin: '0.4rem 0 0 0',
  color: '#607080',
  fontSize: '0.9rem'
}

const STATUS_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: '0.75rem',
  marginTop: '1rem'
}

const STATUS_CARD_STYLE = {
  padding: '0.8rem 0.9rem',
  borderRadius: '10px',
  backgroundColor: '#f7fafc',
  border: '1px solid #e2e9ee'
}

const STATUS_LABEL_STYLE = {
  margin: 0,
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  color: '#607080'
}

const STATUS_VALUE_STYLE = {
  margin: '0.35rem 0 0 0',
  fontSize: '0.98rem',
  fontWeight: 600,
  color: '#1c2733'
}

const INFO_BANNER_STYLE = {
  marginTop: '1rem',
  padding: '0.8rem 0.9rem',
  borderRadius: '10px',
  border: '1px solid #d5e6ef',
  backgroundColor: '#f3f9fc',
  color: '#32586b'
}

const ERROR_BANNER_STYLE = {
  marginTop: '1rem',
  padding: '0.8rem 0.9rem',
  borderRadius: '10px',
  border: '1px solid #f0c8c8',
  backgroundColor: '#fff5f5',
  color: '#a12626'
}

const WidgetStatusPanel = (props: WidgetStatusPanelProps) => {
  return (
    <section style={PANEL_STYLE}>
      <h4 style={PANEL_TITLE_STYLE}>Status</h4>
      <p style={PANEL_DESCRIPTION_STYLE}>Connection state and loaded record summary for the current session.</p>

      {props.isLoadingFeatures && (
        <div style={INFO_BANNER_STYLE}>Loading features...</div>
      )}

      {props.loadError !== '' && (
        <div style={ERROR_BANNER_STYLE}>{props.loadError}</div>
      )}

      {props.loadError === '' && (
        <div style={STATUS_GRID_STYLE}>
          <div style={STATUS_CARD_STYLE}>
            <p style={STATUS_LABEL_STYLE}>Datasource</p>
            <p style={STATUS_VALUE_STYLE}>{props.isDatasourceConnected ? 'Connected' : 'Not connected'}</p>
          </div>

          <div style={STATUS_CARD_STYLE}>
            <p style={STATUS_LABEL_STYLE}>Map widget</p>
            <p style={STATUS_VALUE_STYLE}>{props.isMapConnected ? 'Connected' : 'Not connected'}</p>
          </div>

          <div style={STATUS_CARD_STYLE}>
            <p style={STATUS_LABEL_STYLE}>Loaded records</p>
            <p style={STATUS_VALUE_STYLE}>{props.recordCount.toLocaleString('en-AU')}</p>
          </div>
        </div>
      )}
    </section>
  )
}

export default WidgetStatusPanel

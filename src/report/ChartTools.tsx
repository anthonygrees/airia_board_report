import { useState, type ReactNode } from 'react'
import { Expand, Download } from 'lucide-react'
import { TableView, type TableColumn } from '../components/primitives/TableView'
import { Modal } from './Modal'
import { downloadCsv } from './export'

/** A sibling button, never nested in the overview card's navigation link. */
export function ChartTools({ title, columns, rows, children }: { title: string; columns: readonly TableColumn[]; rows: readonly Record<string, string>[]; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <div className="report-chart">
    <div className="report-chart__actions"><button type="button" className="viz-btn viz-btn--sm" aria-label={`Expand ${title}`} onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}><Expand size={14} /> Expand</button></div>
    {children}
    {open ? <Modal title={title} onClose={() => setOpen(false)}>
      <p>Original chart samples before pixel reduction. Missing values remain unavailable. Source windows and units match the chart.</p>
      <button type="button" className="viz-btn" onClick={() => downloadCsv(title, columns, rows)}><Download size={16} /> Export CSV</button>
      {rows.length ? <TableView caption={title} columns={columns} rows={rows} maxHeight={540} /> : <p>No samples in this date range.</p>}
    </Modal> : null}
  </div>
}

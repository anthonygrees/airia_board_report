import type { TableColumn } from '../components/primitives/TableView'
import { ASSUMPTIONS, type Analysis, type Fact, type WindowFilter, type DimensionId, type PlotEvidence, rankAnalysis, priority } from './model'

export function csvCell(value: unknown): string {
  const raw = String(value ?? '')
  const numeric = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(raw)
  const safe = !numeric && /^[\s\uFEFF]*[=+@-]/.test(raw) ? "'" + raw : raw
  return '"' + safe.replaceAll('"', '""') + '"'
}
export function csvText(columns: readonly TableColumn[], rows: readonly Record<string, string>[]): string {
  return '\uFEFF' + [columns.map(c => csvCell(c.label)).join(','), ...rows.map(row => columns.map(c => csvCell(row[c.key])).join(','))].join('\r\n')
}
export function downloadCsv(title: string, columns: readonly TableColumn[], rows: readonly Record<string, string>[]) {
  const url = URL.createObjectURL(new Blob([csvText(columns, rows)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv'
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Bundled locally; no CDN, keys or tenant data in the generated app bundle. */
export async function exportDeck(facts: readonly Fact[], analysis: Analysis | null, window: WindowFilter, evidence: Partial<Record<DimensionId, PlotEvidence>> = {}) {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const deck = new PptxGenJS(); deck.layout = 'LAYOUT_WIDE'; deck.title = 'Executive AI board report'; deck.author = 'Airia'
  const slide = (title: string) => {
    const s = deck.addSlide()
    s.addText(title, { x: .5, y: .4, w: 12.3, h: .6, fontSize: 28, bold: true })
    s.addText(`Chart bucket range: ${window.from || 'all available'} to ${window.to || 'latest'} (UTC). Headline periods unchanged.`, { x: .5, y: 1.1, w: 12.3, h: .5, fontSize: 12 })
    s.addText(`Generated ${new Date().toISOString()} · Review before distribution`, { x: .5, y: 7.05, w: 12, h: .2, fontSize: 10 })
    return s
  }
  const cover = slide('Executive AI overview')
  cover.addTable([['Principle', 'Value', 'Source window'], ...facts.map(f => [f.label, f.value, f.period])].map(row => row.map(text => ({ text: String(text) }))), { x: .5, y: 1.9, w: 12.2, fontSize: 16, rowH: .46 })
  if (analysis) {
    slide('Executive Summary').addText(analysis.summary, { x: .5, y: 1.9, w: 12, h: 4.6, fontSize: 22, valign: 'top' })
    slide('Priority rubric · AI estimates').addTable([['Principle', 'Risk / 5', 'Actionability / 5', 'Priority / 100'], ...rankAnalysis(analysis.dimensions).map(d => [facts.find(f => f.id === d.id)?.label ?? d.id, d.risk ?? 'Unknown', d.actionability ?? 'Unknown', priority(d) ?? 'Unscored'])].map(row => row.map(text => ({ text: String(text) }))), { x: .5, y: 1.9, w: 12.2, fontSize: 17, rowH: .46 })
  }
  for (const f of facts) {
    const s = slide(f.label)
    s.addText(f.value, { x: .5, y: 1.8, w: 12, h: .7, fontSize: 40 })
    s.addText(f.observation, { x: .5, y: 2.8, w: 12, h: 1.2, fontSize: 22, valign: 'top' })
    const ai = analysis?.dimensions.find(d => d.id === f.id)
    if (ai) s.addText('AI interpretation: ' + ai.statement, { x: .5, y: 4.1, w: 12, h: 1.5, fontSize: 19, valign: 'top' })
    s.addText(`${f.period}\nSource: ${f.source}`, { x: .5, y: 5.9, w: 12, h: .8, fontSize: 13 })
    const plot = evidence[f.id]
    if (plot?.values.length) {
      const chart = slide(f.label + ' — chart')
      chart.addChart(plot.type === 'line' ? deck.ChartType.line : deck.ChartType.bar, [{ name: plot.unit, labels: plot.labels, values: plot.values }], { x: .5, y: 1.9, w: 12.1, h: 4.6, showLegend: false, showValue: false, catAxisLabelFontSize: 11, valAxisLabelFontSize: 12, valAxisMinVal: 0 })
    }
  }
  for (let start = 0; start < ASSUMPTIONS.length; start += 3) {
    slide('Data & assumptions').addText(ASSUMPTIONS.slice(start, start + 3).map(([k, v]) => `${k}\n${v}`).join('\n\n'), { x: .5, y: 1.8, w: 12, h: 4.9, fontSize: 18, valign: 'top' })
  }
  await deck.writeFile({ fileName: 'airia-board-report.pptx' })
}

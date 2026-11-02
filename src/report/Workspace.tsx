import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Download, Settings, Sparkles, Info } from 'lucide-react'
import type { Board } from '../data/live'
import { href } from '../lib/route'
import { useSize } from '../lib/useSize'
import { validateAnalysis } from '../../analysis-contract.mjs'
import { ASSUMPTIONS, boardFacts, overviewEvidence, DEFAULT_WINDOW, DIMENSIONS, priority, rankAnalysis, type Analysis, type Fact, type WindowFilter } from './model'
import { ReportContext } from './context'
import { Modal } from './Modal'
import { DimensionIcon } from './DimensionIcon'
import { ChartTools } from './ChartTools'
import { exportDeck } from './export'
import './report.css'

async function requestAnalysis(payload: unknown, signal: AbortSignal): Promise<unknown> {
  const response = await fetch('/api/board-analysis', { method: 'POST', headers: { 'content-type': 'application/json' }, signal, body: JSON.stringify(payload) })
  const body = await response.json()
  if (!response.ok) throw Error(body.error || 'AI analysis failed.')
  return body
}

function PriorityRubric({ analysis, facts }: { analysis: Analysis; facts: Fact[] }) {
  const [ref, size] = useSize<HTMLDivElement>()
  const ordered = rankAnalysis(analysis.dimensions)
  const w = Math.max(260, size.width), h = 310, l = 44, r = 24, t = 30, bottom = 46
  const x = (v: number) => l + (v - 1) / 4 * (w - l - r)
  const y = (v: number) => h - bottom - (v - 1) / 4 * (h - t - bottom)
  // Scores can coincide. Group them and label all ranks in a single mark.
  const groups = new Map<string, { risk: number; action: number; ranks: number[] }>()
  ordered.forEach((d, i) => { if (d.risk === null || d.actionability === null) return; const key = `${d.risk}:${d.actionability}`; const g = groups.get(key) ?? { risk: d.risk, action: d.actionability, ranks: [] }; g.ranks.push(i + 1); groups.set(key, g) })
  const rows = ordered.map((d, i) => ({ rank: String(i + 1), principle: facts.find(f => f.id === d.id)!.label, risk: String(d.risk ?? 'Unknown'), actionable: String(d.actionability ?? 'Unknown'), priority: String(priority(d) ?? 'Unscored'), rationale: d.rationale }))
  return <section className="report-section" aria-labelledby="rubric-title">
    <h2 id="rubric-title">Eight principles · Priority rubric <small>AI estimates</small></h2>
    <p>Risk versus actionability. Higher priority first. Missing evidence stays unscored.</p>
    <ChartTools title="Eight-principle priority rubric" columns={[{ key: 'rank', label: 'Rank' }, { key: 'principle', label: 'Principle' }, { key: 'risk', label: 'Risk / 5' }, { key: 'actionable', label: 'Actionability / 5' }, { key: 'priority', label: 'Priority / 100' }, { key: 'rationale', label: 'Evidence & uncertainty' }]} rows={rows}>
      <div className="report-priority-layout"><div ref={ref}>
        <svg viewBox={`0 0 ${w} ${h}`} className="report-rubric" role="img" aria-label="Risk versus actionability, scored 1 to 5. Numbered markers match the priority list; multiplied markers indicate coinciding scores.">
          <title>AI-estimated risk versus actionability</title>
          {[1, 2, 3, 4, 5].map(v => <g key={v}><line x1={x(v)} x2={x(v)} y1={t} y2={h - bottom} /><line x1={l} x2={w - r} y1={y(v)} y2={y(v)} /><text x={x(v)} y={h - bottom + 18} textAnchor="middle">{v}</text><text x={l - 12} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
          <text x={l} y={14}>Higher risk ↑ (1–5)</text><text x={w - r} y={h - 6} textAnchor="end">Actionability → (1–5)</text>
          {[...groups].map(([key, g]) => <g key={key}><title>Ranks {g.ranks.join(', ')}: risk {g.risk}, actionability {g.action}</title><rect x={x(g.action) - 13} y={y(g.risk) - 12} width={26} height={24} rx={12} className="report-rubric__mark" /><text x={x(g.action)} y={y(g.risk) + 4} textAnchor="middle" className="report-rubric__rank">{g.ranks.length > 1 ? '×' + g.ranks.length : g.ranks[0]}</text></g>)}
        </svg>
      </div><ol className="report-priorities">{ordered.map(d => <li key={d.id}><a href={href(d.id)}><DimensionIcon id={d.id} /><span>{facts.find(f => f.id === d.id)!.label}</span><span>{priority(d) === null ? 'Unscored' : `${priority(d)}/100`}</span></a></li>)}</ol></div>
    </ChartTools>
    <p className="report-note">Priority = (70% risk + 30% actionability) × 20. Risk: 1 low, 5 critical. Actionability: 1 difficult, 5 ready to act. Model estimates require review.</p>
  </section>
}

export function ReportWorkspace({ board, overview, children, request = requestAnalysis, preview = false }: { board: Board; overview: boolean; children: ReactNode; request?: typeof requestAnalysis; preview?: boolean }) {
  const [window, setWindow] = useState<WindowFilter>(DEFAULT_WINDOW)
  const [enabled, setEnabled] = useState(false)
  const [tool, setTool] = useState<'settings' | 'assumptions' | 'ai' | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [result, setResult] = useState<{ signature: string; analysis: Analysis } | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<{ text: string; sources: string[] } | null>(null)
  const [askError, setAskError] = useState('')
  const [asking, setAsking] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const questionController = useRef<AbortController | null>(null)
  const facts = useMemo(() => boardFacts(board).map(f => preview ? { ...f, source: 'Illustrative fixture: ' + f.source } : f), [board.agents, board.audit, board.finance, board.security, board.compliance, board.incidents, board.discovery, preview])
  const signature = JSON.stringify({ facts, window })
  const analysis = enabled && result?.signature === signature ? result.analysis : null
  const hasFacts = facts.some(f => f.available)
  useEffect(() => {
    const controller = new AbortController()
    setError(''); setAnswer(null); setAskError(''); setAsking(false); questionController.current?.abort()
    if (!enabled || !hasFacts) { setResult(null); return () => controller.abort() }
    const timer = setTimeout(() => {
      const snapshot = JSON.parse(signature)
      void request({ mode: 'analysis', ...snapshot }, controller.signal).then(raw => {
        if (!controller.signal.aborted) setResult({ signature, analysis: validateAnalysis(raw, snapshot.facts) })
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Analysis failed.') })
    }, 700)
    return () => { clearTimeout(timer); controller.abort() }
  }, [signature, enabled, hasFacts, retry, request])
  useEffect(() => () => questionController.current?.abort(), [])
  const close = () => { setTool(null); setConfirm(false); questionController.current?.abort(); setAsking(false) }
  const ask = async () => {
    if (!enabled || !question.trim() || !hasFacts) return
    questionController.current?.abort(); const controller = new AbortController(); questionController.current = controller
    setAsking(true); setAskError(''); setAnswer(null)
    try {
      const raw = await request({ mode: 'question', facts, window, question }, controller.signal) as { answer: string; sources: string[] }
      if (typeof raw.answer !== 'string' || !Array.isArray(raw.sources) || !raw.sources.every(id => facts.some(f => f.id === id && f.available))) throw Error('Invalid answer or sources.')
      if (!controller.signal.aborted) setAnswer({ text: raw.answer, sources: raw.sources })
    } catch (e) { if (!controller.signal.aborted) setAskError(e instanceof Error ? e.message : 'Question failed.') }
    finally { if (!controller.signal.aborted) setAsking(false) }
  }
  const today = new Date().toISOString().slice(0, 10)
  const dates = (days: number) => setWindow({ from: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10), to: today })
  return <ReportContext value={{ window, analysis }}>
    <section className="report-toolbar" aria-label="Report controls">
      <div className="report-actions"><h2>{overview ? 'Overview' : 'Report controls'}</h2><button type="button" className="viz-btn" onClick={() => setTool('settings')}><Settings size={16} /> Settings</button><button type="button" className="viz-btn" onClick={() => setTool('assumptions')}><Info size={16} /> Data & assumptions</button><button type="button" className="viz-btn" disabled={!enabled || !hasFacts} onClick={() => setTool('ai')}><Sparkles size={16} /> Ask AI</button>{overview ? <button type="button" className="viz-btn" disabled={exporting || !hasFacts} onClick={() => { setExportError(''); setExporting(true); void exportDeck(facts, analysis, window, overviewEvidence(board, window)).catch(e => setExportError(e.message)).finally(() => setExporting(false)) }}><Download size={16} /> {exporting ? 'Preparing deck…' : 'Export to deck'}</button> : null}</div>
      <div className="report-filters"><label>Chart bucket start (UTC)<input type="date" value={window.from} max={window.to || today} onChange={e => setWindow(w => ({ ...w, from: e.target.value }))} /></label><label>Through (UTC)<input type="date" value={window.to} min={window.from} max={today} onChange={e => setWindow(w => ({ ...w, to: e.target.value }))} /></label><button type="button" className="viz-btn" onClick={() => dates(7)}>7 days</button><button type="button" className="viz-btn" onClick={() => dates(30)}>30 days</button><button type="button" className="viz-btn" onClick={() => dates(90)}>90 days</button><button type="button" className="viz-btn" onClick={() => setWindow(DEFAULT_WINDOW)}>All available</button></div>
      <p className="report-note">Date range filters chart bucket starts only. Headline metrics and snapshot tables retain their stated source periods. {enabled ? 'AI analysis enabled.' : 'AI analysis off.'}</p>
      {exportError ? <p role="alert">{exportError}</p> : null}
    </section>
    {enabled && overview ? <><section className="report-section" aria-labelledby="executive-title"><h2 id="executive-title">Executive Summary <small>AI analysis</small></h2>{analysis ? <p>{analysis.summary}</p> : error ? <div role="alert"><p>{error}</p><button type="button" className="viz-btn" onClick={() => setRetry(v => v + 1)}>Retry analysis</button></div> : <p role="status">{hasFacts ? 'Generating analysis for the current snapshot…' : 'Waiting for source data…'}</p>}</section>{analysis ? <PriorityRubric analysis={analysis} facts={facts} /> : null}</> : null}
    {children}
    {tool ? <Modal title={tool === 'settings' ? 'Settings' : tool === 'ai' ? 'Ask AI' : 'Data & assumptions'} onClose={close}>
      {tool === 'settings' ? <><label className="report-switch"><input type="checkbox" role="switch" checked={enabled} aria-label="AI Model Analysis" onChange={e => { if (e.target.checked) setConfirm(true); else { setEnabled(false); setResult(null) } }} /> AI Model Analysis</label><p>Enables Ask AI, the Executive Summary, the priority rubric and a statement for each dimension. Data stays available when analysis is disabled.</p><p>{preview ? 'This preview uses synthetic fixtures and local predefined responses; no data is sent to a model.' : 'Only aggregate facts and their source periods are sent to the model service configured by the operator.'} No Airia API key or raw records are included. AI output requires review.</p>{confirm ? <section className="report-warning" role="alertdialog" aria-labelledby="enable-title" aria-describedby="enable-message"><h3 id="enable-title">Enable AI analysis?</h3><p id="enable-message">Enabling AI analysis will slow down filter updates and may take a while to generate. Do you want to continue?</p><div className="report-actions"><button autoFocus type="button" className="viz-btn" onClick={() => setConfirm(false)}>Cancel</button><button type="button" className="viz-btn" onClick={() => { setEnabled(true); setConfirm(false) }}>Continue</button></div></section> : null}</> : tool === 'assumptions' ? <><p>Dashboard nutrition label · methodology v1{preview ? ' · Offline demonstration: synthetic fixture data and predefined responses, no live model or API connection.' : ''}</p><dl className="report-nutrition">{ASSUMPTIONS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><h3>Source availability</h3><ul>{facts.map(f => <li key={f.id}>{f.label}: {f.available ? 'Available' : 'Not available'} — {f.period}</li>)}</ul></> : <><p>Ask about all eight dimensions. Responses cite the supporting dimension. Current chart range: {window.from || 'all available'} to {window.to || 'latest'} (UTC).</p><form className="report-ask" onSubmit={e => { e.preventDefault(); void ask() }}><label>Question<input value={question} onChange={e => setQuestion(e.target.value)} maxLength={600} required placeholder="Which areas need attention?" /></label><button className="viz-btn" type="submit" disabled={asking || !question.trim()}>{asking ? 'Generating…' : 'Ask'}</button></form>{askError ? <p role="alert">{askError}</p> : null}{asking ? <p role="status">Analyzing the dashboard snapshot…</p> : null}{answer ? <div className="report-answer" aria-live="polite"><p>{answer.text}</p><div className="report-actions">{answer.sources.map(id => <a key={id} href={href(id as typeof DIMENSIONS[number][0])} onClick={close}>Source: {facts.find(f => f.id === id)?.label}</a>)}</div><small>AI-generated · review against the source panels</small></div> : null}</>}
    </Modal> : null}
  </ReportContext>
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { boardFacts, windowIndices, rankAnalysis, priority, type AnalysisItem } from '../src/report/model'
import { csvText } from '../src/report/export'
import { previewBoard } from '../src/report/fixtures'
import { validateAnalysis } from '../analysis-contract.mjs'
import { boardAnalysis } from '../analysis.mjs'
import { createServer } from 'node:http'

test('UTC day filtering includes the end day, preserves original sample indices and never prorates', () => {
  const times = ['2026-10-01T00:00:00Z', '2026-10-02T12:00:00Z', '2026-10-03T00:00:00Z'].map(Date.parse)
  assert.deepEqual(windowIndices(times, { from: '2026-10-02', to: '2026-10-02' }), [1])
  assert.deepEqual(windowIndices(times, { from: '', to: '' }), [0, 1, 2])
  assert.deepEqual(windowIndices(times, { from: '2026-10-04', to: '2026-10-05' }), [])
})
test('CSV escapes formulas, commas, quotes and newlines while preserving numeric values', () => {
  const csv = csvText([{ key: 'x', label: 'Value' }], [{ x: '=1+1' }, { x: ' \t@SUM(1)' }, { x: 'a,"b"\nc' }, { x: '23.5' }])
  assert(csv.includes('"\'=1+1"'))
  assert(csv.includes('"\' \t@SUM(1)"'))
  assert(csv.includes('"a,""b""\nc"'))
  assert(csv.endsWith('"23.5"'))
})
test('missing security, incident and discovery evidence remains unavailable rather than zero', () => {
  const b = previewBoard()
  assert.equal(b.security.status, 'ready')
  if (b.security.status === 'ready') b.security = { ...b.security, data: { ...b.security.data, violations: null } }
  b.incidents = { status: 'error', message: 'Denied' }
  b.discovery = { status: 'loading' }
  const facts = boardFacts(b)
  for (const id of ['security', 'incidents', 'vendors', 'shadow']) { const f = facts.find(f => f.id === id)!; assert.equal(f.available, false); assert.equal(f.value, 'Not available') }
  assert(!JSON.stringify(facts).includes('Demo owner'))
  assert(!JSON.stringify(facts).includes('Illustrative agent'))
})

test('configured service forwards only aggregate facts and validates model output', async () => {
  const before = { url: process.env.BOARD_ANALYSIS_URL, model: process.env.BOARD_ANALYSIS_MODEL, token: process.env.BOARD_ANALYSIS_TOKEN }
  const facts = boardFacts(previewBoard())
  let captured: { headers: Record<string, unknown>; body: string } | null = null
  const provider = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk
    captured = { headers: req.headers, body }
    const input = JSON.parse(JSON.parse(body).messages[1].content)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: 'Evidence [inventory].', dimensions: input.facts.map((f: { id: string }) => ({ id: f.id, statement: 'Review available evidence.', risk: null, actionability: null, rationale: 'Insufficient evidence for a numerical assessment.' })) }) } }] }))
  })
  await new Promise<void>(r => provider.listen(0, '127.0.0.1', r))
  process.env.BOARD_ANALYSIS_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`
  process.env.BOARD_ANALYSIS_MODEL = 'test-model'; process.env.BOARD_ANALYSIS_TOKEN = 'test-service-token'
  const server = createServer((req, res) => { void boardAnalysis(req, res) })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'must-not-forward' }, body: JSON.stringify({ mode: 'analysis', window: { from: '', to: '' }, facts, ignoredSecret: 'must-not-forward' }) })
    assert.equal(response.status, 200); assert.equal((await response.json()).dimensions.length, 8)
    assert(captured); assert(!captured.body.includes('must-not-forward')); assert.equal(captured.headers['x-api-key'], undefined); assert.equal(captured.headers.authorization, 'Bearer test-service-token')
  } finally {
    await Promise.all([new Promise<void>(r => server.close(() => r())), new Promise<void>(r => provider.close(() => r()))])
    for (const [name, value] of [['BOARD_ANALYSIS_URL', before.url], ['BOARD_ANALYSIS_MODEL', before.model], ['BOARD_ANALYSIS_TOKEN', before.token]]) { if (value === undefined) delete process.env[name!]; else process.env[name!] = value }
  }
})
test('priority uses the disclosed weighting and never sorts unknown scores ahead of scored evidence', () => {
  const make = (id: AnalysisItem['id'], risk: number | null, actionability: number | null): AnalysisItem => ({ id, risk, actionability, statement: 'Evidence.', rationale: 'Review.' })
  assert.equal(priority(make('inventory', 5, 3)), 88)
  const ranked = rankAnalysis([make('inventory', null, null), make('security', 5, 3), make('accountability', 5, 5)])
  assert.deepEqual(ranked.map(d => d.id), ['accountability', 'security', 'inventory'])
})
test('analysis validation rejects duplicate dimensions, out-of-range scores and scoring unavailable evidence', () => {
  const facts = boardFacts(previewBoard())
  const value = { summary: 'Evidence.', dimensions: facts.map(f => ({ id: f.id, statement: 'Evidence.', rationale: 'Review.', risk: null, actionability: null })) }
  assert.equal(validateAnalysis(value, facts).dimensions.length, 8)
  const duplicate = structuredClone(value); duplicate.dimensions[1].id = duplicate.dimensions[0].id
  assert.throws(() => validateAnalysis(duplicate, facts))
  const bad = structuredClone(value) as { summary: string; dimensions: AnalysisItem[] }; bad.dimensions[0].risk = 6
  assert.throws(() => validateAnalysis(bad, facts))
  const missing = facts.map(f => ({ ...f, available: false })); bad.dimensions[0].risk = 3
  assert.throws(() => validateAnalysis(bad, missing))
})
test('local AI service rejects cross-origin calls and clearly reports missing configuration', async () => {
  const old = process.env.BOARD_ANALYSIS_URL; delete process.env.BOARD_ANALYSIS_URL
  const server = createServer((req, res) => { void boardAnalysis(req, res) })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const address = server.address() as { port: number }; const url = `http://127.0.0.1:${address.port}`
  try {
    const rejected = await fetch(url, { method: 'POST', headers: { origin: 'https://example.org', 'content-type': 'application/json' }, body: '{}' })
    assert.equal(rejected.status, 403)
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    assert.equal(response.status, 503); assert.match((await response.json()).error, /not configured/)
  } finally { await new Promise<void>((r, reject) => server.close(e => e ? reject(e) : r())); if (old === undefined) delete process.env.BOARD_ANALYSIS_URL; else process.env.BOARD_ANALYSIS_URL = old }
})

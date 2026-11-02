export const IDS = ['inventory', 'accountability', 'finance', 'security', 'compliance', 'incidents', 'vendors', 'shadow']
const text = (x, max) => typeof x === 'string' && x.trim().length > 0 && x.length <= max
const score = x => x === null || (Number.isInteger(x) && x >= 1 && x <= 5)
export function validateAnalysis(value, facts) {
  if (!value || !text(value.summary, 1800) || !Array.isArray(value.dimensions) || value.dimensions.length !== 8) throw Error('Invalid analysis response.')
  const seen = new Set()
  for (const d of value.dimensions) {
    if (!IDS.includes(d?.id) || seen.has(d.id) || !text(d.statement, 450) || !text(d.rationale, 700) || !score(d.risk) || !score(d.actionability)) throw Error('Invalid dimension analysis.')
    if (!facts.find(f => f.id === d.id)?.available && (d.risk !== null || d.actionability !== null)) throw Error('Unavailable sources must remain unscored.')
    seen.add(d.id)
  }
  return { summary: value.summary, dimensions: value.dimensions.map(({ id, statement, risk, actionability, rationale }) => ({ id, statement, risk, actionability, rationale })) }
}

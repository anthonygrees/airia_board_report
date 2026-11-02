import type { Analysis, Fact } from './src/report/model'
export const IDS: readonly string[]
export function validateAnalysis(value: unknown, facts: readonly Fact[]): Analysis

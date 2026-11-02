import { createContext, useContext } from 'react'
import { DEFAULT_WINDOW, type WindowFilter, type Analysis } from './model'
export const ReportContext = createContext<{ window: WindowFilter; analysis: Analysis | null }>({ window: DEFAULT_WINDOW, analysis: null })
export const useReport = () => useContext(ReportContext)

import { Boxes, UserRoundCheck, CircleDollarSign, ShieldCheck, ClipboardCheck, Siren, Handshake, ScanEye } from 'lucide-react'
import type { DimensionId } from './model'
const icons = { inventory: Boxes, accountability: UserRoundCheck, finance: CircleDollarSign, security: ShieldCheck, compliance: ClipboardCheck, incidents: Siren, vendors: Handshake, shadow: ScanEye }
export function DimensionIcon({ id }: { id: DimensionId }) { const Icon = icons[id]; return <span className="report-dimension-icon" aria-hidden="true"><Icon size={19} /></span> }

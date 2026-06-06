export function Spinner() {
  return (
    <div className="flex items-center justify-center p-10">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  )
}

const STATUS_COLOR = {
  pending:  'bg-amber-100 text-amber-700 border-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  rejected: 'bg-red-100 text-red-700 border-red-300',
}
const STATUS_TH = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ' }

export function Badge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${STATUS_COLOR[status]}`}>
      {status === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />}
      {STATUS_TH[status]}
    </span>
  )
}

export const ROLE_PRESETS = [
  { value: 'leader',    label: 'หัวหน้ากลุ่ม' },
  { value: 'secretary', label: 'เลขานุการ' },
  { value: 'treasurer', label: 'เหรัญญิก' },
  { value: 'member',    label: 'สมาชิก' },
]

export const timeAgo = (ts) => {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60)    return 'เมื่อกี้'
  if (diff < 3600)  return `${Math.floor(diff/60)} นาทีที่แล้ว`
  if (diff < 86400) return `${Math.floor(diff/3600)} ชั่วโมงที่แล้ว`
  return new Date(ts).toLocaleDateString('th-TH')
}

export const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

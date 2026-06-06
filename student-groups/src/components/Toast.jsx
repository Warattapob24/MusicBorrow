// ── Toast ──────────────────────────────────────────────────────────────────
import { useEffect } from 'react'

export default function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }, [])
  const bg = type === 'error' ? 'bg-red-600' : type === 'warn' ? 'bg-amber-500' : 'bg-emerald-600'
  const icon = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '✅'
  return (
    <div className={`fixed top-4 right-4 z-[9999] flex items-center gap-3 ${bg} text-white
      px-5 py-3 rounded-2xl shadow-2xl max-w-sm animate-slide-in`}>
      <span>{icon}</span>
      <p className="text-sm font-medium flex-1">{msg}</p>
      <button onClick={onClose} className="opacity-70 hover:opacity-100 text-xl leading-none">×</button>
    </div>
  )
}

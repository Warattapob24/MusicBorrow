import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase'

const MODE_CONFIG = {
  student: { label: 'นักเรียน', icon: '🎒', placeholder: 'รหัสนักเรียน เช่น 10001', route: '/student' },
  teacher: { label: 'ครู',      icon: '📚', placeholder: 'รหัสครู',                  route: '/teacher/dashboard' },
  admin:   { label: 'Admin',    icon: '⚙️', placeholder: 'รหัส Admin',               route: '/admin/dashboard' },
}

export default function LoginPage({ mode, onLogin }) {
  const [code, setCode]         = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoad]      = useState(false)
  const [teacherCode, setTC]    = useState(null)
  const [adminCode, setAC]      = useState(null)
  const navigate                = useNavigate()
  const cfg                     = MODE_CONFIG[mode]

  useEffect(() => {
    sb.from('sg_settings').select('key, value').in('key', ['teacher_code', 'admin_code'])
      .then(({ data }) => {
        data?.forEach(s => {
          if (s.key === 'teacher_code') setTC(s.value)
          if (s.key === 'admin_code')   setAC(s.value)
        })
      })
  }, [])

  const handleLogin = async () => {
    if (!code.trim()) { setError('กรุณากรอกรหัส'); return }
    setLoad(true); setError('')

    if (mode === 'teacher') {
      const expected = teacherCode || 'teacher001'
      if (code.trim() === expected) {
        onLogin({ type: 'teacher', id: 'teacher001', name: 'ครูผู้สอน' })
        navigate(cfg.route)
      } else setError('รหัสครูไม่ถูกต้อง')
      setLoad(false); return
    }

    if (mode === 'admin') {
      const expected = adminCode || 'admin9999'
      if (code.trim() === expected) {
        onLogin({ type: 'admin', id: 'admin', name: 'ผู้ดูแลระบบ' })
        navigate(cfg.route)
      } else setError('รหัส Admin ไม่ถูกต้อง')
      setLoad(false); return
    }

    // student — ตรวจจาก Supabase
    const { data, error: err } = await sb
      .from('sg_students')
      .select('*')
      .eq('student_code', code.trim())
      .eq('is_active', true)
      .single()

    if (err || !data) {
      setError('ไม่พบรหัสนักเรียนนี้ในระบบ กรุณาตรวจสอบ')
    } else {
      onLogin({ type: 'student', ...data })
      navigate(cfg.route)
    }
    setLoad(false)
  }

  const gradients = {
    student: 'from-slate-900 via-indigo-950 to-slate-900',
    teacher: 'from-amber-950 via-amber-900 to-slate-900',
    admin:   'from-slate-900 via-slate-800 to-slate-900',
  }
  const iconBg  = { student: 'bg-indigo-600', teacher: 'bg-amber-500', admin: 'bg-slate-600' }
  const btnCls  = { student: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/40', teacher: 'bg-amber-500 hover:bg-amber-400 shadow-amber-900/30', admin: 'bg-slate-700 hover:bg-slate-600 shadow-slate-900/30' }
  const ringCls = { student: 'focus:ring-indigo-500', teacher: 'focus:ring-amber-400', admin: 'focus:ring-slate-400' }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${gradients[mode]} flex flex-col items-center justify-center p-4`}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-up">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-3xl shadow-2xl mb-4 ${iconBg[mode]}`}>
            <span className="text-4xl">{cfg.icon}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Student Groups</h1>
          <p className="text-white/50 text-sm mt-1">
            {mode === 'student' ? 'ระบบจัดกลุ่มนักเรียน' : mode === 'teacher' ? 'โหมดครูผู้สอน' : 'โหมดผู้ดูแลระบบ'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-3xl p-7 shadow-2xl animate-fade-up">
          <label className="block text-white/70 text-sm font-medium mb-2">{cfg.label}</label>
          <input
            value={code}
            onChange={e => { setCode(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder={cfg.placeholder}
            className={`w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3.5 text-white
              placeholder-white/30 focus:outline-none focus:ring-2 ${ringCls[mode]} focus:border-transparent
              text-center text-lg tracking-widest mb-4`}
          />

          {error && (
            <div className="flex items-start gap-2 bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 mb-4">
              <span>❌</span>
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <button onClick={handleLogin} disabled={loading}
            className={`w-full py-3.5 ${btnCls[mode]} text-white font-semibold rounded-2xl
              transition-all shadow-lg disabled:opacity-50 active:scale-95`}>
            {loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
          </button>
        </div>

      </div>
    </div>
  )
}

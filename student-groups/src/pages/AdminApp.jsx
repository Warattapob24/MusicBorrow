import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { sb } from '../lib/supabase'
import { Spinner } from '../components/ui'

export default function AdminApp({ session, onLogout, showToast }) {
  const [tab, setTab]       = useState('students')
  const [importRows, setImp]   = useState([])
  const [importing, setImping] = useState(false)
  const [tcInput, setTcInput]     = useState('')
  const [acInput, setAcInput]     = useState('')
  const [multiGroup, setMulti]    = useState('false')
  const [minMembers, setMinMem]   = useState('0')
  const [maxMembers, setMaxMem]   = useState('0')
  const [savingCfg, setSaveCfg]   = useState(false)
  // Students tab
  const [students, setStudents]   = useState([])
  const [stdSearch, setStdSearch] = useState('')
  const [stdCls, setStdCls]       = useState('all')
  const [editSt, setEditSt]       = useState(null)
  const [showAdd, setShowAdd]     = useState(false)
  const [addForm, setAddForm]     = useState({ student_code:'', full_name:'', classroom:'', grade_level:'', school_year:'' })
  const [savingSt, setSavingSt]   = useState(false)
  const [loadingSt, setLoadSt]    = useState(false)
  const [showImport, setShowImp]  = useState(false)
  const [stdSort, setStdSort]     = useState('classroom')

  const fetchStudents = useCallback(async () => {
    setLoadSt(true)
    const { data } = await sb.from('sg_students').select('*').eq('is_active', true).order('classroom').order('student_code')
    setStudents(data || [])
    setLoadSt(false)
  }, [])

  useEffect(() => { fetchStudents() }, [fetchStudents])

  useEffect(() => {
    sb.from('sg_settings').select('key,value').in('key', ['teacher_code','admin_code','allow_multi_group','min_members','max_members'])
      .then(({ data }) => {
        data?.forEach(s => {
          if (s.key === 'teacher_code')      setTcInput(s.value)
          if (s.key === 'admin_code')        setAcInput(s.value)
          if (s.key === 'allow_multi_group') setMulti(s.value)
          if (s.key === 'min_members')       setMinMem(s.value)
          if (s.key === 'max_members')       setMaxMem(s.value)
        })
      })
  }, [])

  const saveSettings = async () => {
    if (!tcInput.trim() || !acInput.trim()) { showToast('กรุณากรอกรหัสให้ครบ', 'error'); return }
    setSaveCfg(true)
    await Promise.all([
      sb.from('sg_settings').upsert({ key: 'teacher_code',      value: tcInput.trim(),   updated_at: new Date().toISOString() }),
      sb.from('sg_settings').upsert({ key: 'admin_code',        value: acInput.trim(),   updated_at: new Date().toISOString() }),
      sb.from('sg_settings').upsert({ key: 'allow_multi_group', value: multiGroup,       updated_at: new Date().toISOString() }),
      sb.from('sg_settings').upsert({ key: 'min_members',       value: minMembers,       updated_at: new Date().toISOString() }),
      sb.from('sg_settings').upsert({ key: 'max_members',       value: maxMembers,       updated_at: new Date().toISOString() }),
    ])
    setSaveCfg(false)
    showToast('บันทึกรหัสแล้ว ✓ (มีผลทันทีที่ login ครั้งถัดไป)')
  }

  // ── Student CRUD ────────────────────────────────────────────────────────
  const deleteSt = async (st) => {
    if (!window.confirm(`ลบ ${st.full_name}?`)) return
    await sb.from('sg_students').update({ is_active: false }).eq('id', st.id)
    setStudents(prev => prev.filter(s => s.id !== st.id))
    showToast('ลบแล้ว')
  }

  const saveEditSt = async () => {
    if (!editSt.student_code.trim() || !editSt.full_name.trim()) { showToast('กรุณากรอกข้อมูลให้ครบ', 'error'); return }
    setSavingSt(true)
    await sb.from('sg_students').update({
      student_code: editSt.student_code.trim(),
      full_name:    editSt.full_name.trim(),
      classroom:    editSt.classroom?.trim() || '',
      grade_level:  editSt.grade_level?.trim() || '',
      school_year:  editSt.school_year?.trim() || '',
    }).eq('id', editSt.id)
    setSavingSt(false); setEditSt(null); fetchStudents()
    showToast('แก้ไขแล้ว ✓')
  }

  const addStudent = async () => {
    if (!addForm.student_code.trim() || !addForm.full_name.trim()) { showToast('กรุณากรอกรหัสและชื่อ', 'error'); return }
    setSavingSt(true)
    const { error } = await sb.from('sg_students').upsert(
      { ...addForm, student_code: addForm.student_code.trim(), full_name: addForm.full_name.trim(), is_active: true },
      { onConflict: 'student_code' }
    )
    setSavingSt(false)
    if (error) { showToast('Error: ' + error.message, 'error'); return }
    setShowAdd(false)
    setAddForm({ student_code:'', full_name:'', classroom:'', grade_level:'', school_year:'' })
    fetchStudents(); showToast('เพิ่มนักเรียนแล้ว ✓')
  }

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws)
      setImp(data.map(r => ({
        student_code: String(r.student_code || ''),
        full_name:    String(r.full_name || ''),
        classroom:    String(r.classroom || ''),
        grade_level:  String(r.grade_level || ''),
        school_year:  String(r.school_year || ''),
      })).filter(r => r.student_code && r.full_name))
    }
    reader.readAsBinaryString(file)
  }

  const doImport = async () => {
    if (!importRows.length) return
    setImping(true)
    const { error } = await sb.from('sg_students').upsert(importRows, { onConflict: 'student_code' })
    setImping(false)
    if (error) { showToast('Error: ' + error.message, 'error') }
    else { showToast(`นำเข้า ${importRows.length} รายการสำเร็จ! 🎉`); setImp([]); fetchStudents() }
  }

  const stdClassrooms = [...new Set(students.map(s => s.classroom).filter(Boolean))].sort()

  const filtStudents = students.filter(s => {
    const matchCls = stdCls === 'all' || s.classroom === stdCls
    const matchSrc = !stdSearch ||
      s.full_name?.toLowerCase().includes(stdSearch.toLowerCase()) ||
      s.student_code?.includes(stdSearch) ||
      s.classroom?.includes(stdSearch)
    return matchCls && matchSrc
  })

  const sortedStudents = [...filtStudents].sort((a, b) => {
    const nameCmp = (a.full_name||'').localeCompare(b.full_name||'', 'th')
    switch (stdSort) {
      case 'name': return nameCmp
      case 'code': return (a.student_code||'').localeCompare(b.student_code||'')
      default:     return (a.classroom||'').localeCompare(b.classroom||'') || nameCmp
    }
  })

  const BASE = 'https://music-borrow.vercel.app/student-groups'
  const LINKS = [
    { label: '🎒 หน้านักเรียน', url: `${BASE}/`,        desc: 'ลิ้งค์ให้นักเรียน login' },
    { label: '📚 หน้าครู',      url: `${BASE}/teacher`,  desc: 'ลิ้งค์ให้ครู login' },
    { label: '⚙️ หน้า Admin',   url: `${BASE}/admin`,    desc: 'ลิ้งค์ Admin login' },
    { label: '🎵 แอปหลัก',      url: 'https://music-borrow.vercel.app/', desc: 'ระบบยืมคืนเครื่องดนตรี' },
  ]

  const copyLink = (url) => {
    navigator.clipboard.writeText(url).then(() => showToast('คัดลอกลิ้งค์แล้ว ✓'))
  }

  const tabs = [
    { key: 'students', label: `📋 นักเรียน` },
    { key: 'links',    label: '🔗 ลิ้งค์' },
    { key: 'settings', label: '⚙️ ตั้งค่า' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-800 text-white px-5 pb-5" style={{ paddingTop: 'max(env(safe-area-inset-top), 2.5rem)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm">⚙️ Admin Dashboard</p>
            <h1 className="text-xl font-bold">ระบบจัดการนักเรียน</h1>
            <p className="text-slate-400 text-sm">{students.length} คน</p>
          </div>
          <button onClick={onLogout}
            className="text-xs text-slate-400 hover:text-white border border-slate-600 rounded-xl px-3 py-1.5">
            ออก
          </button>
        </div>
      </div>

      <div className="flex bg-white border-b px-2 sticky top-0 z-10 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
              ${tab === t.key ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 max-w-3xl mx-auto">

        {/* ── STUDENTS ── */}
        {tab === 'students' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              <input value={stdSearch} onChange={e=>setStdSearch(e.target.value)}
                placeholder="ค้นหารหัส / ชื่อ..."
                className="flex-1 min-w-[140px] bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
              <select value={stdCls} onChange={e=>setStdCls(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none min-w-[90px]">
                <option value="all">ทุกห้อง</option>
                {stdClassrooms.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={stdSort} onChange={e=>setStdSort(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none min-w-[110px]">
                <option value="classroom">🏫 ห้อง</option>
                <option value="name">🔤 ชื่อ A-Z</option>
                <option value="code">🔢 รหัส</option>
              </select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-slate-500">{sortedStudents.length} / {students.length} คน</p>
              <div className="flex gap-2">
                <button onClick={() => { setShowAdd(p=>!p); setEditSt(null) }}
                  className="px-3 py-2 bg-indigo-600 text-white text-xs rounded-xl hover:bg-indigo-700 font-medium">
                  + เพิ่มทีละคน
                </button>
                <button onClick={() => setShowImp(p=>!p)}
                  className="px-3 py-2 bg-slate-100 text-slate-700 text-xs rounded-xl hover:bg-slate-200 font-medium">
                  📥 Import Excel
                </button>
              </div>
            </div>

            {/* Add form */}
            {showAdd && (
              <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-200 space-y-2">
                <p className="text-sm font-semibold text-indigo-700 mb-2">➕ เพิ่มนักเรียนคนใหม่</p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={addForm.student_code} onChange={e=>setAddForm(p=>({...p,student_code:e.target.value}))}
                    placeholder="รหัสนักเรียน *"
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                  <input value={addForm.full_name} onChange={e=>setAddForm(p=>({...p,full_name:e.target.value}))}
                    placeholder="ชื่อ-สกุล *"
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                  <input value={addForm.classroom} onChange={e=>setAddForm(p=>({...p,classroom:e.target.value}))}
                    placeholder="ห้องเรียน"
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                  <input value={addForm.grade_level} onChange={e=>setAddForm(p=>({...p,grade_level:e.target.value}))}
                    placeholder="ระดับชั้น"
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                  <input value={addForm.school_year} onChange={e=>setAddForm(p=>({...p,school_year:e.target.value}))}
                    placeholder="ปีการศึกษา"
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white col-span-2" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={addStudent} disabled={savingSt}
                    className="flex-1 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-50 font-medium">
                    {savingSt ? '...' : '✓ เพิ่ม'}
                  </button>
                  <button onClick={() => setShowAdd(false)}
                    className="px-4 py-2 bg-white text-slate-600 text-sm rounded-xl border border-slate-200 hover:bg-slate-50">
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}

            {/* Import Excel (collapsible) */}
            {showImport && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-3">
                <p className="text-sm font-semibold text-slate-700">📥 นำเข้าจาก Excel</p>
                <div className="bg-slate-50 rounded-xl p-3 text-xs font-mono text-slate-600 overflow-x-auto whitespace-nowrap">
                  student_code | full_name | classroom | grade_level | school_year
                </div>
                <input type="file" accept=".xlsx,.csv" onChange={handleFile}
                  className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                {importRows.length > 0 && (
                  <>
                    <p className="text-sm font-semibold text-slate-700">พบ {importRows.length} รายการ (แสดง 5 แรก)</p>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="text-xs w-full">
                        <thead className="bg-slate-100">
                          <tr>{['student_code','full_name','classroom','grade_level','school_year'].map(k =>
                            <th key={k} className="p-2 text-left text-slate-600 font-medium">{k}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.slice(0,5).map((r,i) => (
                            <tr key={i} className="border-t border-slate-100">
                              {Object.values(r).map((v,j) => <td key={j} className="p-2 text-slate-700">{v}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button onClick={doImport} disabled={importing}
                      className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 text-sm">
                      {importing ? 'กำลังนำเข้า...' : `📥 นำเข้า ${importRows.length} รายการ`}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Student list */}
            {loadingSt && <Spinner />}
            {!loadingSt && !students.length && (
              <div className="text-center py-16">
                <p className="text-4xl mb-2">👤</p>
                <p className="text-slate-400 text-sm">ยังไม่มีนักเรียน</p>
                <p className="text-slate-300 text-xs mt-1">นำเข้าจาก Excel หรือกด "+ เพิ่มทีละคน"</p>
              </div>
            )}
            <div className="space-y-2">
              {sortedStudents.map(st => {
                if (editSt?.id === st.id) {
                  return (
                    <div key={st.id} className="bg-amber-50 rounded-2xl p-4 border border-amber-200 space-y-2">
                      <p className="text-xs font-semibold text-amber-700 mb-1">✏️ แก้ไขข้อมูล</p>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={editSt.student_code} onChange={e=>setEditSt(p=>({...p,student_code:e.target.value}))}
                          placeholder="รหัสนักเรียน"
                          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" />
                        <input value={editSt.full_name} onChange={e=>setEditSt(p=>({...p,full_name:e.target.value}))}
                          placeholder="ชื่อ-สกุล"
                          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" />
                        <input value={editSt.classroom||''} onChange={e=>setEditSt(p=>({...p,classroom:e.target.value}))}
                          placeholder="ห้องเรียน"
                          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" />
                        <input value={editSt.grade_level||''} onChange={e=>setEditSt(p=>({...p,grade_level:e.target.value}))}
                          placeholder="ระดับชั้น"
                          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveEditSt} disabled={savingSt}
                          className="flex-1 py-2 bg-amber-500 text-white text-sm rounded-xl hover:bg-amber-600 disabled:opacity-50 font-medium">
                          {savingSt ? '...' : '💾 บันทึก'}
                        </button>
                        <button onClick={() => setEditSt(null)}
                          className="px-4 py-2 bg-white text-slate-600 text-sm rounded-xl border border-slate-200">
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={st.id} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {st.full_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{st.full_name}</p>
                      <p className="text-xs text-slate-400">{st.student_code} · {st.classroom}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => { setEditSt({...st}); setShowAdd(false) }}
                        className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg text-xs">✏️</button>
                      <button onClick={() => deleteSt(st)}
                        className="p-2 text-red-400 hover:bg-red-50 rounded-lg text-xs">🗑</button>
                    </div>
                  </div>
                )
              })}
              {!loadingSt && sortedStudents.length === 0 && students.length > 0 && (
                <p className="text-center text-slate-400 py-6 text-sm">ไม่พบนักเรียนที่ค้นหา</p>
              )}
            </div>
          </div>
        )}

        {/* ── LINKS ── */}
        {tab === 'links' && (
          <div className="space-y-3 max-w-sm mx-auto">
            <p className="text-xs text-slate-400 mb-2">กดที่ลิ้งค์เพื่อเปิด หรือกด "คัดลอก" เพื่อแชร์</p>
            {LINKS.map(lk => (
              <div key={lk.url} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 text-sm">{lk.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5 mb-1">{lk.desc}</p>
                    <a href={lk.url} target="_blank" rel="noreferrer"
                      className="text-xs text-indigo-600 break-all hover:underline">{lk.url}</a>
                  </div>
                  <button onClick={() => copyLink(lk.url)}
                    className="flex-shrink-0 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-xl hover:bg-indigo-50 hover:text-indigo-600 font-medium">
                    คัดลอก
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && (
          <div className="space-y-4 max-w-sm mx-auto">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <h3 className="font-semibold text-slate-800 mb-1">ตั้งรหัสเข้าระบบ</h3>
              <p className="text-xs text-slate-400 mb-5">รหัสใหม่จะมีผลทันทีที่ login ครั้งถัดไป</p>

              <label className="block text-xs font-medium text-slate-600 mb-1">อนุญาตให้อยู่หลายกลุ่ม</label>
              <div className="flex gap-2 mb-4">
                <button onClick={() => setMulti('false')} className={`flex-1 py-2 text-xs rounded-xl border font-medium ${multiGroup==='false'?'bg-indigo-600 text-white border-indigo-600':'bg-white text-slate-600 border-slate-200'}`}>
                  1 กลุ่มต่อคน
                </button>
                <button onClick={() => setMulti('true')} className={`flex-1 py-2 text-xs rounded-xl border font-medium ${multiGroup==='true'?'bg-indigo-600 text-white border-indigo-600':'bg-white text-slate-600 border-slate-200'}`}>
                  หลายกลุ่มได้
                </button>
              </div>

              <label className="block text-xs font-medium text-slate-600 mb-1">
                จำนวนสมาชิกขั้นต่ำต่อกลุ่ม <span className="text-slate-400 font-normal">(0 = ไม่จำกัด)</span>
              </label>
              <input type="number" min="0" max="50" value={minMembers} onChange={e => setMinMem(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-4" />

              <label className="block text-xs font-medium text-slate-600 mb-1">
                จำนวนสมาชิกสูงสุดต่อกลุ่ม <span className="text-slate-400 font-normal">(0 = ไม่จำกัด)</span>
              </label>
              <input type="number" min="0" max="50" value={maxMembers} onChange={e => setMaxMem(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-4" />

              <div className="border-t border-slate-100 pt-4 mb-4" />

              <label className="block text-xs font-medium text-slate-600 mb-1">รหัสครู (Teacher Code)</label>
              <input value={tcInput} onChange={e => setTcInput(e.target.value)} placeholder="รหัสครู"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 mb-4" />

              <label className="block text-xs font-medium text-slate-600 mb-1">รหัส Admin</label>
              <input value={acInput} onChange={e => setAcInput(e.target.value)} placeholder="รหัส Admin"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 mb-5" />

              <button onClick={saveSettings} disabled={savingCfg}
                className="w-full py-3 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-50 text-sm active:scale-95 transition-all">
                {savingCfg ? 'กำลังบันทึก...' : '💾 บันทึกรหัส'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

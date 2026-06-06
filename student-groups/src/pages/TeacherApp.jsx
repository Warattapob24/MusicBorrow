import { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { requestSGPush, getSGPushStatus } from '../lib/push'
import { Spinner, Badge, ROLE_PRESETS } from '../components/ui'
import ChatPanel from '../components/ChatPanel'

export default function TeacherApp({ session, onLogout, showToast }) {
  const [groups, setGroups]       = useState([])
  const [classrooms, setCls]      = useState([])
  const [filter, setFilter]       = useState('all')
  const [search, setSearch]       = useState('')
  const [loading, setLoad]        = useState(true)
  const [tab, setTab]             = useState('groups')
  const [requests, setRequests]   = useState([])
  const [toggling, setToggling]   = useState(null)
  const [chat, setChat]           = useState(null)
  const [regOpen, setRegOpen]     = useState(false)
  const [savingReg, setSavingReg] = useState(false)
  // Scoring
  const [scoringId, setScoringId] = useState(null)
  const [scoreType, setScoreType] = useState('group')
  const [scoreVal, setScoreVal]   = useState('')
  const [scoreNote, setScoreNote] = useState('')
  const [savingScore, setSavScore]= useState(false)
  const [groupScores, setGScores] = useState({})
  const [indivScores, setIndivSc] = useState({}) // { [studentId]: { score:'', note:'' } }
  // Notes
  const [notesId, setNotesId]     = useState(null)
  const [notesText, setNotesText] = useState('')
  const [savingNote, setSavNote]  = useState(false)
  // Open polls
  const [openPolls, setOpenPolls]   = useState([])
  // Classroom chat
  const [clsChat, setClsChat]       = useState(null)
  const [pushStatus, setPushSt]     = useState(() => getSGPushStatus())
  // Students tab
  const [students, setStudents]     = useState([])
  const [stdSearch, setStdSearch]   = useState('')
  const [stdCls, setStdCls]         = useState('all')
  const [stdSort, setStdSort]       = useState('classroom')
  const [loadingSt, setLoadSt]      = useState(false)

  const loadGroups = useCallback(async () => {
    const { data } = await sb.from('sg_groups')
      .select('*, sg_group_members(role,role_label,student_id,sg_students(id,full_name,student_code,classroom)), sg_polls(id,status,poll_type)')
      .eq('status','active').order('classroom').order('group_name')
    setGroups(data || [])
    setCls([...new Set(data?.map(g=>g.classroom).filter(Boolean))].sort())
    setLoad(false)
  }, [])

  const loadRequests = useCallback(async () => {
    const { data } = await sb.from('sg_change_requests')
      .select('*, sg_students!sg_change_requests_student_id_fkey(full_name,student_code,classroom), sg_groups(group_name,classroom)')
      .eq('status','pending').order('requested_at',{ascending:true})
    setRequests(data || [])
  }, [])

  const loadPolls = useCallback(async () => {
    const { data } = await sb.from('sg_polls')
      .select('*, sg_groups(group_name,classroom), sg_poll_votes(vote)')
      .eq('status','open').order('created_at',{ascending:false})
    setOpenPolls(data || [])
  }, [])

  const loadStudents = useCallback(async () => {
    setLoadSt(true)
    const { data } = await sb.from('sg_students')
      .select('*, sg_group_members(group_id, role, role_label, sg_groups(id, group_name, classroom, status))')
      .eq('is_active', true).order('classroom').order('student_code')
    setStudents(data || [])
    setLoadSt(false)
  }, [])

  const loadScores = useCallback(async (groupIds) => {
    if (!groupIds.length) return
    const { data } = await sb.from('sg_group_scores').select('*').in('group_id', groupIds)
    const map = {}
    data?.forEach(s => { if (!map[s.group_id]) map[s.group_id] = []; map[s.group_id].push(s) })
    setGScores(map)
  }, [])

  useEffect(() => {
    loadGroups(); loadRequests(); loadPolls(); loadStudents()
    sb.from('sg_settings').select('value').eq('key','registration_open').single()
      .then(({ data }) => setRegOpen(data?.value === 'true'))
  }, [loadGroups, loadRequests, loadPolls, loadStudents])

  // Realtime: อัพเดท badge โหวตทันทีเมื่อนักเรียนสร้างโหวตใหม่
  useEffect(() => {
    const ch = sb.channel('teacher_polls_watch')
      .on('postgres_changes', { event:'*', schema:'public', table:'sg_polls' }, loadPolls)
      .subscribe()
    return () => sb.removeChannel(ch)
  }, [loadPolls])

  // Auto-register push if already granted
  useEffect(() => {
    if (pushStatus === 'granted') requestSGPush(sb, 'teacher')
  }, [pushStatus])

  useEffect(() => {
    if (groups.length) loadScores(groups.map(g=>g.id))
  }, [groups, loadScores])

  const toggleReg = async () => {
    setSavingReg(true)
    const next = !regOpen
    await sb.from('sg_settings').upsert({ key:'registration_open', value:String(next), updated_at:new Date().toISOString() })
    setRegOpen(next); setSavingReg(false)
    showToast(next ? '✅ เปิดรับสมัครกลุ่มแล้ว' : '🔒 ปิดรับสมัครกลุ่มแล้ว')
  }

  const togglePhase = async (g) => {
    setToggling(g.id)
    const next = g.phase === 'open' ? 'locked' : 'open'
    await sb.from('sg_groups').update({ phase:next }).eq('id', g.id)
    setGroups(prev => prev.map(x => x.id===g.id ? {...x, phase:next} : x))
    showToast(next==='open' ? `เปิดแก้ไข "${g.group_name}" แล้ว ✓` : `ล็อก "${g.group_name}" แล้ว 🔒`)
    setToggling(null)
  }

  const deleteGroup = async (g) => {
    if (!window.confirm(`ลบกลุ่ม "${g.group_name}" และข้อมูลทั้งหมด? การดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return
    await sb.from('sg_groups').update({ status:'inactive' }).eq('id', g.id)
    setGroups(prev => prev.filter(x => x.id !== g.id))
    showToast(`ลบกลุ่ม "${g.group_name}" แล้ว`)
  }

  const approve = async (req) => {
    if (req.request_type === 'add') {
      await sb.from('sg_group_members').insert({ group_id:req.group_id, student_id:req.student_id, role:'member', role_label:'สมาชิก' })
    } else if (req.request_type === 'remove') {
      await sb.from('sg_group_members').delete().eq('group_id',req.group_id).eq('student_id',req.student_id)
    } else if (req.request_type === 'change_role') {
      await sb.from('sg_group_members').update({ role:req.new_role, role_label:req.new_role_label }).eq('group_id',req.group_id).eq('student_id',req.student_id)
    } else if (req.request_type === 'new_student') {
      const p = req.payload
      const { data: newSt } = await sb.from('sg_students')
        .upsert({ student_code: p.student_code, full_name: p.full_name, classroom: p.classroom || req.sg_groups?.classroom, is_active: true }, { onConflict: 'student_code' })
        .select().single()
      if (newSt) {
        await sb.from('sg_group_members').insert({ group_id:req.group_id, student_id:newSt.id, role:'member', role_label:'สมาชิก' })
      }
    }
    await sb.from('sg_change_requests').update({ status:'approved' }).eq('id', req.id)
    setRequests(prev => prev.filter(r => r.id !== req.id))
    showToast('อนุมัติแล้ว ✓')
  }

  const reject = async (req) => {
    await sb.from('sg_change_requests').update({ status:'rejected' }).eq('id', req.id)
    setRequests(prev => prev.filter(r => r.id !== req.id))
    showToast('ปฏิเสธคำขอแล้ว', 'warn')
  }

  const saveScore = async (groupId, members) => {
    setSavScore(true)
    if (scoreType === 'group') {
      if (!scoreVal) { showToast('กรุณาใส่คะแนน','error'); setSavScore(false); return }
      await sb.from('sg_group_scores').insert({
        group_id: groupId, student_id: null,
        score: parseFloat(scoreVal), note: scoreNote||null, created_by: session.name,
      })
      setScoreVal(''); setScoreNote('')
      showToast('บันทึกคะแนนกลุ่มแล้ว ✓')
    } else {
      const rows = (members||[])
        .filter(m => indivScores[m.student_id]?.score !== '')
        .map(m => ({
          group_id: groupId,
          student_id: m.student_id,
          score: parseFloat(indivScores[m.student_id]?.score || 0),
          note: indivScores[m.student_id]?.note || null,
          created_by: session.name,
        }))
        .filter(r => !isNaN(r.score))
      if (!rows.length) { showToast('กรุณาใส่คะแนนอย่างน้อย 1 คน','error'); setSavScore(false); return }
      await sb.from('sg_group_scores').insert(rows)
      const init = {}
      members?.forEach(m => { init[m.student_id] = { score:'', note:'' } })
      setIndivSc(init)
      showToast(`บันทึกคะแนน ${rows.length} คน ✓`)
    }
    setSavScore(false)
    loadScores(groups.map(g=>g.id))
  }

  const closePoll = async (pollId) => {
    await sb.from('sg_polls').update({ status:'failed', closed_at: new Date().toISOString() }).eq('id', pollId)
    showToast('ปิดโหวตแล้ว'); loadPolls()
  }

  const saveNotes = async (groupId) => {
    setSavNote(true)
    await sb.from('sg_groups').update({ teacher_notes: notesText }).eq('id', groupId)
    setSavNote(false); setNotesId(null)
    setGroups(prev => prev.map(g => g.id===groupId ? {...g, teacher_notes:notesText} : g))
    showToast('บันทึก note แล้ว ✓')
  }

  const openScoring = (g) => {
    if (scoringId === g.id) { setScoringId(null); return }
    setScoringId(g.id); setScoreType('group'); setScoreVal(''); setScoreNote('')
    const init = {}
    g.sg_group_members?.forEach(m => { init[m.student_id] = { score:'', note:'' } })
    setIndivSc(init)
  }

  const switchToIndividual = (g) => {
    setScoreType('individual')
    const init = {}
    g.sg_group_members?.forEach(m => { init[m.student_id] = { score:'', note:'' } })
    setIndivSc(init)
  }

  const filtered = groups.filter(g => {
    const matchCls = filter==='all' || g.classroom===filter
    const matchSrc = !search || g.group_name.toLowerCase().includes(search.toLowerCase())
    return matchCls && matchSrc
  })
  const pendingCount = requests.length

  const stdClassrooms = [...new Set(students.map(s => s.classroom).filter(Boolean))].sort()
  const filtStudents = students.filter(s => {
    const matchCls = stdCls === 'all' || s.classroom === stdCls
    const matchSrc = !stdSearch ||
      s.full_name?.toLowerCase().includes(stdSearch.toLowerCase()) ||
      s.student_code?.includes(stdSearch) ||
      s.classroom?.includes(stdSearch)
    return matchCls && matchSrc
  })
  const inGroupCount = students.filter(s =>
    s.sg_group_members?.some(m => m.sg_groups?.status === 'active')
  ).length

  const sortedStudents = [...filtStudents].sort((a, b) => {
    const aIn = a.sg_group_members?.some(m => m.sg_groups?.status === 'active')
    const bIn = b.sg_group_members?.some(m => m.sg_groups?.status === 'active')
    const nameCmp = (a.full_name||'').localeCompare(b.full_name||'', 'th')
    switch (stdSort) {
      case 'name':    return nameCmp
      case 'code':    return (a.student_code||'').localeCompare(b.student_code||'')
      case 'inGroup': return (bIn?1:0)-(aIn?1:0) || nameCmp
      case 'noGroup': return (aIn?1:0)-(bIn?1:0) || nameCmp
      default:        return (a.classroom||'').localeCompare(b.classroom||'') || nameCmp
    }
  })

  return (
    <div className="min-h-screen bg-slate-50">
      {chat    && <ChatPanel groupId={chat.id} groupName={chat.group_name} sender={session} onClose={() => setChat(null)} />}
      {clsChat && <ChatPanel classroom={clsChat} sender={session} onClose={() => setClsChat(null)} />}

      <div className="bg-amber-600 text-white px-5 pb-5" style={{paddingTop:'max(env(safe-area-inset-top),2.5rem)'}}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-amber-200 text-sm">📚 โหมดครู</p>
            <h1 className="text-xl font-bold">{session.name}</h1>
            <p className="text-amber-200/70 text-sm">{groups.length} กลุ่ม</p>
          </div>
          <div className="flex flex-col gap-1.5 items-end">
            <button onClick={onLogout} className="text-xs text-amber-200 hover:text-white border border-amber-400/50 rounded-xl px-3 py-1.5">ออก</button>
            {pushStatus !== 'granted' && pushStatus !== 'unsupported' && (
              <button onClick={async () => {
                const ok = await requestSGPush(sb, 'teacher')
                setPushSt(ok ? 'granted' : 'denied')
                if (ok) showToast('เปิดการแจ้งเตือนบนโทรศัพท์แล้ว 🔔')
              }} className="text-xs text-yellow-300 hover:text-white border border-yellow-400/50 rounded-xl px-3 py-1.5">
                🔔 เปิดการแจ้งเตือน
              </button>
            )}
          </div>
        </div>
        <button onClick={toggleReg} disabled={savingReg}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all border ${
            regOpen
              ? 'bg-red-500/30 border-red-300/50 text-white hover:bg-red-500/40'
              : 'bg-emerald-500/30 border-emerald-300/50 text-white hover:bg-emerald-500/40'
          }`}>
          {savingReg ? '...' : regOpen ? '🔒 ปิดรับสมัครกลุ่ม (เปิดอยู่)' : '✅ เปิดรับสมัครกลุ่ม (ปิดอยู่)'}
        </button>
      </div>

      <div className="flex bg-white border-b px-2 sticky top-0 z-10 overflow-x-auto">
        {[
          { key:'groups',   label:'กลุ่มทั้งหมด' },
          { key:'requests', label:`คำขอ${pendingCount?` (${pendingCount})`:''}`},
          { key:'students', label:`📋 นักเรียน` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab===t.key?'border-amber-500 text-amber-600':'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 max-w-3xl mx-auto">

        {/* ── Tab: กลุ่มทั้งหมด ── */}
        {tab === 'groups' && (
          <>
            <div className="flex gap-2 mb-4">
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อกลุ่ม..."
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <select value={filter} onChange={e=>setFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none min-w-[90px]">
                <option value="all">ทุกห้อง</option>
                {classrooms.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {filter !== 'all' && (
                <button onClick={() => setClsChat(filter)}
                  className="flex-shrink-0 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl px-2.5 py-2 text-sm hover:bg-emerald-100">
                  🏫
                </button>
              )}
            </div>
            {loading && <Spinner />}
            <p className="text-xs text-slate-400 mb-3">{filtered.length} กลุ่ม</p>
            <div className="space-y-3">
              {filtered.map(g => {
                const disbandPoll = g.sg_polls?.find(p => p.poll_type==='disband' && p.status==='passed')
                const groupPolls  = openPolls.filter(p => p.group_id === g.id)
                const gScores     = groupScores[g.id] || []
                const isScoring   = scoringId === g.id
                const isNoting    = notesId   === g.id

                return (
                  <div key={g.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 animate-fade-up">
                    {/* Header */}
                    <div className="mb-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-slate-800 leading-snug">{g.group_name}</h3>
                        <span className="text-xs text-slate-400 flex-shrink-0 mt-0.5">{g.sg_group_members?.length} คน</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{g.classroom}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${g.phase==='open'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>
                          {g.phase==='open'?'✏️ เปิด':'🔒 ล็อก'}
                        </span>
                        {disbandPoll && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">💔 โหวตยุบ</span>}
                        {groupPolls.length > 0 && <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">📊 {groupPolls.length} โหวต</span>}
                      </div>
                    </div>

                    {/* Members */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {g.sg_group_members?.map(m => (
                        <span key={m.sg_students?.student_code}
                          className={`text-xs px-2 py-0.5 rounded-full ${m.student_id===g.leader_id?'bg-indigo-100 text-indigo-700':'bg-slate-100 text-slate-600'}`}>
                          {m.sg_students?.full_name?.split(' ')[0]}{m.student_id===g.leader_id?' 👑':''}
                        </span>
                      ))}
                    </div>

                    {/* Open polls for this group */}
                    {groupPolls.length > 0 && (
                      <div className="mb-3 space-y-1.5">
                        {groupPolls.map(p => {
                          const votes = p.sg_poll_votes || []
                          const yesCount = votes.filter(v => v.vote).length
                          const typeLabel = { join:'➕', leave:'➖', leader:'👑', topic:'📋', disband:'💔' }[p.poll_type] || '📋'
                          const isDanger = p.poll_type === 'disband'
                          return (
                            <div key={p.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${isDanger?'bg-red-50':'bg-amber-50'}`}>
                              <span className="flex-shrink-0">{typeLabel}</span>
                              <span className="flex-1 text-slate-700 truncate font-medium">{p.title}</span>
                              <span className="text-slate-400 flex-shrink-0">✓{yesCount}/{votes.length}</span>
                              <button onClick={() => closePoll(p.id)}
                                className="flex-shrink-0 text-slate-400 hover:text-red-500 transition-colors px-1">✕</button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Action bar */}
                    <div className="flex gap-1.5 mt-1 pt-3 border-t border-slate-100">
                      <button onClick={() => setChat(g)}
                        className="flex-1 py-2 bg-amber-50 text-amber-700 rounded-xl text-xs font-medium flex flex-col items-center gap-0.5 active:scale-95 transition-transform">
                        <span>💬</span><span>แชท</span>
                      </button>
                      <button onClick={() => togglePhase(g)} disabled={toggling===g.id}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium flex flex-col items-center gap-0.5 active:scale-95 transition-transform disabled:opacity-50 ${
                          g.phase==='open' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                        <span>{toggling===g.id ? '…' : g.phase==='open' ? '🔒' : '✏️'}</span>
                        <span>{g.phase==='open' ? 'ล็อก' : 'เปิด'}</span>
                      </button>
                      <button onClick={() => openScoring(g)}
                        className="flex-1 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-medium flex flex-col items-center gap-0.5 active:scale-95 transition-transform">
                        <span>⭐</span><span>คะแนน</span>
                      </button>
                      <button onClick={() => { setNotesId(isNoting?null:g.id); setNotesText(g.teacher_notes||'') }}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium flex flex-col items-center gap-0.5 active:scale-95 transition-transform ${isNoting?'bg-amber-100 text-amber-700':'bg-slate-50 text-slate-600'}`}>
                        <span>📝</span><span>Note</span>
                      </button>
                      <button onClick={() => deleteGroup(g)}
                        className="flex-1 py-2 bg-red-50 text-red-500 rounded-xl text-xs font-medium flex flex-col items-center gap-0.5 active:scale-95 transition-transform">
                        <span>🗑</span><span>ลบ</span>
                      </button>
                    </div>

                    {/* Notes panel */}
                    {isNoting && (
                      <div className="border-t border-slate-100 pt-3 mt-1">
                        <p className="text-xs font-semibold text-slate-600 mb-2">📝 บันทึกของครู</p>
                        <textarea value={notesText} onChange={e=>setNotesText(e.target.value)} rows={3}
                          placeholder="บันทึกข้อมูลเกี่ยวกับกลุ่ม..."
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none mb-2" />
                        <button onClick={() => saveNotes(g.id)} disabled={savingNote}
                          className="w-full py-2 bg-amber-500 text-white text-sm rounded-xl hover:bg-amber-600 disabled:opacity-50 font-medium">
                          {savingNote?'...':'💾 บันทึก'}
                        </button>
                        {g.teacher_notes && <p className="text-xs text-slate-400 mt-2 italic">"{g.teacher_notes}"</p>}
                      </div>
                    )}

                    {/* Scoring panel */}
                    {isScoring && (
                      <div className="border-t border-slate-100 pt-3 mt-1">
                        <p className="text-xs font-semibold text-slate-600 mb-2">⭐ ให้คะแนน</p>
                        <div className="flex gap-2 mb-3">
                          <button onClick={() => setScoreType('group')}
                            className={`flex-1 py-1.5 text-xs rounded-lg border ${scoreType==='group'?'bg-indigo-600 text-white border-indigo-600':'bg-white text-slate-600 border-slate-200'}`}>
                            กลุ่ม
                          </button>
                          <button onClick={() => switchToIndividual(g)}
                            className={`flex-1 py-1.5 text-xs rounded-lg border ${scoreType==='individual'?'bg-indigo-600 text-white border-indigo-600':'bg-white text-slate-600 border-slate-200'}`}>
                            รายบุคคล
                          </button>
                        </div>

                        {scoreType === 'group' ? (
                          <div className="flex gap-2 mb-2">
                            <input type="number" value={scoreVal} onChange={e=>setScoreVal(e.target.value)} placeholder="คะแนน"
                              className="w-24 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                            <input value={scoreNote} onChange={e=>setScoreNote(e.target.value)} placeholder="หมายเหตุ (ไม่บังคับ)"
                              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                          </div>
                        ) : (
                          <div className="space-y-2 mb-2">
                            <div className="grid grid-cols-[1fr_64px_96px] gap-1 text-xs text-slate-400 px-1 mb-1">
                              <span>ชื่อ</span><span className="text-center">คะแนน</span><span>หมายเหตุ</span>
                            </div>
                            {g.sg_group_members?.map(m => (
                              <div key={m.student_id} className="grid grid-cols-[1fr_64px_96px] gap-1 items-center">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                                    {m.sg_students?.full_name?.[0]}
                                  </div>
                                  <span className="text-xs text-slate-700 truncate">{m.sg_students?.full_name?.split(' ')[0]}</span>
                                  {m.student_id === g.leader_id && <span className="text-xs">👑</span>}
                                </div>
                                <input type="number"
                                  value={indivScores[m.student_id]?.score ?? ''}
                                  onChange={e => setIndivSc(prev => ({ ...prev, [m.student_id]: { ...(prev[m.student_id]||{}), score: e.target.value } }))}
                                  placeholder="0"
                                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                                <input
                                  value={indivScores[m.student_id]?.note ?? ''}
                                  onChange={e => setIndivSc(prev => ({ ...prev, [m.student_id]: { ...(prev[m.student_id]||{}), note: e.target.value } }))}
                                  placeholder="หมายเหตุ"
                                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                              </div>
                            ))}
                          </div>
                        )}

                        <button onClick={() => saveScore(g.id, g.sg_group_members)} disabled={savingScore}
                          className="w-full py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-50 font-medium mb-2">
                          {savingScore ? '...' : '⭐ บันทึกคะแนน'}
                        </button>

                        {gScores.length > 0 && (
                          <div className="bg-slate-50 rounded-xl p-2 space-y-1">
                            {gScores.slice(0,5).map(s => (
                              <div key={s.id} className="flex justify-between text-xs text-slate-600">
                                <span>{s.student_id ? (g.sg_group_members?.find(m=>m.student_id===s.student_id)?.sg_students?.full_name?.split(' ')[0]||'?') : 'กลุ่ม'}{s.note?` — ${s.note}`:''}</span>
                                <span className="font-semibold text-indigo-600">+{s.score}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {!loading && !filtered.length && <p className="text-center text-slate-400 py-10 text-sm">ไม่พบกลุ่ม</p>}
            </div>
          </>
        )}

        {/* ── Tab: นักเรียน ── */}
        {tab === 'students' && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <input value={stdSearch} onChange={e=>setStdSearch(e.target.value)}
                placeholder="ค้นหารหัส / ชื่อ..."
                className="flex-1 min-w-[140px] bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <select value={stdCls} onChange={e=>setStdCls(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none min-w-[90px]">
                <option value="all">ทุกห้อง</option>
                {stdClassrooms.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={stdSort} onChange={e=>setStdSort(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none min-w-[120px]">
                <option value="classroom">🏫 ห้อง</option>
                <option value="name">🔤 ชื่อ A-Z</option>
                <option value="code">🔢 รหัส</option>
                <option value="noGroup">◌ ไม่มีกลุ่มก่อน</option>
                <option value="inGroup">✓ มีกลุ่มก่อน</option>
              </select>
            </div>

            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>{filtStudents.length} / {students.length} คน</span>
              <span className="text-emerald-600 font-medium">✓ มีกลุ่ม {inGroupCount}</span>
              <span className="text-slate-400">ยังไม่มีกลุ่ม {students.length - inGroupCount}</span>
            </div>

            {loadingSt && <Spinner />}
            {!loadingSt && !students.length && (
              <div className="text-center py-16">
                <p className="text-4xl mb-2">👤</p>
                <p className="text-slate-400 text-sm">ยังไม่มีรายชื่อนักเรียน</p>
                <p className="text-slate-300 text-xs mt-1">ให้ Admin นำเข้าข้อมูลก่อน</p>
              </div>
            )}

            <div className="space-y-2">
              {sortedStudents.map(st => {
                const activeMembers = st.sg_group_members?.filter(m => m.sg_groups?.status === 'active') || []
                const inGroup = activeMembers.length > 0
                const groupInfo = activeMembers[0]?.sg_groups

                return (
                  <div key={st.id} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 ${inGroup ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {st.full_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{st.full_name}</p>
                      <p className="text-xs text-slate-400">{st.student_code} · {st.classroom}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {inGroup ? (
                        <div>
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">✓ มีกลุ่มแล้ว</span>
                          {groupInfo && (
                            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[120px]">{groupInfo.group_name}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">ยังไม่มีกลุ่ม</span>
                      )}
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

        {/* ── Tab: คำขอแก้ไข ── */}
        {tab === 'requests' && (
          <div className="space-y-3">
            {!requests.length && <p className="text-center text-slate-400 py-10 text-sm">ไม่มีคำขอรออนุมัติ ✓</p>}
            {requests.map(r => (
              <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm border border-amber-200">
                <p className="text-xs text-slate-400 font-medium mb-1">{r.sg_groups?.group_name} · {r.sg_groups?.classroom}</p>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    {r.request_type === 'new_student' ? (
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          👤 ขอเพิ่มนักเรียนใหม่: <span className="font-semibold">{r.payload?.full_name}</span>
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">รหัส {r.payload?.student_code} · ห้อง {r.payload?.classroom}</p>
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-slate-800">
                        {r.request_type==='add'?'➕ เพิ่ม':r.request_type==='remove'?'➖ ถอด':'✏️ เปลี่ยนตำแหน่ง'}{' '}
                        <span className="font-semibold">{r.sg_students?.full_name}</span>
                        {r.request_type==='change_role' && <span className="text-slate-400 font-normal"> → {r.new_role_label}</span>}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">{new Date(r.requested_at).toLocaleString('th-TH')}</p>
                  </div>
                  <Badge status="pending" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approve(r)}
                    className="flex-1 py-2 bg-emerald-500 text-white text-sm rounded-xl hover:bg-emerald-600 font-medium active:scale-95">
                    ✓ อนุมัติ
                  </button>
                  <button onClick={() => reject(r)}
                    className="flex-1 py-2 bg-slate-100 text-slate-700 text-sm rounded-xl hover:bg-red-50 hover:text-red-600 font-medium active:scale-95">
                    ✕ ปฏิเสธ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

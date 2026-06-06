import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { requestSGPush, getSGPushStatus } from '../lib/push'
import { Spinner, Badge, ROLE_PRESETS } from '../components/ui'
import ChatPanel from '../components/ChatPanel'

async function validateMember(targetCode, myClassroom) {
  const { data, error } = await sb.from('sg_students')
    .select('*').eq('student_code', targetCode.trim()).eq('is_active', true).single()
  if (error || !data) return { ok: false, msg: `ไม่พบรหัส "${targetCode}"` }
  if (data.classroom !== myClassroom)
    return { ok: false, msg: `${data.full_name} อยู่ห้อง ${data.classroom} ≠ ห้อง ${myClassroom}` }
  return { ok: true, student: data }
}

function PollCard({ poll, myId, totalMembers, onVote, onClose }) {
  const votes     = poll.sg_poll_votes || []
  const yesCount  = votes.filter(v => v.vote).length
  const totalVoted = votes.length
  const pct       = totalMembers > 0 ? Math.round((yesCount / totalMembers) * 100) : 0
  const threshold = poll.poll_type === 'disband' ? 100 : 51
  const myVote    = votes.find(v => v.student_id === myId)
  const isPassed  = poll.status === 'passed'
  const isFailed  = poll.status === 'failed'

  const typeLabel = { join:'➕ รับเข้า', leave:'➖ ถอดออก', leader:'👑 เลือกหัวหน้า', topic:'📋 ทั่วไป', disband:'💔 ยุบกลุ่ม', change_leader:'🔄 เปลี่ยนหัวหน้า' }[poll.poll_type] || '📋'

  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border ${isPassed?'border-emerald-200':isFailed?'border-red-200':'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-xs text-slate-400">{typeLabel}</span>
          <p className="font-semibold text-slate-800 text-sm">{poll.title}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${isPassed?'bg-emerald-100 text-emerald-700':isFailed?'bg-red-100 text-red-600':'bg-amber-100 text-amber-700'}`}>
          {isPassed?'ผ่าน ✓':isFailed?'ไม่ผ่าน':'กำลังโหวต'}
        </span>
      </div>
      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>เห็นด้วย {yesCount}/{totalMembers} ({pct}%)</span>
          <span>ต้องการ {threshold}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width:`${Math.min(pct,100)}%` }} />
        </div>
        <p className="text-xs text-slate-400 mt-1">โหวตแล้ว {totalVoted}/{totalMembers} คน</p>
      </div>
      {poll.status === 'open' && !myVote && (
        <div className="flex gap-2">
          <button onClick={() => onVote(poll.id, true)} className="flex-1 py-2 bg-emerald-500 text-white text-sm rounded-xl hover:bg-emerald-600 font-medium active:scale-95">👍 เห็นด้วย</button>
          <button onClick={() => onVote(poll.id, false)} className="flex-1 py-2 bg-slate-100 text-slate-700 text-sm rounded-xl hover:bg-red-50 hover:text-red-600 font-medium active:scale-95">👎 ไม่เห็นด้วย</button>
        </div>
      )}
      {poll.status === 'open' && myVote && (
        <p className="text-xs text-center text-slate-500 py-1.5 bg-slate-50 rounded-xl">
          {myVote.vote ? '✅ คุณโหวตเห็นด้วย' : '❌ คุณโหวตไม่เห็นด้วย'}
        </p>
      )}
      {poll.status === 'open' && onClose && (
        <button onClick={() => onClose(poll.id)} className="w-full mt-2 py-1.5 text-xs text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50">ปิดโหวต</button>
      )}
    </div>
  )
}

// ── StudentSuggest — autocomplete สมาชิกที่ยังไม่มีกลุ่มในห้องเดียวกัน ──────
function StudentSuggest({ query, classroom, onSelect, exclude = [] }) {
  const [sug, setSug]   = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const q = query.trim()
    // แสดงเมื่อพิมพ์ตัวเลข หรือพิมพ์ 2+ ตัวอักษร
    if (!q || (!/\d/.test(q) && q.length < 2)) { setSug([]); return }
    const t = setTimeout(async () => {
      setBusy(true)
      const { data } = await sb.from('sg_students')
        .select('id, student_code, full_name, sg_group_members(group_id)')
        .eq('is_active', true)
        .eq('classroom', classroom)
        .or(`student_code.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(12)
      // กรองเฉพาะคนที่ยังไม่มีกลุ่ม และยังไม่ถูกเพิ่มแล้ว
      const ungrouped = (data || []).filter(s =>
        !s.sg_group_members?.length && !exclude.includes(s.id)
      )
      setSug(ungrouped)
      setBusy(false)
    }, 280)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, classroom, exclude.join(',')])

  if (!query.trim()) return null

  return (
    <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-indigo-200 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
      {busy && <p className="text-xs text-slate-400 px-3 py-2.5">🔍 กำลังค้นหา...</p>}
      {!busy && !sug.length && (
        <p className="text-xs text-slate-400 px-3 py-2.5">ไม่พบนักเรียนที่ยังไม่มีกลุ่มในห้อง {classroom}</p>
      )}
      {sug.map(s => (
        <button key={s.id} onMouseDown={e => { e.preventDefault(); onSelect(s) }}
          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-indigo-50 text-left border-b border-slate-50 last:border-0 active:bg-indigo-100 transition-colors">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
            {s.full_name?.[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{s.full_name}</p>
            <p className="text-xs text-slate-400">{s.student_code}</p>
          </div>
        </button>
      ))}
    </div>
  )
}

// ── GroupList ──────────────────────────────────────────────────────────────
function GroupList({ session, onLogout, showToast, settings }) {
  const [groups, setGroups]       = useState([])
  const [loading, setLoad]        = useState(true)
  const [unreadMap, setUnreadMap] = useState({})
  const [clsChat, setClsChat]     = useState(false)
  const [pushStatus, setPushSt]   = useState(() => getSGPushStatus())
  const navigate                  = useNavigate()

  // Auto-register push if already granted; otherwise wait for user to click
  useEffect(() => {
    if (pushStatus === 'granted' && session?.student_code) {
      requestSGPush(sb, session.student_code)
    }
  }, [session, pushStatus])

  const load = useCallback(async () => {
    setLoad(true)
    const { data: memberOf } = await sb.from('sg_group_members').select('group_id').eq('student_id', session.id)
    const ids = memberOf?.map(m => m.group_id) || []
    if (!ids.length) { setGroups([]); setLoad(false); return }
    const { data } = await sb.from('sg_groups')
      .select('*, sg_group_members(role,role_label,sg_students(full_name,student_code))')
      .in('id', ids).eq('status','active').order('created_at',{ascending:false})
    setGroups(data || []); setLoad(false)
  }, [session.id])

  useEffect(() => { load() }, [load])

  // Subscribe to new messages for all groups → show dot badge
  useEffect(() => {
    if (!groups.length) return
    const channels = groups.map(g => {
      const lastRead = localStorage.getItem(`sg_lr_${g.id}`) || '1970-01-01'
      return sb.channel(`gl_${g.id}_${session.id}`)
        .on('postgres_changes', { event:'INSERT', schema:'public', table:'sg_chat_messages', filter:`group_id=eq.${g.id}` },
          p => { if (p.new.sender_id !== session.id && p.new.sent_at > lastRead) setUnreadMap(prev => ({ ...prev, [g.id]: true })) })
        .subscribe()
    })
    return () => channels.forEach(ch => sb.removeChannel(ch))
  }, [groups, session.id])

  const canCreate = settings.registration_open === 'true' &&
    (settings.allow_multi_group === 'true' || !groups.length)

  return (
    <div className="min-h-screen bg-slate-50">
      {clsChat && (
        <ChatPanel classroom={session.classroom} sender={session} onClose={() => setClsChat(false)} />
      )}
      <div className="bg-indigo-600 text-white px-5 pb-6" style={{paddingTop:'max(env(safe-area-inset-top),2.5rem)'}}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-indigo-200 text-sm">สวัสดี 👋</p>
            <h1 className="text-xl font-bold">{session.full_name}</h1>
            <p className="text-indigo-200/80 text-sm">{session.student_code} · {session.classroom}</p>
          </div>
          <div className="flex flex-col gap-1.5 items-end mt-1">
            <button onClick={onLogout} className="text-xs text-indigo-300 hover:text-white border border-indigo-400/50 rounded-xl px-3 py-1.5">ออก</button>
            <button onClick={() => setClsChat(true)}
              className="text-xs text-emerald-300 hover:text-white border border-emerald-400/50 rounded-xl px-3 py-1.5">
              🏫 แชทห้อง {session.classroom}
            </button>
            {pushStatus !== 'granted' && pushStatus !== 'unsupported' && (
              <button onClick={async () => {
                const ok = await requestSGPush(sb, session.student_code)
                setPushSt(ok ? 'granted' : 'denied')
                if (ok) showToast('เปิดการแจ้งเตือนแล้ว 🔔')
              }} className="text-xs text-yellow-300 hover:text-white border border-yellow-400/50 rounded-xl px-3 py-1.5">
                🔔 เปิดการแจ้งเตือน
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-slate-800 text-lg">กลุ่มของฉัน <span className="text-sm font-normal text-slate-400">({groups.length})</span></h2>
          {canCreate ? (
            <button onClick={() => navigate('/student/create')}
              className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 active:scale-95 shadow-sm">
              + สร้างกลุ่ม
            </button>
          ) : (
            <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl">
              {settings.registration_open !== 'true' ? '🔒 ปิดรับสมัคร' : ''}
            </span>
          )}
        </div>

        {loading && <Spinner />}
        {!loading && !groups.length && (
          <div className="text-center py-20 animate-fade-up">
            <p className="text-5xl mb-3">👥</p>
            <p className="text-slate-500 font-medium">ยังไม่มีกลุ่ม</p>
            <p className="text-slate-400 text-sm mt-1">
              {settings.registration_open === 'true' ? 'กดปุ่ม "สร้างกลุ่ม" เพื่อเริ่มต้น' : 'รอครูเปิดรับสมัครกลุ่ม'}
            </p>
          </div>
        )}
        <div className="space-y-3">
          {groups.map(g => {
            const me = g.sg_group_members?.find(m => m.sg_students?.student_code === session.student_code)
            return (
              <div key={g.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 animate-fade-up">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-800">{g.group_name}</h3>
                      {me?.role === 'leader' && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">👑 หัวหน้า</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${g.phase==='open'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>
                        {g.phase==='open'?'✏️ เปิด':'🔒 ล็อก'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{g.sg_group_members?.length} คน · ห้อง {g.classroom}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {g.sg_group_members?.slice(0,5).map(m => (
                        <span key={m.sg_students?.student_code} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {m.sg_students?.full_name?.split(' ')[0]}{m.role==='leader'?' 👑':''}
                        </span>
                      ))}
                      {(g.sg_group_members?.length||0)>5 && <span className="text-xs text-slate-400">+{g.sg_group_members.length-5}</span>}
                    </div>
                  </div>
                  <button onClick={() => {
                      localStorage.setItem(`sg_lr_${g.id}`, new Date().toISOString())
                      setUnreadMap(prev => ({ ...prev, [g.id]: false }))
                      navigate(`/student/group/${g.id}`)
                    }}
                    className="relative p-2.5 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 text-sm font-bold flex-shrink-0">
                    →
                    {unreadMap[g.id] && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── CreateGroup ────────────────────────────────────────────────────────────
function CreateGroup({ session, showToast, settings }) {
  const navigate              = useNavigate()
  const [name, setName]       = useState('')
  const [desc, setDesc]       = useState('')
  const [members, setMembers] = useState([{ ...session, role:'leader', role_label:'หัวหน้ากลุ่ม', isCreator:true }])
  const [code, setCode]       = useState('')
  const [showSug, setShowSug] = useState(false)
  const [checking, setCheck]  = useState(false)
  const [saving, setSave]     = useState(false)
  const minMembers            = parseInt(settings.min_members||'0', 10)
  const maxMembers            = parseInt(settings.max_members||'0', 10)

  const addMember = async () => {
    if (!code.trim()) return
    if (members.find(m => m.student_code === code.trim())) { showToast('เพิ่มนักเรียนคนนี้แล้ว','warn'); return }
    setCheck(true)
    const res = await validateMember(code, session.classroom)
    setCheck(false)
    if (!res.ok) { showToast(res.msg,'error'); return }
    if (settings.allow_multi_group !== 'true') {
      const { data: ex } = await sb.from('sg_group_members').select('id').eq('student_id', res.student.id).limit(1)
      if (ex?.length) { showToast(`${res.student.full_name} อยู่ในกลุ่มอื่นแล้ว`,'error'); return }
    }
    setMembers(p => [...p, { ...res.student, role:'member', role_label:'สมาชิก' }])
    setCode(''); showToast(`เพิ่ม ${res.student.full_name} แล้ว ✓`)
  }

  const create = async () => {
    if (!name.trim()) { showToast('กรุณาตั้งชื่อกลุ่ม','warn'); return }
    if (minMembers > 0 && members.length < minMembers) { showToast(`ต้องมีสมาชิกอย่างน้อย ${minMembers} คน`,'warn'); return }
    if (maxMembers > 0 && members.length > maxMembers) { showToast(`สมาชิกต้องไม่เกิน ${maxMembers} คน`,'warn'); return }
    setSave(true)
    const { data: g, error } = await sb.from('sg_groups')
      .insert({ group_name:name.trim(), description:desc||null, classroom:session.classroom, created_by:session.id, leader_id:session.id, phase:'open' })
      .select().single()
    if (error) { showToast('เกิดข้อผิดพลาด: '+error.message,'error'); setSave(false); return }
    await sb.from('sg_group_members').insert(members.map(m => ({ group_id:g.id, student_id:m.id, role:m.role, role_label:m.role_label })))
    // auto-create initial leader confirmation poll
    await sb.from('sg_polls').insert({
      group_id: g.id,
      title: `เลือกหัวหน้า: ${session.full_name?.split(' ')[0]}`,
      poll_type: 'leader',
      target_student_id: session.id,
      created_by: session.id,
      pass_threshold: 0.501,
    })
    setSave(false); showToast('สร้างกลุ่มสำเร็จ! 🎉 ไปโหวตหาหัวหน้าได้เลย'); navigate('/student')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-indigo-600 text-white px-5 pb-5" style={{paddingTop:'max(env(safe-area-inset-top),2.5rem)'}}>
        <button onClick={() => navigate('/student')} className="text-indigo-200 text-sm mb-2 flex items-center gap-1">← กลับ</button>
        <h1 className="text-xl font-bold">สร้างกลุ่มใหม่</h1>
        <p className="text-indigo-200/70 text-sm">
          ห้อง {session.classroom}
          {minMembers > 0 && ` · อย่างน้อย ${minMembers} คน`}
          {maxMembers > 0 && ` · ไม่เกิน ${maxMembers} คน`}
        </p>
      </div>
      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <label className="block text-sm font-semibold text-slate-700 mb-2">ชื่อกลุ่ม *</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="เช่น กลุ่มโปรเจกต์วิทยาศาสตร์"
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-3" />
          <label className="block text-sm font-semibold text-slate-700 mb-2">คำอธิบาย</label>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2} placeholder="รายละเอียดกลุ่ม..."
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <label className="block text-sm font-semibold text-slate-700 mb-1">เพิ่มสมาชิก</label>
          <p className="text-xs text-slate-400 mb-3">เฉพาะนักเรียนห้อง {session.classroom} · พิมพ์ตัวเลขเพื่อค้นหา</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input value={code} onChange={e=>setCode(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&addMember()}
                onFocus={()=>setShowSug(true)} onBlur={()=>setShowSug(false)}
                placeholder="รหัสนักเรียน หรือพิมพ์เพื่อค้นหา"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              {showSug && (
                <StudentSuggest
                  query={code}
                  classroom={session.classroom}
                  exclude={members.map(m => m.id)}
                  onSelect={s => { setCode(s.student_code); setShowSug(false) }}
                />
              )}
            </div>
            <button onClick={addMember} disabled={checking} className="px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-50">
              {checking?'...':'เพิ่ม'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-3">
            สมาชิก ({members.length} คน)
            {minMembers > 0 && members.length < minMembers && <span className="ml-2 text-xs text-red-500">ต้องเพิ่มอีก {minMembers-members.length} คน</span>}
            {maxMembers > 0 && members.length > maxMembers && <span className="ml-2 text-xs text-red-500">เกินสูงสุด {maxMembers} คน</span>}
          </p>
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center flex-shrink-0">{m.full_name?.[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{m.full_name}</p>
                  <p className="text-xs text-slate-400">{m.student_code}</p>
                </div>
                <select value={m.role}
                  onChange={e => { const p=ROLE_PRESETS.find(r=>r.value===e.target.value); setMembers(prev=>prev.map(x=>x.id===m.id?{...x,role:e.target.value,role_label:p?.label||'สมาชิก'}:x)) }}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
                  {ROLE_PRESETS.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {!m.isCreator && <button onClick={()=>setMembers(p=>p.filter(x=>x.id!==m.id))} className="text-red-400 hover:text-red-600 p-1">✕</button>}
              </div>
            ))}
          </div>
        </div>

        <button onClick={create} disabled={saving || (minMembers > 0 && members.length < minMembers) || (maxMembers > 0 && members.length > maxMembers)}
          className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 disabled:opacity-50 shadow-lg active:scale-95 transition-all">
          {saving ? 'กำลังสร้าง...' : `✓ สร้างกลุ่ม (${members.length} คน)`}
        </button>
      </div>
    </div>
  )
}

// ── GroupDetail ────────────────────────────────────────────────────────────
function GroupDetail({ session, showToast, settings }) {
  const navigate                    = useNavigate()
  const { id: groupId }             = useParams()
  const [group, setGroup]           = useState(null)
  const [notFound, setNotFound]     = useState(false)
  const [members, setMembers]       = useState([])
  const [requests, setReqs]         = useState([])
  const [polls, setPolls]           = useState([])
  const [draws, setDraws]           = useState([])
  const [scores, setScores]         = useState([])
  const [tab, setTab]               = useState('members')
  const [code, setCode]             = useState('')
  const [showSug, setShowSug]       = useState(false)
  const [checking, setCheck]        = useState(false)
  const [chat, setChat]             = useState(false)
  const [privateChat, setPriv]      = useState(false)
  const [unreadChat, setUnreadChat] = useState(0)
  const [unreadPriv, setUnreadPriv] = useState(0)
  const [pollTitle, setPollTitle]   = useState('')
  const [pollType, setPollType]     = useState('topic')
  const [pollTarget, setPollTarget] = useState('')
  const [creatingPoll, setCrePoll]  = useState(false)
  const [drawTitle, setDrawTitle]   = useState('')
  const [drawing, setDrawing]       = useState(false)
  const [lastDraw, setLastDraw]     = useState(null)
  // New student request
  const [newStCode, setNewStCode]   = useState('')
  const [newStName, setNewStName]   = useState('')
  const [showNewSt, setShowNewSt]   = useState(false)
  // Role editing
  const [editRoleId, setEditRoleId] = useState(null)
  const [editRoleVal, setEditRoleVal] = useState('member')

  const load = useCallback(async () => {
    const [{ data:g, error:ge }, { data:m }, { data:r }, { data:p }, { data:d }, { data:sc }] = await Promise.all([
      sb.from('sg_groups').select('*').eq('id', groupId).single(),
      sb.from('sg_group_members').select('*, sg_students(id,full_name,student_code,classroom)').eq('group_id', groupId),
      sb.from('sg_change_requests').select('*, sg_students!sg_change_requests_student_id_fkey(full_name,student_code)')
        .eq('group_id', groupId).order('requested_at',{ascending:false}),
      sb.from('sg_polls').select('*, sg_poll_votes(*)').eq('group_id', groupId).order('created_at',{ascending:false}),
      sb.from('sg_random_draws').select('*').eq('group_id', groupId).order('created_at',{ascending:false}),
      sb.from('sg_group_scores').select('*').eq('group_id', groupId).order('created_at',{ascending:false}),
    ])
    if (ge || !g) { setNotFound(true); return }
    setGroup(g); setMembers(m||[]); setReqs(r||[]); setPolls(p||[]); setDraws(d||[]); setScores(sc||[])
  }, [groupId])

  useEffect(() => { load() }, [load])

  // Realtime badge: เมื่อปิด panel ให้นับข้อความใหม่
  useEffect(() => {
    if (chat) { setUnreadChat(0); return }
    const ch = sb.channel(`chat_badge_${groupId}_${session.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'sg_chat_messages', filter:`group_id=eq.${groupId}` },
        p => { if (p.new.sender_id !== session.id) setUnreadChat(n => n + 1) })
      .subscribe()
    return () => sb.removeChannel(ch)
  }, [groupId, chat, session.id])

  useEffect(() => {
    if (privateChat) { setUnreadPriv(0); return }
    const ch = sb.channel(`priv_badge_${groupId}_${session.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'sg_private_messages', filter:`group_id=eq.${groupId}` },
        p => { if (p.new.sender_code !== session.student_code) setUnreadPriv(n => n + 1) })
      .subscribe()
    return () => sb.removeChannel(ch)
  }, [groupId, privateChat, session.id, session.student_code])

  if (notFound) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-slate-50">
      <p className="text-5xl">😕</p>
      <p className="text-slate-600 font-medium">ไม่พบกลุ่มนี้</p>
      <button onClick={() => navigate('/student')} className="text-indigo-600 text-sm">← กลับหน้าหลัก</button>
    </div>
  )
  if (!group) return <div className="flex justify-center py-20"><Spinner /></div>

  const isOpen   = group.phase === 'open'
  const me       = members.find(m => m.student_id === session.id || m.sg_students?.id === session.id)
  const isLeader = group.leader_id === session.id || me?.role === 'leader'
  const pendingCount  = requests.filter(r => r.status === 'pending').length
  const openPollCount = polls.filter(p => p.status === 'open').length
  const groupScore    = scores.filter(s => !s.student_id).reduce((sum,s) => sum+(s.score||0), 0)

  // ── Member actions ──────────────────────────────────────────────────────
  const doAdd = async () => {
    if (!code.trim()) return
    if (members.find(m => m.sg_students?.student_code === code.trim())) { showToast('เป็นสมาชิกอยู่แล้ว','warn'); return }
    const maxMem = parseInt(settings?.max_members||'0', 10)
    if (maxMem > 0 && members.length >= maxMem) { showToast(`สมาชิกเต็มแล้ว (สูงสุด ${maxMem} คน)`,'warn'); return }
    setCheck(true); const res = await validateMember(code, session.classroom); setCheck(false)
    if (!res.ok) { showToast(res.msg,'error'); return }
    await sb.from('sg_group_members').insert({ group_id:groupId, student_id:res.student.id, role:'member', role_label:'สมาชิก' })
    setCode(''); load(); showToast(`เพิ่ม ${res.student.full_name} แล้ว ✓`)
  }

  const doRemove = async (studentId, name) => {
    if (!window.confirm(`ถอด "${name}" ออก?`)) return
    await sb.from('sg_group_members').delete().eq('group_id',groupId).eq('student_id',studentId)
    load(); showToast(`ถอด ${name} ออกแล้ว`)
  }

  const reqAdd = async () => {
    if (!code.trim()) return
    if (members.find(m => m.sg_students?.student_code === code.trim())) { showToast('เป็นสมาชิกอยู่แล้ว','warn'); return }
    setCheck(true); const res = await validateMember(code, session.classroom); setCheck(false)
    if (!res.ok) { showToast(res.msg,'error'); return }
    await sb.from('sg_change_requests').insert({ group_id:groupId, student_id:res.student.id, request_type:'add', requested_by:session.id })
    setCode(''); load(); showToast(`ส่งคำขอเพิ่ม ${res.student.full_name} — รอครูอนุมัติ`)
  }

  const reqAddNewStudent = async () => {
    if (!newStCode.trim() || !newStName.trim()) { showToast('กรุณากรอกรหัสและชื่อ','error'); return }
    await sb.from('sg_change_requests').insert({
      group_id: groupId,
      student_id: null,
      request_type: 'new_student',
      requested_by: session.id,
      payload: { student_code: newStCode.trim(), full_name: newStName.trim(), classroom: session.classroom }
    })
    setNewStCode(''); setNewStName(''); setShowNewSt(false)
    load(); showToast('ส่งคำขอเพิ่มนักเรียนใหม่ — รอครูอนุมัติ')
  }

  const leaveGroup = async () => {
    if (!window.confirm('ออกจากกลุ่มนี้?')) return
    if (isOpen) {
      if (isLeader) {
        const next = members.find(m => m.student_id !== session.id)
        if (next) {
          await sb.from('sg_group_members').update({ role:'leader', role_label:'หัวหน้ากลุ่ม' }).eq('group_id',groupId).eq('student_id',next.student_id)
          await sb.from('sg_groups').update({ leader_id: next.student_id }).eq('id', groupId)
        }
      }
      await sb.from('sg_group_members').delete().eq('group_id',groupId).eq('student_id',session.id)
      showToast('ออกจากกลุ่มแล้ว'); navigate('/student')
    } else {
      await sb.from('sg_change_requests').insert({ group_id:groupId, student_id:session.id, request_type:'remove', requested_by:session.id })
      showToast('ส่งคำขอออกจากกลุ่ม — รอครูอนุมัติ'); load()
    }
  }

  const editRole = async (m) => {
    const preset = ROLE_PRESETS.find(r => r.value === editRoleVal)
    const roleLabel = preset?.label || 'สมาชิก'
    if (isOpen) {
      await sb.from('sg_group_members').update({ role: editRoleVal, role_label: roleLabel }).eq('group_id', groupId).eq('student_id', m.student_id)
      showToast('เปลี่ยนบทบาทแล้ว ✓')
    } else {
      await sb.from('sg_change_requests').insert({
        group_id: groupId, student_id: m.student_id, request_type: 'change_role',
        new_role: editRoleVal, new_role_label: roleLabel, requested_by: session.id
      })
      showToast('ส่งคำขอเปลี่ยนบทบาท — รอครูอนุมัติ')
    }
    setEditRoleId(null); load()
  }

  const voteToRemove = async (m) => {
    const name = m.sg_students?.full_name?.split(' ')[0] || 'สมาชิก'
    await sb.from('sg_polls').insert({
      group_id: groupId,
      title: `โหวตถอด ${name} ออกจากกลุ่ม`,
      poll_type: 'leave',
      target_student_id: m.student_id,
      created_by: session.id,
      pass_threshold: 0.501,
    })
    showToast(`สร้างโหวต — ไปดูที่แท็บโหวต 🗳️`); load(); setTab('polls')
  }

  const transferLeader = async (studentId, name) => {
    if (!window.confirm(`โอนหัวหน้าให้ ${name}?`)) return
    await sb.from('sg_group_members').update({ role:'leader', role_label:'หัวหน้ากลุ่ม' }).eq('group_id',groupId).eq('student_id',studentId)
    await sb.from('sg_group_members').update({ role:'member', role_label:'สมาชิก' }).eq('group_id',groupId).eq('student_id',session.id)
    await sb.from('sg_groups').update({ leader_id: studentId }).eq('id', groupId)
    showToast(`โอนหัวหน้าให้ ${name} แล้ว 👑`); load()
  }

  // ── Polls ───────────────────────────────────────────────────────────────
  const createPoll = async () => {
    if (!pollTitle.trim()) { showToast('กรุณาตั้งหัวข้อโหวต','warn'); return }
    setCrePoll(true)
    let targetId = null
    if (['join','leave','leader'].includes(pollType) && pollTarget.trim()) {
      const { data } = await sb.from('sg_students').select('id').eq('student_code', pollTarget.trim()).single()
      targetId = data?.id || null
    }
    await sb.from('sg_polls').insert({
      group_id: groupId, title: pollTitle.trim(), poll_type: pollType,
      target_student_id: targetId, created_by: session.id,
      pass_threshold: pollType === 'disband' ? 1.0 : 0.501,
    })
    setPollTitle(''); setPollTarget(''); setCrePoll(false); load(); showToast('สร้างโหวตแล้ว ✓')
  }

  const castVote = async (pollId, vote) => {
    await sb.from('sg_poll_votes').upsert({ poll_id:pollId, student_id:session.id, vote }, { onConflict:'poll_id,student_id' })
    const poll = polls.find(p => p.id === pollId)
    if (poll) {
      const updVotes = [...(poll.sg_poll_votes||[]).filter(v => v.student_id !== session.id), { student_id:session.id, vote }]
      const yesCount = updVotes.filter(v => v.vote).length
      if (updVotes.length >= members.length) {
        const passed = yesCount / members.length >= (poll.pass_threshold || 0.501)
        await sb.from('sg_polls').update({ status: passed?'passed':'failed', closed_at: new Date().toISOString() }).eq('id', pollId)
        if (passed) await handlePollPassed(poll, yesCount)
      }
    }
    load()
  }

  const closePoll = async (pollId) => {
    await sb.from('sg_polls').update({ status:'failed', closed_at: new Date().toISOString() }).eq('id', pollId)
    load(); showToast('ปิดโหวตแล้ว')
  }

  const handlePollPassed = async (poll) => {
    if (poll.poll_type === 'leader' && poll.target_student_id) {
      await sb.from('sg_group_members').update({ role:'leader', role_label:'หัวหน้ากลุ่ม' }).eq('group_id',groupId).eq('student_id',poll.target_student_id)
      if (group.leader_id) await sb.from('sg_group_members').update({ role:'member', role_label:'สมาชิก' }).eq('group_id',groupId).eq('student_id',group.leader_id)
      await sb.from('sg_groups').update({ leader_id: poll.target_student_id }).eq('id', groupId)
      showToast('เปลี่ยนหัวหน้าแล้ว 👑')
    } else if (poll.poll_type === 'change_leader') {
      // Step 1 passed: demote current leader, then auto-create leader polls for all members
      if (group.leader_id) {
        await sb.from('sg_group_members').update({ role:'member', role_label:'สมาชิก' }).eq('group_id',groupId).eq('student_id',group.leader_id)
      }
      await sb.from('sg_groups').update({ leader_id: null }).eq('id', groupId)
      const currentMembers = members.length ? members : (await sb.from('sg_group_members').select('*, sg_students(id,full_name)').eq('group_id',groupId)).data || []
      if (currentMembers.length) {
        await sb.from('sg_polls').insert(currentMembers.map(m => ({
          group_id: groupId,
          title: `เลือก ${(m.sg_students?.full_name||'?').split(' ')[0]} เป็นหัวหน้า`,
          poll_type: 'leader',
          target_student_id: m.student_id,
          created_by: session.id,
          pass_threshold: 0.501,
        })))
      }
      showToast('🗳️ เริ่มโหวตหาหัวหน้าใหม่! ดูในแท็บโหวต')
    } else if (poll.poll_type === 'join' && poll.target_student_id) {
      await sb.from('sg_group_members').insert({ group_id:groupId, student_id:poll.target_student_id, role:'member', role_label:'สมาชิก' })
      showToast('รับสมาชิกใหม่แล้ว ✓')
    } else if (poll.poll_type === 'leave' && poll.target_student_id) {
      await sb.from('sg_group_members').delete().eq('group_id',groupId).eq('student_id',poll.target_student_id)
      showToast('ถอดสมาชิกออกแล้ว')
    } else if (poll.poll_type === 'disband') {
      showToast('💔 ทุกคนโหวตยุบกลุ่ม — ครูจะเห็นและยืนยันการยุบ')
    }
  }

  // ── Random draw ─────────────────────────────────────────────────────────
  const doDraw = async () => {
    if (!drawTitle.trim()) { showToast('กรุณาตั้งชื่อการสุ่ม','warn'); return }
    if (!members.length) return
    setDrawing(true)
    try {
      const picked = members[Math.floor(Math.random() * members.length)]
      const st = picked?.sg_students
      if (!st?.id) { showToast('ไม่พบข้อมูลสมาชิก','error'); setDrawing(false); return }
      const { error } = await sb.from('sg_random_draws').insert({
        group_id:groupId, title:drawTitle.trim(),
        picked_student_id:st.id, picked_name:st.full_name, created_by:session.id
      })
      if (error) { showToast('เกิดข้อผิดพลาด: '+error.message,'error'); setDrawing(false); return }
      setLastDraw({ title:drawTitle.trim(), studentName:st.full_name })
      setDrawTitle('')
      showToast(`🎲 สุ่มได้: ${st.full_name}`)
      load()
    } catch(e) {
      showToast('เกิดข้อผิดพลาด','error')
    }
    setDrawing(false)
  }

  const tabList = [
    { key:'members', label:`สมาชิก (${members.length})` },
    { key:'polls',   label:`โหวต${openPollCount?` (${openPollCount})`:''}` },
    { key:'random',  label:'สุ่ม' },
    { key:'scores',  label:'คะแนน' },
    ...(pendingCount ? [{ key:'requests', label:`คำขอ (${pendingCount})` }] : []),
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {chat        && <ChatPanel groupId={groupId} groupName={group.group_name} sender={session} onClose={() => setChat(false)} />}
      {privateChat && <ChatPanel groupId={groupId} groupName={group.group_name} sender={session} onClose={() => setPriv(false)} isPrivate />}

      <div className="bg-indigo-600 text-white px-5 pb-4" style={{paddingTop:'max(env(safe-area-inset-top),2.5rem)'}}>
        <button onClick={() => navigate('/student')} className="text-indigo-200 text-sm mb-2 flex items-center gap-1">← กลับ</button>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold">{group.group_name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isOpen?'bg-emerald-400/30 text-emerald-100':'bg-white/15 text-indigo-200'}`}>
                {isOpen?'✏️ เปิด':'🔒 ล็อก'}
              </span>
              {isLeader && <span className="text-xs bg-yellow-400/30 text-yellow-100 px-2 py-0.5 rounded-full">👑 หัวหน้า</span>}
            </div>
            <p className="text-indigo-200/70 text-sm mt-0.5">{members.length} คน · ห้อง {group.classroom}</p>
            {groupScore > 0 && <p className="text-indigo-200/80 text-xs mt-0.5">⭐ คะแนนกลุ่ม: {groupScore}</p>}
          </div>
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button onClick={() => { setChat(true); setUnreadChat(0) }}
              className="relative flex items-center gap-1 bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-xl text-xs">
              💬 กลุ่ม
              {unreadChat > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none">{unreadChat > 9 ? '9+' : unreadChat}</span>}
            </button>
            <button onClick={() => { setPriv(true); setUnreadPriv(0) }}
              className="relative flex items-center gap-1 bg-violet-500/30 hover:bg-violet-500/50 px-3 py-1.5 rounded-xl text-xs">
              🔒 ส่วนตัว
              {unreadPriv > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none">{unreadPriv > 9 ? '9+' : unreadPriv}</span>}
            </button>
          </div>
        </div>
      </div>

      <div className="flex bg-white border-b overflow-x-auto sticky top-0 z-10">
        {tabList.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab===t.key?'border-indigo-600 text-indigo-600':'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 max-w-2xl mx-auto">

        {/* ── สมาชิก ── */}
        {tab === 'members' && (
          <div className="space-y-3">
            {me && isLeader && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">
                    {isOpen ? '✏️ เพิ่มสมาชิก (ทันที)' : '🔒 ส่งคำขอเพิ่มสมาชิก (รอครู)'}
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input value={code} onChange={e=>setCode(e.target.value)}
                        onKeyDown={e=>e.key==='Enter'&&(isOpen?doAdd():reqAdd())}
                        onFocus={()=>setShowSug(true)} onBlur={()=>setShowSug(false)}
                        placeholder="รหัส หรือพิมพ์ตัวเลขเพื่อค้นหา"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      {showSug && (
                        <StudentSuggest
                          query={code}
                          classroom={session.classroom}
                          exclude={members.map(m => m.student_id)}
                          onSelect={s => { setCode(s.student_code); setShowSug(false) }}
                        />
                      )}
                    </div>
                    <button onClick={isOpen?doAdd:reqAdd} disabled={checking}
                      className={`px-4 py-2 text-white text-sm rounded-xl disabled:opacity-50 ${isOpen?'bg-indigo-600 hover:bg-indigo-700':'bg-amber-500 hover:bg-amber-600'}`}>
                      {checking?'...':(isOpen?'เพิ่ม':'ขอเพิ่ม')}
                    </button>
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500">👤 ขอเพิ่มนักเรียนใหม่ (ไม่มีในระบบ)</p>
                    <button onClick={() => setShowNewSt(p=>!p)}
                      className="text-xs text-indigo-500 hover:text-indigo-700">
                      {showNewSt ? 'ซ่อน ▲' : 'แสดง ▼'}
                    </button>
                  </div>
                  {showNewSt && (
                    <div className="space-y-2">
                      <input value={newStCode} onChange={e=>setNewStCode(e.target.value)} placeholder="รหัสนักเรียน *"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                      <input value={newStName} onChange={e=>setNewStName(e.target.value)} placeholder="ชื่อ-สกุล *"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                      <button onClick={reqAddNewStudent}
                        className="w-full py-2 bg-amber-500 text-white text-sm rounded-xl hover:bg-amber-600 font-medium">
                        ส่งคำขอ — รอครูอนุมัติ
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {members.map(m => {
              const isMe         = m.sg_students?.id === session.id
              const isMemberLead = m.student_id === group.leader_id
              return (
                <div key={m.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center flex-shrink-0">{m.sg_students?.full_name?.[0]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-slate-800 text-sm">{m.sg_students?.full_name}</p>
                        {isMe && <span className="text-xs text-indigo-500">(คุณ)</span>}
                      </div>
                      <p className="text-xs text-slate-400">{m.sg_students?.student_code}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-lg flex-shrink-0 ${isMemberLead?'bg-indigo-100 text-indigo-700':'bg-slate-100 text-slate-600'}`}>
                      {isMemberLead?'👑 ':''}{m.role_label}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100 flex-wrap">
                    {isMe && !isMemberLead && (
                      <button onClick={leaveGroup} className="text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50">
                        {isOpen?'ออกจากกลุ่ม':'ขอออก'}
                      </button>
                    )}
                    {isLeader && !isMe && (
                      <>
                        <button
                          onClick={() => { setEditRoleId(editRoleId===m.student_id?null:m.student_id); setEditRoleVal(m.role||'member') }}
                          className={`text-xs border rounded-lg px-3 py-1.5 ${editRoleId===m.student_id?'bg-amber-500 text-white border-amber-500':'text-amber-600 border-amber-200 hover:bg-amber-50'}`}>
                          ✏️ บทบาท
                        </button>
                        <button onClick={() => voteToRemove(m)}
                          className="text-xs text-violet-600 border border-violet-200 rounded-lg px-3 py-1.5 hover:bg-violet-50">
                          🗳️ โหวตออก
                        </button>
                        {isOpen ? (
                          <>
                            <button onClick={() => doRemove(m.student_id, m.sg_students?.full_name)} className="text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50">ถอดออก</button>
                            <button onClick={() => transferLeader(m.student_id, m.sg_students?.full_name)} className="text-xs text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50">โอนหัวหน้า</button>
                          </>
                        ) : (
                          <button onClick={() => { sb.from('sg_change_requests').insert({ group_id:groupId, student_id:m.student_id, request_type:'remove', requested_by:session.id }).then(() => { load(); showToast('ส่งคำขอถอด — รอครูอนุมัติ') }) }}
                            className="text-xs text-amber-600 border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-50">ขอถอดออก</button>
                        )}
                      </>
                    )}
                  </div>
                  {/* Role edit panel */}
                  {isLeader && !isMe && editRoleId === m.student_id && (
                    <div className="mt-2 flex gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
                      <select value={editRoleVal} onChange={e=>setEditRoleVal(e.target.value)}
                        className="flex-1 border border-amber-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none">
                        {ROLE_PRESETS.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <button onClick={() => editRole(m)}
                        className="px-3 py-1.5 bg-amber-500 text-white text-xs rounded-lg hover:bg-amber-600 font-medium whitespace-nowrap">
                        {isOpen ? '✓ เปลี่ยน' : '✓ ขอเปลี่ยน'}
                      </button>
                      <button onClick={() => setEditRoleId(null)}
                        className="px-2 py-1.5 bg-white text-slate-500 text-xs rounded-lg border border-slate-200">✕</button>
                    </div>
                  )}
                </div>
              )
            })}

            {me && (
              <div className="flex gap-2 mt-1">
                {group.leader_id && (
                  <button onClick={async () => {
                      const existing = polls.find(p => p.poll_type === 'change_leader' && p.status === 'open')
                      if (existing) { showToast('มีโหวตเปลี่ยนหัวหน้าเปิดอยู่แล้ว','warn'); setTab('polls'); return }
                      await sb.from('sg_polls').insert({
                        group_id: groupId, title: 'เปลี่ยนหัวหน้ากลุ่มไหม?',
                        poll_type: 'change_leader', target_student_id: null,
                        created_by: session.id, pass_threshold: 0.501,
                      })
                      showToast('สร้างโหวตแล้ว — ไปดูที่แท็บโหวต'); load(); setTab('polls')
                    }}
                    className="flex-1 py-2.5 text-sm text-orange-600 border border-orange-200 rounded-2xl hover:bg-orange-50">
                    🔄 เสนอเปลี่ยนหัวหน้า
                  </button>
                )}
                <button onClick={() => setTab('polls')}
                  className="flex-1 py-2.5 text-sm text-indigo-600 border border-indigo-200 rounded-2xl hover:bg-indigo-50">
                  🗳️ โหวต / ยุบกลุ่ม →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── โหวต ── */}
        {tab === 'polls' && (
          <div className="space-y-3">
            {me && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-indigo-100">
                <p className="text-sm font-semibold text-slate-700 mb-3">🗳️ สร้างโหวตใหม่</p>

                {/* ประเภทโหวต */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { v:'topic',         icon:'📋', label:'ทั่วไป',        desc:'ถามความคิดเห็น',  danger:false, show:true },
                    { v:'change_leader', icon:'🔄', label:'เปลี่ยนหัวหน้า',desc:'>50% → เลือกใหม่', danger:false, show:!!group.leader_id },
                    { v:'join',          icon:'➕', label:'รับสมาชิก',     desc:'เชิญคนเข้ากลุ่ม', danger:false, show:isOpen && isLeader },
                    { v:'leave',         icon:'➖', label:'ถอดสมาชิก',     desc:'โหวตให้ออก',       danger:false, show:isOpen && isLeader },
                    { v:'leader',        icon:'👑', label:'เลือกหัวหน้า',  desc:'เสนอชื่อ',          danger:false, show:isLeader },
                    { v:'disband',       icon:'💔', label:'ยุบกลุ่ม',      desc:'ต้องการ 100%',     danger:true,  show:true },
                  ].filter(t => t.show).map(t => (
                    <button key={t.v} onClick={() => setPollType(t.v)}
                      className={`p-2 rounded-xl border text-left transition-all ${
                        pollType === t.v
                          ? t.danger ? 'bg-red-500 text-white border-red-500' : 'bg-indigo-600 text-white border-indigo-600'
                          : t.danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                      <p className="text-base leading-none mb-0.5">{t.icon}</p>
                      <p className="text-xs font-semibold leading-tight">{t.label}</p>
                      <p className="text-[10px] opacity-60 leading-tight mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>

                {['join','leave','leader'].includes(pollType) && (
                  <input value={pollTarget} onChange={e=>setPollTarget(e.target.value)} placeholder="รหัสนักเรียนเป้าหมาย"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none mb-3" />
                )}
                {pollType !== 'change_leader' && (
                  <input value={pollTitle} onChange={e=>setPollTitle(e.target.value)} placeholder="ตั้งชื่อโหวต..."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none mb-3" />
                )}
                {pollType === 'change_leader' && (
                  <p className="text-xs text-indigo-600 bg-indigo-50 rounded-xl px-3 py-2 mb-3">
                    🔄 ถ้า &gt;50% เห็นด้วย → ระบบจะสร้างโหวตเลือกหัวหน้าใหม่ให้อัตโนมัติ
                  </p>
                )}
                {pollType === 'disband' && (
                  <p className="text-xs text-red-500 mb-2 text-center">⚠️ ต้องการเสียงเห็นด้วย 100% จากทุกคนในกลุ่ม</p>
                )}

                <button onClick={async () => {
                    if (pollType !== 'change_leader' && !pollTitle.trim()) { showToast('กรุณาตั้งชื่อโหวต','warn'); return }
                    setCrePoll(true)
                    const title = pollType === 'change_leader' ? 'เปลี่ยนหัวหน้ากลุ่มไหม?' : pollTitle.trim()
                    let targetId = null
                    if (['join','leave','leader'].includes(pollType) && pollTarget.trim()) {
                      const { data } = await sb.from('sg_students').select('id').eq('student_code', pollTarget.trim()).single()
                      targetId = data?.id || null
                    }
                    await sb.from('sg_polls').insert({
                      group_id: groupId, title, poll_type: pollType,
                      target_student_id: targetId, created_by: session.id,
                      pass_threshold: pollType === 'disband' ? 1.0 : 0.501,
                    })
                    setPollTitle(''); setPollTarget(''); setCrePoll(false); load(); showToast('สร้างโหวตแล้ว ✓')
                  }} disabled={creatingPoll}
                  className={`w-full py-2.5 text-white text-sm rounded-xl disabled:opacity-50 font-medium ${
                    pollType === 'disband' ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}>
                  {creatingPoll ? '...' : '✓ สร้างโหวต'}
                </button>
              </div>
            )}
            {!polls.length && <p className="text-center text-slate-400 py-10 text-sm">ยังไม่มีโหวต</p>}
            {polls.map(poll => (
              <PollCard key={poll.id} poll={poll} myId={session.id} totalMembers={members.length}
                onVote={castVote} onClose={isLeader && poll.status==='open' ? closePoll : null} />
            ))}
          </div>
        )}

        {/* ── สุ่ม ── */}
        {tab === 'random' && (
          <div className="space-y-3">
            {me && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-indigo-100">
                <p className="text-sm font-semibold text-slate-700 mb-3">🎲 สุ่มสมาชิก</p>
                <input value={drawTitle} onChange={e=>setDrawTitle(e.target.value)} placeholder="หัวข้อ เช่น ใครนำเสนองาน"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none mb-3" />
                <button onClick={doDraw} disabled={drawing}
                  className="w-full py-2.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-50 font-medium active:scale-95 transition-all">
                  {drawing?'🎲 กำลังสุ่ม...':'🎲 สุ่มเลย!'}
                </button>
              </div>
            )}
            {lastDraw && (
              <div className="bg-indigo-50 border-2 border-indigo-300 rounded-2xl p-5 text-center animate-fade-up">
                <p className="text-xs text-indigo-500 mb-1">{lastDraw.title}</p>
                <p className="text-3xl font-bold text-indigo-700">{lastDraw.studentName}</p>
                <p className="text-xs text-indigo-400 mt-1">ผลสุ่มล่าสุด</p>
              </div>
            )}
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-2">ประวัติการสุ่ม</p>
            {!draws.length && <p className="text-center text-slate-400 py-6 text-sm">ยังไม่มีการสุ่ม</p>}
            {draws.map(d => (
              <div key={d.id} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">{d.title}</p>
                  <p className="font-semibold text-slate-800 text-sm">{d.picked_name}</p>
                </div>
                <p className="text-xs text-slate-400">{new Date(d.created_at).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'})}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── คะแนน ── */}
        {tab === 'scores' && (
          <div className="space-y-3">
            {scores.filter(s=>!s.student_id).length > 0 && (
              <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-200">
                <p className="text-xs font-semibold text-indigo-600 mb-2">⭐ คะแนนกลุ่มรวม</p>
                {scores.filter(s=>!s.student_id).map(s => (
                  <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-indigo-100 last:border-0">
                    <div><p className="text-sm font-semibold text-slate-800">{s.score} คะแนน</p>{s.note&&<p className="text-xs text-slate-500">{s.note}</p>}</div>
                    <p className="text-xs text-slate-400">{s.created_by}</p>
                  </div>
                ))}
              </div>
            )}
            {members.map(m => {
              const ms = scores.filter(s => s.student_id === m.student_id)
              if (!ms.length) return null
              const total = ms.reduce((sum,s) => sum+(s.score||0), 0)
              return (
                <div key={m.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                  <div className="flex justify-between mb-2">
                    <p className="font-medium text-slate-800 text-sm">{m.sg_students?.full_name}</p>
                    <p className="text-sm font-bold text-indigo-600">{total} คะแนน</p>
                  </div>
                  {ms.map(s => (
                    <div key={s.id} className="flex justify-between text-xs text-slate-500 py-1 border-t border-slate-50">
                      <span>{s.note||'คะแนน'}</span><span className="font-medium text-slate-700">+{s.score}</span>
                    </div>
                  ))}
                </div>
              )
            })}
            {!scores.length && (
              <div className="text-center py-16">
                <p className="text-4xl mb-2">📊</p>
                <p className="text-slate-400 text-sm">ยังไม่มีคะแนน</p>
                <p className="text-slate-300 text-xs mt-1">ครูจะเป็นผู้ให้คะแนน</p>
              </div>
            )}
          </div>
        )}

        {/* ── คำขอ ── */}
        {tab === 'requests' && (
          <div className="space-y-2">
            {!requests.length && <p className="text-center text-slate-400 py-10 text-sm">ไม่มีคำขอ</p>}
            {requests.map(r => (
              <div key={r.id} className={`bg-white rounded-2xl p-4 shadow-sm border ${r.status==='pending'?'border-amber-200':'border-slate-100 opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {r.request_type === 'new_student'
                        ? `👤 ขอเพิ่มนักเรียนใหม่: ${r.payload?.full_name} (${r.payload?.student_code})`
                        : `${r.request_type==='add'?'➕':r.request_type==='remove'?'➖':'✏️'} ${r.sg_students?.full_name}`
                      }
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{new Date(r.requested_at).toLocaleString('th-TH')}</p>
                  </div>
                  <Badge status={r.status} />
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

export default function StudentApp({ session, onLogout, showToast }) {
  const [settings, setSettings] = useState({ registration_open:'false', allow_multi_group:'false', min_members:'0', max_members:'0' })

  useEffect(() => {
    sb.from('sg_settings').select('key,value').in('key',['registration_open','allow_multi_group','min_members','max_members'])
      .then(({ data }) => { const s={}; data?.forEach(r=>{ s[r.key]=r.value }); setSettings(p=>({...p,...s})) })
  }, [])

  return (
    <Routes>
      <Route index         element={<GroupList   session={session} onLogout={onLogout} showToast={showToast} settings={settings} />} />
      <Route path="create" element={<CreateGroup session={session} showToast={showToast} settings={settings} />} />
      <Route path="group/:id" element={<GroupDetail session={session} showToast={showToast} settings={settings} />} />
    </Routes>
  )
}

import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { fmtTime } from './ui'

export default function ChatPanel({ groupId, groupName, sender, onClose, isPrivate = false, classroom = null }) {
  const [msgs, setMsgs]   = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoad]= useState(true)
  const bottomRef         = useRef(null)

  const isClassroom = !!classroom
  const TABLE = isClassroom ? 'sg_classroom_messages'
              : isPrivate   ? 'sg_private_messages'
              :               'sg_chat_messages'

  useEffect(() => {
    let mounted = true
    const query = sb.from(TABLE).select('*').order('sent_at', { ascending: true }).limit(150)
    const filtered = isClassroom ? query.eq('classroom', classroom) : query.eq('group_id', groupId)
    filtered.then(({ data }) => { if (mounted) { setMsgs(data || []); setLoad(false) } })

    const realtimeFilter = isClassroom
      ? `classroom=eq.${classroom}`
      : `group_id=eq.${groupId}`
    const ch = sb.channel(`${isClassroom ? 'cls' : isPrivate ? 'priv' : 'chat'}_${classroom || groupId}_${Date.now()}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:TABLE, filter:realtimeFilter },
        payload => { if (mounted) setMsgs(prev => [...prev, payload.new]) })
      .subscribe()

    return () => { mounted = false; sb.removeChannel(ch) }
  }, [groupId, classroom, isPrivate, isClassroom, TABLE])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const myId = isClassroom
    ? (sender.student_code || sender.id)
    : isPrivate
      ? sender.student_code
      : (sender.type === 'student' ? sender.student_code : sender.id)

  const send = async () => {
    if (!input.trim()) return
    const msg = input.trim(); setInput('')
    if (isClassroom) {
      await sb.from(TABLE).insert({
        classroom,
        sender_id:   sender.type === 'student' ? sender.id : null,
        sender_code: sender.student_code || sender.id,
        sender_name: sender.full_name || sender.name,
        sender_type: sender.type === 'teacher' ? 'teacher' : 'student',
        message:     msg,
      })
    } else if (isPrivate) {
      await sb.from(TABLE).insert({
        group_id:    groupId,
        sender_code: sender.student_code,
        sender_name: sender.full_name,
        message:     msg,
      })
    } else {
      await sb.from(TABLE).insert({
        group_id:    groupId,
        sender_type: sender.type === 'admin' ? 'teacher' : sender.type,
        sender_id:   myId,
        sender_name: sender.type === 'student' ? sender.full_name : sender.name,
        message:     msg,
      })
    }
  }

  const accent = isClassroom ? 'emerald' : isPrivate ? 'violet' : 'indigo'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{ height: '88vh', maxHeight: 620 }}>

        {/* Header */}
        <div className={`flex items-center gap-3 px-5 py-4 text-white flex-shrink-0
          ${isClassroom ? 'bg-emerald-600' : isPrivate ? 'bg-violet-600' : 'bg-indigo-600'}`}>
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center font-bold text-sm">
            {isClassroom ? '🏫' : isPrivate ? '🔒' : groupName?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">
              {isClassroom ? `แชทห้อง ${classroom}` : groupName}
            </p>
            <p className={`text-xs ${isClassroom ? 'text-emerald-200' : isPrivate ? 'text-violet-200' : 'text-indigo-200'}`}>
              {isClassroom ? '🏫 แชทกับเพื่อนทั้งห้อง · Realtime'
               : isPrivate ? '🔒 แชทส่วนตัว · ครูไม่เห็น'
               : '💬 แชทกลุ่ม · Realtime'}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
          {loading && (
            <div className="flex justify-center pt-8">
              <div className="w-6 h-6 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          )}
          {!loading && msgs.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-10">
              {isClassroom ? '🏫 เริ่มแชทกับเพื่อนทั้งห้องได้เลย'
               : isPrivate ? '🔒 เริ่มแชทส่วนตัวของกลุ่มได้เลย'
               : 'ยังไม่มีข้อความ 💬'}
            </p>
          )}
          {msgs.map(m => {
            const senderId  = (isPrivate || isClassroom) ? m.sender_code : m.sender_id
            const isMe      = senderId === myId
            const isTeacher = !isPrivate && m.sender_type === 'teacher'
            return (
              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%]">
                  {!isMe && (
                    <p className="text-xs text-slate-500 mb-1 px-1">
                      {m.sender_name}
                      {isTeacher && <span className="ml-1 font-semibold text-amber-600">· ครู</span>}
                    </p>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed
                    ${isMe
                      ? isClassroom ? 'bg-emerald-600 text-white rounded-br-sm'
                        : isPrivate ? 'bg-violet-600 text-white rounded-br-sm'
                        :             'bg-indigo-600 text-white rounded-br-sm'
                      : isTeacher
                        ? 'bg-amber-50 text-slate-800 border border-amber-200 rounded-bl-sm'
                        : 'bg-white text-slate-800 shadow-sm rounded-bl-sm'}`}>
                    {m.message}
                  </div>
                  <p className={`text-xs text-slate-400 mt-0.5 px-1 ${isMe ? 'text-right' : ''}`}>
                    {fmtTime(m.sent_at)}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2 p-3 bg-white border-t border-slate-100 flex-shrink-0">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder={isClassroom ? '🏫 แชททั้งห้อง...' : isPrivate ? '🔒 แชทส่วนตัว...' : '💬 พิมพ์ข้อความ...'}
            className={`flex-1 bg-slate-100 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2
              ${isClassroom ? 'focus:ring-emerald-400' : isPrivate ? 'focus:ring-violet-400' : 'focus:ring-indigo-400'}`} />
          <button onClick={send}
            className={`w-10 h-10 text-white rounded-2xl flex items-center justify-center active:scale-90 transition-all flex-shrink-0
              ${isClassroom ? 'bg-emerald-600 hover:bg-emerald-700' : isPrivate ? 'bg-violet-600 hover:bg-violet-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
            <svg className="w-5 h-5 rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

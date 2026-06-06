import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import LoginPage    from './pages/LoginPage'
import StudentApp   from './pages/StudentApp'
import TeacherApp   from './pages/TeacherApp'
import AdminApp     from './pages/AdminApp'
import Toast        from './components/Toast'

function useSession() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sg_session') || 'null') }
    catch { return null }
  })
  const login  = (data) => { localStorage.setItem('sg_session', JSON.stringify(data)); setSession(data) }
  const logout = ()     => { localStorage.removeItem('sg_session'); setSession(null) }
  return { session, login, logout }
}

export default function App() {
  const { session, login, logout } = useSession()
  const [toast, setToast] = useState(null)
  const showToast = (msg, type = 'success') => setToast({ msg, type, key: Date.now() })

  const sharedProps = { session, onLogout: logout, showToast }

  return (
    <>
      {toast && (
        <Toast key={toast.key} msg={toast.msg} type={toast.type}
          onClose={() => setToast(null)} />
      )}
      <Routes>
        {/* Public login routes — redirect to correct dashboard if already logged in */}
        <Route path="/" element={
          !session ? <LoginPage mode="student" onLogin={login} /> :
          session.type === 'teacher' ? <Navigate to="/teacher/dashboard" /> :
          session.type === 'admin'   ? <Navigate to="/admin/dashboard" />   :
          <Navigate to="/student" />
        } />
        <Route path="/teacher" element={
          session?.type === 'teacher' ? <Navigate to="/teacher/dashboard" replace /> :
          <LoginPage mode="teacher" onLogin={login} />
        } />
        <Route path="/admin" element={
          session?.type === 'admin' ? <Navigate to="/admin/dashboard" replace /> :
          <LoginPage mode="admin" onLogin={login} />
        } />

        {/* Protected routes — ถ้า session ไม่ใช่ student ให้เห็น login ตรงนี้เลย ไม่ bounce ไปหน้าครู */}
        <Route path="/student/*"         element={session?.type === 'student' ? <StudentApp {...sharedProps} /> : <LoginPage mode="student" onLogin={login} />} />
        <Route path="/teacher/dashboard" element={session?.type === 'teacher' ? <TeacherApp {...sharedProps} /> : <Navigate to="/teacher" replace />} />
        <Route path="/admin/dashboard"   element={session?.type === 'admin'   ? <AdminApp   {...sharedProps} /> : <Navigate to="/admin" replace />} />

        <Route path="*" element={
          !session ? <Navigate to="/" replace /> :
          session.type === 'teacher' ? <Navigate to="/teacher/dashboard" replace /> :
          session.type === 'admin'   ? <Navigate to="/admin/dashboard" replace />   :
          <Navigate to="/student" replace />
        } />
      </Routes>
    </>
  )
}

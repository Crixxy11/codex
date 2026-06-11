import { useEffect } from 'react'
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useSettings, useT } from './stores/settings'
import { useToasts } from './stores/toast'
import LibraryPage from './pages/LibraryPage'
import NotesPage from './pages/NotesPage'
import StatsPage from './pages/StatsPage'
import SettingsPage from './pages/SettingsPage'
import ReaderPage from './reader/ReaderPage'
import { IconLibrary, IconQuote, IconChart, IconGear } from './components/Icons'

function Shell() {
  const t = useT()
  const location = useLocation()
  const inReader = location.pathname.startsWith('/read/')

  return (
    <>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/read/:id" element={<ReaderPage />} />
      </Routes>

      {!inReader && (
        <nav className="tabbar">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            <IconLibrary />
            {t('nav.library')}
          </NavLink>
          <NavLink to="/notes" className={({ isActive }) => (isActive ? 'active' : '')}>
            <IconQuote />
            {t('nav.notes')}
          </NavLink>
          <NavLink to="/stats" className={({ isActive }) => (isActive ? 'active' : '')}>
            <IconChart />
            {t('nav.stats')}
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
            <IconGear />
            {t('nav.settings')}
          </NavLink>
        </nav>
      )}

      <Toasts />
    </>
  )
}

function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  if (toasts.length === 0) return null
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'celebrate' ? 'celebrate-toast' : ''}`}>
          {t.kind === 'celebrate' ? '✦ ' : ''}
          {t.text}
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const theme = useSettings((s) => s.theme)

  useEffect(() => {
    // Pedir almacenamiento persistente: reduce el riesgo de que el
    // navegador purgue IndexedDB (libros, subrayados) bajo presión.
    void navigator.storage?.persist?.()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    if (meta && bg) meta.setAttribute('content', bg)
  }, [theme])

  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}

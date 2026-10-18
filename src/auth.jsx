import { useCallback, useEffect, useRef, useState } from 'react'
import { authMe, authLogin, authRegister, fetchUserData, pushUserData, updateProfile, getToken, setToken } from './api'
import { applyTheme, commitTheme, loadTheme, sameTheme, DEFAULT_THEME } from './theme'

const OWNER_KEY = 'jelanwha-owner'

// Tema akun dipakai di perangkat ini; kalau akun belum punya tema tapi perangkat sudah, tema perangkat dikirim ke akun.
function adoptTheme(u) {
  if (u?.theme) commitTheme(u.theme)
  else { const local = loadTheme(); if (!sameTheme(local, DEFAULT_THEME)) updateProfile({ theme: local }).catch(() => {}) }
}
const bid = x => x?.manga_id || x?.id

// Gabungkan data di perangkat dengan data di akun (tidak ada yang hilang).
export function mergeData(local = {}, remote = {}) {
  const rb = remote.bookmarks || [], seen = new Set(rb.map(bid))
  const bookmarks = [...(local.bookmarks || []).filter(x => bid(x) && !seen.has(bid(x))), ...rb].slice(0, 500)
  const map = new Map()
  ;[...(remote.history || []), ...(local.history || [])].forEach(h => {
    if (!h?.id) return
    const old = map.get(h.id)
    if (!old) map.set(h.id, h)
    else if ((h.at || 0) >= (old.at || 0)) map.set(h.id, { ...old, ...h })
    else map.set(h.id, { ...h, ...old })
  })
  const history = [...map.values()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 100)
  const read = {}
  for (const src of [remote.read || {}, local.read || {}]) {
    for (const [k, v] of Object.entries(src)) read[k] = [...new Set([...(read[k] || []), ...v.map(String)])]
  }
  return { bookmarks, history, read }
}

// Status login + sinkronisasi otomatis bookmark/riwayat/chapter terbaca ke akun.
export function useAccount({ data, apply, clear }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(!getToken())
  const [modal, setModal] = useState(null) // null | 'login' | 'register'
  const [synced, setSynced] = useState(false)
  const dataRef = useRef(data); dataRef.current = data
  const applyRef = useRef(apply); applyRef.current = apply
  const clearRef = useRef(clear); clearRef.current = clear

  const syncDown = useCallback(async u => {
    let owner = ''
    try { owner = localStorage.getItem(OWNER_KEY) || '' } catch {}
    const foreign = owner && owner !== u.id // data lokal milik akun lain → jangan dicampur
    const remote = await fetchUserData()
    applyRef.current(mergeData(foreign ? {} : dataRef.current, remote))
    try { localStorage.setItem(OWNER_KEY, u.id) } catch {}
    setSynced(true)
  }, [])

  useEffect(() => {
    if (!getToken()) return
    let alive = true
    authMe()
      .then(async r => { if (!alive) return; setUser(r.user); adoptTheme(r.user); try { await syncDown(r.user) } catch {} })
      .catch(e => { if (e.status === 401) setToken('') })
      .finally(() => alive && setReady(true))
    return () => { alive = false }
  }, [])

  const { bookmarks, history, read } = data
  useEffect(() => {
    if (!user || !synced) return
    const t = setTimeout(() => { pushUserData({ bookmarks, history, read }).catch(() => {}) }, 1200)
    return () => clearTimeout(t)
  }, [user, synced, bookmarks, history, read])

  const submit = useCallback(async (mode, form) => {
    const res = mode === 'register' ? await authRegister(form) : await authLogin(form)
    setToken(res.token); setUser(res.user); adoptTheme(res.user)
    try { await syncDown(res.user) } catch {}
    setModal(null)
  }, [syncDown])

  const logout = useCallback(async () => {
    try { if (synced) await pushUserData(dataRef.current) } catch {}
    setToken(''); setUser(null); setSynced(false)
    try { localStorage.removeItem(OWNER_KEY) } catch {}
    clearRef.current()
  }, [synced])

  return { user, setUser, ready, modal, synced, openAuth: (m = 'login') => setModal(m), closeAuth: () => setModal(null), setModal, submit, logout }
}

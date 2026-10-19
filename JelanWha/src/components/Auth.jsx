import React, { useEffect, useRef, useState } from 'react'
import { loginWithGoogleFirebase, firebaseConfigured } from '../firebase'
import { createPortal } from 'react-dom'
import { MoreVertical, LogIn, UserPlus, LogOut, X, Cloud, MessageCircle, Mail, Check, Pencil, Palette } from 'lucide-react'
import Avatar from './Avatar'

export function AuthModal({ onClose, onGoogle }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const signIn = async () => {
    setBusy(true); setError('')
    try { const result = await loginWithGoogleFirebase(); await onGoogle(result) }
    catch (err) { setError(err?.message || 'Login Google melalui Firebase gagal. Coba lagi.') }
    finally { setBusy(false) }
  }

  return createPortal(<div className="auth-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="auth-card" role="dialog" aria-modal="true" aria-label="Masuk dengan Google">
      <button className="auth-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
      <div className="auth-brand"><span className="brand-mark">J</span></div>
      <h2>Masuk ke JelanWha</h2>
      <p className="auth-sub">Masuk aman dengan akun Google melalui Firebase. Bookmark, riwayat baca, dan profilmu akan tersimpan.</p>
      {firebaseConfigured
        ? <div className="google-login"><button type="button" className="primary-button" onClick={signIn} disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>{busy ? 'Menghubungkan ke Google…' : 'Lanjutkan dengan Google'}</button></div>
        : <div className="auth-error" role="alert">Firebase belum dikonfigurasi. Isi VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, dan nilai VITE_FIREBASE_* lainnya di file .env.</div>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      <p className="auth-sub">Nama tampilan bisa diubah kapan saja melalui menu akun → Edit profil.</p>
    </div>
  </div>, document.body)
}

// Menu titik tiga di pojok kanan atas
export function AccountMenu({ user, ready, synced, openAuth, openSettings, logout, waLink, mailLink, closeSignal }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  useEffect(() => { setOpen(false) }, [closeSignal])
  useEffect(() => {
    if (!open) return
    const down = e => { if (!root.current?.contains(e.target)) setOpen(false) }
    const key = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key) }
  }, [open])
  const act = fn => () => { setOpen(false); fn() }
  return <div className="acct" ref={root}>
    <button className={`acct-button ${user ? 'has-user' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Menu akun">
      {user ? <Avatar className="acct-avatar" src={user.avatar} name={user.name || user.email} /> : <MoreVertical size={21} />}
    </button>
    {open && <div className="acct-panel" role="menu">
      {user ? <div className="acct-user"><Avatar className="acct-avatar big" src={user.avatar} name={user.name || user.email} /><div><strong>{user.name || 'Pembaca JelanWha'}</strong><span>{user.email}</span><em className={synced ? 'ok' : ''}>{synced ? <><Check size={12} /> Tersinkron ke akun</> : <><Cloud size={12} /> Menyinkronkan…</>}</em></div></div>
        : <div className="acct-guest"><strong>Belum masuk</strong><p>Masuk dengan Google supaya bookmark dan riwayat tersimpan di akunmu.</p>
          <button className="primary-button small" onClick={act(() => openAuth('login'))} disabled={!ready}><LogIn size={14} /> Masuk dengan Google</button></div>}
      <div className="acct-links">
        {user && <button onClick={act(() => openSettings('profil'))}><Pencil size={16} /> Edit profil</button>}
        <button onClick={act(() => openSettings('tampilan'))}><Palette size={16} /> Tampilan &amp; warna</button>
        <a href={waLink} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}><MessageCircle size={16} /> Saluran WhatsApp</a>
        <a href={mailLink} onClick={() => setOpen(false)}><Mail size={16} /> Lapor error / hubungi kami</a>
        {user && <button className="acct-logout" onClick={act(logout)}><LogOut size={16} /> Keluar</button>}
      </div>
    </div>}
  </div>
}

// Ajakan login Google untuk pengguna yang belum masuk
export function GuestPrompt({ openAuth, title = 'Simpan koleksimu ke akun', detail = 'Masuk dengan Google agar bookmark dan riwayat tersimpan di akunmu.' }) {
  return <div className="guest-prompt"><div><strong>{title}</strong><p>{detail}</p></div>
    <div className="guest-actions"><button className="primary-button small" onClick={() => openAuth('login')}><LogIn size={14} /> Masuk dengan Google</button></div></div>
}

export function GuestStrip({ openAuth }) {
  const [hide, setHide] = useState(() => { try { return sessionStorage.getItem('jelanwha-strip') === '1' } catch { return false } })
  if (hide) return null
  return <div className="guest-strip"><UserPlus size={16} /><span>Belum masuk? <button onClick={() => openAuth('login')}>Masuk dengan Google</button> biar bookmark &amp; riwayat tersimpan.</span>
    <button className="strip-x" aria-label="Tutup" onClick={() => { setHide(true); try { sessionStorage.setItem('jelanwha-strip', '1') } catch {} }}><X size={15} /></button></div>
}

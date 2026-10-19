import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, LogIn, UserPlus, LogOut, Eye, EyeOff, X, Cloud, MessageCircle, Mail, Check, Pencil, Palette } from 'lucide-react'
import Avatar from './Avatar'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function AuthModal({ mode, setMode, onClose, onSubmit }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reg = mode === 'register'
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [])
  useEffect(() => { setError('') }, [mode])
  const submit = async e => {
    e.preventDefault()
    if (busy) return
    const em = email.trim()
    if (!EMAIL_RE.test(em)) return setError('Masukkan email yang valid, contoh: nama@gmail.com')
    if (!password) return setError('Kata sandi belum diisi.')
    if (reg && password.length < 8) return setError('Kata sandi minimal 8 karakter.')
    setBusy(true); setError('')
    try { await onSubmit(mode, { email: em, password, name: name.trim() }) }
    catch (err) { setError(err.message || 'Terjadi kesalahan. Coba lagi.') }
    finally { setBusy(false) }
  }
  return createPortal(<div className="auth-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="auth-card" role="dialog" aria-modal="true" aria-label={reg ? 'Buat akun' : 'Masuk'}>
      <button className="auth-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
      <div className="auth-brand"><span className="brand-mark">J</span></div>
      <h2>{reg ? 'Buat akun baru' : 'Masuk ke JelanWha'}</h2>
      <p className="auth-sub">{reg ? 'Daftar pakai emailmu supaya bookmark, riwayat, dan chapter yang sudah dibaca tersimpan di semua perangkat.' : 'Masuk untuk menyinkronkan bookmark dan riwayat bacamu.'}</p>
      <div className="auth-tabs" role="tablist">
        <button role="tab" aria-selected={!reg} className={!reg ? 'on' : ''} onClick={() => setMode('login')} type="button">Masuk</button>
        <button role="tab" aria-selected={reg} className={reg ? 'on' : ''} onClick={() => setMode('register')} type="button">Buat akun</button>
      </div>
      <form onSubmit={submit} noValidate>
        {reg && <label className="auth-field"><span>Nama panggilan <em>(opsional)</em></span><input value={name} onChange={e => setName(e.target.value)} maxLength={40} autoComplete="nickname" placeholder="Mis. Budi" /></label>}
        <label className="auth-field"><span>Email</span><input type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="nama@gmail.com" autoFocus /></label>
        <label className="auth-field"><span>Kata sandi</span>
          <div className="auth-pass"><input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete={reg ? 'new-password' : 'current-password'} placeholder={reg ? 'Minimal 8 karakter' : 'Kata sandi'} />
            <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        </label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? 'Memproses…' : reg ? <>Buat akun <UserPlus size={16} /></> : <>Masuk <LogIn size={16} /></>}</button>
      </form>
      <p className="auth-switch">{reg ? <>Sudah punya akun? <button type="button" onClick={() => setMode('login')}>Masuk</button></> : <>Belum punya akun? <button type="button" onClick={() => setMode('register')}>Buat akun pakai emailmu</button></>}</p>
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
        : <div className="acct-guest"><strong>Belum masuk</strong><p>Buat akun pakai emailmu supaya bookmark & riwayat tidak hilang dan bisa dibuka di perangkat lain.</p>
          <button className="primary-button small" onClick={act(() => openAuth('register'))} disabled={!ready}><UserPlus size={14} /> Buat akun</button>
          <button className="outline-button small" onClick={act(() => openAuth('login'))} disabled={!ready}><LogIn size={14} /> Masuk</button></div>}
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

// Ajakan membuat akun untuk yang belum masuk
export function GuestPrompt({ openAuth, title = 'Simpan koleksimu ke akun', detail = 'Buat akun pakai emailmu agar bookmark dan riwayat tidak hilang, dan bisa dibuka di HP atau perangkat lain.' }) {
  return <div className="guest-prompt"><div><strong>{title}</strong><p>{detail}</p></div>
    <div className="guest-actions"><button className="primary-button small" onClick={() => openAuth('register')}><UserPlus size={14} /> Buat akun</button><button className="outline-button small" onClick={() => openAuth('login')}>Masuk</button></div></div>
}

export function GuestStrip({ openAuth }) {
  const [hide, setHide] = useState(() => { try { return sessionStorage.getItem('jelanwha-strip') === '1' } catch { return false } })
  if (hide) return null
  return <div className="guest-strip"><UserPlus size={16} /><span>Belum punya akun? <button onClick={() => openAuth('register')}>Buat akun pakai emailmu</button> biar bookmark &amp; riwayat tersimpan.</span>
    <button className="strip-x" aria-label="Tutup" onClick={() => { setHide(true); try { sessionStorage.setItem('jelanwha-strip', '1') } catch {} }}><X size={15} /></button></div>
}

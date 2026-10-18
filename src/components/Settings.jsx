import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Camera, Trash2, Check, RotateCcw, Loader2, LogIn, ZoomIn } from 'lucide-react'
import { updateProfile, uploadAvatar, removeAvatar } from '../api'
import { saveFirestoreProfile } from '../firebase'
import { ACCENTS, BGS, DEFAULT_THEME, applyTheme, cleanTheme, commitTheme, loadTheme, sameTheme } from '../theme'
import Avatar from './Avatar'

const VIEW = 240          // ukuran area potong (px)
const OUT = 256           // ukuran foto hasil (px)
const PIC_TYPES = /^image\/(jpeg|png|webp|gif)$/

/* ---------- pemotong foto: geser + zoom, hasil persegi 256×256 ---------- */
function Cropper({ src, onCancel, onDone, busy }) {
  const [img, setImg] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [err, setErr] = useState('')
  const drag = useRef(null)
  useEffect(() => {
    const im = new Image()
    im.onload = () => setImg(im)
    im.onerror = () => setErr('Foto tidak bisa dibaca. Coba file lain.')
    im.src = src
  }, [src])
  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1
  const scale = base * zoom
  const dw = img ? img.naturalWidth * scale : 0, dh = img ? img.naturalHeight * scale : 0
  const clamp = (p, z = zoom) => {
    const s = base * z, mx = Math.max(0, (img.naturalWidth * s - VIEW) / 2), my = Math.max(0, (img.naturalHeight * s - VIEW) / 2)
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) }
  }
  const changeZoom = z => { z = Math.min(4, Math.max(1, z)); setZoom(z); setPos(p => clamp(p, z)) }
  const down = e => { drag.current = { x: e.clientX, y: e.clientY, p: pos }; e.currentTarget.setPointerCapture?.(e.pointerId) }
  const move = e => { const d = drag.current; if (d && img) setPos(clamp({ x: d.p.x + e.clientX - d.x, y: d.p.y + e.clientY - d.y })) }
  const up = () => { drag.current = null }
  const done = async () => {
    if (!img) return
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = OUT
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, OUT, OUT)
    const size = VIEW / scale
    const sx = img.naturalWidth / 2 - pos.x / scale - size / 2, sy = img.naturalHeight / 2 - pos.y / scale - size / 2
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, sx, sy, size, size, 0, 0, OUT, OUT)
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9))
    if (!blob) return setErr('Foto tidak bisa diproses.')
    onDone(blob)
  }
  return <div className="st-crop">
    <p className="st-hint">Geser foto untuk mengatur posisi, lalu atur zoom.</p>
    <div className="st-crop-view" style={{ width: VIEW, height: VIEW }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onWheel={e => { if (img) changeZoom(zoom - e.deltaY * 0.002) }}>
      {img && <img src={src} alt="" draggable={false} style={{ width: dw, height: dh, transform: `translate(-50%,-50%) translate(${pos.x}px,${pos.y}px)` }} />}
      {!img && !err && <Loader2 size={22} className="spin st-crop-load" />}
      <span className="st-crop-ring" />
    </div>
    <label className="st-zoom"><ZoomIn size={16} /><input type="range" min="1" max="4" step="0.01" value={zoom} onChange={e => changeZoom(Number(e.target.value))} aria-label="Zoom" /></label>
    {err && <div className="auth-error" role="alert">{err}</div>}
    <div className="st-row">
      <button type="button" className="outline-button" onClick={onCancel} disabled={busy}>Batal</button>
      <button type="button" className="primary-button" onClick={done} disabled={!img || busy}>{busy ? <><Loader2 size={15} className="spin" /> Mengunggah…</> : <><Check size={15} /> Pakai foto</>}</button>
    </div>
  </div>
}

/* ---------- tab Profil ---------- */
function ProfileTab({ user, onUser, openAuth, onClose }) {
  const [name, setName] = useState(user?.name || '')
  const [busy, setBusy] = useState('')     // '' | 'name' | 'photo' | 'remove'
  const [msg, setMsg] = useState(null)     // { ok, text }
  const [crop, setCrop] = useState('')
  const input = useRef(null)
  useEffect(() => () => { if (crop) URL.revokeObjectURL(crop) }, [crop])
  if (!user) return <div className="st-guest">
    <p>Masuk dulu untuk mengatur nama dan foto profilmu. Nama dan foto ini tampil di komentar.</p>
    <div className="guest-actions">
      <button className="primary-button small" onClick={() => { onClose(); openAuth('login') }}><LogIn size={14} /> Masuk dengan Google</button>
    </div>
  </div>

  const pick = e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (!PIC_TYPES.test(f.type)) return setMsg({ ok: false, text: 'Format foto harus JPG, PNG, WEBP, atau GIF.' })
    if (f.size > 15 * 1024 * 1024) return setMsg({ ok: false, text: 'Foto terlalu besar (maksimal 15 MB).' })
    setMsg(null); setCrop(URL.createObjectURL(f))
  }
  const saveName = async e => {
    e.preventDefault()
    const n = name.replace(/\s+/g, ' ').trim()
    if (n && n.length < 2) return setMsg({ ok: false, text: 'Nama minimal 2 karakter.' })
    setBusy('name'); setMsg(null)
    try { await saveFirestoreProfile({ name: n }); const r = await updateProfile({ name: n }); onUser(r.user); setName(r.user.name || ''); setMsg({ ok: true, text: 'Nama tersimpan di profil dan Cloud Firestore.' }) }
    catch (err) { setMsg({ ok: false, text: err.message || 'Gagal menyimpan nama.' }) }
    finally { setBusy('') }
  }
  const savePhoto = async blob => {
    setBusy('photo'); setMsg(null)
    try { const r = await uploadAvatar(blob); onUser(r.user); setCrop(''); setMsg({ ok: true, text: 'Foto profil diperbarui.' }) }
    catch (err) { setMsg({ ok: false, text: err.message || 'Gagal mengunggah foto.' }) }
    finally { setBusy('') }
  }
  const dropPhoto = async () => {
    setBusy('remove'); setMsg(null)
    try { const r = await removeAvatar(); onUser(r.user); setMsg({ ok: true, text: 'Foto dihapus.' }) }
    catch (err) { setMsg({ ok: false, text: err.message || 'Gagal menghapus foto.' }) }
    finally { setBusy('') }
  }

  if (crop) return <Cropper src={crop} busy={busy === 'photo'} onCancel={() => setCrop('')} onDone={savePhoto} />
  const dirty = name.replace(/\s+/g, ' ').trim() !== (user.name || '')
  return <div className="st-profile">
    <div className="st-avatar-row">
      <Avatar className="acct-avatar st-avatar" src={user.avatar} name={user.name || user.email} />
      <div className="st-avatar-actions">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={pick} />
        <button type="button" className="outline-button small" onClick={() => input.current?.click()} disabled={!!busy}><Camera size={14} /> {user.avatar ? 'Ganti foto' : 'Pilih foto'}</button>
        {user.avatar && <button type="button" className="text-button danger" onClick={dropPhoto} disabled={!!busy}>{busy === 'remove' ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />} Hapus foto</button>}
        <span className="st-hint">JPG, PNG, WEBP, atau GIF. Nanti dipotong persegi.</span>
      </div>
    </div>
    <form onSubmit={saveName} noValidate>
      <label className="auth-field"><span>Nama tampilan</span>
        <input value={name} onChange={e => { setName(e.target.value); setMsg(null) }} maxLength={40} autoComplete="nickname" placeholder="Mis. Budi" /></label>
      <p className="st-hint st-hint-tight">Nama ini tampil di komentarmu. Kosongkan untuk memakai nama otomatis. Emailmu tidak pernah ditampilkan.</p>
      <label className="auth-field"><span>Email</span><input value={user.email} readOnly disabled /></label>
      {msg && <div className={msg.ok ? 'st-ok' : 'auth-error'} role={msg.ok ? 'status' : 'alert'}>{msg.ok && <Check size={14} />} {msg.text}</div>}
      <button className="primary-button auth-submit" type="submit" disabled={busy === 'name' || !dirty}>{busy === 'name' ? 'Menyimpan…' : 'Simpan nama'}</button>
    </form>
  </div>
}

/* ---------- tab Tampilan (warna) ---------- */
function ThemeTab({ user, onUser }) {
  const committed = useRef(loadTheme())
  const [draft, setDraft] = useState(committed.current)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { applyTheme(draft) }, [draft])
  useEffect(() => () => { applyTheme(committed.current) }, [])   // keluar tanpa menyimpan → kembali ke warna tersimpan
  const set = patch => { setDraft(d => cleanTheme({ ...d, ...patch })); setMsg(null) }
  const isPreset = ACCENTS.some(a => a.hex === draft.accent)
  const dirty = !sameTheme(draft, committed.current)
  const save = async () => {
    committed.current = commitTheme(draft)
    setMsg({ ok: true, text: user ? 'Warna disimpan di akunmu.' : 'Warna disimpan di perangkat ini.' })
    if (user) {
      setBusy(true)
      try { onUser((await updateProfile({ theme: committed.current })).user) }
      catch { setMsg({ ok: true, text: 'Warna disimpan di perangkat ini, tapi belum tersinkron ke akun.' }) }
      finally { setBusy(false) }
    }
  }
  return <div className="st-theme">
    <div className="st-preview" aria-label="Pratinjau">
      <div className="st-pv-top"><span className="brand-mark">J</span><b>Jelan<span className="brand-accent">Wha</span></b></div>
      <div className="st-pv-row"><button type="button" className="primary-button small" tabIndex={-1}>Tombol</button><button type="button" className="outline-button small" tabIndex={-1}>Outline</button><span className="genre-chip">Action</span></div>
      <div className="st-pv-bar"><span /></div>
    </div>

    <div className="st-label">Warna aksen</div>
    <div className="st-swatches" role="radiogroup" aria-label="Warna aksen">
      {ACCENTS.map(a => <button key={a.hex} type="button" role="radio" aria-checked={draft.accent === a.hex} aria-label={a.name} title={a.name}
        className={`st-swatch ${draft.accent === a.hex ? 'on' : ''}`} style={{ background: a.hex }} onClick={() => set({ accent: a.hex })}>{draft.accent === a.hex && <Check size={16} />}</button>)}
      <label className={`st-swatch st-custom ${!isPreset ? 'on' : ''}`} title="Pilih warna sendiri" style={!isPreset ? { background: draft.accent } : undefined}>
        {!isPreset && <Check size={16} />}
        <input type="color" value={draft.accent} onChange={e => set({ accent: e.target.value })} aria-label="Pilih warna sendiri" />
      </label>
    </div>
    <p className="st-hint st-hint-tight">Pilih salah satu, atau ketuk lingkaran pelangi untuk warna bebas.</p>

    <div className="st-label">Latar</div>
    <div className="st-bgs" role="radiogroup" aria-label="Gaya latar">
      {BGS.map(b => <button key={b.id} type="button" role="radio" aria-checked={draft.bg === b.id} className={`st-bg ${draft.bg === b.id ? 'on' : ''}`} onClick={() => set({ bg: b.id })}>
        <strong>{b.name}</strong><span>{b.hint}</span></button>)}
    </div>

    {msg && <div className="st-ok" role="status"><Check size={14} /> {msg.text}</div>}
    <div className="st-row">
      <button type="button" className="outline-button" onClick={() => set(DEFAULT_THEME)} disabled={sameTheme(draft, DEFAULT_THEME)}><RotateCcw size={14} /> Bawaan</button>
      <button type="button" className="primary-button" onClick={save} disabled={!dirty || busy}>{busy ? 'Menyimpan…' : 'Simpan warna'}</button>
    </div>
  </div>
}

export function SettingsModal({ tab, setTab, user, onClose, onUser, openAuth }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [])
  return createPortal(<div className={`auth-overlay st-overlay ${tab === 'tampilan' ? 'peek' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="auth-card st-card" role="dialog" aria-modal="true" aria-label="Pengaturan">
      <button className="auth-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
      <h2>Pengaturan</h2>
      <div className="auth-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'profil'} className={tab === 'profil' ? 'on' : ''} onClick={() => setTab('profil')} type="button">Profil</button>
        <button role="tab" aria-selected={tab === 'tampilan'} className={tab === 'tampilan' ? 'on' : ''} onClick={() => setTab('tampilan')} type="button">Tampilan</button>
      </div>
      {tab === 'profil' ? <ProfileTab user={user} onUser={onUser} openAuth={openAuth} onClose={onClose} /> : <ThemeTab user={user} onUser={onUser} />}
    </div>
  </div>, document.body)
}

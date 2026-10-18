import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, ImagePlus, Send, SmilePlus, Trash2, Flag, X, ShieldAlert, Ban, LogIn, Loader2 } from 'lucide-react'
import Avatar from './Avatar'
import { getComments, postComment, deleteComment, reportComment, sendReaction, uploadImage } from '../api'

export const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']
const MAX_TEXT = 1000
const ago = ts => {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'baru saja'
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} hari lalu`
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Hitung ulang ringkasan reaksi secara lokal (supaya terasa instan); server tetap jadi sumber kebenaran.
function toggled(sum, emoji) {
  const counts = { ...sum.counts }, prev = sum.mine
  if (prev) { counts[prev] = (counts[prev] || 1) - 1; if (counts[prev] <= 0) delete counts[prev] }
  const next = prev === emoji ? '' : emoji
  if (next) counts[next] = (counts[next] || 0) + 1
  return { counts, mine: next }
}

// Kecilkan gambar besar di browser sebelum diunggah (maks 3 MB di server). GIF dikirim apa adanya.
async function prepareImage(file) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Format gambar harus JPG, PNG, WEBP, atau GIF.')
  if (file.type === 'image/gif') {
    if (file.size > 3 * 1024 * 1024) throw new Error('GIF maksimal 3 MB.')
    return file
  }
  if (file.size <= 700 * 1024) return file
  let bmp
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { throw new Error('Gambar tidak bisa dibaca. Coba file lain.') }
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) throw new Error('Gambar tidak bisa diproses.')
  if (blob.size > 3 * 1024 * 1024) throw new Error('Gambar terlalu besar (maksimal 3 MB).')
  return blob
}

/* ---------- reaksi emoji ---------- */
export function Reactions({ sum, onPick, compact = false, label }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const off = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const key = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', off); document.addEventListener('touchstart', off); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('touchstart', off); document.removeEventListener('keydown', key) }
  }, [open])
  const used = EMOJIS.filter(e => sum.counts[e])
  return <div className={`rx ${compact ? 'compact' : ''}`} ref={box}>
    {label && <span className="rx-label">{label}</span>}
    {(compact ? used : EMOJIS).map(e => <button key={e} type="button" className={`rx-pill ${sum.mine === e ? 'mine' : ''}`} onClick={() => onPick(e)} aria-pressed={sum.mine === e} aria-label={`Reaksi ${e}`}>
      <span>{e}</span>{sum.counts[e] ? <b>{sum.counts[e]}</b> : null}</button>)}
    {compact && <div className="rx-add-wrap">
      <button type="button" className="rx-add" onClick={() => setOpen(v => !v)} aria-label="Tambah reaksi" aria-expanded={open}><SmilePlus size={15} /></button>
      {open && <div className="rx-picker" role="menu">{EMOJIS.map(e => <button key={e} type="button" role="menuitem" className={sum.mine === e ? 'mine' : ''} onClick={() => { onPick(e); setOpen(false) }}>{e}</button>)}</div>}
    </div>}
  </div>
}

function Lightbox({ src, onClose }) {
  useEffect(() => {
    const key = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = prev }
  }, [])
  return createPortal(<div className="cm-lightbox" onClick={onClose}><button className="cm-lightbox-x" onClick={onClose} aria-label="Tutup"><X size={20} /></button><img src={src} alt="Gambar komentar" onClick={e => e.stopPropagation()} /></div>, document.body)
}

/* ---------- satu komentar ---------- */
function CommentItem({ c, onReact, onDelete, onReport, onZoom }) {
  const [confirm, setConfirm] = useState('')   // '' | 'delete' | 'report'
  if (c.hidden) return <li className="cm-item hidden"><ShieldAlert size={16} /><span>Komentar disembunyikan karena dilaporkan sebagai spoiler dan sedang ditinjau admin.</span></li>
  return <li className="cm-item">
    <Avatar className="cm-avatar" src={c.avatar} name={c.name} />
    <div className="cm-main">
      <div className="cm-head"><strong>{c.name}</strong><time>{ago(c.at)}</time></div>
      {c.text && <p className="cm-text">{c.text}</p>}
      {c.image && <button type="button" className="cm-img" onClick={() => onZoom(c.image)} aria-label="Perbesar gambar"><img src={c.image} alt="Gambar dari komentar" loading="lazy" /></button>}
      <div className="cm-foot">
        <Reactions compact sum={{ counts: c.counts, mine: c.mine }} onPick={e => onReact(c.id, e)} />
        <span className="cm-actions">
          {c.own
            ? (confirm === 'delete'
              ? <><span className="cm-ask">Hapus?</span><button type="button" className="danger" onClick={() => onDelete(c.id)}>Ya</button><button type="button" onClick={() => setConfirm('')}>Batal</button></>
              : <button type="button" onClick={() => setConfirm('delete')}><Trash2 size={13} /> Hapus</button>)
            : c.reported
              ? <span className="cm-ask">Sudah dilaporkan</span>
              : (confirm === 'report'
                ? <><span className="cm-ask">Laporkan spoiler?</span><button type="button" className="danger" onClick={() => { setConfirm(''); onReport(c.id) }}>Ya</button><button type="button" onClick={() => setConfirm('')}>Batal</button></>
                : <button type="button" onClick={() => setConfirm('report')}><Flag size={13} /> Laporkan</button>)}
        </span>
      </div>
    </div>
  </li>
}

/* ---------- kotak menulis ---------- */
function Composer({ chapterId, mangaId, onPosted, onBanned }) {
  const [text, setText] = useState('')
  const [file, setFile] = useState(null), [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const input = useRef(null)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const pick = e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) return setError('Format gambar harus JPG, PNG, WEBP, atau GIF.')
    setError(''); setFile(f); setPreview(URL.createObjectURL(f))
  }
  const clearFile = () => { setFile(null); setPreview('') }
  const send = async e => {
    e.preventDefault()
    if (busy) return
    if (!text.trim() && !file) return setError('Tulis komentar atau lampirkan gambar.')
    setBusy(true); setError('')
    try {
      let image = ''
      if (file) image = (await uploadImage(await prepareImage(file))).url
      const item = await postComment(chapterId, { text, image, mangaId })
      setText(''); clearFile()
      onPosted(item)
    } catch (err) {
      if (err.code === 'BANNED') onBanned(err.message)
      else setError(err.message || 'Gagal mengirim komentar.')
    } finally { setBusy(false) }
  }
  return <form className="cm-composer" onSubmit={send}>
    <textarea value={text} onChange={e => setText(e.target.value)} maxLength={MAX_TEXT} rows={3} placeholder="Tulis komentar… (tanpa spoiler ya!)" aria-label="Tulis komentar" />
    {preview && <div className="cm-preview"><img src={preview} alt="Pratinjau gambar" /><button type="button" onClick={clearFile} aria-label="Hapus gambar"><X size={14} /></button></div>}
    {error && <div className="auth-error" role="alert">{error}</div>}
    <div className="cm-composer-bar">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={pick} />
      <button type="button" className="outline-button cm-attach" onClick={() => input.current?.click()} disabled={busy}><ImagePlus size={16} /> Gambar</button>
      <span className="cm-count">{text.length}/{MAX_TEXT}</span>
      <button className="primary-button" type="submit" disabled={busy || (!text.trim() && !file)}>{busy ? <><Loader2 size={15} className="spin" /> Mengirim…</> : <>Kirim <Send size={15} /></>}</button>
    </div>
  </form>
}

/* ---------- bagian komentar satu chapter ---------- */
export default function Comments({ chapterId, mangaId, user, openAuth, appealHref }) {
  const [items, setItems] = useState([]), [chapter, setChapter] = useState({ counts: {}, mine: '' })
  const [page, setPage] = useState(1), [totalPage, setTotalPage] = useState(1), [total, setTotal] = useState(0)
  const [sort, setSort] = useState('new')
  const [loading, setLoading] = useState(true), [more, setMore] = useState(false), [error, setError] = useState('')
  const [banned, setBanned] = useState(!!user?.banned), [banMsg, setBanMsg] = useState('')
  const [zoom, setZoom] = useState(''), [toast, setToast] = useState('')
  const reqId = useRef(0)

  useEffect(() => { setBanned(!!user?.banned) }, [user?.id, user?.banned])
  const flash = m => { setToast(m); setTimeout(() => setToast(''), 2600) }

  const load = useCallback(async (p, replace) => {
    const my = ++reqId.current
    try {
      const r = await getComments(chapterId, { page: p, sort })
      if (my !== reqId.current) return
      setItems(list => replace ? r.items : [...list, ...r.items.filter(x => !list.some(y => y.id === x.id))])
      setChapter(r.chapter); setPage(r.page); setTotalPage(r.totalPage); setTotal(r.total)
      if (r.me?.banned) setBanned(true)
      setError('')
    } catch (e) { if (my === reqId.current) setError(e.message) }
    finally { if (my === reqId.current) { setLoading(false); setMore(false) } }
  }, [chapterId, sort, user?.id])
  useEffect(() => { setLoading(true); setItems([]); load(1, true) }, [load])

  const needLogin = () => { openAuth('login'); return true }
  const handleErr = e => { if (e.code === 'BANNED') { setBanned(true); setBanMsg(e.message) } else flash(e.message || 'Terjadi kesalahan.') }

  const reactChapter = async emoji => {
    if (!user) return needLogin()
    const before = chapter
    setChapter(toggled(before, emoji))
    try { setChapter(await sendReaction({ target: 'chapter', id: chapterId, emoji })) } catch (e) { setChapter(before); handleErr(e) }
  }
  const reactComment = async (id, emoji) => {
    if (!user) return needLogin()
    const patch = fn => setItems(l => l.map(c => c.id === id ? fn(c) : c))
    const before = items.find(c => c.id === id)
    if (!before) return
    patch(c => ({ ...c, ...toggled(c, emoji) }))
    try { const s = await sendReaction({ target: 'comment', id, emoji }); patch(c => ({ ...c, ...s })) }
    catch (e) { patch(() => before); handleErr(e) }
  }
  const remove = async id => {
    try { await deleteComment(id); setItems(l => l.filter(c => c.id !== id)); setTotal(t => Math.max(0, t - 1)) } catch (e) { handleErr(e) }
  }
  const report = async id => {
    try {
      const r = await reportComment(id)
      setItems(l => l.map(c => c.id === id ? (r.hidden ? { ...c, hidden: true } : { ...c, reported: true }) : c))
      flash('Terima kasih, laporanmu diterima.')
    } catch (e) { handleErr(e) }
  }
  const onReport = id => user ? report(id) : needLogin()

  return <section className="comments" aria-label="Komentar chapter">
    <div className="cm-rules"><Ban size={17} /><p><strong>Dilarang keras spoiler.</strong> Jangan bocorkan isi chapter berikutnya, ending, atau twist. Pelanggar langsung di-ban.</p></div>

    <Reactions sum={chapter} onPick={reactChapter} label="Gimana chapter ini?" />

    <div className="cm-title"><h3><MessageCircle size={18} /> Komentar <span>{total}</span></h3>
      <div className="cm-sort" role="tablist" aria-label="Urutkan komentar">
        <button role="tab" aria-selected={sort === 'new'} className={sort === 'new' ? 'on' : ''} onClick={() => setSort('new')}>Terbaru</button>
        <button role="tab" aria-selected={sort === 'top'} className={sort === 'top' ? 'on' : ''} onClick={() => setSort('top')}>Terpopuler</button>
      </div></div>

    {banned
      ? <div className="cm-banned" role="alert"><Ban size={18} /><div><strong>Akunmu diblokir dari berkomentar</strong><p>{banMsg || 'Akunmu diblokir karena membagikan spoiler. Kamu masih bisa membaca, tetapi tidak bisa lagi berkomentar, bereaksi, atau mengunggah gambar.'}</p><a href={appealHref}>Hubungi admin</a></div></div>
      : user
        ? <Composer chapterId={chapterId} mangaId={mangaId} onBanned={m => { setBanned(true); setBanMsg(m) }}
            onPosted={item => { if (sort === 'new') setItems(l => [item, ...l]); else load(1, true); setTotal(t => t + 1) }} />
        : <div className="cm-login"><p>Masuk dulu untuk berkomentar, kirim gambar, dan memberi reaksi emoji.</p><button className="primary-button" onClick={() => openAuth('login')}><LogIn size={15} /> Masuk dengan Google</button></div>}

    {loading ? <div className="cm-loading">{[0, 1, 2].map(i => <div key={i} className="shimmer" />)}</div>
      : error ? <div className="cm-error"><span>{error}</span><button className="text-button" onClick={() => { setLoading(true); load(1, true) }}>Coba lagi</button></div>
      : !items.length ? <div className="cm-empty">Belum ada komentar. Jadilah yang pertama!</div>
      : <ul className="cm-list">{items.map(c => <CommentItem key={c.id} c={c} onReact={reactComment} onDelete={remove} onReport={onReport} onZoom={setZoom} />)}</ul>}

    {!loading && !error && page < totalPage && <button className="outline-button cm-more" disabled={more} onClick={() => { setMore(true); load(page + 1, false) }}>{more ? 'Memuat…' : 'Muat komentar lainnya'}</button>}
    {toast && <div className="cm-toast" role="status">{toast}</div>}
    {zoom && <Lightbox src={zoom} onClose={() => setZoom('')} />}
  </section>
}

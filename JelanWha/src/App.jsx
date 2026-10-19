import { createPortal } from 'react-dom'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, Link, NavLink, useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom'
import { Search, Home, Compass, Bookmark, History, BookOpen, ChevronRight, Star, ArrowLeft, ArrowUpDown, Heart, Menu, X, AlertCircle, RefreshCw, ChevronLeft, ArrowUp, List, Check, CheckCheck, Trash2, Play, Tags, ChevronDown, MessageCircle, Mail, Megaphone, Clock } from 'lucide-react'
import { useAccount } from './auth'
import { AuthModal, AccountMenu, GuestPrompt, GuestStrip } from './components/Auth'
import { SettingsModal } from './components/Settings'
import { getList, getTop, getHome, getGenres, getManga, getChapter, normalizeManga, KINDS, KIND_LABEL } from './api'
import Dropdown from './components/Dropdown'
import Pagination from './components/Pagination'
import Comments from './components/Comments'

/* ---------- penyimpanan lokal ---------- */
const readJSON = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback } catch { return fallback } }
const writeJSON = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch {} }
function usePersisted(key, fallback) {
  const [value, setValue] = useState(() => readJSON(key, fallback))
  useEffect(() => { writeJSON(key, value) }, [key, value])
  return [value, setValue]
}
const Lib = createContext(null)
const useLib = () => useContext(Lib)
const AuthCtx = createContext({ user: null, ready: true, openAuth: () => {} })
const useAuth = () => useContext(AuthCtx)
const idOf = m => m?.manga_id || m?.id || ''
const timeAgo = ts => {
  if (!ts) return ''
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'baru saja'
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} hari lalu`
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ---------- kontak & komunitas ---------- */
const WA_CHANNEL = 'https://whatsapp.com/channel/0029VbDl6M9A2pLIyAggrZ3P'
const CONTACT_EMAIL = 'ajasofaa@gmail.com'
const mailTo = (subject, body = '') => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
const reportMail = (detail = '') => mailTo('Lapor error JelanWha', `Halo admin JelanWha,\n\nSaya menemukan error:\n${detail}\n\nHalaman: ${typeof location !== 'undefined' ? location.href : ''}\nPerangkat/Browser: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}\n\nPenjelasan singkat:\n`)
function Community() {
  return <section className="community" aria-label="Komunitas dan kontak">
    <div className="comm-card wa"><div className="comm-icon"><Megaphone size={24} /></div><div className="comm-copy"><strong>Gabung saluran WhatsApp</strong><p>Join supaya tidak ketinggalan info update, manhwa baru, dan pengumuman.</p><a className="primary-button wa-button" href={WA_CHANNEL} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> Gabung saluran</a></div></div>
    <div className="comm-card mail"><div className="comm-icon"><Mail size={24} /></div><div className="comm-copy"><strong>Ada yang error? Hubungi kami</strong><p>Kalau ada bug, gambar tidak muncul, atau chapter bermasalah, kabari lewat email.</p><span className="mail-addr">{CONTACT_EMAIL}</span><a className="outline-button" href={reportMail()}><Mail size={16} /> Kirim email</a></div></div>
  </section>
}

/* ---------- potongan UI kecil ---------- */
function Cover({ manga, className = '' }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [manga.cover])
  return <div className={`cover ${className}`}>
    {manga.cover && !broken
      ? <img src={manga.cover} alt={`Cover ${manga.title}`} loading="lazy" onError={() => setBroken(true)} />
      : <div className="cover-fallback"><BookOpen size={28} /><span>{manga.title}</span></div>}
  </div>
}
function Skeletons({ count = 8, shelf = false }) {
  return <div className={shelf ? 'shelf-track' : 'manga-grid'}>{Array.from({ length: count }, (_, i) => <div className={`skeleton-card ${shelf ? 'shelf-item' : ''}`} key={i}><div className="skeleton-cover shimmer" /><div className="skeleton-line shimmer" /><div className="skeleton-line short shimmer" /></div>)}</div>
}
function Empty({ title, detail }) { return <div className="empty"><BookOpen size={28} /><strong>{title}</strong><span>{detail}</span></div> }
function ErrorNotice({ error, retry }) {
  return <div className="error-notice"><AlertCircle size={18} /><div><strong>Data belum bisa dimuat</strong><p>{error || 'Periksa koneksi atau API.'}</p>{retry && <button className="text-button" onClick={retry}><RefreshCw size={14} /> Coba lagi</button>}<a className="report-link" href={reportMail(error || '')}><Mail size={13} /> Masih error? Lapor lewat email</a></div></div>
}
function SectionHeading({ title, subtitle, to, link = 'Lihat semua', children }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{children}{to && <Link to={to} className="section-link">{link}<ChevronRight size={16} /></Link>}</div>
}
function MangaCard({ item }) {
  const { isSaved, toggleBookmark } = useLib()
  const m = normalizeManga(item)
  const saved = isSaved(m.id)
  return <article className="manga-card">
    <Link to={`/manga/${m.id}`} className="cover-link"><Cover manga={m} />{m.kind && <span className={`type-badge ${m.kind}`}>{KIND_LABEL[m.kind]}</span>}<span className="cover-rating"><Star size={12} fill="currentColor" /> {m.rating ? m.rating.toFixed(1) : '—'}</span></Link>
    <div className="card-copy"><Link to={`/manga/${m.id}`} className="card-title">{m.title}</Link><div className="card-meta">{m.latest ? `Chapter ${m.latest}` : 'Lihat detail'}</div>{m.updatedAt > 0 && <div className="card-meta card-time">{timeAgo(m.updatedAt)}</div>}</div>
    <button className={`bookmark-mini ${saved ? 'active' : ''}`} aria-label={saved ? 'Hapus bookmark' : 'Bookmark'} onClick={() => toggleBookmark(item)}><Heart size={16} fill={saved ? 'currentColor' : 'none'} /></button>
  </article>
}
const uniqueBy = (arr) => { const seen = new Set(); return arr.filter(x => { const k = idOf(x); if (!k || seen.has(k)) return false; seen.add(k); return true }) }

/* ---------- App ---------- */
function App() {
  const [bookmarks, setBookmarks] = usePersisted('jelanwha-bookmarks', [])
  const [history, setHistory] = usePersisted('jelanwha-history', [])
  const [readMap, setReadMap] = usePersisted('jelanwha-read', {})
  const location = useLocation()
  const isReader = location.pathname.startsWith('/read/')

  const isSaved = useCallback(id => bookmarks.some(x => idOf(x) === id), [bookmarks])
  const toggleBookmark = useCallback(item => {
    const n = normalizeManga(item)
    if (!n.id) return
    setBookmarks(list => list.some(x => idOf(x) === n.id)
      ? list.filter(x => idOf(x) !== n.id)
      : [{ manga_id: n.id, title: n.title, cover_portrait_url: n.cover, user_rate: n.rating, latest_chapter_number: n.latest }, ...list])
  }, [])
  // simpan/ubah satu entri riwayat; nilai kosong tidak menimpa data lama
  const upsertHistory = useCallback(entry => {
    if (!entry?.id) return
    setHistory(list => {
      const old = list.find(x => x.id === entry.id) || {}
      const { touch, ...fields } = entry
      const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '' && v != null))
      return [{ ...old, ...clean, at: touch === false ? (old.at || Date.now()) : Date.now() }, ...list.filter(x => x.id !== entry.id)].slice(0, 60)
    })
  }, [])
  const removeHistory = useCallback(id => setHistory(l => l.filter(x => x.id !== id)), [])
  const clearHistory = useCallback(() => setHistory([]), [])
  const markRead = useCallback((mangaId, chapterId) => {
    if (!mangaId || !chapterId) return
    setReadMap(map => {
      const cur = map[mangaId] || []
      return cur.includes(String(chapterId)) ? map : { ...map, [mangaId]: [...cur, String(chapterId)] }
    })
  }, [])
  const isRead = useCallback((mangaId, chapterId) => !!readMap[mangaId]?.includes(String(chapterId)), [readMap])
  const readCount = useCallback(mangaId => readMap[mangaId]?.length || 0, [readMap])
  const lib = useMemo(() => ({ bookmarks, history, isSaved, toggleBookmark, upsertHistory, removeHistory, clearHistory, markRead, isRead, readCount }),
    [bookmarks, history, isSaved, toggleBookmark, upsertHistory, removeHistory, clearHistory, markRead, isRead, readCount])

  const account = useAccount({
    data: { bookmarks, history, read: readMap },
    apply: d => { setBookmarks(d.bookmarks); setHistory(d.history); setReadMap(d.read) },
    clear: () => { setBookmarks([]); setHistory([]); setReadMap({}) }
  })
  const [settings, setSettings] = useState(null) // null | 'profil' | 'tampilan'
  const authValue = useMemo(() => ({ user: account.user, ready: account.ready, openAuth: account.openAuth }), [account.user, account.ready])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [location.pathname])
  const nav = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/explore', label: 'Explore', icon: Compass },
    { to: '/bookmarks', label: 'Bookmark', icon: Bookmark },
    { to: '/history', label: 'Riwayat', icon: History }
  ]
  return <Lib.Provider value={lib}><AuthCtx.Provider value={authValue}><div className={`app-shell ${isReader ? 'is-reader' : ''}`}>
    {!isReader && <header className="topbar">
      <Link to="/" className="brand"><span className="brand-mark">J</span><span>Jelan<span className="brand-accent">Wha</span></span></Link>
      <nav className="desktop-nav">{nav.map(n => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'selected' : ''}`}><n.icon size={17} />{n.label}</NavLink>)}
      </nav>
      <Link to="/explore" className="header-search"><Search size={17} /><span>Cari komik...</span></Link>
      <AccountMenu user={account.user} ready={account.ready} synced={account.synced} openAuth={account.openAuth} openSettings={setSettings} logout={account.logout} waLink={WA_CHANNEL} mailLink={reportMail()} closeSignal={location.pathname} />
    </header>}
    <main className={`main-content ${isReader ? 'reader-mode' : ''}`}><Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/explore" element={<ExplorePage />} />
      <Route path="/manga/:id" element={<DetailPage />} />
      <Route path="/read/:id" element={<ReaderPage />} />
      <Route path="/bookmarks" element={<BookmarksPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="*" element={<Empty title="Halaman tidak ditemukan" detail="Coba kembali ke halaman utama." />} />
    </Routes></main>
    {!isReader && <footer className="footer"><span className="brand small"><span className="brand-mark">J</span>Jelan<span className="brand-accent">Wha</span></span><span className="footer-links"><a href={WA_CHANNEL} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Saluran WhatsApp</a><a href={reportMail()}><Mail size={14} /> {CONTACT_EMAIL}</a></span></footer>}
    {!isReader && <nav className="bottom-nav">{nav.map(n => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `bottom-link ${isActive ? 'selected' : ''}`}><n.icon size={20} /><span>{n.label}</span></NavLink>)}</nav>}
  {settings && <SettingsModal tab={settings} setTab={setSettings} user={account.user} onUser={account.setUser} onClose={() => setSettings(null)} openAuth={account.openAuth} />}
  {account.modal && <AuthModal onClose={account.closeAuth} onGoogle={account.submitGoogle} />}
  </div></AuthCtx.Provider></Lib.Provider>
}

/* ---------- Banner: gambar besar menyatu dengan judul ---------- */
function Banner({ items }) {
  const trackRef = useRef(null)
  const indexRef = useRef(0)
  const paused = useRef(false)
  const drag = useRef(null)
  const moved = useRef(false)
  const [index, setIndex] = useState(0)
  const [dragging, setDragging] = useState(false)
  const slides = useMemo(() => items.map(normalizeManga), [items])
  const count = slides.length
  const anim = useRef(0)
  const stopAnim = () => { cancelAnimationFrame(anim.current); const el = trackRef.current; if (el) el.style.scrollSnapType = '' }
  // animasi geser buatan sendiri (±350ms) — scroll "smooth" bawaan browser terasa lambat
  const animateTo = useCallback(left => {
    const el = trackRef.current
    if (!el) return
    cancelAnimationFrame(anim.current)
    const from = el.scrollLeft, dist = left - from
    if (Math.abs(dist) < 2) { el.style.scrollSnapType = ''; return }
    const dur = 350, t0 = performance.now()
    el.style.scrollSnapType = 'none'
    const step = now => {
      const k = Math.min(1, (now - t0) / dur)
      el.scrollLeft = from + dist * (1 - Math.pow(1 - k, 3))
      if (k < 1) anim.current = requestAnimationFrame(step)
      else { el.scrollLeft = left; el.style.scrollSnapType = '' }
    }
    anim.current = requestAnimationFrame(step)
  }, [])
  useEffect(() => () => cancelAnimationFrame(anim.current), [])
  const go = useCallback(i => {
    const el = trackRef.current
    if (!el || !count) return
    animateTo(((i + count) % count) * el.clientWidth)
  }, [count, animateTo])
  const onScroll = () => {
    const el = trackRef.current
    if (!el || !el.clientWidth) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    indexRef.current = i
    setIndex(i)
  }
  useEffect(() => {
    if (count < 2) return
    const t = setInterval(() => { if (!paused.current && !drag.current && !document.hidden) go(indexRef.current + 1) }, 4200)
    return () => clearInterval(t)
  }, [count, go])
  const onPointerDown = e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    stopAnim()
    drag.current = { x: e.clientX, left: trackRef.current.scrollLeft }
    moved.current = false
  }
  const onPointerMove = e => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    if (!moved.current && Math.abs(dx) > 6) { moved.current = true; setDragging(true) }
    if (moved.current) trackRef.current.scrollLeft = drag.current.left - dx
  }
  const endDrag = () => {
    if (!drag.current) return
    const el = trackRef.current
    const wasMoved = moved.current
    drag.current = null
    setDragging(false)
    if (wasMoved) {
      const delta = el.scrollLeft / el.clientWidth - indexRef.current
      const target = delta > 0.15 ? indexRef.current + 1 : delta < -0.15 ? indexRef.current - 1 : indexRef.current
      animateTo(Math.max(0, Math.min(count - 1, target)) * el.clientWidth)
    }
  }
  if (!count) {
    return <section className="banner banner-fallback"><div className="banner-copy"><span className="eyebrow"><span className="pulse-dot" /> RUANG BACA KAMU</span><h1>Cerita bagus,<br /><em>mood bagus.</em></h1><p>Temukan dunia baru lewat cerita yang kamu suka.</p><Link to="/explore" className="primary-button">Jelajahi komik <ChevronRight size={17} /></Link></div></section>
  }
  return <section className="banner" aria-roledescription="carousel" aria-label="Update terbaru"
    onMouseEnter={() => { paused.current = true }} onMouseLeave={() => { paused.current = false; endDrag() }}
    onTouchStart={() => { paused.current = true; stopAnim() }} onTouchEnd={() => { setTimeout(() => { paused.current = false }, 4000) }}>
    <div ref={trackRef} className={`banner-track ${dragging ? 'dragging' : ''}`} onScroll={onScroll}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
      onClickCapture={e => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false } }}
      onDragStart={e => e.preventDefault()}>
      {slides.map((m, i) => <article className="banner-slide" key={m.id || i} aria-label={`${i + 1} dari ${count}`}>
        {m.cover && <img className="banner-bg" src={m.cover} alt="" aria-hidden="true" draggable="false" loading={i === 0 ? 'eager' : 'lazy'} />}
        {m.cover && <img className="banner-art" src={m.cover} alt={`Cover ${m.title}`} draggable="false" loading={i === 0 ? 'eager' : 'lazy'} />}
        <div className="banner-shade" />
        <div className="banner-copy">
          <span className="eyebrow"><span className="pulse-dot" /> {m.kind ? `${KIND_LABEL[m.kind].toUpperCase()} • ` : ''}{i === 0 ? 'UPDATE TERBARU' : (m.ongoing ? 'ONGOING' : 'TERBARU')}</span>
          <h2 className="banner-title"><Link to={`/manga/${m.id}`} draggable="false">{m.title}</Link></h2>
          <div className="banner-meta">
            <span><Star size={13} fill="currentColor" /> {m.rating ? m.rating.toFixed(1) : '—'}</span>
            {m.latest && <span><BookOpen size={13} /> Chapter {m.latest}</span>}
            {m.updatedAt > 0 && <span><Clock size={13} /> {timeAgo(m.updatedAt)}</span>}
            {m.genres.slice(0, 3).map(g => <span key={g} className="genre-chip">{g}</span>)}
          </div>
          {m.description && <p className="banner-desc">{m.description}</p>}
          <div className="banner-actions"><Link to={`/manga/${m.id}`} className="primary-button" draggable="false">Baca sekarang <ChevronRight size={16} /></Link></div>
        </div>
      </article>)}
    </div>
    {count > 1 && <>
      <button className="banner-arrow left" aria-label="Sebelumnya" onClick={() => go(index - 1)}><ChevronLeft size={20} /></button>
      <button className="banner-arrow right" aria-label="Berikutnya" onClick={() => go(index + 1)}><ChevronRight size={20} /></button>
      <div className="banner-dots">{slides.map((_, i) => <button key={i} className={i === index ? 'active' : ''} aria-label={`Slide ${i + 1}`} onClick={() => go(i)} />)}</div>
    </>}
  </section>
}

/* ---------- Rak horizontal (slide ke samping) ---------- */
function Shelf({ children }) {
  const ref = useRef(null)
  const [edge, setEdge] = useState({ start: true, end: false })
  const update = () => {
    const el = ref.current
    if (el) setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }
  useEffect(() => { update() }, [children])
  useEffect(() => { window.addEventListener('resize', update); return () => window.removeEventListener('resize', update) }, [])
  const move = dir => { const el = ref.current; el?.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' }) }
  return <div className="shelf">
    <div className="shelf-track" ref={ref} onScroll={update}>{children}</div>
    {!edge.start && <button className="shelf-arrow left" aria-label="Geser ke kiri" onClick={() => move(-1)}><ChevronLeft size={20} /></button>}
    {!edge.end && <button className="shelf-arrow right" aria-label="Geser ke kanan" onClick={() => move(1)}><ChevronRight size={20} /></button>}
  </div>
}

/* ---------- Home ---------- */
const GRID_SIZE = 18
function HomePage() {
  const [home, setHome] = useState(null)
  const [more, setMore] = useState([])
  const [morePage, setMorePage] = useState(1)
  const [moreNext, setMoreNext] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = async () => {
    setLoading(true); setError('')
    const [a, b] = await Promise.allSettled([getHome(), getList({ sort: 'latest', page: 2, pageSize: GRID_SIZE })])
    if (a.status === 'fulfilled') setHome(a.value)
    if (b.status === 'fulfilled') { setMore(uniqueBy(b.value.items)); setMorePage(2); setMoreNext(b.value.hasNext) } else setMoreNext(false)
    if (a.status === 'rejected') setError(a.reason?.message || 'Gagal memuat')
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const r = await getList({ sort: 'latest', page: morePage + 1, pageSize: GRID_SIZE })
      setMore(prev => uniqueBy([...prev, ...r.items])); setMorePage(morePage + 1); setMoreNext(r.hasNext && r.items.length > 0)
    } catch (e) { setError(e.message) } finally { setLoadingMore(false) }
  }
  const popular = home?.popular || []
  const latest = home?.latest?.manhwa || []
  const known = new Set(latest.map(idOf))
  const moreShown = more.filter(m => !known.has(idOf(m)))
  const { user, ready, openAuth } = useAuth()
  return <div className="page-stack">
    {ready && !user && <GuestStrip openAuth={openAuth} />}
    {loading ? <div className="banner banner-skeleton shimmer" /> : <Banner items={home?.banner || []} />}
    {error && <ErrorNotice error={error} retry={load} />}
    <section><SectionHeading title="Lagi populer" subtitle="Geser untuk lihat lebih banyak" to="/explore?sort=popular" />
      {loading ? <Skeletons count={8} shelf /> : popular.length ? <Shelf>{popular.map((m, i) => <div className="shelf-item" key={idOf(m) || i}><MangaCard item={m} /></div>)}</Shelf> : !error && <Empty title="Belum ada katalog" detail="API belum mengembalikan daftar komik." />}
    </section>
    <section><SectionHeading title="Manhwa terbaru" subtitle="Chapter yang baru ditambahkan" to="/explore?type=manhwa" />
      {loading ? <Skeletons count={8} shelf /> : latest.length ? <Shelf>{latest.map((m, i) => <div className="shelf-item" key={idOf(m) || i}><MangaCard item={m} /></div>)}</Shelf> : !error && <Empty title="Belum ada update" detail="Coba lagi nanti." />}
    </section>
    {!loading && moreShown.length > 0 && <section><SectionHeading title="Semua update" subtitle="Terus temukan bacaan baru" to="/explore" link="Buka Explore" />
      <div className="manga-grid">{moreShown.map((m, i) => <MangaCard key={idOf(m) || i} item={m} />)}</div>
      {moreNext && <div className="load-more"><button className="outline-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <><RefreshCw size={15} className="spin" /> Memuat…</> : <>Muat lebih banyak <ChevronDown size={16} /></>}</button></div>}
    </section>}
    {!loading && <Community />}
  </div>
}

/* ---------- Explore ---------- */
const FALLBACK_GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Harem', 'Historical', 'Horror', 'Isekai', 'Martial Arts', 'Mystery', 'Psychological', 'Romance', 'School Life', 'Sci-Fi', 'Slice of Life', 'Supernatural', 'Thriller'].map(name => ({ id: '', name }))
const SORTS = [
  { value: 'latest', label: 'Terbaru' },
  { value: 'popular', label: 'Populer' },
  { value: 'rating', label: 'Rating tertinggi' },
  { value: 'title', label: 'Judul A–Z' }
]
const FORMAT_OPTIONS = [{ value: '', label: 'Semua format' }, ...KINDS.map(k => ({ value: k, label: KIND_LABEL[k] }))]
const PAGE_SIZE = 24
function ExplorePage() {
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') || '', genre = sp.get('genre') || '', sort = sp.get('sort') || 'latest'
  const type = KINDS.includes(sp.get('type')) ? sp.get('type') : ''
  const page = Math.max(1, parseInt(sp.get('page'), 10) || 1)
  const [input, setInput] = useState(q)
  const [genres, setGenres] = useState(FALLBACK_GENRES)
  const [genresReady, setGenresReady] = useState(false)
  const [res, setRes] = useState({ items: [], totalPage: 0, totalRecord: 0, hasNext: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const topRef = useRef(null)
  const reqId = useRef(0)

  const setParams = (patch, keepPage = false) => {
    const n = new URLSearchParams(sp)
    Object.entries(patch).forEach(([k, v]) => { if (v === '' || v == null || (k === 'sort' && v === 'latest') || (k === 'page' && v === 1)) n.delete(k); else n.set(k, String(v)) })
    if (!keepPage && !('page' in patch)) n.delete('page')
    setSp(n, { replace: true })
  }
  useEffect(() => { setInput(q) }, [q])
  useEffect(() => { const t = setTimeout(() => { if (input.trim() !== q.trim()) setParams({ q: input.trim() }) }, 350); return () => clearTimeout(t) }, [input])
  useEffect(() => { getGenres().then(g => { if (g.length) setGenres(g) }).catch(() => {}).finally(() => setGenresReady(true)) }, [])

  const genreObj = genres.find(g => g.name.toLowerCase() === genre.toLowerCase())
  useEffect(() => {
    if (genre && !genresReady) return // tunggu daftar genre supaya id-nya ketemu
    const my = ++reqId.current
    setLoading(true); setError('')
    const serverSort = sort === 'popular' ? 'popular' : 'latest'
    const job = !type && sort === 'popular' && !q && !genre
      ? getTop({ page, pageSize: PAGE_SIZE })
      : getList({ q, genre: genreObj?.id || '', type, sort: type ? sort : (q ? '' : serverSort), page, pageSize: PAGE_SIZE })
    job.then(r => { if (my === reqId.current) setRes(r) })
      .catch(e => { if (my === reqId.current) { setError(e.message); setRes({ items: [], totalPage: 0, totalRecord: 0, hasNext: false }) } })
      .finally(() => { if (my === reqId.current) setLoading(false) })
  }, [q, genre, type, sort, page, genresReady, retry])

  const items = useMemo(() => {
    let list = res.items
    if (genre) list = list.filter(x => { const g = normalizeManga(x).genres; return !g.length || g.some(n => n.toLowerCase() === genre.toLowerCase()) })
    if (sort === 'rating') list = [...list].sort((a, b) => Number(b.user_rate || 0) - Number(a.user_rate || 0))
    if (sort === 'title') list = [...list].sort((a, b) => String(a.title).localeCompare(String(b.title)))
    return list
  }, [res.items, genre, sort])

  const genreOptions = useMemo(() => [{ value: '', label: 'Semua genre' }, ...genres.map(g => ({ value: g.name, label: g.name }))], [genres])
  const changePage = n => { setParams({ page: n }, true); topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const hasFilter = q || genre || type || sort !== 'latest'
  return <div className="page-stack"><div className="page-intro"><span className="eyebrow">KATALOG</span><h1>Jelajahi cerita</h1><p>Cari judul, pilih genre, lalu mulai petualangan baru.</p></div>
    <div className="explore-search" ref={topRef}><Search size={19} /><input value={input} onChange={e => setInput(e.target.value)} placeholder="Cari judul komik..." aria-label="Cari judul komik" />{input && <button onClick={() => { setInput(''); setParams({ q: '' }) }} aria-label="Hapus pencarian"><X size={17} /></button>}</div>
    <div className="filters">
      <Dropdown label="Genre" icon={Tags} value={genre} options={genreOptions} searchable onChange={v => setParams({ genre: v })} />
      <Dropdown label="Format" icon={BookOpen} value={type} options={FORMAT_OPTIONS} onChange={v => setParams({ type: v })} />
      <Dropdown label="Urutkan" icon={ArrowUpDown} value={sort} options={SORTS} onChange={v => setParams({ sort: v })} />
      {hasFilter && <button className="text-button reset" onClick={() => { setInput(''); setSp({}, { replace: true }) }}><X size={13} /> Atur ulang</button>}
      <span className="results-count">{loading ? 'Memuat…' : `${items.length} judul${res.totalRecord ? ` dari ${res.totalRecord}` : ''}`}</span>
    </div>
    {error && <ErrorNotice error={error} retry={() => setRetry(n => n + 1)} />}
    {loading ? <Skeletons count={12} /> : items.length ? <div className="manga-grid">{items.map((m, i) => <MangaCard key={idOf(m) || i} item={m} />)}</div> : !error && <Empty title="Tidak ada hasil" detail="Coba kata kunci atau genre lain." />}
    {!loading && !error && <Pagination page={page} totalPage={res.totalPage} hasNext={res.hasNext} onChange={changePage} />}
  </div>
}

/* ---------- Detail ---------- */
function DetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isSaved, toggleBookmark, history, upsertHistory, isRead, readCount } = useLib()
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [asc, setAsc] = useState(false)
  const load = () => { setLoading(true); setError(''); getManga(id).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [id])
  const raw = data?.data || data
  const m = normalizeManga(raw || {})
  const chapters = raw?.chapters || []
  useEffect(() => { if (raw && m.id) upsertHistory({ id: m.id, title: m.title, cover: m.cover, touch: false }) }, [raw])
  const ordered = useMemo(() => {
    const list = [...chapters].sort((a, b) => Number(b.chapter_number) - Number(a.chapter_number))
    return asc ? list.reverse() : list
  }, [chapters, asc])
  if (loading) return <div className="detail-loading"><div className="skeleton-cover shimmer" /><div><div className="skeleton-line shimmer" /><div className="skeleton-line shimmer" /><div className="skeleton-line short shimmer" /></div></div>
  if (error) return <ErrorNotice error={error} retry={load} />
  const saved = isSaved(m.id)
  const lastRead = history.find(h => h.id === m.id && h.chapterId)
  const first = [...chapters].sort((a, b) => Number(a.chapter_number) - Number(b.chapter_number))[0]
  const startId = lastRead?.chapterId || first?.chapter_id
  const done = readCount(m.id)
  return <div className="page-stack">
    <Link to="/explore" className="back-link"><ArrowLeft size={16} /> Kembali ke explore</Link>
    <section className="detail-panel"><Cover manga={m} className="detail-cover" /><div className="detail-info"><span className="eyebrow">DETAIL MANHWA</span><h1>{m.title}</h1>
      <div className="detail-stats"><span><Star size={15} fill="currentColor" /> {m.rating ? m.rating.toFixed(1) : 'Belum ada rating'}</span><span><BookOpen size={15} /> {raw?.total_chapters || chapters.length || '—'} chapter</span><span><span className="status-dot" />{m.status}</span>{done > 0 && <span><CheckCheck size={15} /> {done} dibaca</span>}</div>
      <div className="genre-list">{m.genres.map(g => <span key={g} className="genre-chip">{g}</span>)}</div>
      <p className="synopsis">{m.description || 'Sinopsis belum tersedia dari sumber data.'}</p>
      <div className="detail-actions">
        <button className="primary-button" disabled={!startId} onClick={() => navigate(`/read/${startId}`)}>{lastRead ? <>Lanjutkan Ch. {lastRead.chapterNumber ?? ''} <Play size={15} /></> : <>Mulai membaca <BookOpen size={16} /></>}</button>
        <button className={`outline-button ${saved ? 'saved' : ''}`} onClick={() => toggleBookmark({ ...raw, id: m.id, cover: m.cover })}><Heart size={16} fill={saved ? 'currentColor' : 'none'} />{saved ? 'Tersimpan' : 'Bookmark'}</button>
      </div></div></section>
    <section><SectionHeading title="Daftar chapter" subtitle={`${chapters.length} chapter tersedia${done ? ` · ${done} sudah dibaca` : ''}`}>
      {chapters.length > 1 && <button className="outline-button small" onClick={() => setAsc(v => !v)}><ArrowUpDown size={14} /> {asc ? 'Terlama dulu' : 'Terbaru dulu'}</button>}
    </SectionHeading>
      {ordered.length ? <div className="chapter-list">{ordered.map((c, i) => {
        const read = isRead(m.id, c.chapter_id), current = lastRead?.chapterId === String(c.chapter_id)
        return <Link to={`/read/${c.chapter_id}`} key={c.chapter_id || i} className={`chapter-row ${read ? 'read' : ''} ${current ? 'current' : ''}`}>
          <div className="chapter-icon">{read ? <Check size={18} strokeWidth={3} /> : <BookOpen size={17} />}</div>
          <div className="chapter-name"><strong>{c.chapter_title || `Chapter ${c.chapter_number}`}</strong><span>{c.release_date || 'Tanggal rilis tidak tersedia'}</span></div>
          {read && <span className="read-badge">Dibaca</span>}
          {!read && current && <span className="read-badge now">Terakhir</span>}
          <span className="chapter-number">Ch. {c.chapter_number}</span><ChevronRight size={16} />
        </Link>
      })}</div> : <Empty title="Chapter belum tersedia" detail="Sumber API tidak mengembalikan daftar chapter untuk judul ini." />}
    </section>
  </div>
}

/* ---------- Pemilih chapter di pembaca ---------- */
function ChapterPicker({ open, setOpen, chapters, currentId, mangaId, fallbackLabel }) {
  const navigate = useNavigate()
  const { isRead } = useLib()
  const list = useRef(null)
  const ordered = useMemo(() => [...chapters].sort((a, b) => Number(b.chapter_number) - Number(a.chapter_number)), [chapters])
  const cur = ordered.find(c => String(c.chapter_id) === String(currentId))
  useEffect(() => {
    if (!open) return
    const t = requestAnimationFrame(() => { const b = list.current, el = b?.querySelector('.current'); if (b && el) b.scrollTop = el.offsetTop - b.clientHeight / 2 + el.clientHeight / 2 })
    return () => cancelAnimationFrame(t)
  }, [open])
  return <div className="cp">
    <button className="cp-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Pilih chapter"><List size={16} /><span>{cur ? (cur.chapter_title || `Chapter ${cur.chapter_number}`) : fallbackLabel}</span><ChevronDown size={15} className="cp-caret" /></button>
    {open && createPortal(<>
      <div className="cp-backdrop" onClick={() => setOpen(false)} />
      <div className="cp-sheet" role="listbox"><div className="cp-head">Pilih chapter<button className="reader-btn" onClick={() => setOpen(false)} aria-label="Tutup"><X size={16} /></button></div>
        <div className="cp-list" ref={list}>{ordered.length ? ordered.map(c => {
          const isCur = String(c.chapter_id) === String(currentId), read = isRead(mangaId, c.chapter_id)
          return <button key={c.chapter_id} role="option" aria-selected={isCur} className={`cp-row ${isCur ? 'current' : ''} ${read ? 'read' : ''}`} onClick={() => { setOpen(false); if (!isCur) navigate(`/read/${c.chapter_id}`) }}>
            <span className="cp-check">{read ? <Check size={14} strokeWidth={3} /> : null}</span><span className="cp-name">{c.chapter_title || `Chapter ${c.chapter_number}`}</span>{isCur && <span className="read-badge now">Sedang dibaca</span>}
          </button>
        }) : <div className="dd-none">Daftar chapter belum dimuat</div>}</div>
      </div>
    </>, document.body)}
  </div>
}

/* ---------- Pembaca ---------- */
function ReaderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isSaved, toggleBookmark, upsertHistory, markRead, isRead } = useLib()
  const { user, openAuth } = useAuth()
  const [data, setData] = useState(null), [dataId, setDataId] = useState(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0)
  const [ui, setUi] = useState(false), [progress, setProgress] = useState(0), [chapters, setChapters] = useState([]), [info, setInfo] = useState(null)
  const [hint, setHint] = useState(false), [picker, setPicker] = useState(false)
  const lastY = useRef(0), endRef = useRef(null), marked = useRef('')

  useEffect(() => {
    let alive = true
    setLoading(true); setError(''); setUi(false); setPicker(false); lastY.current = 0; marked.current = ''
    getChapter(id).then(p => {
      if (!alive) return
      const d = p?.data || p
      setData(d); setDataId(id)
      upsertHistory({ id: d.manga_id, title: d.manga_title, cover: d.cover_image_url, chapterId: String(id), chapterNumber: d.chapter_number, chapterTitle: d.chapter_title })
    }).catch(e => alive && setError(e.message)).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [id, reload])
  useEffect(() => {
    try { if (!localStorage.getItem('jelanwha-reader-hint')) { localStorage.setItem('jelanwha-reader-hint', '1'); setHint(true); const t = setTimeout(() => setHint(false), 3200); return () => clearTimeout(t) } } catch {}
  }, [])
  const mangaId = data?.manga_id
  useEffect(() => {
    if (!mangaId) return
    let alive = true
    getManga(mangaId).then(d => {
      if (!alive) return
      const raw = d?.data || d, n = normalizeManga(raw || {})
      setChapters(raw?.chapters || []); setInfo(n)
      upsertHistory({ id: mangaId, title: n.title, cover: n.cover, touch: false })
    }).catch(() => {})
    return () => { alive = false }
  }, [mangaId])

  const images = data?.images || (data?.chapter?.data || []).map(x => `${data.base_url || 'https://assets.shngm.id'}${data.chapter?.path || ''}${x}`)
  const ready = !loading && !error && dataId === id && images.length > 0

  // progres baca, sembunyikan menu saat scroll turun, dan tandai "sudah dibaca" saat sampai ujung chapter
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(1, y / max) : 0)
      if (Math.abs(y - lastY.current) > 40) { if (y > lastY.current) setUi(false); lastY.current = y }
      const end = endRef.current
      if (ready && mangaId && end && y > 300 && marked.current !== id && end.getBoundingClientRect().top < window.innerHeight) {
        marked.current = id
        markRead(mangaId, id)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ready, mangaId, id])

  const title = data?.chapter_title || (data?.chapter_number ? `Chapter ${data.chapter_number}` : 'Chapter')
  const showUi = ui || picker || loading || !!error || !images.length
  const bm = { id: mangaId, title: info?.title || data?.manga_title || 'Manhwa', cover: info?.cover || data?.cover_image_url || '' }
  const saved = mangaId ? isSaved(mangaId) : false
  const done = mangaId && isRead(mangaId, id)
  return <div className="reader-page">
    <div className="reader-progress"><span style={{ transform: `scaleX(${progress})` }} /></div>
    <header className={`reader-bar reader-bar-top ${showUi ? 'show' : ''}`}>
      <Link to={mangaId ? `/manga/${mangaId}` : '/explore'} className="reader-btn" aria-label="Kembali ke detail"><ArrowLeft size={19} /></Link>
      <div className="reader-title"><strong>{data?.manga_title || 'Membaca'}</strong><span>{loading ? 'Memuat…' : `${title} · ${images.length} halaman`}{done ? ' · ✓ dibaca' : ''}</span></div>
      {mangaId && <button className={`reader-btn ${saved ? 'active' : ''}`} aria-label="Bookmark" onClick={() => toggleBookmark(bm)}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button>}
      <Link to="/" className="reader-btn" aria-label="Ke beranda"><Home size={18} /></Link>
    </header>
    <div className="reader-body" onClick={() => setUi(v => !v)}>
      {loading ? <div className="reader-skeleton">{Array.from({ length: 3 }, (_, i) => <div className="shimmer" key={i} />)}</div>
        : error ? <div className="reader-state"><ErrorNotice error={error} retry={() => setReload(n => n + 1)} /></div>
        : images.length ? <div className="reader-images">{images.map((src, i) => <img key={`${src}-${i}`} src={src} alt={`Halaman ${i + 1}`} loading={i < 2 ? 'eager' : 'lazy'} draggable="false" />)}</div>
        : <div className="reader-state"><Empty title="Gambar chapter tidak tersedia" detail="Sumber tidak mengembalikan gambar untuk chapter ini." /></div>}
      {!loading && data && images.length > 0 && <div className="reader-end" ref={endRef} onClick={e => e.stopPropagation()}>
        <span className={`finish ${done ? 'on' : ''}`}>{done ? <><CheckCheck size={16} /> {title} sudah dibaca</> : `Akhir ${title}`}</span>
        <div className="reader-bottom">{data.prev_chapter_id ? <Link className="outline-button" to={`/read/${data.prev_chapter_id}`}>← Sebelumnya</Link> : <span />}{data.next_chapter_id ? <Link className="primary-button" to={`/read/${data.next_chapter_id}`}>Berikutnya →</Link> : <Link className="outline-button" to={`/manga/${data.manga_id}`}>Daftar chapter</Link>}</div>
        <a className="report-link" href={reportMail(`${data.manga_title || ''} - ${title}`)}><Mail size={13} /> Gambar rusak / error? Lapor</a></div>}
      {!loading && data && images.length > 0 && <div className="comments-wrap" onClick={e => e.stopPropagation()}>
        <Comments chapterId={String(id)} mangaId={String(mangaId || '')} user={user} openAuth={openAuth} appealHref={mailTo('Banding ban komentar JelanWha', `Halo admin JelanWha,\n\nAkun saya (${user?.email || ''}) diblokir dari berkomentar. Saya ingin mengajukan banding.\n\nPenjelasan:\n`)} />
      </div>}
    </div>
    <footer className={`reader-bar reader-bar-bottom ${showUi ? 'show' : ''}`}>
      <button className="reader-btn" disabled={!data?.prev_chapter_id} aria-label="Chapter sebelumnya" onClick={() => navigate(`/read/${data.prev_chapter_id}`)}><ChevronLeft size={20} /></button>
      <ChapterPicker open={picker} setOpen={setPicker} chapters={chapters} currentId={id} mangaId={mangaId} fallbackLabel={title} />
      <button className="reader-btn" aria-label="Ke atas" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={18} /></button>
      <button className="reader-btn next" disabled={!data?.next_chapter_id} aria-label="Chapter berikutnya" onClick={() => navigate(`/read/${data.next_chapter_id}`)}><ChevronRight size={20} /></button>
    </footer>
    {hint && <div className="reader-hint">Ketuk layar untuk menampilkan menu</div>}
  </div>
}

/* ---------- Bookmark & Riwayat ---------- */
function BookmarksPage() {
  const { bookmarks } = useLib()
  const { user, ready, openAuth } = useAuth()
  const [sort, setSort] = useState('recent')
  const ordered = useMemo(() => sort === 'title' ? [...bookmarks].sort((a, b) => String(a.title).localeCompare(String(b.title))) : bookmarks, [bookmarks, sort])
  return <div className="page-stack"><div className="page-intro"><span className="eyebrow">KOLEKSI KAMU</span><h1>Bookmark</h1><p>Manhwa yang kamu simpan</p></div>
    {ready && !user && <GuestPrompt openAuth={openAuth} />}
    {bookmarks.length > 0 && <div className="saved-toolbar"><span>{bookmarks.length} judul</span><Dropdown value={sort} onChange={setSort} icon={ArrowUpDown} options={[{ value: 'recent', label: 'Terbaru disimpan' }, { value: 'title', label: 'Judul A–Z' }]} /></div>}
    {ordered.length ? <div className="manga-grid">{ordered.map((m, i) => <MangaCard key={idOf(m) || i} item={m} />)}</div> : <Empty title="Belum ada bookmark" detail="Tekan ikon hati pada manhwa untuk menyimpannya." />}
  </div>
}
function HistoryPage() {
  const { history, removeHistory, clearHistory, readCount } = useLib()
  const { user, ready, openAuth } = useAuth()
  return <div className="page-stack"><div className="page-intro"><span className="eyebrow">KOLEKSI KAMU</span><h1>Riwayat baca</h1><p>Lanjutkan bacaan terakhirmu</p></div>
    {ready && !user && <GuestPrompt openAuth={openAuth} title="Riwayat tersimpan di akunmu" />}
    {history.length > 0 && <div className="saved-toolbar"><span>{history.length} judul</span><button className="text-button danger" onClick={() => { if (window.confirm('Hapus semua riwayat baca?')) clearHistory() }}><Trash2 size={14} /> Hapus semua</button></div>}
    {history.length ? <div className="history-list">{history.map(h => {
      const m = normalizeManga(h)
      const to = h.chapterId ? `/read/${h.chapterId}` : `/manga/${m.id}`
      return <article className="history-item" key={h.id}>
        <Link to={to} className="history-cover" tabIndex={-1}><Cover manga={m} /></Link>
        <div className="history-info">
          <Link to={`/manga/${m.id}`} className="history-title">{m.title}</Link>
          <div className="history-meta">{h.chapterId ? <span><BookOpen size={12} /> {h.chapterTitle || `Chapter ${h.chapterNumber ?? ''}`}</span> : <span>Belum mulai membaca</span>}{readCount(m.id) > 0 && <span><CheckCheck size={12} /> {readCount(m.id)} dibaca</span>}<span>{timeAgo(h.at)}</span></div>
          <div className="history-actions"><Link to={to} className="primary-button small">{h.chapterId ? <>Lanjutkan <Play size={13} /></> : <>Buka <ChevronRight size={14} /></>}</Link>
            <Link to={`/manga/${m.id}`} className="outline-button small">Detail</Link></div>
        </div>
        <button className="history-remove" aria-label={`Hapus ${m.title} dari riwayat`} onClick={() => removeHistory(h.id)}><X size={16} /></button>
      </article>
    })}</div> : <Empty title="Belum ada riwayat" detail="Manhwa yang kamu baca akan muncul di sini." />}
  </div>
}
export default App

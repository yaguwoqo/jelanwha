import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loginFirebase, authUser, getUserData, saveUserData, updateProfile } from './auth.js'
import { uploadAvatar, removeAvatar } from './profile.js'
import { KINDS, createCatalog } from './catalog.js'
import { UPLOAD_DIR, EMOJIS, listComments, postComment, deleteComment, reportComment, react, uploadImage, admin } from './comments.js'

const app = express()
const PORT = process.env.PORT || 8787
const BASE = (process.env.SHNGM_API_BASE || 'https://api.shngm.io/v1').replace(/\/$/, '')
app.use(cors())
app.use(express.json({ limit: '1mb' }))

async function upstream(p) {
  const response = await fetch(`${BASE}${p}`, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'JelanWha/1.0 (catalog adapter)'
    },
    signal: AbortSignal.timeout(20000)
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`Upstream API returned ${response.status}`)
  try { return JSON.parse(body) } catch { throw new Error('Upstream did not return valid JSON') }
}
const catalog = createCatalog(upstream)
catalog.get().catch(() => {})   // hangatkan cache saat server menyala supaya halaman pertama cepat
const num = (v, d, max = 100) => Math.min(max, Math.max(1, Math.floor(Number(v)) || d))
const wrap = fn => async (req, res) => {
  try { res.json(await fn(req)) }
  catch (e) { res.status(e.status || 502).json({ retcode: -1, message: e.message, code: e.code }) }
}

// Autentikasi hanya melalui Google melalui Firebase Authentication
app.post('/api/auth/firebase', wrap(req => loginFirebase(req.body?.idToken, req.body?.profile || {})))
app.get('/api/auth/me', wrap(req => ({ user: authUser(req) })))
app.get('/api/user/data', wrap(req => getUserData(authUser(req).id)))
app.put('/api/user/data', wrap(req => saveUserData(authUser(req).id, req.body)))

// Profil: nama, foto, tema warna
app.put('/api/profile', wrap(req => updateProfile(authUser(req).id, req.body)))
app.post('/api/profile/avatar', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '1mb' }), wrap(req => uploadAvatar(req)))
app.delete('/api/profile/avatar', wrap(req => removeAvatar(req)))

// Komentar, reaksi emoji, unggah gambar
app.get('/api/emojis', (_req, res) => res.json({ emojis: EMOJIS }))
app.get('/api/comments/:chapterId', wrap(req => listComments(req)))
app.post('/api/comments/:chapterId', wrap(req => postComment(req)))
app.delete('/api/comments/:id', wrap(req => deleteComment(req)))
app.post('/api/comments/:id/report', wrap(req => reportComment(req)))
app.put('/api/react', wrap(req => react(req)))
app.post('/api/upload', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], limit: '3mb' }), wrap(req => uploadImage(req)))
// Admin (butuh ADMIN_TOKEN): daftar laporan, ban/unban, hapus/pulihkan komentar
app.get('/api/admin/reports', wrap(req => admin.reports(req)))
app.post('/api/admin/ban', wrap(req => admin.ban(req)))
app.post('/api/admin/unban', wrap(req => admin.unban(req)))
app.delete('/api/admin/comments/:id', wrap(req => admin.remove(req)))
app.post('/api/admin/comments/:id/restore', wrap(req => admin.restore(req)))
app.use('/uploads', express.static(UPLOAD_DIR, { index: false, dotfiles: 'deny', maxAge: '30d', immutable: true, setHeaders: res => res.setHeader('X-Content-Type-Options', 'nosniff') }))

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'JelanWha API adapter' }))

// Daftar umum: cari (q), urut (sort), genre (id), halaman.
app.get('/api/list', wrap(req => {
  const { q, sort, genre } = req.query
  // Per jenis (manhwa/manhua/manga): disaring dari katalog lengkap di server.
  const type = KINDS.includes(String(req.query.type)) ? String(req.query.type) : ''
  if (type) return catalog.list({ type, q, sort: sort || 'latest', genre, page: num(req.query.page, 1, 9999), size: num(req.query.page_size, 24) })
  const params = [`page=${num(req.query.page, 1, 9999)}`, `page_size=${num(req.query.page_size, 24)}`]
  if (q) params.push(`q=${encodeURIComponent(q)}`)
  if (sort) params.push(`sort=${encodeURIComponent(sort)}`)
  if (genre) params.push(`genre_include=${encodeURIComponent(genre)}`)
  return upstream(`/manga/list?${params.join('&')}`)
}))
// Halaman utama dalam satu panggilan: banner (ongoing terbaru), populer, dan update terbaru per jenis.
app.get('/api/home', wrap(async () => ({
  retcode: 0,
  data: await catalog.home(async () => { const r = await upstream('/manga/top?filter=daily&page=1&page_size=12'); return Array.isArray(r?.data) ? r.data : (r?.data?.results || []) })
})))
// Tetap ada supaya kompatibel dengan versi lama.
app.get('/api/latest', wrap(req => upstream(`/manga/list?sort=latest&page=${num(req.query.page, 1, 9999)}&page_size=${num(req.query.page_size, 24)}`)))
app.get('/api/search', wrap(req => upstream(`/manga/list?q=${encodeURIComponent(req.query.q || '')}&page=${num(req.query.page, 1, 9999)}&page_size=${num(req.query.page_size, 24)}`)))
app.get('/api/top', wrap(req => upstream(`/manga/top?filter=${encodeURIComponent(req.query.filter || 'daily')}&page=${num(req.query.page, 1, 9999)}&page_size=${num(req.query.page_size, 24)}`)))
app.get('/api/genres', wrap(() => upstream('/genre/list')))
app.get('/api/manga/:id', wrap(async req => {
  const id = encodeURIComponent(req.params.id)
  const data = await upstream(`/manga/detail/${id}`)
  try {
    // ambil semua chapter (200 per halaman, maksimal 10 halaman)
    let all = [], page = 1, totalPage = 1
    do {
      const r = await upstream(`/chapter/${id}/list?page=${page}&page_size=200&sort_by=chapter_number&sort_order=desc`)
      const rows = Array.isArray(r?.data) ? r.data : (r?.data?.results || [])
      all = all.concat(rows)
      totalPage = Number(r?.meta?.total_page || 1)
      if (!rows.length) break
      page++
    } while (page <= totalPage && page <= 10)
    if (data?.data) data.data.chapters = all
  } catch {}
  return data
}))
app.get('/api/chapter/:id', wrap(req => upstream(`/chapter/detail/${encodeURIComponent(req.params.id)}`)))

// Kalau sudah di-build (npm run build), sajikan frontend dari folder dist.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}
// Error JSON (mis. body rusak) alih-alih halaman HTML
app.use((err, req, res, _next) => res.status(err.status || 400).json({ retcode: -1, message: err.type === 'entity.too.large' ? (req.path === '/api/upload' ? 'Gambar terlalu besar (maksimal 3 MB).' : req.path === '/api/profile/avatar' ? 'Foto terlalu besar (maksimal 1 MB).' : 'Data terlalu besar.') : 'Permintaan tidak valid.' }))
app.listen(PORT, () => console.log(`JelanWha listening on :${PORT}`))

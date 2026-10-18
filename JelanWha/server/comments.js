// Komentar per chapter + gambar + reaksi emoji + laporan spoiler + moderasi.
// Disimpan di data/comments.json, gambar di data/uploads/. Baca komentar boleh tanpa login; menulis, bereaksi,
// dan mengunggah gambar wajib login (supaya pelanggar bisa di-ban).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, HttpError, authUser, tryAuthUser, userInfo, isBanned, banUser, unbanUser } from './auth.js'
import { checkSpoiler } from './moderation.js'

export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })
const FILE = path.join(DATA_DIR, 'comments.json')

export const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']
const MAX_TEXT = 1000
const MAX_IMAGE = 3 * 1024 * 1024
const REPORT_HIDE = 3                                   // komentar disembunyikan otomatis setelah N pelapor berbeda
const AUTOBAN = process.env.SPOILER_AUTOBAN !== '0'     // set SPOILER_AUTOBAN=0 untuk mematikan ban otomatis
const BAN_MSG = 'Akunmu diblokir karena membagikan spoiler. Kamu masih bisa membaca, tetapi tidak bisa lagi berkomentar atau mengunggah gambar. Merasa ini keliru? Hubungi admin lewat email kontak.'

/* ---------- penyimpanan ---------- */
function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) }
  catch (e) {
    if (e.code !== 'ENOENT') { try { fs.copyFileSync(FILE, `${FILE}.corrupt-${Date.now()}`) } catch {} }
    return {}
  }
}
const cdb = load()
cdb.comments ||= {}   // id → komentar
cdb.reactions ||= {}  // "ch:<chapterId>" | "cm:<commentId>" → { userId: emoji }
cdb.uploads ||= {}    // nama file → userId pengunggah
function save() {
  const tmp = `${FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(cdb))
  fs.renameSync(tmp, FILE)
}

/* ---------- util ---------- */
const idStr = (v, n = 64) => String(v ?? '').trim().slice(0, n)
const safeId = v => { const s = idStr(v); if (!/^[\w-]{1,64}$/.test(s)) throw new HttpError(400, 'ID tidak valid.'); return s }
const displayName = u => u.name || `Pembaca ${u.id.slice(0, 4)}`   // email tidak pernah ditampilkan
const stripCtl = s => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '')

const lastAction = new Map()
function throttle(key, ms, msg) {
  const now = Date.now(), last = lastAction.get(key) || 0
  if (now - last < ms) throw new HttpError(429, msg)
  lastAction.set(key, now)
}
setInterval(() => { const n = Date.now(); for (const [k, v] of lastAction) if (n - v > 3600000) lastAction.delete(k) }, 600000).unref()
const uploadsLog = new Map()
function uploadQuota(uid) {
  const now = Date.now(), list = (uploadsLog.get(uid) || []).filter(t => now - t < 3600000)
  if (list.length >= 20) throw new HttpError(429, 'Terlalu banyak unggahan. Coba lagi nanti.')
  list.push(now); uploadsLog.set(uid, list)
}

function assertCanPost(user) {
  if (user.banned) throw new HttpError(403, BAN_MSG, 'BANNED')
}

/* ---------- reaksi ---------- */
function summary(key, uid) {
  const r = cdb.reactions[key] || {}
  const counts = {}
  for (const e of Object.values(r)) counts[e] = (counts[e] || 0) + 1
  return { counts, mine: uid ? (r[uid] || '') : '' }
}
function totalReactions(key) { return Object.keys(cdb.reactions[key] || {}).length }

export function react(req) {
  const user = authUser(req); assertCanPost(user)
  const { target, emoji } = req.body || {}
  const id = safeId(req.body?.id)
  if (target !== 'chapter' && target !== 'comment') throw new HttpError(400, 'Target reaksi tidak valid.')
  if (!EMOJIS.includes(emoji)) throw new HttpError(400, 'Emoji tidak tersedia.')
  if (target === 'comment' && !cdb.comments[id]) throw new HttpError(404, 'Komentar tidak ditemukan.')
  throttle(`react|${user.id}`, 250, 'Pelan-pelan ya.')
  const key = `${target === 'chapter' ? 'ch' : 'cm'}:${id}`
  const r = (cdb.reactions[key] ||= {})
  if (r[user.id] === emoji) delete r[user.id]   // tekan emoji yang sama = batal
  else r[user.id] = emoji
  if (!Object.keys(r).length) delete cdb.reactions[key]
  save()
  return summary(key, user.id)
}

/* ---------- unggah gambar ---------- */
export function sniff(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buf.length > 12 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return 'gif'
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  return ''
}
export function uploadImage(req) {
  const user = authUser(req); assertCanPost(user)
  const buf = req.body
  if (!Buffer.isBuffer(buf) || !buf.length) throw new HttpError(400, 'Format gambar harus JPG, PNG, WEBP, atau GIF.')
  if (buf.length > MAX_IMAGE) throw new HttpError(413, 'Gambar terlalu besar (maksimal 3 MB).')
  const ext = sniff(buf)   // tipe ditentukan dari isi file, bukan dari header kiriman pengguna
  if (!ext) throw new HttpError(400, 'File bukan gambar yang valid (JPG, PNG, WEBP, GIF).')
  uploadQuota(user.id)
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf, { flag: 'wx' })
  cdb.uploads[name] = user.id
  save()
  return { url: `/uploads/${name}` }
}
function removeFile(url) {
  const m = /^\/uploads\/([a-f0-9]{32}\.(?:jpg|png|webp|gif))$/.exec(url || '')
  if (!m) return
  try { fs.unlinkSync(path.join(UPLOAD_DIR, m[1])) } catch {}
  delete cdb.uploads[m[1]]
}

/* ---------- komentar ---------- */
function view(c, me) {
  const author = userInfo(c.userId)
  const base = { id: c.id, name: author ? displayName(author) : 'Pembaca', avatar: author?.avatar || '', at: c.createdAt, own: !!me && c.userId === me.id, reported: !!me && c.reports.includes(me.id) }
  if (c.hidden) return { ...base, hidden: true, text: '', image: '', ...summary(`cm:${c.id}`, me?.id) }
  return { ...base, hidden: false, text: c.text, image: c.image || '', ...summary(`cm:${c.id}`, me?.id) }
}
const visible = c => !c.removed && !isBanned(c.userId)

export function listComments(req) {
  const me = tryAuthUser(req)
  const chapterId = safeId(req.params.chapterId)
  const size = Math.min(30, Math.max(1, Math.floor(Number(req.query.size)) || 15))
  const page = Math.max(1, Math.floor(Number(req.query.page)) || 1)
  const sort = req.query.sort === 'top' ? 'top' : 'new'
  const all = Object.values(cdb.comments).filter(c => c.chapterId === chapterId && visible(c))
  all.sort(sort === 'top'
    ? (a, b) => totalReactions(`cm:${b.id}`) - totalReactions(`cm:${a.id}`) || b.createdAt - a.createdAt
    : (a, b) => b.createdAt - a.createdAt)
  const totalPage = Math.max(1, Math.ceil(all.length / size))
  return {
    items: all.slice((page - 1) * size, page * size).map(c => view(c, me)),
    page, totalPage, total: all.length,
    chapter: summary(`ch:${chapterId}`, me?.id),
    me: me ? { banned: me.banned } : null
  }
}

export function postComment(req) {
  const user = authUser(req); assertCanPost(user)
  const chapterId = safeId(req.params.chapterId)
  const raw = stripCtl(String(req.body?.text || '').replace(/\r\n/g, '\n')).trim()
  if (raw.length > MAX_TEXT) throw new HttpError(400, `Komentar maksimal ${MAX_TEXT} karakter.`)
  const text = raw.replace(/\n{3,}/g, '\n\n')
  const image = idStr(req.body?.image, 80)
  if (!text && !image) throw new HttpError(400, 'Tulis komentar atau lampirkan gambar.')
  if (image) {
    const m = /^\/uploads\/([a-f0-9]{32}\.(?:jpg|png|webp|gif))$/.exec(image)
    if (!m || cdb.uploads[m[1]] !== user.id || !fs.existsSync(path.join(UPLOAD_DIR, m[1]))) throw new HttpError(400, 'Gambar tidak valid. Unggah ulang.')
  }
  // Cek spoiler sebelum throttle supaya pelanggaran tidak bisa "disembunyikan" oleh pembatas waktu.
  const verdict = checkSpoiler(text)
  if (verdict.level === 'hard') {
    if (image) removeFile(image)
    if (AUTOBAN) {
      banUser(user.id, 'Spoiler (terdeteksi otomatis)')
      save()
      throw new HttpError(403, BAN_MSG, 'BANNED')
    }
    throw new HttpError(422, 'Dilarang spoiler! Komentar ditolak.', 'SPOILER')
  }
  if (verdict.level === 'soft') {
    if (image) removeFile(image)
    throw new HttpError(422, 'Komentarmu terindikasi membocorkan cerita (chapter berikutnya/ending). Spoiler dilarang dan bisa membuat akun di-ban. Tulis ulang tanpa membocorkan ya.', 'SPOILER')
  }
  throttle(`post|${user.id}`, 8000, 'Tunggu beberapa detik sebelum mengirim komentar lagi.')
  const c = { id: crypto.randomUUID(), chapterId, mangaId: idStr(req.body?.mangaId), userId: user.id, text, image, createdAt: Date.now(), reports: [], hidden: false, removed: false }
  cdb.comments[c.id] = c
  save()
  return view(c, user)
}

export function deleteComment(req, admin = false) {
  const c = cdb.comments[safeId(req.params.id)]
  if (!c || c.removed) throw new HttpError(404, 'Komentar tidak ditemukan.')
  if (!admin) {
    const user = authUser(req)
    if (c.userId !== user.id) throw new HttpError(403, 'Kamu hanya bisa menghapus komentarmu sendiri.')
  }
  c.removed = true
  removeFile(c.image); c.image = ''
  delete cdb.reactions[`cm:${c.id}`]
  save()
  return { ok: true }
}

export function reportComment(req) {
  const user = authUser(req); assertCanPost(user)
  const c = cdb.comments[safeId(req.params.id)]
  if (!c || c.removed) throw new HttpError(404, 'Komentar tidak ditemukan.')
  if (c.userId === user.id) throw new HttpError(400, 'Kamu tidak bisa melaporkan komentarmu sendiri.')
  if (!c.reports.includes(user.id)) c.reports.push(user.id)
  if (c.reports.length >= REPORT_HIDE) c.hidden = true   // disembunyikan sementara sampai admin memutuskan
  save()
  return { ok: true, hidden: c.hidden }
}

/* ---------- admin (header x-admin-token = ADMIN_TOKEN di .env) ---------- */
function requireAdmin(req) {
  const want = process.env.ADMIN_TOKEN || ''
  if (!want) throw new HttpError(503, 'Admin belum diaktifkan. Set ADMIN_TOKEN di .env.')
  const got = String(req.headers['x-admin-token'] || '')
  const a = Buffer.from(got), b = Buffer.from(want)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'Token admin salah.')
}
export const admin = {
  reports(req) {
    requireAdmin(req)
    const items = Object.values(cdb.comments).filter(c => !c.removed && (c.reports.length || c.hidden))
      .sort((a, b) => b.reports.length - a.reports.length || b.createdAt - a.createdAt)
      .map(c => ({ id: c.id, chapterId: c.chapterId, mangaId: c.mangaId, text: c.text, image: c.image, reports: c.reports.length, hidden: c.hidden, at: c.createdAt, user: userInfo(c.userId) }))
    return { items }
  },
  ban(req) { requireAdmin(req); return { user: banUser(safeId(req.body?.userId), req.body?.reason || 'Dibanned admin') } },
  unban(req) { requireAdmin(req); return { user: unbanUser(safeId(req.body?.userId)) } },
  remove(req) { requireAdmin(req); return deleteComment(req, true) },
  restore(req) {   // komentar yang dilaporkan ternyata aman: tampilkan lagi dan kosongkan laporan
    requireAdmin(req)
    const c = cdb.comments[safeId(req.params.id)]
    if (!c || c.removed) throw new HttpError(404, 'Komentar tidak ditemukan.')
    c.reports = []; c.hidden = false; save()
    return { ok: true }
  }
}

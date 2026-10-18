// Akun sederhana tanpa database eksternal: email + kata sandi, disimpan di file JSON.
// Kata sandi di-hash dengan scrypt, sesi memakai token bertanda tangan HMAC (30 hari).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const scrypt = promisify(crypto.scrypt)
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })
const DB_FILE = path.join(DATA_DIR, 'db.json')
const SECRET_FILE = path.join(DATA_DIR, 'secret.key')
const TOKEN_TTL = 30 * 24 * 3600 * 1000

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code }
}

function loadSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET
  try { const s = fs.readFileSync(SECRET_FILE, 'utf8').trim(); if (s.length >= 32) return s } catch {}
  const s = crypto.randomBytes(48).toString('hex')
  fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 })
  return s
}
const SECRET = loadSecret()

function loadDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }
  catch (e) {
    if (e.code !== 'ENOENT') { try { fs.copyFileSync(DB_FILE, `${DB_FILE}.corrupt-${Date.now()}`) } catch {} }
    return { users: {} }
  }
}
const db = loadDb()
db.users ||= {}
const emailIndex = new Map(Object.values(db.users).map(u => [u.email, u.id]))
function save() {
  const tmp = `${DB_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(db))
  fs.renameSync(tmp, DB_FILE)
}

/* ---------- token ---------- */
const sign = body => crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
function makeToken(uid) {
  const body = Buffer.from(JSON.stringify({ uid, exp: Date.now() + TOKEN_TTL })).toString('base64url')
  return `${body}.${sign(body)}`
}
function readToken(token) {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig) return null
  const want = Buffer.from(sign(body)), got = Buffer.from(sig)
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return p.exp > Date.now() ? p : null
  } catch { return null }
}

/* ---------- pembatas percobaan ---------- */
const tries = new Map()
function guard(key, max, windowMs) {
  const now = Date.now()
  const t = tries.get(key)
  if (t && t.until > now && t.count >= max) throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.')
  return t && t.until > now ? t : { count: 0, until: now + windowMs }
}
const fail = (key, t) => { t.count++; tries.set(key, t) }
setInterval(() => { const n = Date.now(); for (const [k, v] of tries) if (v.until < n) tries.delete(k) }, 600000).unref()

/* ---------- validasi ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const cleanEmail = v => String(v || '').trim().toLowerCase()
const publicUser = u => ({ id: u.id, email: u.email, name: u.name || '', avatar: u.avatar || '', theme: u.theme || null, banned: !!u.banned })
const hash = async (pw, salt) => (await scrypt(String(pw), salt, 64)).toString('hex')
const DUMMY_SALT = 'jelanwha-dummy-salt'

export async function registerUser(body = {}, ip = '') {
  const email = cleanEmail(body.email), password = String(body.password || ''), name = String(body.name || '').trim().slice(0, 40)
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Email tidak valid.')
  if (password.length < 8) throw new HttpError(400, 'Kata sandi minimal 8 karakter.')
  if (password.length > 128) throw new HttpError(400, 'Kata sandi terlalu panjang.')
  const key = `reg|${ip}`
  const t = guard(key, 10, 3600000)
  if (emailIndex.has(email)) throw new HttpError(409, 'Email sudah terdaftar. Silakan masuk.')
  fail(key, t)
  const salt = crypto.randomBytes(16).toString('hex')
  const user = { id: crypto.randomUUID(), email, name, salt, hash: await hash(password, salt), createdAt: Date.now(), data: { bookmarks: [], history: [], read: {} } }
  if (emailIndex.has(email)) throw new HttpError(409, 'Email sudah terdaftar. Silakan masuk.')
  db.users[user.id] = user
  emailIndex.set(email, user.id)
  save()
  return { token: makeToken(user.id), user: publicUser(user) }
}

export async function loginUser(body = {}, ip = '') {
  const email = cleanEmail(body.email), password = String(body.password || '')
  const key = `login|${ip}|${email}`
  const t = guard(key, 8, 600000)
  const user = db.users[emailIndex.get(email)]
  const computed = await hash(password, user ? user.salt : DUMMY_SALT)
  const ok = user && crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(user.hash))
  if (!ok) { fail(key, t); throw new HttpError(401, 'Email atau kata sandi salah. Belum punya akun? Buat akun dengan emailmu.') }
  tries.delete(key)
  return { token: makeToken(user.id), user: publicUser(user) }
}

export function authUser(req) {
  const m = /^Bearer (.+)$/.exec(req.headers?.authorization || '')
  const p = m && readToken(m[1])
  const user = p && db.users[p.uid]
  if (!user) throw new HttpError(401, 'Sesi berakhir. Silakan masuk lagi.')
  return publicUser(user)
}

// Seperti authUser, tapi tidak melempar error kalau belum login (untuk endpoint yang boleh dibaca publik).
export function tryAuthUser(req) { try { return authUser(req) } catch { return null } }

/* ---------- moderasi: ban / unban ---------- */
export function userInfo(uid) {
  const u = db.users[uid]
  return u ? { id: u.id, email: u.email, name: u.name || '', avatar: u.avatar || '', banned: !!u.banned, bannedReason: u.banned?.reason || '' } : null
}
export const isBanned = uid => !!db.users[uid]?.banned
export function banUser(uid, reason = 'Melanggar aturan komunitas') {
  const u = db.users[uid]
  if (!u) throw new HttpError(404, 'Pengguna tidak ditemukan.')
  u.banned = { at: Date.now(), reason: String(reason).slice(0, 200) }
  save()
  return userInfo(uid)
}
export function unbanUser(uid) {
  const u = db.users[uid]
  if (!u) throw new HttpError(404, 'Pengguna tidak ditemukan.')
  delete u.banned
  save()
  return userInfo(uid)
}

/* ---------- data akun (bookmark, riwayat, chapter terbaca) ---------- */
const str = (v, n) => (typeof v === 'string' || typeof v === 'number') ? String(v).slice(0, n) : ''
function sanitize(d = {}) {
  const arr = (a, max) => Array.isArray(a) ? a.slice(0, max) : []
  const bookmarks = arr(d.bookmarks, 500).map(b => ({
    manga_id: str(b?.manga_id ?? b?.id, 64), title: str(b?.title, 200), cover_portrait_url: str(b?.cover_portrait_url ?? b?.cover, 600),
    user_rate: Number(b?.user_rate) || 0, latest_chapter_number: str(b?.latest_chapter_number, 20)
  })).filter(b => b.manga_id)
  const history = arr(d.history, 100).map(h => ({
    id: str(h?.id, 64), title: str(h?.title, 200), cover: str(h?.cover, 600), chapterId: str(h?.chapterId, 64),
    chapterNumber: str(h?.chapterNumber, 20), chapterTitle: str(h?.chapterTitle, 200), at: Number(h?.at) || 0
  })).filter(h => h.id)
  const read = {}
  if (d.read && typeof d.read === 'object' && !Array.isArray(d.read)) {
    for (const [k, v] of Object.entries(d.read).slice(0, 1000)) {
      const key = str(k, 64)
      if (key && Array.isArray(v)) read[key] = [...new Set(v.slice(0, 3000).map(x => str(x, 64)).filter(Boolean))]
    }
  }
  return { bookmarks, history, read }
}
export function getUserData(uid) {
  const u = db.users[uid]
  if (!u) throw new HttpError(401, 'Sesi berakhir. Silakan masuk lagi.')
  return { ...(u.data || { bookmarks: [], history: [], read: {} }), updatedAt: u.updatedAt || 0 }
}
export function saveUserData(uid, body) {
  const u = db.users[uid]
  if (!u) throw new HttpError(401, 'Sesi berakhir. Silakan masuk lagi.')
  u.data = sanitize(body)
  u.updatedAt = Date.now()
  save()
  return { ok: true, updatedAt: u.updatedAt }
}

/* ---------- profil: nama, foto, tema warna ---------- */
const HEX = /^#[0-9a-f]{6}$/i
const THEME_BGS = ['auto', 'neutral', 'amoled']
const cleanName = v => String(v || '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)

export function updateProfile(uid, body = {}) {
  const u = db.users[uid]
  if (!u) throw new HttpError(401, 'Sesi berakhir. Silakan masuk lagi.')
  if (body && typeof body === 'object' && 'name' in body) {
    const name = cleanName(body.name)
    if (name && name.length < 2) throw new HttpError(400, 'Nama minimal 2 karakter.')
    u.name = name
  }
  if (body && typeof body === 'object' && 'theme' in body) {
    const t = body.theme
    if (t === null) delete u.theme
    else {
      if (!t || typeof t !== 'object' || !HEX.test(String(t.accent || '')) || !THEME_BGS.includes(t.bg)) throw new HttpError(400, 'Pengaturan warna tidak valid.')
      u.theme = { accent: t.accent.toLowerCase(), bg: t.bg }
    }
  }
  save()
  return { user: publicUser(u) }
}

// Simpan alamat foto profil baru (atau kosongkan). Mengembalikan alamat lama supaya filenya bisa dihapus.
export function setAvatar(uid, url) {
  const u = db.users[uid]
  if (!u) throw new HttpError(401, 'Sesi berakhir. Silakan masuk lagi.')
  const old = u.avatar || ''
  if (url) u.avatar = url; else delete u.avatar
  save()
  return { old, user: publicUser(u) }
}

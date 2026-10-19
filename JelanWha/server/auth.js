// Sesi API bertanda tangan HMAC; identitas pengguna diverifikasi melalui Firebase Authentication.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getFirebaseAdminAuth } from './firebaseAdmin.js'

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

/* ---------- validasi ---------- */
const cleanEmail = v => String(v || '').trim().toLowerCase()
const publicUser = u => ({ id: u.id, email: u.email, name: u.name || '', avatar: u.avatar || '', theme: u.theme || null, banned: !!u.banned })

// Firebase ID token diverifikasi server-side. UID Firebase dipetakan ke akun lokal agar
// komentar, bookmark, moderasi, dan sesi API tetap kompatibel dengan struktur proyek.
export async function loginFirebase(idToken, profile = {}) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_PATH && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new HttpError(503, 'Firebase Admin belum dikonfigurasi. Atur FIREBASE_SERVICE_ACCOUNT_PATH di .env.')
  }
  if (typeof idToken !== 'string' || idToken.length > 12000) throw new HttpError(400, 'Token Firebase tidak valid.')
  let payload
  try { payload = await getFirebaseAdminAuth().verifyIdToken(idToken) }
  catch (e) {
    if (String(e?.message || '').includes('default credentials') || String(e?.message || '').includes('credential') || String(e?.code || '') === 'ENOENT') {
      throw new HttpError(503, 'Firebase Admin belum dikonfigurasi. Atur FIREBASE_SERVICE_ACCOUNT_PATH di .env.')
    }
    throw new HttpError(401, 'Token Firebase tidak valid atau kedaluwarsa. Silakan masuk lagi.')
  }
  if (!payload?.uid || !payload.email || payload.email_verified !== true) throw new HttpError(401, 'Akun Google harus memiliki email terverifikasi.')
  const email = cleanEmail(payload.email)
  const uid = String(payload.uid)
  const profileName = cleanName(profile?.name || payload.name || '')
  let user = Object.values(db.users).find(u => u.firebaseUid === uid)
  if (!user) {
    const existingId = emailIndex.get(email)
    if (existingId) {
      user = db.users[existingId]
      user.firebaseUid = uid
      if (profileName) user.name = profileName
      if (!user.avatar && payload.picture) user.avatar = String(payload.picture).slice(0, 600)
    } else {
      user = {
        id: crypto.randomUUID(), email, name: profileName,
        avatar: String(profile?.avatar || payload.picture || '').slice(0, 600), firebaseUid: uid,
        createdAt: Date.now(), data: { bookmarks: [], history: [], read: {} }
      }
      db.users[user.id] = user
      emailIndex.set(email, user.id)
    }
    save()
  } else if (profileName && user.name !== profileName) {
    user.name = profileName
    save()
  }
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

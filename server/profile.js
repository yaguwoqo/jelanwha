// Foto profil: unggah (sudah dipotong persegi & dikecilkan di browser), ganti, hapus.
// File disimpan di data/uploads/ dengan awalan "av-" (terpisah dari gambar komentar).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { HttpError, authUser, setAvatar } from './auth.js'
import { UPLOAD_DIR, sniff } from './comments.js'

const MAX_AVATAR = 1024 * 1024
const log = new Map()
function quota(uid) {
  const now = Date.now(), list = (log.get(uid) || []).filter(t => now - t < 3600000)
  if (list.length >= 10) throw new HttpError(429, 'Terlalu sering ganti foto. Coba lagi nanti.')
  list.push(now); log.set(uid, list)
}
function removeOld(url) {
  const m = /^\/uploads\/(av-[a-f0-9]{32}\.(?:jpg|png|webp))$/.exec(url || '')
  if (m) { try { fs.unlinkSync(path.join(UPLOAD_DIR, m[1])) } catch {} }
}

export function uploadAvatar(req) {
  const user = authUser(req)
  const buf = req.body
  if (!Buffer.isBuffer(buf) || !buf.length) throw new HttpError(400, 'Format foto harus JPG, PNG, atau WEBP.')
  if (buf.length > MAX_AVATAR) throw new HttpError(413, 'Foto terlalu besar (maksimal 1 MB).')
  const ext = sniff(buf)   // tipe ditentukan dari isi file
  if (!ext || ext === 'gif') throw new HttpError(400, 'File bukan foto yang valid (JPG, PNG, WEBP).')
  quota(user.id)
  const name = `av-${crypto.randomBytes(16).toString('hex')}.${ext}`
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf, { flag: 'wx' })
  const { old, user: updated } = setAvatar(user.id, `/uploads/${name}`)
  removeOld(old)
  return { user: updated }
}

export function removeAvatar(req) {
  const user = authUser(req)
  const { old, user: updated } = setAvatar(user.id, '')
  removeOld(old)
  return { user: updated }
}

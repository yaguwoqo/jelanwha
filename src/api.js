// Semua request lewat backend adapter (/api/*) supaya base API gampang diganti.
const TOKEN_KEY = 'jelanwha-token'
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' } }
export const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch {} }

async function request(path, { method = 'GET', body, raw } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (raw) headers['Content-Type'] = raw.type
  else if (body !== undefined) headers['Content-Type'] = 'application/json'
  let response
  try { response = await fetch(path, { method, headers, body: raw || (body !== undefined ? JSON.stringify(body) : undefined) }) }
  catch { throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet atau pastikan server berjalan.') }
  if (!response.ok) {
    let msg = '', code = ''
    try { const j = await response.json(); msg = j?.message || ''; code = j?.code || '' } catch {}
    const err = new Error(msg || `Gagal mengambil data (${response.status})`)
    err.status = response.status; err.code = code
    throw err
  }
  const payload = await response.json()
  if (payload?.retcode !== undefined && payload.retcode !== 0) throw new Error(payload.message || 'API tidak tersedia')
  return payload
}

const toArray = d => Array.isArray(d) ? d : (d?.results || d?.items || d?.list || [])

// Mengubah respons daftar (dengan atau tanpa meta paginasi) jadi bentuk seragam.
function parseList(payload, page, pageSize) {
  const items = toArray(payload?.data)
  const meta = payload?.meta || payload?.data?.meta || payload?.pagination || {}
  const totalRecord = Number(meta.total_record ?? meta.total ?? meta.totalRecord ?? 0) || 0
  let totalPage = Number(meta.total_page ?? meta.totalPage ?? meta.total_pages ?? 0) || 0
  if (!totalPage && totalRecord) totalPage = Math.ceil(totalRecord / pageSize)
  const hasNext = totalPage ? page < totalPage : items.length >= pageSize
  return { items, page, pageSize, totalPage, totalRecord, hasNext }
}

const qs = obj => Object.entries(obj)
  .filter(([, v]) => v !== '' && v !== undefined && v !== null)
  .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')

export async function getList({ q = '', sort = '', genre = '', page = 1, pageSize = 24 } = {}) {
  return parseList(await request(`/api/list?${qs({ q, sort, genre, page, page_size: pageSize })}`), page, pageSize)
}
export async function getTop({ page = 1, pageSize = 24, filter = 'daily' } = {}) {
  return parseList(await request(`/api/top?${qs({ filter, page, page_size: pageSize })}`), page, pageSize)
}
export async function getGenres() {
  const p = await request('/api/genres')
  return toArray(p?.data)
    .map(g => typeof g === 'string' ? { id: '', name: g } : { id: g.genre_id ?? g.id ?? '', name: g.name || g.genre_name || '' })
    .filter(g => g.name)
}
export async function getManga(id) {
  return (await request(`/api/manga/${encodeURIComponent(id)}`))?.data
}
export async function getChapter(id) {
  return (await request(`/api/chapter/${encodeURIComponent(id)}`))?.data
}

export function normalizeManga(m) {
  return {
    id: m?.manga_id || m?.id || '',
    title: m?.title || 'Tanpa judul',
    cover: m?.cover || m?.cover_portrait_url || m?.cover_image_url || m?.cover_url || '',
    description: m?.description || '',
    rating: Number(m?.user_rate ?? m?.rating ?? 0) || 0,
    genres: (m?.taxonomy?.Genre || m?.genres || []).map(x => typeof x === 'string' ? x : x?.name).filter(Boolean),
    latest: m?.latest_chapter_number || m?.latest || '',
    status: m?.status === 2 ? 'Completed' : (m?.status === 1 ? 'Ongoing' : (m?.status || 'Ongoing')),
    chapters: m?.chapters || []
  }
}

/* ---------- akun ---------- */
export const authRegister = ({ email, password, name }) => request('/api/auth/register', { method: 'POST', body: { email, password, name } })
export const authLogin = ({ email, password }) => request('/api/auth/login', { method: 'POST', body: { email, password } })
export const authMe = () => request('/api/auth/me')
export const fetchUserData = () => request('/api/user/data')
export const pushUserData = data => request('/api/user/data', { method: 'PUT', body: data })

/* ---------- komentar, reaksi, gambar ---------- */
export const getComments = (chapterId, { page = 1, sort = 'new' } = {}) => request(`/api/comments/${encodeURIComponent(chapterId)}?${qs({ page, sort })}`)
export const postComment = (chapterId, body) => request(`/api/comments/${encodeURIComponent(chapterId)}`, { method: 'POST', body })
export const deleteComment = id => request(`/api/comments/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const reportComment = id => request(`/api/comments/${encodeURIComponent(id)}/report`, { method: 'POST', body: {} })
export const sendReaction = body => request('/api/react', { method: 'PUT', body })
export const uploadImage = blob => request('/api/upload', { method: 'POST', raw: blob })

/* ---------- profil: nama, foto, tema ---------- */
export const updateProfile = body => request('/api/profile', { method: 'PUT', body })
export const uploadAvatar = blob => request('/api/profile/avatar', { method: 'POST', raw: blob })
export const removeAvatar = () => request('/api/profile/avatar', { method: 'DELETE' })

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

export async function getList({ q = '', sort = '', genre = '', type = '', page = 1, pageSize = 24 } = {}) {
  return parseList(await request(`/api/list?${qs({ q, sort, genre, type, page, page_size: pageSize })}`), page, pageSize)
}
// Isi halaman utama sekali panggil: { banner, popular, latest: { manhwa }, counts }
export async function getHome() {
  const d = (await request('/api/home'))?.data || {}
  return { banner: d.banner || [], popular: d.popular || [], latest: d.latest || {}, counts: d.counts || {} }
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

/* ---------- jenis komik: manhwa (KR), manhua (CN), manga (JP) ---------- */
export const KINDS = ['manhwa', 'manhua', 'manga']
export const KIND_LABEL = { manhwa: 'Manhwa', manhua: 'Manhua', manga: 'Manga' }
const BY_COUNTRY = { KR: 'manhwa', CN: 'manhua', TW: 'manhua', HK: 'manhua', JP: 'manga' }
const firstOf = v => Array.isArray(v) ? v[0] : v
export function kindOf(m) {
  const c = String(firstOf(m?.country_id) ?? firstOf(m?.country) ?? '').toUpperCase()
  if (BY_COUNTRY[c]) return BY_COUNTRY[c]
  const fmt = [m?.taxonomy?.Format, m?.format].flat().filter(Boolean).map(x => String(typeof x === 'string' ? x : x?.name).toLowerCase())
  return KINDS.find(k => fmt.includes(k)) || ''
}

// Buang label sumber (mis. "[Shinigami]", "shinigami.asia", "- Shinigami") dari judul/sinopsis.
// Sengaja sempit supaya judul asli yang memang memuat kata "Shinigami" tidak ikut terhapus.
const BRAND = [/[\[(【]\s*shinigami(?:\s*id)?\s*[\])】]/gi, /\bshinigami\.(?:asia|id|com|net|io)\b/gi, /\s*[-–|·•]\s*shinigami(?:\s*id)?\s*$/gi, /^\s*shinigami(?:\s*id)?\s*[-–|:·•]\s+/gi]
export const cleanText = s => BRAND.reduce((t, re) => t.replace(re, ' '), String(s ?? '')).replace(/[ \t]{2,}/g, ' ').trim()

const STATUS = { 1: 'Ongoing', 2: 'Completed', 3: 'Hiatus', 4: 'Dropped' }
export function normalizeManga(m) {
  return {
    id: m?.manga_id || m?.id || '',
    title: cleanText(m?.title) || 'Tanpa judul',
    cover: m?.cover || m?.cover_portrait_url || m?.cover_image_url || m?.cover_url || '',
    description: cleanText(m?.description),
    rating: Number(m?.user_rate ?? m?.rating ?? 0) || 0,
    genres: (m?.taxonomy?.Genre || m?.genres || []).map(x => typeof x === 'string' ? x : x?.name).filter(Boolean),
    latest: m?.latest_chapter_number || m?.latest || '',
    updatedAt: Date.parse(m?.latest_chapter_time || '') || 0,
    kind: kindOf(m),
    ongoing: m?.status === 1 || /^ongoing$/i.test(String(m?.status ?? '')),
    status: STATUS[m?.status] || m?.status || 'Ongoing',
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

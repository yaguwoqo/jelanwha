// Katalog lengkap (±1000 judul) di-cache di memori, lalu disaring per jenis: manhwa (KR), manhua (CN), manga (JP).
// Dengan begini filter jenis tidak bergantung pada parameter khusus dari API sumber.
export const KINDS = ['manhwa', 'manhua', 'manga']
const BY_COUNTRY = { KR: 'manhwa', CN: 'manhua', TW: 'manhua', HK: 'manhua', JP: 'manga' }

const first = v => Array.isArray(v) ? v[0] : v
const names = v => (Array.isArray(v) ? v : [v]).map(x => typeof x === 'string' ? x : x?.name).filter(Boolean)
const num = v => Number(v) || 0

// Jenis dari kode negara; kalau kosong, coba dari taxonomy/format.
export function kindOf(m) {
  const c = String(first(m?.country_id) ?? first(m?.country) ?? '').toUpperCase()
  if (BY_COUNTRY[c]) return BY_COUNTRY[c]
  const fmt = [...names(m?.taxonomy?.Format || []), ...names(m?.format || [])].map(s => String(s).toLowerCase())
  return KINDS.find(k => fmt.includes(k)) || ''
}
export const isOngoing = m => m?.status === 1 || /^ongoing$/i.test(String(m?.status ?? ''))
export const updatedAt = m => Date.parse(m?.latest_chapter_time || m?.updated_at || '') || 0
const hasCover = m => !!(m?.cover_portrait_url || m?.cover_image_url || m?.cover || m?.cover_url)

const rowsOf = r => Array.isArray(r?.data) ? r.data : (r?.data?.results || r?.data?.items || [])
const dedupe = rows => { const seen = new Set(); return rows.filter(m => { const k = m?.manga_id || m?.id; if (!k || seen.has(k)) return false; seen.add(k); return true }) }

// Ambil semua halaman dari satu endpoint daftar (page_size 500 dulu; kalau ditolak, turun ke 100).
export async function fetchPages(upstream, path, { sizes = [500, 100], maxItems = 1000 } = {}) {
  let lastErr
  for (const size of sizes) {
    try {
      const head = await upstream(`${path}&page=1&page_size=${size}`)
      let all = rowsOf(head)
      const totalPage = Math.min(Math.ceil(maxItems / size), Number(head?.meta?.total_page) || (all.length >= size ? 2 : 1))
      if (totalPage > 1) {
        const rest = await Promise.all(Array.from({ length: totalPage - 1 }, (_, i) => upstream(`${path}&page=${i + 2}&page_size=${size}`).then(rowsOf).catch(() => [])))
        for (const r of rest) all = all.concat(r)
      }
      if (!all.length) throw new Error('Katalog kosong')
      return dedupe(all)
    } catch (e) { lastErr = e }
  }
  throw lastErr
}

export function filterRows(rows, { type = '', q = '' } = {}) {
  let list = type ? rows.filter(m => kindOf(m) === type) : rows
  const needle = String(q || '').trim().toLowerCase()
  if (needle) list = list.filter(m => [m.title, m.alternative_title].some(t => String(t || '').toLowerCase().includes(needle)))
  return list
}
export function sortRows(rows, sort = 'latest') {
  if (sort === 'popular') return [...rows].sort((a, b) => num(b.view_count) - num(a.view_count))
  if (sort === 'rating') return [...rows].sort((a, b) => num(b.user_rate) - num(a.user_rate))
  if (sort === 'title') return [...rows].sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
  return rows   // 'latest': urutan katalog (terbaru dulu)
}
export function paginate(list, page, size) {
  const total = list.length, totalPage = Math.max(1, Math.ceil(total / size))
  return { retcode: 0, message: 'ok', meta: { page, page_size: size, total_page: totalPage, total_record: total }, data: list.slice((page - 1) * size, page * size) }
}

// Isi halaman utama dalam satu respons: banner, populer, dan update manhwa terbaru.
export function buildHome(rows, topRows = []) {
  const manhwa = rows.filter(m => kindOf(m) === 'manhwa')

  // Banner: manhwa yang masih ongoing dan paling baru update. Bukan yang terpopuler.
  const covered = rows.filter(hasCover)
  const t1 = covered.filter(m => kindOf(m) === 'manhwa' && isOngoing(m))
  const t2 = covered.filter(isOngoing)
  const t3 = covered.filter(m => kindOf(m) === 'manhwa')
  let banner = t1.slice(0, 6)
  if (banner.length < 3) banner = dedupe([...t1, ...t2, ...t3, ...covered]).slice(0, 6)

  return {
    banner,
    popular: topRows.length ? topRows : sortRows(rows, 'popular').slice(0, 12),
    latest: { manhwa: manhwa.slice(0, 18) },
    counts: { all: rows.length, ...Object.fromEntries(KINDS.map(k => [k, rows.filter(m => kindOf(m) === k).length])) }
  }
}

// Cache katalog: segar 5 menit; setelah itu data lama tetap dipakai sambil diperbarui di belakang layar.
export function createCatalog(upstream, { ttl = 5 * 60 * 1000 } = {}) {
  let cache = null, at = 0, inflight = null
  const refresh = () => {
    if (!inflight) {
      inflight = fetchPages(upstream, '/manga/list?sort=latest')
        .then(rows => { cache = [...rows].sort((a, b) => updatedAt(b) - updatedAt(a)); at = Date.now(); return cache })
        .finally(() => { inflight = null })
    }
    return inflight
  }
  const get = async () => {
    if (cache && Date.now() - at < ttl) return cache
    if (cache) { refresh().catch(() => {}); return cache }
    return refresh()
  }
  return {
    get,
    async home(topFetcher) {
      const [rows, top] = await Promise.all([get(), Promise.resolve().then(topFetcher).catch(() => [])])
      return buildHome(rows, top)
    },
    // Daftar per jenis. Dengan genre: ambil daftar genre itu dari sumber lalu saring jenisnya.
    async list({ type = '', q = '', sort = 'latest', genre = '', page = 1, size = 24 } = {}) {
      const rows = genre ? await fetchPages(upstream, `/manga/list?sort=latest&genre_include=${encodeURIComponent(genre)}`) : await get()
      return paginate(sortRows(filterRows(rows, { type, q }), sort), page, size)
    }
  }
}

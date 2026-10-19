// Tema warna: warna aksen + gaya latar. Semua warna web memakai variabel CSS (--h, --s, --l, --lilac, ...),
// jadi cukup mengubah variabel itu di <html> dan seluruh tampilan ikut berubah.
const KEY = 'jelanwha-theme'
const VKEY = 'jelanwha-theme-vars'   // variabel hasil hitung; dibaca skrip kecil di index.html supaya tidak berkedip saat dibuka

export const DEFAULT_THEME = { accent: '#b8a2f5', bg: 'auto' }
export const ACCENTS = [
  { name: 'Lilac', hex: '#b8a2f5' }, { name: 'Biru', hex: '#6ea8ff' }, { name: 'Cyan', hex: '#5fd4e8' }, { name: 'Hijau', hex: '#6fdc9a' },
  { name: 'Kuning', hex: '#f2c94c' }, { name: 'Oranye', hex: '#ff9f5a' }, { name: 'Merah', hex: '#ff6b7a' }, { name: 'Pink', hex: '#ff8ccf' }
]
export const BGS = [
  { id: 'auto', name: 'Mengikuti aksen', hint: 'Latar sedikit berwarna', s: 1, l: 1 },
  { id: 'neutral', name: 'Abu netral', hint: 'Latar abu-abu gelap', s: 0.1, l: 1 },
  { id: 'amoled', name: 'Hitam pekat', hint: 'Hemat baterai di layar AMOLED', s: 0.35, l: 0.55 }
]
const HEX = /^#[0-9a-f]{6}$/i
export const cleanTheme = t => ({
  accent: HEX.test(t?.accent || '') ? t.accent.toLowerCase() : DEFAULT_THEME.accent,
  bg: BGS.some(b => b.id === t?.bg) ? t.bg : DEFAULT_THEME.bg
})
export const sameTheme = (a, b) => { a = cleanTheme(a); b = cleanTheme(b); return a.accent === b.accent && a.bg === b.bg }

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0, s = 0; const l = (max + min) / 2
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1))
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60; if (h < 0) h += 360
  }
  return { h, s: s * 100, l: l * 100 }
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l)
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))))
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('')
}

export function themeVars(theme) {
  const t = cleanTheme(theme), bg = BGS.find(b => b.id === t.bg)
  const o = hexToHsl(t.accent)
  const l = Math.min(88, Math.max(48, o.l))          // aksen terlalu gelap/terang jadi sulit dibaca → dibatasi
  const accent = l === o.l ? t.accent : hslToHex(o.h, o.s, l)
  const rgb = [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16))
  const bright = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.52
  return {
    '--h': String(Math.round(o.h)), '--s': String(bg.s), '--l': String(bg.l),
    '--lilac': accent, '--lilac2': hslToHex(o.h, o.s, Math.max(20, l - 9)), '--lilac-hover': hslToHex(o.h, o.s, Math.min(94, l + 7)),
    '--lilac-rgb': rgb.join(' '), '--on-accent': bright ? hslToHex(o.h, 30, 13) : '#ffffff',
    meta: hslToHex(((Math.round(o.h) - 6) + 360) % 360, 15.8 * bg.s, 7.5 * bg.l)
  }
}

// Terapkan ke halaman (tanpa menyimpan) — dipakai juga untuk pratinjau langsung.
export function applyTheme(theme) {
  const vars = themeVars(theme)
  const root = document.documentElement.style
  for (const [k, v] of Object.entries(vars)) if (k.startsWith('--')) root.setProperty(k, v)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', vars.meta)
  return vars
}
export function loadTheme() {
  try { return cleanTheme(JSON.parse(localStorage.getItem(KEY) || 'null')) } catch { return { ...DEFAULT_THEME } }
}
// Terapkan + simpan di perangkat ini.
export function commitTheme(theme) {
  const t = cleanTheme(theme), vars = applyTheme(t)
  try { localStorage.setItem(KEY, JSON.stringify(t)); localStorage.setItem(VKEY, JSON.stringify(vars)) } catch {}
  return t
}

// Penjaga spoiler berbasis pola teks. Ini BUKAN pengertian makna: tidak bisa tahu apakah sebuah kalimat
// benar-benar membocorkan cerita, dan tidak bisa menilai gambar. Karena itu ada dua tingkat:
//  - 'hard' : spoiler yang jelas disengaja (penanda spoiler / teks tersembunyi ||...||) → komentar ditolak + akun di-ban
//  - 'soft' : terindikasi membocorkan chapter berikutnya/ending → komentar ditolak + peringatan (tidak di-ban)
// Sisanya (termasuk gambar) ditangani lewat tombol "Laporkan spoiler" dan keputusan admin.

const clean = t => String(t || '').normalize('NFKC').replace(/[\u200b-\u200f\u2060\ufeff]/g, '')

const NEG = '(?:no|tanpa|anti|jangan|gak|nggak|ga|tdk|tidak|bebas|zero|non)'
const NEG_RE = new RegExp(`\\b${NEG}[\\s-]*(?:ada[\\s-]*)?(?:spoilers?|bocor(?:an)?)\\b`, 'gi')

const HARD = [
  /\|\|[^|]{2,}\|\|/,                          // ||teks tersembunyi||
  />![\s\S]{2,}?!</,                           // >!teks tersembunyi!<
  /[\[(<{]\s*spoilers?\s*[\])>}]/i,            // [spoiler] (spoiler) <spoiler>
  /\bspoilers?\s*(?:alert|warning|ahead|incoming)\b/i,
  /\bspoilers?\s*[:!]/i                         // "spoiler: ..." / "spoiler!"
]

const FUTURE = '(?:chapter|chap|ch|bab|eps?|episode)\\s*(?:depan|selanjutnya|berikutnya|next|nanti)|(?:ending|endingnya|akhir cerita|season\\s*(?:depan|berikutnya|\\d+))|(?:nanti|ke depan|kedepannya)'
const REVEAL = '(?:mati|tewas|meninggal|dibunuh|terbunuh|berkhianat|pengkhianat|hamil|selingkuh|menikah|ternyata|terungkap|bangkit|kalah|menang|jadi villain|identitas)'
const SOFT = [
  new RegExp(`(?:${FUTURE})[^.!?\\n]{0,60}\\b${REVEAL}\\b`, 'i'),
  new RegExp(`\\b${REVEAL}\\b[^.!?\\n]{0,60}(?:${FUTURE})`, 'i'),
  /\b(?:bocoran|bocorin|ngebocor|membocorkan|nge-?spoiler|ngespoiler)\b/i
]

export function checkSpoiler(text) {
  const t = clean(text)
  const stripped = t.replace(NEG_RE, ' ')
  // "s p o i l e r" / "s.p.o.i.l.e.r" dijaga lewat versi tanpa pemisah, hanya untuk penanda spoiler yang eksplisit
  const squashed = stripped.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (HARD.some(re => re.test(stripped)) || /spoileralert|spoilerwarning/.test(squashed)) return { level: 'hard' }
  if (SOFT.some(re => re.test(stripped))) return { level: 'soft' }
  return { level: 'ok' }
}

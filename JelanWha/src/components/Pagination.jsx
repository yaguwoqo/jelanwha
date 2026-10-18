import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set([1, 2, total - 1, total, cur - 1, cur, cur + 1])
  if (cur <= 4) [3, 4, 5].forEach(n => set.add(n))
  if (cur >= total - 3) [total - 4, total - 3, total - 2].forEach(n => set.add(n))
  const nums = [...set].filter(n => n >= 1 && n <= total).sort((a, b) => a - b)
  const out = []
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] === 2) out.push(n - 1)
    else if (i && n - nums[i - 1] > 2) out.push('…')
    out.push(n)
  })
  return out
}

// [‹ Sebelumnya]  1 2 3 … 20  [Berikutnya ›]
export default function Pagination({ page, totalPage = 0, hasNext, onChange }) {
  const last = totalPage || 0
  const canNext = last ? page < last : !!hasNext
  if (page <= 1 && !canNext) return null
  return <nav className="pagination" aria-label="Halaman">
    <button className="pg-btn pg-edge" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Halaman sebelumnya"><ChevronLeft size={16} /><span>Sebelumnya</span></button>
    <div className="pg-numbers">
      {last ? pageList(page, last).map((n, i) => n === '…'
        ? <span key={`e${i}`} className="pg-gap">…</span>
        : <button key={n} className={`pg-btn pg-num ${n === page ? 'current' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => n !== page && onChange(n)}>{n}</button>)
        : <>{page > 1 && <button className="pg-btn pg-num" onClick={() => onChange(page - 1)}>{page - 1}</button>}<button className="pg-btn pg-num current" aria-current="page">{page}</button>{canNext && <button className="pg-btn pg-num" onClick={() => onChange(page + 1)}>{page + 1}</button>}</>}
    </div>
    <button className="pg-btn pg-edge" disabled={!canNext} onClick={() => onChange(page + 1)} aria-label="Halaman berikutnya"><span>Berikutnya</span><ChevronRight size={16} /></button>
  </nav>
}

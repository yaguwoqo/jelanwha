import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

// Dropdown buatan sendiri (bukan <select> bawaan browser) supaya tampilannya
// sama di semua perangkat: daftar rapi, ada centang pilihan, bisa dicari.
export default function Dropdown({ value, options, onChange, label, icon: Icon, searchable = false, className = '' }) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(-1)
  const root = useRef(null)
  const list = useRef(null)
  const shown = useMemo(() => {
    const t = term.trim().toLowerCase()
    return t ? options.filter(o => o.label.toLowerCase().includes(t)) : options
  }, [options, term])
  const current = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (!root.current?.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  useEffect(() => {
    if (!open) return
    setTerm('')
    setActive(options.findIndex(o => o.value === value))
    const t = requestAnimationFrame(() => {
      const box = list.current, el = box?.querySelector('[aria-selected="true"]')
      if (box && el) box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2
    })
    return () => cancelAnimationFrame(t)
  }, [open])

  const pick = o => { onChange(o.value); setOpen(false) }
  const onKeyDown = e => {
    if (!open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key) && e.target.tagName === 'BUTTON') { e.preventDefault(); setOpen(true) } return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(shown.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' && shown[active]) { e.preventDefault(); pick(shown[active]) }
  }
  useEffect(() => {
    const el = list.current?.querySelector('.dd-option.active')
    if (el && list.current) {
      const b = list.current
      if (el.offsetTop < b.scrollTop) b.scrollTop = el.offsetTop
      else if (el.offsetTop + el.clientHeight > b.scrollTop + b.clientHeight) b.scrollTop = el.offsetTop + el.clientHeight - b.clientHeight
    }
  }, [active])

  return <div className={`dd ${open ? 'open' : ''} ${className}`} ref={root} onKeyDown={onKeyDown}>
    {label && <span className="dd-label">{label}</span>}
    <button type="button" className="dd-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      {Icon && <Icon size={15} />}
      <span className="dd-value">{current?.label ?? '—'}</span>
      <ChevronDown size={16} className="dd-caret" />
    </button>
    {open && <>
      <div className="dd-backdrop" onClick={() => setOpen(false)} />
      <div className="dd-panel" role="listbox">
        <div className="dd-grab" />
        {searchable && <div className="dd-search"><Search size={14} /><input autoFocus value={term} onChange={e => { setTerm(e.target.value); setActive(0) }} placeholder="Cari…" aria-label="Cari pilihan" /></div>}
        <div className="dd-list" ref={list}>
          {shown.length ? shown.map((o, i) => <button type="button" key={o.value} role="option" aria-selected={o.value === value}
            className={`dd-option ${o.value === value ? 'selected' : ''} ${i === active ? 'active' : ''}`}
            onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
            <span>{o.label}</span>{o.value === value && <Check size={15} />}
          </button>) : <div className="dd-none">Tidak ditemukan</div>}
        </div>
      </div>
    </>}
  </div>
}

import React, { useEffect, useState } from 'react'

// Foto profil bulat; kalau belum ada foto (atau gagal dimuat) tampil huruf pertama nama.
export default function Avatar({ src, name, className = '' }) {
  const [bad, setBad] = useState(false)
  useEffect(() => { setBad(false) }, [src])
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'
  return <span className={className} aria-hidden="true">{src && !bad ? <img src={src} alt="" draggable={false} onError={() => setBad(true)} /> : initial}</span>
}

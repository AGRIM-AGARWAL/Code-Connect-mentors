import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SOUND_ON, isMuted, onMuteChange, setMuted, unlockAudio } from '../audio/sfx'

/** Fixed backdrop: grid + accent wash, drifting fog, scanlines, film grain. */
export function Backdrop({ wash }: { wash?: string }) {
  useEffect(() => {
    if (wash) document.documentElement.style.setProperty('--wash', wash)
  }, [wash])
  return (
    <>
      <div className="fx fx-grid" aria-hidden />
      <div className="fx fx-fog" aria-hidden />
      <div className="fx fx-scan" aria-hidden />
      <svg className="fx fx-grain" aria-hidden>
        <filter id="cc-grain">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#cc-grain)" />
      </svg>
    </>
  )
}

export function MuteToggle() {
  return SOUND_ON ? <MuteButton /> : null
}

function MuteButton() {
  const [m, setM] = useState(isMuted())
  useEffect(() => {
    const off = onMuteChange(setM)
    return () => {
      off()
    }
  }, [])
  return (
    <button
      className="icon-btn"
      aria-pressed={m}
      aria-label={m ? 'Sound off. Turn sound on' : 'Sound on. Turn sound off'}
      title={m ? 'Sound off' : 'Sound on'}
      onClick={() => {
        unlockAudio()
        setMuted(!m)
      }}
    >
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        {m ? (
          <path d="m22 9-6 6M16 9l6 6" />
        ) : (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 5a10 10 0 0 1 0 14" />
          </>
        )}
      </svg>
    </button>
  )
}

/** Top row on every student screen: a mono label on the left, mute on the right. */
export function TopBar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="topbar">
      <div className="mono c-muted">{left}</div>
      <div className="topbar-right">
        {right}
        <MuteToggle />
      </div>
    </div>
  )
}

export function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error && (
        <div className="err-line" role="alert" id={`${htmlFor}-err`}>
          <span className="tag">ERR</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="loading">
      <span className="spinner big" />
      <span className="mono c-muted">{text}</span>
    </div>
  )
}

/** Desktop-only reticle cursor that grows into brackets over interactive elements. */
export function Reticle() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let x = -100, y = -100, cx = -100, cy = -100, raf = 0
    const move = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      const hot = (e.target as Element)?.closest?.('a,button,[role="button"],select,input,label')
      ref.current?.classList.toggle('hot', !!hot)
    }
    const loop = () => {
      cx += (x - cx) * 0.15
      cy += (y - cy) * 0.15
      if (ref.current) ref.current.style.transform = `translate3d(${cx}px, ${cy}px, 0)`
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('pointermove', move)
    raf = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(raf)
    }
  }, [])
  return <div ref={ref} className="reticle" aria-hidden />
}

/** Light particle fog on desktop (canvas, ~180 soft dots drifting toward the cursor). Off on phones / reduced motion. */
export function FogCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    if (!window.matchMedia('(min-width: 900px) and (hover: hover)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const g = c.getContext('2d')
    if (!g) return
    let w = 0, h = 0, raf = 0, mx = 0.5, my = 0.5, ox = 0, oy = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const resize = () => {
      w = c.width = innerWidth * dpr
      h = c.height = innerHeight * dpr
      c.style.width = innerWidth + 'px'
      c.style.height = innerHeight + 'px'
    }
    resize()
    const cols = ['111,166,161', '201,166,107', '124,147,176', '228,225,218']
    const P = Array.from({ length: 180 }, () => ({
      x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7,
      r: 0.6 + Math.random() * 1.8, vx: (Math.random() - 0.5) * 0.00008, vy: -0.00004 - Math.random() * 0.00008,
      c: cols[Math.floor(Math.random() * cols.length)], a: 0.08 + Math.random() * 0.22,
    }))
    const onMove = (e: PointerEvent) => {
      mx = e.clientX / innerWidth
      my = e.clientY / innerHeight
    }
    let last = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden || t - last < 30) return // ~30 fps cap
      last = t
      ox += ((mx - 0.5) * 0.03 - ox) * 0.08
      oy += ((my - 0.5) * 0.03 - oy) * 0.08
      g.clearRect(0, 0, w, h)
      for (const p of P) {
        p.x += p.vx
        p.y += p.vy
        if (p.y < -0.05) { p.y = 1.05; p.x = Math.random() }
        if (p.x < -0.05) p.x = 1.05
        if (p.x > 1.05) p.x = -0.05
        const px = (p.x + ox * p.z) * w
        const py = (p.y + oy * p.z) * h
        g.beginPath()
        g.fillStyle = `rgba(${p.c},${p.a * p.z})`
        g.arc(px, py, p.r * dpr * p.z * 1.4, 0, Math.PI * 2)
        g.fill()
      }
    }
    addEventListener('resize', resize)
    addEventListener('pointermove', onMove)
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', resize)
      removeEventListener('pointermove', onMove)
    }
  }, [])
  return <canvas ref={ref} className="fx fx-canvas" aria-hidden />
}

/** Magnetic hover: element follows the pointer by 20% of the offset, max 8px. */
export function useMagnetic<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const dx = Math.max(-8, Math.min(8, (e.clientX - (r.left + r.width / 2)) * 0.2))
      const dy = Math.max(-8, Math.min(8, (e.clientY - (r.top + r.height / 2)) * 0.2))
      el.style.transform = `translate(${dx}px, ${dy}px)`
    }
    const leave = () => {
      el.style.transform = ''
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [])
  return ref
}

/** Mentor photo tile: real photo if we have one, otherwise striped tile with initials. */
export function PhotoTile({ url, initials, color, size, className = '', label }: { url?: string | null; initials?: string; color?: string; size?: number; className?: string; label?: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className={`photo ${className}`}>
      {url && !broken ? (
        <>
          <img className="photo-bg" src={url} alt="" aria-hidden="true" />
          <img className="photo-fit" src={url} alt={label ?? ''} loading="lazy" onError={() => setBroken(true)} />
        </>
      ) : initials ? (
        <span className="ini" style={{ color, fontSize: size }}>{initials}</span>
      ) : null}
    </div>
  )
}

export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const f = () => setM(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [q])
  return m
}

import { useEffect, useRef, useState } from 'react'
import { Loading, MuteToggle, PhotoTile, useMagnetic, useMedia } from '../components/Shell'
import { errMsg, rpc, type Mentor } from '../lib/api'
import { LOCAL_PHOTOS, RANKS, accentFor, firstName, hexA, initials, pad2 } from '../lib/mentorStyle'
import { playSelectVoice, sfx } from '../audio/sfx'

type M = Mentor & { idx: number; accent: string; first: string; ini: string; num: string }

export function decorate(mentors: Mentor[]): M[] {
  return mentors.map((m, i) => ({
    ...m,
    idx: i,
    accent: accentFor(m.accent, i),
    photo_url: m.photo_url || LOCAL_PHOTOS[m.id] || null,
    first: firstName(m.name),
    ini: initials(m.name),
    num: pad2(i + 1),
  }))
}

export default function Select({ token, mentors: raw, onSaved }: { token: string; mentors: Mentor[] | null; onSaved: () => void }) {
  const desktop = useMedia('(min-width: 980px)')
  const [focus, setFocus] = useState(0)
  const [slots, setSlots] = useState<number[]>([])
  const [zoom, setZoom] = useState(0)
  const [locked, setLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mentors = raw ? decorate(raw) : null

  // voice line once the roster is on screen
  useEffect(() => {
    if (!raw) return
    const t = setTimeout(() => playSelectVoice(), 500)
    return () => clearTimeout(t)
  }, [!!raw])

  // background wash follows the focused mentor's accent
  useEffect(() => {
    if (!mentors?.[focus]) return
    document.documentElement.style.setProperty('--wash', hexA(mentors[focus].accent, 0.11))
  }, [focus, mentors?.length])
  useEffect(() => () => {
    document.documentElement.style.removeProperty('--wash')
  }, [])

  const full = slots.length === 3
  const fPick = slots.indexOf(focus)
  const canSelect = fPick === -1 && !full

  const preview = (i: number) => {
    if (i !== focus) {
      setFocus(i)
      sfx.hover()
    }
  }
  const select = () => {
    if (!canSelect || locked) return
    setSlots((s) => [...s, focus])
    setZoom((z) => z + 1)
    sfx.select()
  }
  const removeAt = (k: number) => {
    setSlots((s) => s.filter((_, j) => j !== k))
    sfx.unselect()
  }
  const unselect = () => {
    setSlots((s) => s.filter((x) => x !== focus))
    sfx.unselect()
  }

  async function lockIn() {
    if (!full || !mentors || busy) return
    setBusy(true)
    setError('')
    setLocked(true)
    sfx.lockIn()
    try {
      await rpc('save_choices', { p_token: token, p_m1: mentors[slots[0]].id, p_m2: mentors[slots[1]].id, p_m3: mentors[slots[2]].id })
      setTimeout(onSaved, 1800)
    } catch (e) {
      setLocked(false)
      setBusy(false)
      setError(errMsg(e))
    }
  }

  // keyboard: ← → browse, Enter selects (or locks in when 3/3)
  const keyRef = useRef({ select, lockIn, preview, focus, full, n: 0 })
  keyRef.current = { select, lockIn, preview, focus, full, n: mentors?.length ?? 0 }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyRef.current
      const t = e.target as Element
      if (t?.closest?.('input,select,textarea')) return
      if (e.key === 'ArrowRight' && k.n) { k.preview((k.focus + 1) % k.n); e.preventDefault() }
      if (e.key === 'ArrowLeft' && k.n) { k.preview((k.focus - 1 + k.n) % k.n); e.preventDefault() }
      if (e.key === 'Enter' && !(t?.closest?.('button:not(.thumb),a'))) {
        e.preventDefault()
        if (k.full) k.lockIn()
        else k.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!mentors) return <div className="screen"><Loading text="LOADING ROSTER" /></div>
  if (mentors.length < 3)
    return (
      <div className="screen">
        <div className="col"><div className="banner warn">Not enough mentors are available yet. Check back soon.</div></div>
      </div>
    )

  const f = mentors[focus]
  const status = fPick > -1 ? `PICKED · ${RANKS[fPick]}` : 'AVAILABLE'
  const selectLabel = fPick > -1 ? `SELECTED · ${RANKS[fPick]}` : `SELECT AS ${RANKS[slots.length] ?? ''}`
  const picks = slots.map((i, k) => ({ rank: RANKS[k], m: mentors[i] }))

  const overlay = locked && (
    <div className="overlay" role="dialog" aria-label="Picks locked">
      <div className="locked-title stamp glitch">LOCKED IN</div>
      <div className="locked-picks">
        {picks.map((p) => (
          <div key={p.m.id} className="locked-pick lockin" style={{ background: p.m.accent }}>
            <span className="r">{p.rank}</span>
            <span className="n">{p.m.first}</span>
          </div>
        ))}
      </div>
      <div className="mono md c-teal" style={{ letterSpacing: '.2em' }}>LOADING MISSION BRIEFING <span className="blink">▮▮▮▮▯▯</span></div>
    </div>
  )

  if (!desktop) return <Mobile {...{ mentors, f, focus, slots, full, canSelect, fPick, status, selectLabel, preview, select, unselect, removeAt, lockIn, zoom, error, overlay }} />

  return (
    <div className="sel-desk">
      <header className="sel-head">
        <div className="brand">
          <span className="brand-name">CODE CONNECT<span className="caret">_</span></span>
          <span className="mono c-muted">STEP 02/05 · ROSTER</span>
        </div>
        <div className="slots" aria-label="Your ranked picks">
          {[0, 1, 2].map((k) => {
            const idx = slots[k]
            const m = idx == null ? null : mentors[idx]
            return m ? (
              <div key={`${k}-${m.id}`} className="slot filled lockin" style={{ background: m.accent, boxShadow: `0 0 24px ${hexA(m.accent, 0.19)}` }}>
                <span className="rank">{RANKS[k]}</span>
                <span className="nm">{m.first}</span>
                <button className="slot-x" onClick={() => removeAt(k)} aria-label={`Remove ${m.name} from ${RANKS[k]} choice`}>
                  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            ) : (
              <div key={k} className="slot empty">
                <span className="rank c-muted">{RANKS[k]}</span>
                <span className="mono c-muted">— EMPTY —</span>
              </div>
            )
          })}
        </div>
        <div className="topbar-right" style={{ minWidth: 200, justifyContent: 'flex-end' }}>
          <span className="mono c-muted">{slots.length}/3 LOCKED</span>
          <MuteToggle />
        </div>
      </header>

      <main className="sel-main">
        <div className="ghost-num" aria-hidden>{f.num}</div>
        <section className="stage-info" key={f.id}>
          <h1 className="display glitch c-muted" style={{ fontSize: 34, letterSpacing: '.08em', lineHeight: 1 }}>SELECT YOUR MENTORS</h1>
          <div className="mono md rise" style={{ color: f.accent }}>// MENTOR_{f.num} · {f.name.toUpperCase()} · {status}</div>
          <h2 className="stage-name rise">{f.first}</h2>
          {f.tagline && <div className="stage-tag rise" style={{ color: f.accent }}>{f.tagline}</div>}
          {f.highlights.length > 0 && (
            <div className="skills rise">
              {f.highlights.map((h) => <span key={h} className="skill">{h}</span>)}
            </div>
          )}
          <StageActions {...{ f, canSelect, fPick, full, selectLabel, select, unselect }} />
          {error && <div className="banner error">{error}</div>}
        </section>
        <section className="frame-wrap" aria-label="Mentor photo">
          <TiltFrame key={f.id} accent={f.accent} zoomId={zoom}>
            <PhotoTile className="main-photo" url={f.photo_url} initials={f.ini} color={f.accent} size={150} label={f.name} />
            <div className="photo alt" style={{ position: 'relative' }}>
              <span className="tag-tiny c-muted" style={{ left: 14, bottom: 12 }}>#{f.num}</span>
            </div>
            <div className="status">
              <span className="mono sm c-muted">STATUS</span>
              <span className="display" style={{ fontSize: 30, lineHeight: .95, color: f.accent }}>{status}</span>
            </div>
          </TiltFrame>
        </section>
      </main>

      <footer className="sel-foot">
        <div className="roster-wrap">
          <div className="topbar mono c-muted" style={{ minHeight: 0 }}>
            <span>// ROSTER · {mentors.length} MENTORS · HOVER TO PREVIEW</span>
            <span>← → TO BROWSE · ENTER TO SELECT</span>
          </div>
          <div className="roster">
            {mentors.map((m) => <Thumb key={m.id} m={m} on={m.idx === focus} rank={slots.indexOf(m.idx)} onPreview={() => preview(m.idx)} />)}
          </div>
        </div>
        <div className="lock-box">
          {full ? (
            <LockButton onClick={lockIn} disabled={busy} />
          ) : (
            <div className="lock-empty">
              <span className="big">LOCK IN</span>
              <span className="mono c-muted">PICK {3 - slots.length} MORE</span>
            </div>
          )}
        </div>
      </footer>
      {overlay}
    </div>
  )
}

function StageActions({ f, canSelect, fPick, full, selectLabel, select, unselect }: { f: M; canSelect: boolean; fPick: number; full: boolean; selectLabel: string; select: () => void; unselect: () => void }) {
  const mag = useMagnetic<HTMLButtonElement>()
  return (
    <div className="stage-actions">
      {canSelect && <button ref={mag} className="btn tall" onClick={select}>{selectLabel} →</button>}
      {fPick > -1 && (
        <button className="btn-outline" style={{ borderColor: f.accent, color: f.accent, borderWidth: 1.5 }} onClick={unselect}>
          {selectLabel} · UNDO
        </button>
      )}
      {full && fPick === -1 && <button className="btn-outline" disabled>3/3 PICKED · REMOVE ONE TO SWAP</button>}
      {f.github && <a className="btn-outline" href={f.github} target="_blank" rel="noreferrer">GITHUB ↗</a>}
      {f.linkedin && <a className="btn-outline" href={f.linkedin} target="_blank" rel="noreferrer">LINKEDIN ↗</a>}
    </div>
  )
}

function LockButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const mag = useMagnetic<HTMLButtonElement>()
  return (
    <button ref={mag} className="btn pulse lock-btn" onClick={onClick} disabled={disabled}>
      <span className="big">LOCK IN</span>
      <span className="small">3/3 READY · PRESS ENTER</span>
    </button>
  )
}

/** Card frame that leans toward the cursor (≤ 6°) and zooms toward the camera on select. */
function TiltFrame({ accent, zoomId, children }: { accent: string; zoomId: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const firstZoom = useRef(zoomId)
  const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // zoom toward the camera when a mentor is selected (not on first render)
  useEffect(() => {
    const el = ref.current
    if (!el || zoomId === firstZoom.current || calm()) return
    el.animate(
      [
        { transform: 'rotateY(-7deg) rotateX(3deg) translateZ(0)', filter: 'brightness(1)' },
        { transform: 'rotateY(0deg) rotateX(0deg) translateZ(140px) scale(1.04)', filter: 'brightness(1.3)', offset: 0.35 },
        { transform: 'rotateY(-7deg) rotateX(3deg) translateZ(0)', filter: 'brightness(1)' },
      ],
      { duration: 1100, easing: 'cubic-bezier(.16,1,.3,1)' },
    )
  }, [zoomId])
  // lean toward the cursor (≤ 6°)
  useEffect(() => {
    const el = ref.current
    if (!el || !window.matchMedia('(hover: hover)').matches || calm()) return
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      el.style.transform = `rotateY(${x * 12}deg) rotateX(${-y * 8}deg) translateZ(24px)`
    }
    const leave = () => { el.style.transform = '' }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [])
  return (
    <div ref={ref} className="frame rise" style={{ background: accent, boxShadow: `0 30px 80px rgba(0,0,0,.6), 0 0 60px ${hexA(accent, 0.11)}` }}>
      {children}
    </div>
  )
}

function Thumb({ m, on, rank, onPreview, small }: { m: M; on: boolean; rank: number; onPreview: () => void; small?: boolean }) {
  return (
    <button
      className={`thumb ${small ? 'sm' : ''}`}
      onMouseEnter={onPreview}
      onFocus={onPreview}
      onClick={onPreview}
      aria-label={`Preview ${m.name}${rank > -1 ? `, picked ${RANKS[rank]}` : ''}`}
      aria-pressed={on}
      style={{
        borderColor: on ? m.accent : undefined,
        transform: on ? (small ? 'translateY(-6px)' : 'translateY(-10px) scale(1.04)') : undefined,
        boxShadow: on && !small ? `0 0 0 1px ${m.accent}, 0 0 26px ${hexA(m.accent, 0.23)}` : undefined,
      }}
    >
      <span className="sw" style={{ background: m.accent, opacity: rank > -1 && !on ? 0.55 : 1 }}>
        {m.photo_url ? (
          <>
            <img className="photo-bg" src={m.photo_url} alt="" aria-hidden="true" />
            <img className="photo-fit" src={m.photo_url} alt="" />
          </>
        ) : m.ini}
      </span>
      <span className="tn">{m.first}</span>
      {!small && <span className="mono sm c-muted">#{m.num}</span>}
      {rank > -1 && <span className="rank-badge stamp">{RANKS[rank]}</span>}
    </button>
  )
}

function Mobile(p: {
  mentors: M[]; f: M; focus: number; slots: number[]; full: boolean; canSelect: boolean; fPick: number; status: string; selectLabel: string
  preview: (i: number) => void; select: () => void; unselect: () => void; removeAt: (k: number) => void; lockIn: () => void; zoom: number; error: string; overlay: React.ReactNode
}) {
  const { mentors, f, focus, slots, full, canSelect, fPick, status, selectLabel, preview, select, unselect, removeAt, lockIn, zoom, error, overlay } = p
  const cardRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (zoom && cardRef.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      cardRef.current.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)', filter: 'brightness(1.25)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 800, easing: 'cubic-bezier(.16,1,.3,1)' })
  }, [zoom])
  return (
    <div className="screen" style={{ paddingTop: 16 }}>
      <div className="col" style={{ gap: 12 }}>
        <div className="topbar">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="mono sm c-muted">STEP 02/05 · {slots.length}/3 LOCKED</span>
            <h1 className="display glitch" style={{ fontSize: 26, lineHeight: 1, letterSpacing: '.02em' }}>SELECT YOUR MENTORS</h1>
          </div>
          <MuteToggle />
        </div>

        <div className="slots-m" aria-label="Your ranked picks">
          {[0, 1, 2].map((k) => {
            const idx = slots[k]
            const m = idx == null ? null : mentors[idx]
            return m ? (
              <button key={`${k}-${m.id}`} className="slot-m filled lockin" style={{ background: m.accent }} onClick={() => removeAt(k)} aria-label={`Remove ${m.name} from ${RANKS[k]}`}>
                <span className="mono sm" style={{ fontWeight: 700, letterSpacing: '.06em' }}>{RANKS[k]} ×</span>
                <span className="n">{m.first}</span>
              </button>
            ) : (
              <div key={k} className="slot-m empty">
                <span className="r c-muted">{RANKS[k]}</span>
                <span className="mono sm c-muted">EMPTY</span>
              </div>
            )
          })}
        </div>

        <article ref={cardRef} key={f.id} className="mcard rise" style={{ background: f.accent, ['--wash' as string]: hexA(f.accent, 0.11) }}>
          <div className="mcard-top"><span>MENTOR_{f.num}</span><span>{status}</span></div>
          <div className="mcard-tiles">
            <PhotoTile className="main-photo" url={f.photo_url} initials={f.ini} color={f.accent} size={72} label={f.name} />
            <div className="photo alt" />
            <div className="num" style={{ color: f.accent }}>{f.num}</div>
          </div>
          {f.tagline && <p>{f.tagline}</p>}
          {f.highlights.length > 0 && (
            <div className="chips">{f.highlights.slice(0, 4).map((h) => <span key={h} style={{ color: f.accent }}>{h}</span>)}</div>
          )}
          <div className="mcard-bottom">
            <div className="mcard-name" style={{ fontSize: `min(84px, calc((100vw - 150px) / ${Math.max(f.first.length, 3) * 0.5}))` }}>{f.first}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {f.github && <a className="round-link" style={{ color: f.accent }} href={f.github} target="_blank" rel="noreferrer" aria-label={`${f.name} on GitHub`}>GH</a>}
              {f.linkedin && <a className="round-link" style={{ color: f.accent }} href={f.linkedin} target="_blank" rel="noreferrer" aria-label={`${f.name} on LinkedIn`}>IN</a>}
            </div>
          </div>
        </article>

        <div>
          <div className="topbar mono sm c-muted" style={{ minHeight: 0 }}>
            <span>// SWIPE ROSTER · {mentors.length}</span>
            <span>TAP TO PREVIEW</span>
          </div>
          <div className="strip">
            {mentors.map((m) => <Thumb key={m.id} small m={m} on={m.idx === focus} rank={slots.indexOf(m.idx)} onPreview={() => preview(m.idx)} />)}
          </div>
        </div>

        {error && <div className="banner error">{error}</div>}

        <div style={{ marginTop: 'auto' }}>
          {full ? (
            <button className="btn block tall pulse" style={{ fontSize: 32 }} onClick={lockIn}>LOCK IN · 3/3</button>
          ) : canSelect ? (
            <button className="btn-select-m" onClick={select}>{selectLabel} →</button>
          ) : fPick > -1 ? (
            <button className="btn-undo-m" onClick={unselect}>{selectLabel} · TAP TO UNDO</button>
          ) : null}
        </div>
      </div>
      {overlay}
    </div>
  )
}

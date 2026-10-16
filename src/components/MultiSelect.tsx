import { useEffect, useRef, useState } from 'react'

type Props = {
  id: string
  options: readonly string[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  invalid?: boolean
}

export default function MultiSelect({ id, options, selected, onChange, placeholder = 'Select…', invalid }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // close when clicking outside
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt])

  return (
    <div className="ms" ref={wrapRef}>
      <button
        type="button"
        id={id}
        className={`ms-trigger input ${invalid ? 'is-invalid' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        {selected.length === 0 ? (
          <span className="ms-placeholder">{placeholder}</span>
        ) : (
          <span className="ms-chips">
            {selected.map((s) => (
              <span key={s} className="chip">
                {s}
                <span
                  role="button"
                  aria-label={`Remove ${s}`}
                  className="chip-x"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(s)
                  }}
                >
                  ×
                </span>
              </span>
            ))}
          </span>
        )}
        <span className={`ms-caret ${open ? 'up' : ''}`}>▾</span>
      </button>

      {open && (
        <ul className="ms-menu" role="listbox" aria-multiselectable="true">
          {options.map((opt) => {
            const on = selected.includes(opt)
            return (
              <li key={opt} role="option" aria-selected={on}>
                <label className={`ms-option ${on ? 'on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(opt)} />
                  <span className="box" aria-hidden />
                  {opt}
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

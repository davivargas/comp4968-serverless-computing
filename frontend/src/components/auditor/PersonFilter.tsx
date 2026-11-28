import { useEffect, useId, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { auditorApi } from '@/lib/auditor/api'
import type { EmployeeMatch } from '@/lib/auditor/types'
import { cn } from '@/lib/utils'

export interface Person { id: string; name: string }

/**
 * Search-as-you-type picker over GET /audit/employees. Shows the chosen person as the input's
 * value, with a clear button; typing again starts a new search.
 */
export default function PersonFilter({ id, value, onChange }: { id?: string; value: Person | null; onChange: (p: Person | null) => void }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<EmployeeMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const listId = useId()
  const box = useRef<HTMLDivElement>(null)

  const search = text.trim()
  useEffect(() => {
    if (search.length < 2) return
    let stale = false
    const timer = setTimeout(() => {
      setLoading(true)
      auditorApi.searchEmployees(search, 8)
        .then((r) => { if (!stale) { setResults(r); setError(null); setActive(0) } })
        .catch((e: Error) => { if (!stale) setError(e.message) })
        .finally(() => { if (!stale) setLoading(false) })
    }, 200)
    return () => { stale = true; clearTimeout(timer) }
  }, [search])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const pick = (e: EmployeeMatch) => {
    onChange({ id: e.employeeId, name: `${e.firstName} ${e.lastName}` })
    setText('')
    setOpen(false)
  }
  const showList = open && search.length >= 2

  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id} role="combobox" aria-expanded={showList} aria-controls={listId} autoComplete="off"
        className={cn('pl-8', value && 'pr-8')}
        placeholder={value ? value.name : 'Anyone'}
        value={value && !open ? value.name : text}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setText(e.target.value); setOpen(true) }}
        onKeyDown={(e) => {
          if (!showList) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active]) }
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {value && (
        <button type="button" aria-label="Clear person" onClick={() => { onChange(null); setText('') }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground">
          <X className="size-3.5" />
        </button>
      )}
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full min-w-64 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
          {error ? <li className="px-2 py-1.5 text-destructive">{error}</li>
            : loading && results.length === 0 ? <li className="px-2 py-1.5 text-muted-foreground">Searching…</li>
            : results.length === 0 ? <li className="px-2 py-1.5 text-muted-foreground">No one matches “{search}”.</li>
            : results.map((e, i) => (
              <li key={e.employeeId} role="option" aria-selected={i === active}
                onMouseDown={(ev) => { ev.preventDefault(); pick(e) }} onMouseEnter={() => setActive(i)}
                className={cn('cursor-pointer rounded-sm px-2 py-1.5', i === active && 'bg-accent text-accent-foreground')}>
                <div className="font-medium">{e.firstName} {e.lastName}</div>
                <div className="truncate text-xs text-muted-foreground">{e.email} · ID {e.employeeId}</div>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

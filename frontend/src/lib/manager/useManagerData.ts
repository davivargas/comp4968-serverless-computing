import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { managerApi } from './api'
import type { ManagedEmployee, ManagerProject } from './types'

export function useManagerData() {
  const [employees, setEmployees] = useState<ManagedEmployee[]>([])
  const [projects, setProjects] = useState<ManagerProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [people, work] = await Promise.all([managerApi.listEmployees(), managerApi.listProjects()])
      setEmployees(people); setProjects(work)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load manager data') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void reload() }, [reload])
  const [busy, setBusy] = useState(false)
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    try { await action(); toast.success(message); await reload(); return true }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Action failed'); return false }
    finally { setBusy(false) }
  }
  return { employees, projects, loading, error, reload, run, busy }
}

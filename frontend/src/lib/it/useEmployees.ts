import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { itApi } from './api'
import type { Employee } from './types'

/** Loads the employee list and gives pages a `run` helper: call the API, refresh, and toast the result. */
export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setEmployees(await itApi.listEmployees())
    } catch (e) {
      toast.error(`Couldn't load employees: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  /** Rethrows on failure so dialogs can stay open; callers that don't care should `.catch(() => {})`. */
  const run = useCallback(async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      await refresh()
      toast.success(success)
    } catch (e) {
      toast.error((e as Error).message || 'Something went wrong')
      throw e
    }
  }, [refresh])

  return { employees, loading, run }
}

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { itApi } from './api'
import type { Me, Position, Team } from './types'

/** Calls the API, then runs `after`, and toasts the result. Rethrows so dialogs can stay open on failure. */
export async function runAction(action: () => Promise<unknown>, success: string, after?: () => unknown) {
  try {
    await action()
    await after?.()
    toast.success(success)
  } catch (e) {
    toast.error((e as Error).message || 'Something went wrong')
    throw e
  }
}

function useList<T>(load: () => Promise<T[]>, what: string) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try {
      setItems(await load())
    } catch (e) {
      toast.error(`Couldn't load ${what}: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [load, what])
  useEffect(() => { refresh() }, [refresh])
  return { items, loading, refresh }
}

const loadTeams = () => itApi.listTeams()
const loadPositions = () => itApi.listPositions()

export const useTeams = () => useList<Team>(loadTeams, 'teams')
export const usePositions = () => useList<Position>(loadPositions, 'positions')

/** The signed-in admin (GET /me). */
export function useMe() {
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => { itApi.getMe().then(setMe).catch(() => {}) }, [])
  return me
}

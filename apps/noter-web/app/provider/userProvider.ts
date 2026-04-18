'use client'

import { useEffect } from 'react'
import { userApi } from '@/lib/axios/auth'
import { useUserStore } from '@/stores/user'

export function UserProvider({ children }: { children: React.ReactNode }) {
  const setUser = useUserStore((s) => s.setUser)
  const clearUser = useUserStore((s) => s.clearUser)
  const setReady = useUserStore((s) => s.setReady)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const user = await userApi.getProfile()
        if (alive) setUser(user)
      } catch {
        if (alive) clearUser()
      } finally {
        if (alive) setReady(true)
      }
    })()

    return () => {
      alive = false
    }
  }, [setUser, clearUser, setReady])

  return children
}

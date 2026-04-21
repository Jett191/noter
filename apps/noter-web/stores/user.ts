import { create } from 'zustand'
import type { CurrentUser } from '@/types/auth'

type UserState = {
  user: CurrentUser | null
  ready: boolean
  setUser: (user: CurrentUser | null) => void
  clearUser: () => void
  setReady: (ready: boolean) => void
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  ready: false,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
  setReady: (ready) => set({ ready })
}))

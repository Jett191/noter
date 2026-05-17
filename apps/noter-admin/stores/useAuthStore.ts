'use client'

/**
 * useAuthStore — 管理员认证状态 (zustand)
 *
 * 存储当前管理员的 email 与 role,供客户端组件读取。
 * 登录成功后调用 setAuth 写入;退出时调用 clearAuth 清空。
 *
 * Requirements: 1, 2, 3
 */

import { create } from 'zustand'

export type AdminRole = 'admin' | 'super_admin'

interface AuthState {
  email: string | null
  role: AdminRole | null
}

interface AuthActions {
  setAuth: (email: string, role: AdminRole) => void
  clearAuth: () => void
}

export type AuthStore = AuthState & AuthActions

export const useAuthStore = create<AuthStore>((set) => ({
  email: null,
  role: null,

  setAuth: (email: string, role: AdminRole) => set({ email, role }),

  clearAuth: () => set({ email: null, role: null })
}))

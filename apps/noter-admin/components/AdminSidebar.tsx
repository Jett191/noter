'use client'

/**
 * Admin_Sidebar 组件
 *
 * 设计参见 design.md §8.1:
 *   - 8 项导航(Dashboard, Users, Documents, Public Documents, Public Categories, Public Tags, Logs, Settings)
 *   - 当前路由高亮
 *   - 底部展示当前管理员邮箱 + 退出按钮
 *   - 移动端 (<768px) 作为浮层抽屉使用,由父组件控制 open 状态
 *
 * Requirements: 3
 */

import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/useAuthStore'
import httpClient from '@/lib/http/client'

interface NavItem {
  label: string
  href: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  { label: '用户管理', href: '/users', icon: '👥' },
  { label: '用户文档', href: '/documents', icon: '📄' },
  { label: '公共文档', href: '/public-documents', icon: '📚' },
  { label: '公共分类', href: '/public-categories', icon: '📁' },
  { label: '公共标签', href: '/public-tags', icon: '🏷️' },
  { label: '操作日志', href: '/logs', icon: '📋' },
  { label: '系统设置', href: '/settings', icon: '⚙️' }
]

interface AdminSidebarProps {
  /** 移动端是否展开 */
  open?: boolean
  /** 移动端关闭回调 */
  onClose?: () => void
}

export default function AdminSidebar({ open, onClose }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { email, clearAuth } = useAuthStore()

  function isActive(href: string): boolean {
    if (href === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/'
    }
    return pathname.startsWith(href)
  }

  async function handleLogout() {
    try {
      await httpClient.post('/api/admin/auth/sign-out')
    } catch {
      // 即使登出 API 失败也清除本地状态
    }
    clearAuth()
    router.push('/sign-in')
  }

  const sidebarContent = (
    <div className='flex h-full flex-col'>
      {/* Logo / Brand */}
      <div className='flex h-14 items-center border-b border-gray-200 px-4'>
        <span className='text-lg font-bold text-gray-900'>Noter Admin</span>
      </div>

      {/* Navigation */}
      <nav className='flex-1 overflow-y-auto px-3 py-4'>
        <ul className='space-y-1'>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href)
            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault()
                    router.push(item.href)
                    onClose?.()
                  }}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                  aria-current={active ? 'page' : undefined}>
                  <span className='text-base'>{item.icon}</span>
                  <span>{item.label}</span>
                </a>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom: Admin email + Logout */}
      <div className='border-t border-gray-200 px-4 py-3'>
        {email && (
          <p className='mb-2 truncate text-xs text-gray-500' title={email}>
            {email}
          </p>
        )}
        <button
          onClick={handleLogout}
          className='w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50'>
          退出登录
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className='hidden md:flex md:w-60 md:flex-col md:border-r md:border-gray-200 md:bg-white'>
        {sidebarContent}
      </aside>

      {/* Mobile overlay drawer */}
      {open && (
        <div className='fixed inset-0 z-40 md:hidden'>
          {/* Backdrop */}
          <div className='fixed inset-0 bg-black/30' onClick={onClose} aria-hidden='true' />
          {/* Drawer */}
          <aside className='relative z-50 flex h-full w-60 flex-col bg-white shadow-xl'>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}

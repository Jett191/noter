'use client'

/**
 * Admin 主布局
 *
 * 设计参见 design.md §8.1:
 *   - 双栏布局:左侧 Admin_Sidebar + 右侧主内容区
 *   - 顶部页面标题栏(含移动端菜单按钮)
 *   - 移动端 (<768px):sidebar 变为浮层抽屉
 *
 * Requirements: 3
 */

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import AdminSidebar from '@/components/AdminSidebar'

/** 根据当前路径返回页面标题 */
function getPageTitle(pathname: string): string {
  if (pathname.startsWith('/dashboard') || pathname === '/') return 'Dashboard'
  if (pathname.startsWith('/users')) return '用户管理'
  if (pathname.startsWith('/documents')) return '用户文档'
  if (pathname.startsWith('/public-documents')) return '公共文档'
  if (pathname.startsWith('/public-categories')) return '公共分类'
  if (pathname.startsWith('/public-tags')) return '公共标签'
  if (pathname.startsWith('/logs')) return '操作日志'
  if (pathname.startsWith('/settings')) return '系统设置'
  return 'Noter Admin'
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const title = getPageTitle(pathname)

  return (
    <div className='flex h-screen overflow-hidden bg-gray-50'>
      {/* Sidebar */}
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <div className='flex flex-1 flex-col overflow-hidden'>
        {/* Top bar */}
        <header className='flex h-14 items-center border-b border-gray-200 bg-white px-4 shadow-sm'>
          {/* Mobile menu button */}
          <button
            type='button'
            className='mr-3 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:hidden'
            onClick={() => setSidebarOpen(true)}
            aria-label='打开菜单'>
            <svg
              className='h-5 w-5'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
              aria-hidden='true'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M4 6h16M4 12h16M4 18h16'
              />
            </svg>
          </button>

          <h1 className='text-lg font-semibold text-gray-900'>{title}</h1>
        </header>

        {/* Page content */}
        <main className='flex-1 overflow-y-auto p-4 md:p-6'>{children}</main>
      </div>
    </div>
  )
}

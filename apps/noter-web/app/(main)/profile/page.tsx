'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@noter/ui/components/button'
import { Separator } from '@noter/ui/components/separator'
import { ArrowLeft, User, Lock, Mail } from 'lucide-react'
import { cn } from '@noter/ui/lib/utils'
import { ProfileSection } from './ProfileSection'
import { PasswordSection } from './PasswordSection'
import { EmailSection } from './EmailSection'

type Tab = 'profile' | 'password' | 'email'

const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'profile', label: '个人资料', icon: User },
  { key: 'password', label: '修改密码', icon: Lock },
  { key: 'email', label: '修改邮箱', icon: Mail }
]

export default function ProfilePage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('profile')

  return (
    <div className='mx-auto flex h-full max-w-4xl flex-col p-6'>
      {/* 顶部返回 */}
      <Button variant='ghost' size='sm' className='mb-4 w-fit' onClick={() => router.back()}>
        <ArrowLeft data-icon='inline-start' />
        返回
      </Button>

      <h1 className='mb-6 text-2xl font-semibold'>账号设置</h1>

      {/* 主体：左侧选项卡 + 右侧内容 */}
      <div className='flex flex-1 gap-6'>
        {/* 左侧导航 */}
        <nav className='flex w-48 shrink-0 flex-col gap-1'>
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  activeTab === tab.key
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}>
                <Icon className='size-4' />
                {tab.label}
              </button>
            )
          })}
        </nav>

        <Separator orientation='vertical' className='h-auto' />

        {/* 右侧内容 */}
        <div className='flex-1'>
          {activeTab === 'profile' && <ProfileSection />}
          {activeTab === 'password' && <PasswordSection />}
          {activeTab === 'email' && <EmailSection />}
        </div>
      </div>
    </div>
  )
}

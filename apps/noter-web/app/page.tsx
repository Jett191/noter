import { Button } from '@noter/ui/components/button'

export default function HomePage() {
  return (
    <main className='space-y-6 p-10'>
      <section className='space-y-3'>
        <h1 className='text-2xl font-bold'>Monorepo 组件测试</h1>
        <p className='text-muted-foreground text-sm'>
          这个页面同时测试 ui 组件和 blocks 组件是否可正常导入。
        </p>
      </section>

      <section className='space-y-3'>
        <h2 className='text-lg font-medium'>1. 测试 ui 组件</h2>
        <Button>这是 ui/button</Button>
      </section>

      <section className='space-y-3'>
        <h2 className='text-lg font-medium'>2. 测试 blocks 组件</h2>
      </section>
    </main>
  )
}

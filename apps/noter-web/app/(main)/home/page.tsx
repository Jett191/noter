'use client'
import { useUserStore } from '@/stores/user'

function HomePage() {
  const userTest = useUserStore((s) => s.user)
  console.log(userTest)
  return (
    <>
      <div>HomePage</div>
    </>
  )
}

export default HomePage

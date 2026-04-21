import { Button } from '@noter/ui/components/button'
import Link from 'next/link'

function HomePage() {
  return (
    <main className=''>
      <nav className='m-6 flex items-center justify-center gap-3'>
        <Link href={'/signin'}>
          <Button>SignIn</Button>
        </Link>
        <Link href={'/signup'}>
          <Button>SignUp</Button>
        </Link>
      </nav>
    </main>
  )
}

export default HomePage

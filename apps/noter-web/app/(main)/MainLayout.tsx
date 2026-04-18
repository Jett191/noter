import { UserProvider } from '@/app/provider/userProvider'

export default function MainLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return <UserProvider>{children}</UserProvider>
}

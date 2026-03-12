import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const navItems = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Journal', href: '/dashboard/journal' },
  { label: 'Stats', href: '/dashboard/stats' },
  { label: 'Rules', href: '/dashboard/rules' },
  { label: 'News', href: '/dashboard/news' },
]

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-black flex">
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col p-4">
        <div className="mb-8">
          <h1 className="text-white font-bold text-xl">TradingBrew</h1>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg px-3 py-2 text-sm transition"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ViolationBadge({ userId }: { userId: string }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const check = async () => {
      const { data } = await supabase
        .from('sessions')
        .select('violation_count')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setShow(((data as { violation_count?: number } | null)?.violation_count ?? 0) > 0)
    }

    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [userId])

  if (!show) return null
  return (
    <span
      className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
      title="Rule violations detected"
    />
  )
}

import TradingViewCalendar from '@/components/news/TradingViewCalendar'

export default function NewsPage() {
  return (
    <div className="p-6 h-screen flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Economic Calendar</h1>
        <p className="text-zinc-500 text-sm mt-1">High-impact events — live via TradingView.</p>
      </div>
      <div className="flex-1 min-h-0">
        <TradingViewCalendar />
      </div>
    </div>
  )
}

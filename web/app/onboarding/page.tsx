'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const steps = [
  'Trading Style',
  'Your Platform',
  'Name Your Buddy',
  'Your Rules',
  'Prop Firm',
]

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [data, setData] = useState({
    trading_style: '',
    platform: '',
    buddy_name: 'Brew',
    max_trades_day: '',
    max_daily_loss: '',
    max_risk_per_trade: '',
    firm_name: '',
    account_size: '',
    trailing_drawdown: '',
    daily_loss_limit: '',
  })
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const update = (field: string, value: string) => {
    setData(prev => ({ ...prev, [field]: value }))
  }

  const next = () => setStep(prev => prev + 1)
  const back = () => setStep(prev => prev - 1)

  const finish = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('users').update({
      trading_style: data.trading_style,
      buddy_name: data.buddy_name || 'Brew',
      onboarding_complete: true,
    }).eq('id', user.id)

    if (data.max_trades_day || data.max_daily_loss || data.max_risk_per_trade) {
      const rules = []
      if (data.max_trades_day) rules.push({ user_id: user.id, rule_type: 'max_trades_day', value: Number(data.max_trades_day) })
      if (data.max_daily_loss) rules.push({ user_id: user.id, rule_type: 'max_daily_loss', value: Number(data.max_daily_loss) })
      if (data.max_risk_per_trade) rules.push({ user_id: user.id, rule_type: 'max_risk_per_trade', value: Number(data.max_risk_per_trade) })
      if (rules.length) await supabase.from('rules').insert(rules)
    }

    if (data.firm_name && data.account_size) {
      await supabase.from('accounts').insert({
        user_id: user.id,
        account_type: 'prop_firm',
        firm_name: data.firm_name,
        account_size: Number(data.account_size),
        trailing_drawdown: Number(data.trailing_drawdown),
        daily_loss_limit: Number(data.daily_loss_limit),
      })
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Let's set you up</h1>
          <p className="text-zinc-500 text-sm mt-1">Step {step + 1} of {steps.length}</p>
        </div>

        {/* Progress */}
        <div className="flex gap-1 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all ${i <= step ? 'bg-blue-500' : 'bg-zinc-800'}`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">

          {/* Step 0 — Trading Style */}
          {step === 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-6">What do you trade?</h2>
              <div className="grid grid-cols-2 gap-3">
                {['Futures', 'Forex', 'Stocks', 'Crypto'].map((style) => (
                  <button
                    key={style}
                    onClick={() => update('trading_style', style.toLowerCase())}
                    className={`py-3 rounded-xl text-sm font-medium transition border ${
                      data.trading_style === style.toLowerCase()
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1 — Platform */}
          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-6">What platform do you use?</h2>
              <div className="grid grid-cols-2 gap-3">
                {['Tradovate', 'NinjaTrader', 'MT4/MT5', 'TradingView', 'Rithmic', 'Other'].map((p) => (
                  <button
                    key={p}
                    onClick={() => update('platform', p.toLowerCase())}
                    className={`py-3 rounded-xl text-sm font-medium transition border ${
                      data.platform === p.toLowerCase()
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 — Buddy Name */}
          {step === 2 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">Name your buddy</h2>
              <p className="text-zinc-500 text-sm mb-6">This is what your AI companion will be called.</p>
              <input
                type="text"
                value={data.buddy_name}
                onChange={(e) => update('buddy_name', e.target.value)}
                placeholder="Brew"
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition"
              />
              <p className="text-zinc-600 text-xs mt-2">Default is "Brew" — you can change this anytime</p>
            </div>
          )}

          {/* Step 3 — Rules */}
          {step === 3 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">Set your rules</h2>
              <p className="text-zinc-500 text-sm mb-6">Your buddy will enforce these. Leave blank to skip.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block">Max trades per day</label>
                  <input
                    type="number"
                    value={data.max_trades_day}
                    onChange={(e) => update('max_trades_day', e.target.value)}
                    placeholder="e.g. 5"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block">Max daily loss ($)</label>
                  <input
                    type="number"
                    value={data.max_daily_loss}
                    onChange={(e) => update('max_daily_loss', e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block">Max risk per trade ($)</label>
                  <input
                    type="number"
                    value={data.max_risk_per_trade}
                    onChange={(e) => update('max_risk_per_trade', e.target.value)}
                    placeholder="e.g. 100"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4 — Prop Firm */}
          {step === 4 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">Prop firm account?</h2>
              <p className="text-zinc-500 text-sm mb-6">Optional — skip if not applicable.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block">Firm name</label>
                  <input
                    type="text"
                    value={data.firm_name}
                    onChange={(e) => update('firm_name', e.target.value)}
                    placeholder="e.g. Apex, TopStep, FTMO"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block">Account size ($)</label>
                  <input
                    type="number"
                    value={data.account_size}
                    onChange={(e) => update('account_size', e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1 block">Trailing drawdown ($)</label>
                  <input
                    type="number"
                    value={data.trailing_drawdown}
                    onChange={(e) => update('trailing_drawdown', e.target.value)}
                    placeholder="e.g. 2500"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button
                onClick={back}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg py-3 text-sm transition"
              >
                Back
              </button>
            )}
            {step < steps.length - 1 ? (
              <button
                onClick={next}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 text-sm font-medium transition"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-medium transition"
              >
                {loading ? 'Setting up...' : 'Start Trading'}
              </button>
            )}
          </div>

          {/* Skip */}
          {step === 4 && (
            <button
              onClick={finish}
              className="w-full text-zinc-600 text-sm mt-3 hover:text-zinc-400 transition"
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ─────────────────────────────────────────────────────────────────

type Tab = 'general' | 'buddy' | 'account' | 'notifications'

export type UserSettings = {
  trading_timezone: string | null
  buddy_name: string | null
  buddy_personality: string | null
  notif_morning: boolean | null
  notif_news: boolean | null
  notif_violations: boolean | null
  notif_debrief: boolean | null
}

export type Account = {
  id: string
  account_type: string
  nickname: string
  firm_name: string | null
  account_size: number | null
  current_balance: number | null
  daily_loss_limit: number | null
  trailing_drawdown: number | null
  max_trades_day: number | null
  is_active: boolean
}

type AccountType = 'prop_firm' | 'personal' | 'live' | 'demo'

type NewAccountForm = {
  account_type: AccountType
  nickname: string
  firm_name: string
  account_size: string
  current_balance: string
  daily_loss_limit: string
  trailing_drawdown: string
  max_trades_day: string
}

type Toast = { type: 'success' | 'error'; message: string } | null

// ─── Timezone Data ─────────────────────────────────────────────────────────

type TimezoneEntry = { value: string; label: string; region: string }

const TIMEZONES: TimezoneEntry[] = [
  // Americas
  { value: 'America/New_York', label: 'New York (EST/EDT)', region: 'Americas' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)', region: 'Americas' },
  { value: 'America/Denver', label: 'Denver (MST/MDT)', region: 'Americas' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)', region: 'Americas' },
  { value: 'America/Toronto', label: 'Toronto', region: 'Americas' },
  { value: 'America/Sao_Paulo', label: 'São Paulo', region: 'Americas' },
  { value: 'America/Mexico_City', label: 'Mexico City', region: 'Americas' },
  // Europe
  { value: 'Europe/London', label: 'London (GMT/BST)', region: 'Europe' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)', region: 'Europe' },
  { value: 'Europe/Berlin', label: 'Berlin', region: 'Europe' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam', region: 'Europe' },
  { value: 'Europe/Zurich', label: 'Zurich', region: 'Europe' },
  { value: 'Europe/Moscow', label: 'Moscow', region: 'Europe' },
  // Asia/Pacific
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)', region: 'Asia/Pacific' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)', region: 'Asia/Pacific' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', region: 'Asia/Pacific' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)', region: 'Asia/Pacific' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)', region: 'Asia/Pacific' },
  { value: 'Asia/Kolkata', label: 'Kolkata (IST)', region: 'Asia/Pacific' },
  { value: 'Asia/Seoul', label: 'Seoul (KST)', region: 'Asia/Pacific' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)', region: 'Asia/Pacific' },
  { value: 'Australia/Melbourne', label: 'Melbourne', region: 'Asia/Pacific' },
  // Africa
  { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST)', region: 'Africa' },
  { value: 'Africa/Cairo', label: 'Cairo (EET)', region: 'Africa' },
  { value: 'Africa/Lagos', label: 'Lagos (WAT)', region: 'Africa' },
  // UTC/GMT
  { value: 'UTC', label: 'UTC', region: 'UTC/GMT' },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: `Etc/GMT+${i + 1}`,
    label: `GMT-${i + 1}`,
    region: 'UTC/GMT',
  })),
  ...Array.from({ length: 12 }, (_, i) => ({
    value: `Etc/GMT-${i + 1}`,
    label: `GMT+${i + 1}`,
    region: 'UTC/GMT',
  })),
]

const REGIONS = ['Americas', 'Europe', 'Asia/Pacific', 'Africa', 'UTC/GMT']

// ─── Personality Presets ───────────────────────────────────────────────────

const PRESET_KEYS = ['friendly_mentor', 'drill_sergeant', 'zen_master', 'gordon_gekko']

const PERSONALITIES = [
  {
    value: 'friendly_mentor',
    label: 'Friendly Mentor',
    description: 'Warm, encouraging, asks good questions',
  },
  {
    value: 'drill_sergeant',
    label: 'Drill Sergeant',
    description: 'Tough love, holds you accountable, no excuses',
  },
  {
    value: 'zen_master',
    label: 'Zen Master',
    description: 'Calm, reflective, focuses on process not outcome',
  },
  {
    value: 'gordon_gekko',
    label: 'Gordon Gekko',
    description: 'Aggressive, profit-focused, loves winners',
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'Describe your own',
  },
]

const PERSONALITY_LABELS: Record<string, string> = {
  friendly_mentor: 'Warm, encouraging, asks good questions',
  drill_sergeant: 'Tough love, holds you accountable, no excuses',
  zen_master: 'Calm, reflective, focuses on process not outcome',
  gordon_gekko: 'Aggressive, profit-focused, loves winners',
}

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'prop_firm', label: 'Prop Firm' },
  { value: 'personal', label: 'Personal' },
  { value: 'live', label: 'Live' },
  { value: 'demo', label: 'Demo' },
]

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  prop_firm: 'text-violet-400 bg-violet-400/10',
  personal: 'text-blue-400 bg-blue-400/10',
  live: 'text-green-400 bg-green-400/10',
  demo: 'text-zinc-400 bg-zinc-800',
}

function initNewAccountForm(): NewAccountForm {
  return {
    account_type: 'prop_firm',
    nickname: '',
    firm_name: '',
    account_size: '',
    current_balance: '',
    daily_loss_limit: '',
    trailing_drawdown: '',
    max_trades_day: '',
  }
}

// ─── Toast Component ───────────────────────────────────────────────────────

function ToastMessage({ toast }: { toast: Toast }) {
  if (!toast) return null
  return (
    <div
      className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
        toast.type === 'success'
          ? 'bg-green-500/20 border border-green-500/40 text-green-400'
          : 'bg-red-500/20 border border-red-500/40 text-red-400'
      }`}
    >
      {toast.type === 'success' ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {toast.message}
    </div>
  )
}

// ─── Toggle Component ──────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (val: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-blue-600' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function SettingsClient({
  initialSettings,
  initialAccounts,
}: {
  initialSettings: UserSettings
  initialAccounts: Account[]
}) {
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [toast, setToast] = useState<Toast>(null)

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="h-screen flex flex-col">
      <ToastMessage toast={toast} />

      {/* Page header */}
      <div className="px-6 pt-6 pb-0">
        <h1 className="text-2xl font-bold text-white mb-4">Settings</h1>

        {/* Tab bar */}
        <div className="flex border-b border-zinc-800">
          {(['general', 'buddy', 'account', 'notifications'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab === 'account' ? 'Account' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'general' && (
          <GeneralTab initialSettings={initialSettings} showToast={showToast} />
        )}
        {activeTab === 'buddy' && (
          <BuddyTab initialSettings={initialSettings} showToast={showToast} />
        )}
        {activeTab === 'account' && (
          <AccountTab initialAccounts={initialAccounts} showToast={showToast} />
        )}
        {activeTab === 'notifications' && (
          <NotificationsTab initialSettings={initialSettings} showToast={showToast} />
        )}
      </div>
    </div>
  )
}

// ─── General Tab ───────────────────────────────────────────────────────────

function GeneralTab({
  initialSettings,
  showToast,
}: {
  initialSettings: UserSettings
  showToast: (type: 'success' | 'error', message: string) => void
}) {
  const router = useRouter()
  const [timezone, setTimezone] = useState(
    initialSettings.trading_timezone ?? 'America/New_York'
  )
  const [search, setSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectedTz = TIMEZONES.find((tz) => tz.value === timezone)

  const filtered = search.trim()
    ? TIMEZONES.filter(
        (tz) =>
          tz.label.toLowerCase().includes(search.toLowerCase()) ||
          tz.value.toLowerCase().includes(search.toLowerCase())
      )
    : TIMEZONES

  const groupedFiltered = REGIONS.map((region) => ({
    region,
    timezones: filtered.filter((tz) => tz.region === region),
  })).filter((g) => g.timezones.length > 0)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trading_timezone: timezone }),
      })
      if (!res.ok) throw new Error()
      showToast('success', 'Settings saved')
      router.refresh()
    } catch {
      showToast('error', 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-white mb-1">Trading Timezone</h2>
          <p className="text-zinc-500 text-sm mb-4">
            All trade times will be displayed in this timezone.
          </p>

          <div ref={dropdownRef} className="relative w-full max-w-md">
            {/* Trigger button */}
            <button
              onClick={() => {
                setDropdownOpen((v) => !v)
                setSearch('')
              }}
              className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm hover:border-zinc-500 transition-colors"
            >
              <span>{selectedTz?.label ?? timezone}</span>
              <svg
                className={`w-4 h-4 text-zinc-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown */}
            {dropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden">
                {/* Search */}
                <div className="p-2 border-b border-zinc-800">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search timezones..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* List */}
                <div className="max-h-64 overflow-y-auto">
                  {groupedFiltered.length === 0 ? (
                    <p className="px-4 py-3 text-zinc-500 text-sm">No timezones found</p>
                  ) : (
                    groupedFiltered.map(({ region, timezones }) => (
                      <div key={region}>
                        <p className="px-3 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-950/50">
                          {region}
                        </p>
                        {timezones.map((tz) => (
                          <button
                            key={tz.value}
                            onClick={() => {
                              setTimezone(tz.value)
                              setDropdownOpen(false)
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-zinc-800 transition-colors ${
                              tz.value === timezone
                                ? 'text-blue-400 bg-blue-500/10'
                                : 'text-zinc-300'
                            }`}
                          >
                            {tz.label}
                          </button>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save footer */}
      <div className="sticky bottom-0 border-t border-zinc-800 bg-black/80 backdrop-blur px-6 py-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ─── Buddy Tab ─────────────────────────────────────────────────────────────

function BuddyTab({
  initialSettings,
  showToast,
}: {
  initialSettings: UserSettings
  showToast: (type: 'success' | 'error', message: string) => void
}) {
  const router = useRouter()
  const stored = initialSettings.buddy_personality ?? 'friendly_mentor'
  const isPreset = PRESET_KEYS.includes(stored)

  const [buddyName, setBuddyName] = useState(initialSettings.buddy_name ?? '')
  const [selectedPersonality, setSelectedPersonality] = useState(
    isPreset ? stored : 'custom'
  )
  const [customText, setCustomText] = useState(isPreset ? '' : stored)
  const [saving, setSaving] = useState(false)

  const previewPersonality =
    selectedPersonality === 'custom'
      ? customText || 'Describe your personality above'
      : PERSONALITY_LABELS[selectedPersonality] ?? ''

  async function handleSave() {
    setSaving(true)
    try {
      const personality =
        selectedPersonality === 'custom' ? customText.trim() : selectedPersonality
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buddy_name: buddyName.trim() || null,
          buddy_personality: personality || null,
        }),
      })
      if (!res.ok) throw new Error()
      showToast('success', 'Settings saved')
      router.refresh()
    } catch {
      showToast('error', 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-6 space-y-8">
        {/* Buddy Name */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-1">Buddy Name</h2>
          <p className="text-zinc-500 text-sm mb-4">What do you want to call your AI companion?</p>
          <input
            type="text"
            maxLength={20}
            value={buddyName}
            onChange={(e) => setBuddyName(e.target.value)}
            placeholder="Brew"
            className="w-full max-w-xs bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <p className="mt-1 text-xs text-zinc-600">{buddyName.length}/20</p>
        </div>

        {/* Buddy Personality */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-1">Buddy Personality</h2>
          <p className="text-zinc-500 text-sm mb-4">
            Choose how your buddy speaks and coaches you.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
            {PERSONALITIES.map((p) => (
              <button
                key={p.value}
                onClick={() => setSelectedPersonality(p.value)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  selectedPersonality === p.value
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
                }`}
              >
                <p
                  className={`font-medium text-sm ${
                    selectedPersonality === p.value ? 'text-blue-400' : 'text-white'
                  }`}
                >
                  {p.label}
                </p>
                <p className="text-zinc-500 text-xs mt-1">{p.description}</p>
              </button>
            ))}
          </div>

          {/* Custom text area */}
          {selectedPersonality === 'custom' && (
            <div className="mt-4 max-w-2xl">
              <textarea
                maxLength={200}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="e.g. Batman — serious, strategic, never settles for less"
                rows={3}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
              />
              <p className="mt-1 text-xs text-zinc-600">{customText.length}/200</p>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="max-w-2xl p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Preview</p>
          <p className="text-zinc-300 text-sm">
            Your buddy{' '}
            <span className="text-white font-medium">{buddyName.trim() || 'Brew'}</span> will
            speak like:{' '}
            <span className="text-zinc-400 italic">{previewPersonality}</span>
          </p>
        </div>
      </div>

      {/* Save footer */}
      <div className="sticky bottom-0 border-t border-zinc-800 bg-black/80 backdrop-blur px-6 py-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ─── Account Tab ───────────────────────────────────────────────────────────

function AccountTab({
  initialAccounts,
  showToast,
}: {
  initialAccounts: Account[]
  showToast: (type: 'success' | 'error', message: string) => void
}) {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<NewAccountForm>(initNewAccountForm())
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function setField<K extends keyof NewAccountForm>(key: K, val: NewAccountForm[K]) {
    setForm((prev) => ({ ...prev, [key]: val }))
  }

  function openEdit(account: Account) {
    setEditingId(account.id)
    setForm({
      account_type: (account.account_type as AccountType) ?? 'prop_firm',
      nickname: account.nickname ?? '',
      firm_name: account.firm_name ?? '',
      account_size: account.account_size != null ? String(account.account_size) : '',
      current_balance: account.current_balance != null ? String(account.current_balance) : '',
      daily_loss_limit: account.daily_loss_limit != null ? String(account.daily_loss_limit) : '',
      trailing_drawdown: account.trailing_drawdown != null ? String(account.trailing_drawdown) : '',
      max_trades_day: account.max_trades_day != null ? String(account.max_trades_day) : '',
    })
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditingId(null)
    setForm(initNewAccountForm())
  }

  async function handleCreate() {
    if (!form.nickname.trim()) {
      showToast('error', 'Nickname is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_type: form.account_type,
          nickname: form.nickname.trim(),
          firm_name: form.firm_name.trim() || null,
          account_size: form.account_size ? parseFloat(form.account_size) : null,
          current_balance: form.current_balance ? parseFloat(form.current_balance) : null,
          daily_loss_limit: form.daily_loss_limit ? parseFloat(form.daily_loss_limit) : null,
          trailing_drawdown: form.trailing_drawdown ? parseFloat(form.trailing_drawdown) : null,
          max_trades_day: form.max_trades_day ? parseInt(form.max_trades_day, 10) : null,
        }),
      })
      if (!res.ok) throw new Error()
      const { account } = await res.json() as { account: Account }
      setAccounts((prev) => [account, ...prev])
      closeDrawer()
      showToast('success', 'Account added')
      router.refresh()
    } catch {
      showToast('error', 'Failed to create account')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate() {
    if (!editingId) return
    if (!form.nickname.trim()) {
      showToast('error', 'Nickname is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/accounts/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_type: form.account_type,
          nickname: form.nickname.trim(),
          firm_name: form.firm_name.trim() || null,
          account_size: form.account_size ? parseFloat(form.account_size) : null,
          current_balance: form.current_balance ? parseFloat(form.current_balance) : null,
          daily_loss_limit: form.daily_loss_limit ? parseFloat(form.daily_loss_limit) : null,
          trailing_drawdown: form.trailing_drawdown ? parseFloat(form.trailing_drawdown) : null,
          max_trades_day: form.max_trades_day ? parseInt(form.max_trades_day, 10) : null,
        }),
      })
      if (!res.ok) throw new Error()
      const { account } = await res.json() as { account: Account }
      setAccounts((prev) => prev.map((a) => (a.id === editingId ? account : a)))
      closeDrawer()
      showToast('success', 'Account updated')
      router.refresh()
    } catch {
      showToast('error', 'Failed to update account')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      })
      if (!res.ok) throw new Error()
      setAccounts((prev) => prev.filter((a) => a.id !== id))
      showToast('success', 'Account removed')
      router.refresh()
    } catch {
      showToast('error', 'Failed to remove account')
    } finally {
      setDeletingId(null)
    }
  }

  const typeLabel = (type: string) =>
    ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type

  return (
    <div className="p-6 space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Your Accounts</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Manage your trading accounts and limits.</p>
        </div>
        <button
          onClick={() => { setEditingId(null); setForm(initNewAccountForm()); setDrawerOpen(true) }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Account
        </button>
      </div>

      {/* Account cards */}
      {accounts.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21H5a2 2 0 01-2-2V7a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">No accounts yet. Add your first account above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      ACCOUNT_TYPE_COLORS[account.account_type] ?? 'text-zinc-400 bg-zinc-800'
                    }`}
                  >
                    {typeLabel(account.account_type)}
                  </span>
                  <p className="text-white font-semibold mt-2">{account.nickname}</p>
                  {account.firm_name && (
                    <p className="text-zinc-500 text-xs mt-0.5">{account.firm_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(account)}
                    className="text-zinc-600 hover:text-zinc-300 transition-colors p-1"
                    title="Edit account"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(account.id)}
                    disabled={deletingId === account.id}
                    className="text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40 p-1"
                    title="Remove account"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {account.account_size != null && (
                  <Stat label="Size" value={`$${account.account_size.toLocaleString()}`} />
                )}
                {account.current_balance != null && (
                  <Stat label="Balance" value={`$${account.current_balance.toLocaleString()}`} />
                )}
                {account.daily_loss_limit != null && (
                  <Stat label="Daily limit" value={`$${account.daily_loss_limit.toLocaleString()}`} />
                )}
                {account.trailing_drawdown != null && (
                  <Stat label="Max DD" value={`$${account.trailing_drawdown.toLocaleString()}`} />
                )}
                {account.max_trades_day != null && (
                  <Stat label="Max trades/day" value={String(account.max_trades_day)} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Account Drawer */}
      {drawerOpen && (
        <AccountDrawer
          form={form}
          setField={setField}
          onClose={closeDrawer}
          onSave={editingId ? handleUpdate : handleCreate}
          saving={saving}
          isEditing={editingId !== null}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-zinc-600 text-xs">{label}</p>
      <p className="text-zinc-300 text-sm font-medium">{value}</p>
    </div>
  )
}

function AccountDrawer({
  form,
  setField,
  onClose,
  onSave,
  saving,
  isEditing,
}: {
  form: NewAccountForm
  setField: <K extends keyof NewAccountForm>(key: K, val: NewAccountForm[K]) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
  isEditing: boolean
}) {
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-30"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-zinc-950 border-l border-zinc-800 z-40 flex flex-col shadow-2xl">
        {/* Drawer header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h3 className="text-white font-semibold">{isEditing ? 'Edit Account' : 'New Account'}</h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Account type */}
          <div>
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-2 block">
              Account Type
            </label>
            <div className="flex rounded-lg overflow-hidden border border-zinc-700">
              {ACCOUNT_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setField('account_type', t.value)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    form.account_type === t.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <FormField
            label="Nickname *"
            placeholder="e.g. Apex 50k"
            value={form.nickname}
            onChange={(v) => setField('nickname', v)}
          />
          <FormField
            label="Firm Name"
            placeholder="e.g. Apex Trader"
            value={form.firm_name}
            onChange={(v) => setField('firm_name', v)}
          />
          <FormField
            label="Account Size ($)"
            placeholder="50000"
            value={form.account_size}
            onChange={(v) => setField('account_size', v)}
            type="number"
          />
          <FormField
            label="Current Balance ($)"
            placeholder="50000"
            value={form.current_balance}
            onChange={(v) => setField('current_balance', v)}
            type="number"
          />
          <FormField
            label="Daily Loss Limit ($)"
            placeholder="1000"
            value={form.daily_loss_limit}
            onChange={(v) => setField('daily_loss_limit', v)}
            type="number"
          />
          <FormField
            label="Max Trailing Drawdown ($)"
            placeholder="2500"
            value={form.trailing_drawdown}
            onChange={(v) => setField('trailing_drawdown', v)}
            type="number"
          />
          <FormField
            label="Max Trades Per Day"
            placeholder="5"
            value={form.max_trades_day}
            onChange={(v) => setField('max_trades_day', v)}
            type="number"
          />
        </div>

        {/* Drawer footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-zinc-700 text-zinc-400 hover:text-white text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Account'}
          </button>
        </div>
      </div>
    </>
  )
}

function FormField({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'number'
}) {
  return (
    <div>
      <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
      />
    </div>
  )
}

// ─── Notifications Tab ─────────────────────────────────────────────────────

type NotifSettings = {
  notif_morning: boolean
  notif_news: boolean
  notif_violations: boolean
  notif_debrief: boolean
}

const NOTIF_ITEMS: {
  key: keyof NotifSettings
  label: string
  description: string
}[] = [
  {
    key: 'notif_morning',
    label: 'Morning Briefing',
    description: 'Brew gives you a morning brief before market open',
  },
  {
    key: 'notif_news',
    label: 'Pre-News Alerts',
    description: 'Alert 15 mins before high impact events',
  },
  {
    key: 'notif_violations',
    label: 'Rule Violation Alerts',
    description: 'Brew warns you when approaching limits',
  },
  {
    key: 'notif_debrief',
    label: 'End of Day Debrief',
    description: 'Brew summarizes your session at close',
  },
]

function NotificationsTab({
  initialSettings,
  showToast,
}: {
  initialSettings: UserSettings
  showToast: (type: 'success' | 'error', message: string) => void
}) {
  const [notifs, setNotifs] = useState<NotifSettings>({
    notif_morning: initialSettings.notif_morning ?? true,
    notif_news: initialSettings.notif_news ?? true,
    notif_violations: initialSettings.notif_violations ?? true,
    notif_debrief: initialSettings.notif_debrief ?? true,
  })
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const toggle = useCallback((key: keyof NotifSettings) => {
    setNotifs((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifs),
      })
      if (!res.ok) throw new Error()
      showToast('success', 'Settings saved')
      router.refresh()
    } catch {
      showToast('error', 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-6 space-y-3">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-white mb-1">Notifications</h2>
          <p className="text-zinc-500 text-sm">Control when Brew reaches out to you.</p>
        </div>

        {NOTIF_ITEMS.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-xl"
          >
            <div>
              <p className="text-white text-sm font-medium">{item.label}</p>
              <p className="text-zinc-500 text-xs mt-0.5">{item.description}</p>
            </div>
            <Toggle
              checked={notifs[item.key]}
              onChange={() => toggle(item.key)}
            />
          </div>
        ))}
      </div>

      {/* Save footer */}
      <div className="sticky bottom-0 border-t border-zinc-800 bg-black/80 backdrop-blur px-6 py-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

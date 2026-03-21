/**
 * Migration: Rules Manager
 * Run with: npx tsx scripts/migrate-rules.ts
 *
 * This script logs the SQL to execute in your Supabase SQL editor.
 * The Supabase JS client does not support raw DDL — run the output
 * statements directly in the Supabase dashboard → SQL Editor.
 */

import * as fs from 'fs'
import * as path from 'path'

// Load .env.local so environment variables are available
function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    console.warn('[migrate] .env.local not found — skipping env load')
    return
  }
  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (key && !(key in process.env)) {
      process.env[key] = val
    }
  }
}

loadEnvLocal()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('\n══════════════════════════════════════════════')
console.log('  MIGRATION: Rules Manager')
console.log('══════════════════════════════════════════════\n')

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('[migrate] Warning: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found.')
  console.warn('[migrate] Proceeding to log SQL only.\n')
}

const statements: { label: string; sql: string }[] = [
  {
    label: 'Add columns to rules table',
    sql: `ALTER TABLE rules
  ADD COLUMN IF NOT EXISTS raw_text TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`,
  },
  {
    label: 'Add columns to rule_violations table',
    sql: `ALTER TABLE rule_violations
  ADD COLUMN IF NOT EXISTS analyst_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id);`,
  },
  {
    label: 'Add violation_count to sessions table',
    sql: `ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 0;`,
  },
]

console.log('Run these statements in your Supabase dashboard → SQL Editor:\n')
console.log('─'.repeat(50))

statements.forEach(({ label, sql }, i) => {
  console.log(`\n-- ${i + 1}. ${label}`)
  console.log(sql)
})

console.log('\n' + '─'.repeat(50))
console.log('\n[migrate] SQL logged. Copy and paste into Supabase SQL Editor to apply.')
console.log('[migrate] Migration complete ✓\n')

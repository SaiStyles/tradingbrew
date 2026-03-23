import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local for tests
config({ path: resolve(__dirname, '.env.local') })

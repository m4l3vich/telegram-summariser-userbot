import readline from 'node:readline/promises'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { TelegramClient, SqliteStorage } from '@mtcute/node'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const dataDir = process.env.DATA_DIR || '.'

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bgCyan: '\x1b[46m',
  bgBlue: '\x1b[44m',
}

async function ask(prompt: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` ${c.dim}[${defaultValue}]${c.reset}` : ''
  const answer = (await rl.question(`  ${c.cyan}>${c.reset} ${prompt}${suffix}${c.dim}:${c.reset} `)).trim()
  return answer || defaultValue || ''
}

function banner(): void {
  console.log('')
  console.log(`  ${c.bgCyan}${c.bold}${c.white}                                           ${c.reset}`)
  console.log(`  ${c.bgCyan}${c.bold}${c.white}   ✈️  Telegram Summariser — Setup Wizard   ${c.reset}`)
  console.log(`  ${c.bgCyan}${c.bold}${c.white}                                           ${c.reset}`)
  console.log('')
}

function step(num: number, title: string, subtitle?: string): void {
  console.log(`\n  ${c.bold}${c.blue}━━━ Step ${num} ${c.reset}${c.bold}${title}${c.reset}`)
  if (subtitle) {
    console.log(`  ${c.dim}${subtitle}${c.reset}`)
  }
  console.log('')
}

function success(msg: string): void {
  console.log(`  ${c.green}✔${c.reset} ${msg}`)
}

function warn(msg: string): void {
  console.log(`  ${c.yellow}⚠${c.reset} ${msg}`)
}

function fail(msg: string): void {
  console.log(`  ${c.red}✖${c.reset} ${msg}`)
}

function info(msg: string): void {
  console.log(`  ${c.dim}${msg}${c.reset}`)
}

interface ModelEntry {
  id: string
  display_name?: string
}

async function fetchOpenAIModels(baseUrl: string, apiKey: string): Promise<ModelEntry[]> {
  const url = `${baseUrl}/v1/models`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  const body = (await res.json()) as { data: ModelEntry[] }
  return body.data
}

async function fetchAnthropicModels(baseUrl: string, apiKey: string): Promise<ModelEntry[]> {
  const models: ModelEntry[] = []
  let afterId: string | undefined

  for (;;) {
    const params = new URLSearchParams({ limit: '100' })
    if (afterId) params.set('after_id', afterId)

    const url = `${baseUrl}/v1/models?${params.toString()}`
    const res = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

    const body = (await res.json()) as {
      data: ModelEntry[]
      has_more: boolean
      last_id: string
    }
    models.push(...body.data)

    if (!body.has_more) break
    afterId = body.last_id
  }

  return models
}

function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '')
  if (url.endsWith('/v1')) {
    url = url.slice(0, -3)
  }
  return url
}

async function selectModel(
  provider: string,
  apiKey: string,
  baseUrl: string,
  currentModel?: string,
): Promise<string> {
  info('🔍 Fetching available models...')

  let models: ModelEntry[]
  try {
    if (provider === 'anthropic') {
      models = await fetchAnthropicModels(baseUrl, apiKey)
    } else {
      models = await fetchOpenAIModels(baseUrl, apiKey)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warn(`Could not fetch models: ${msg}`)
    info('You can type the model ID manually.')
    return await ask('AI Model', currentModel || 'gpt-4o')
  }

  if (models.length === 0) {
    warn('No models returned by the API.')
    return await ask('AI Model', currentModel || 'gpt-4o')
  }

  models.sort((a, b) => a.id.localeCompare(b.id))

  console.log(`\n  ${c.bold}📋 Available models:${c.reset}`)
  for (let i = 0; i < models.length; i++) {
    const m = models[i]
    const num = `${c.cyan}${String(i + 1).padStart(3)}${c.reset}`
    const name = m.display_name ? `${m.id} ${c.dim}(${m.display_name})${c.reset}` : m.id
    console.log(`   ${num}  ${name}`)
  }
  console.log('')

  const defaultHint = currentModel || ''
  const choice = await ask('Select model number or type model ID', defaultHint)

  const num = parseInt(choice, 10)
  if (!isNaN(num) && num >= 1 && num <= models.length) {
    const selected = models[num - 1].id
    success(`Selected: ${c.bold}${selected}${c.reset}`)
    return selected
  }

  success(`Model: ${c.bold}${choice}${c.reset}`)
  return choice
}

async function main(): Promise<void> {
  banner()

  step(1, '📡 Telegram API Credentials', 'Get yours at https://my.telegram.org/apps')

  const apiId = await ask('API ID', process.env.API_ID)
  const apiHash = await ask('API Hash', process.env.API_HASH)

  if (!apiId || !apiHash) {
    fail('API ID and API Hash are required. Aborting.')
    rl.close()
    return
  }

  const defaultSession = process.env.SESSION_FILE || join(dataDir, 'session.sqlite')
  const sessionFile = await ask('Session file path', defaultSession)

  step(2, '🔐 Telegram Authentication', 'Logging into Telegram...')

  const tg = new TelegramClient({
    apiId: Number(apiId),
    apiHash,
    storage: new SqliteStorage(sessionFile),
  })

  const self = await tg.start({
    phone: async () => await rl.question(`  ${c.cyan}>${c.reset} 📱 Phone number: `),
    code: async () => await rl.question(`  ${c.cyan}>${c.reset} 💬 Verification code: `),
    password: async () => await rl.question(`  ${c.cyan}>${c.reset} 🔑 2FA password: `),
  })

  success(`Logged in as ${c.bold}${self.displayName}${c.reset}`)

  step(3, '🤖 AI Provider Configuration')

  let aiProvider = await ask('AI Provider (openai / anthropic)', process.env.AI_PROVIDER || 'openai')
  if (aiProvider !== 'openai' && aiProvider !== 'anthropic') {
    warn('Invalid provider. Defaulting to "openai".')
    aiProvider = 'openai'
  }

  const aiApiKey = await ask('AI API Key', process.env.AI_API_KEY)
  if (!aiApiKey) {
    fail('AI API Key is required. Aborting.')
    await tg.destroy()
    rl.close()
    return
  }

  const defaultBaseUrl = aiProvider === 'anthropic'
    ? 'https://api.anthropic.com'
    : 'https://api.openai.com'

  const rawBaseUrl = await ask('AI Base URL (leave empty for default)', process.env.AI_BASE_URL || '')
  const customBaseUrl = rawBaseUrl ? normalizeBaseUrl(rawBaseUrl) : ''
  const effectiveBaseUrl = customBaseUrl || defaultBaseUrl
  console.log('')

  const aiModel = await selectModel(aiProvider, aiApiKey, effectiveBaseUrl, process.env.AI_MODEL)

  step(4, '⚙️  Optional Settings')

  const summaryLanguage = await ask('Summary language', process.env.SUMMARY_LANGUAGE || 'English')
  const summaryTimezone = await ask('Summary timezone', process.env.SUMMARY_TIMEZONE || 'Europe/Moscow')
  const promptFile = await ask('Prompt file path', process.env.PROMPT_FILE || 'prompt.txt')

  console.log('')

  const envPath = join(dataDir, '.env')

  if (existsSync(envPath)) {
    const overwrite = await ask('⚠️  A .env file already exists. Overwrite? (y/N)', 'N')
    if (overwrite.toLowerCase() !== 'y') {
      info('Skipping .env write.')
      success('Setup complete!\n')
      await tg.destroy()
      rl.close()
      return
    }
  }

  const lines: string[] = [
    `API_ID=${apiId}`,
    `API_HASH=${apiHash}`,
    `SESSION_FILE=${sessionFile}`,
    '',
    `AI_PROVIDER=${aiProvider}`,
    `AI_API_KEY=${aiApiKey}`,
    `AI_MODEL=${aiModel}`,
  ]

  if (customBaseUrl) {
    lines.push(`AI_BASE_URL=${customBaseUrl}`)
  } else {
    lines.push('# AI_BASE_URL=')
  }

  lines.push('# AI_REASONING_EFFORT=')
  lines.push('')
  lines.push(`SUMMARY_LANGUAGE=${summaryLanguage}`)
  lines.push(`SUMMARY_TIMEZONE=${summaryTimezone}`)
  lines.push(`PROMPT_FILE=${promptFile}`)
  lines.push('')

  mkdirSync(dataDir, { recursive: true })
  writeFileSync(envPath, lines.join('\n'), 'utf8')
  success(`.env file written to ${c.bold}${envPath}${c.reset}`)

  console.log('')
  console.log(`  ${c.bgBlue}${c.bold}${c.white}                                            ${c.reset}`)
  console.log(`  ${c.bgBlue}${c.bold}${c.white}   🎉 Setup complete! Start the bot with:   ${c.reset}`)
  console.log(`  ${c.bgBlue}${c.bold}${c.white}                                            ${c.reset}`)
  console.log('')
  console.log(`  ${c.green}$${c.reset} ${c.bold}pnpm dev${c.reset}     ${c.dim}— development with hot-reload${c.reset}`)
  console.log(`  ${c.green}$${c.reset} ${c.bold}pnpm start${c.reset}   ${c.dim}— production build${c.reset}`)
  console.log('')

  await tg.destroy()
  rl.close()
}

main().catch(console.error)

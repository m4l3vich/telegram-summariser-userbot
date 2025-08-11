import { SqliteStorage, TelegramClient, Message } from '@mtcute/node'
import { html } from '@mtcute/html-parser'
import { md } from '@mtcute/markdown-parser'
import OpenAI from 'openai'

import { fetchMessages } from './fetch-messages.js'
import { appendMessage } from './utils.js'
import { readFileSync } from 'fs'

const tgClient = new TelegramClient({
  storage: new SqliteStorage(process.env.SESSION_FILE),
  apiId: Number(process.env.API_ID!),
  apiHash: process.env.API_HASH!
})

const openai = new OpenAI({
  apiKey: process.env.BOTHUB_API_KEY,
  baseURL: 'https://bothub.chat/api/v2/openai/v1'
})

const summaryPrompt = readFileSync(process.env.PROMPT_FILE || 'prompt.txt', 'utf8')
  .replace('{{ language }}', process.env.SUMMARY_LANGUAGE || 'English')
  .replace('{{ timezone }}', process.env.SUMMARY_TIMEZONE || process.env.TZ || 'Europe/Moscow')

async function main() {
  tgClient.onNewMessage.add(async msg => {
    if (!msg.isOutgoing || !msg.text.startsWith('/summary')) return

    appendMessage(tgClient, msg, 'Summarising: Fetching messages...')

    try {
      const [limit, ...extraQuery] = msg.text.split(' ').slice(1)
      tgClient.log.warn(
        'Begin summarising: chat=%s, limit=%s, query=%s',
        msg.chat.id,
        limit,
        extraQuery.join(' ')
      )
      const response = await summarise(msg, limit, extraQuery.join(' '))

      tgClient.log.warn('Summarising finished: chat=%s', msg.chat.id)
      appendMessage(tgClient, msg, response)
    } catch (err) {
      tgClient.log.error('Failed to summarise chat:')
      console.error(err)
      appendMessage(tgClient, msg, 'Failed. See console (unknown error)')
    }
  })

  const self = await tgClient.start()
  tgClient.log.warn(`Logged in as ${self.displayName}`)
}

async function summarise(message: Message, limit: string, extraQuery: string = '') {
  const start = process.hrtime.bigint()

  const messages = await fetchMessages({
    client: tgClient,
    peer: message.chat.inputPeer,
    limit
  })

  tgClient.log.warn(
    'Summarising: fetched messages: chat=%s, count=%s',
    message.chat.id,
    messages.length
  )
  appendMessage(
    tgClient,
    message,
    `Summarising: Got ${messages.length} messages, waiting for model response...`
  )

  const messageContentLines = ['Chat history:', ...messages.map(e => JSON.stringify(e)).reverse()]
  if (extraQuery) {
    messageContentLines.push(
      'User provided an extra query, you MUST prioritise answering to this:',
      `"${extraQuery}"`
    )
  }

  // writeFileSync('messages.json', messageContentLines.join('\n'))

  const response = await openai.chat.completions.create({
    model: 'gpt-5-nano',
    reasoning_effort: 'minimal',
    messages: [
      { role: 'system', content: summaryPrompt },
      { role: 'user', content: messageContentLines.join('\n') }
    ]
  })

  const modelResp = response.choices[0]
  if (!modelResp.message.content) {
    tgClient.log.error('Failed to summarise chat:')
    console.dir(response)
    return `Failed. See console (finish_reason="${modelResp.finish_reason}", refusal="${modelResp.message.refusal}")`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usageCaps = (response.usage as any).cost * 750_000

  const end = process.hrtime.bigint()
  return html`
    <b>Summary:</b> <br />
    <blockquote expandable>${md(modelResp.message.content)}</blockquote>
    <br />
    ${usageCaps.toFixed(2)} CAPS; ${(Number(end - start) / 1_000_000_000).toFixed(2)}s
  `
}

main()

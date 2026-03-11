import { SqliteStorage, TelegramClient, networkMiddlewares, tl } from '@mtcute/node'
import { html } from '@mtcute/html-parser'
import { md } from '@mtcute/markdown-parser'
import { generateText } from 'ai'
import type { Message } from '@mtcute/node'

import { fetchMessages } from './fetch-messages.js'
import { appendMessage } from './utils.js'
import { getModel, getReasoningEffort } from './ai-provider.js'
import { readFileSync } from 'fs'

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  process.exit(1)
})

const tgClient = new TelegramClient({
  storage: new SqliteStorage(process.env.SESSION_FILE),
  apiId: Number(process.env.API_ID!),
  apiHash: process.env.API_HASH!,
  network: {
    middlewares: networkMiddlewares.basic({
      floodWaiter: {
        maxWait: 60_000,
        maxRetries: 3
      }
    })
  }
})

const summaryPrompt = readFileSync(process.env.PROMPT_FILE || 'prompt.txt', 'utf8')
  .replace('{{ language }}', process.env.SUMMARY_LANGUAGE || 'English')
  .replace('{{ timezone }}', process.env.SUMMARY_TIMEZONE || process.env.TZ || 'Europe/Moscow')

async function main() {
  tgClient.onNewMessage.add(async msg => {
    if (!msg.isOutgoing || !msg.text.startsWith('/summary')) return

    const [limit, ...extraQuery] = msg.text.split(' ').slice(1)

    appendMessage(tgClient, msg, 'Summarising: Fetching messages...')

    try {
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
      if (tl.RpcError.is(err, 'FLOOD_WAIT_%d')) {
        tgClient.log.error('Flood wait exceeded: %ds', err.seconds)
        appendMessage(tgClient, msg, `Failed: Telegram rate limit (${err.seconds}s). Try again later.`)
        return
      }
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
  const chatId = message.chat.id

  tgClient.log.warn('Fetching messages: chat=%s, limit=%s', chatId, limit)
  const messages = await fetchMessages({
    client: tgClient,
    chatId: message.chat.inputPeer,
    limit
  })

  tgClient.log.warn('Done fetching messages: chat=%s, count=%s', chatId, messages.length)
  appendMessage(tgClient, message, `Summarising: Waiting for model response...`)

  const messageContentLines = ['Chat history:', ...messages.map(e => JSON.stringify(e)).reverse()]
  if (extraQuery) {
    messageContentLines.push(
      'User provided an extra query, you MUST prioritise answering to this:',
      `"${extraQuery}"`
    )
  }

  const inputChars = messageContentLines.join('\n').length
  tgClient.log.warn('Sending to model: chat=%s, messages=%s, inputChars=%s', chatId, messages.length, inputChars)

  const reasoningEffort = getReasoningEffort()

  const result = await generateText({
    model: getModel(),
    messages: [
      { role: 'system', content: summaryPrompt },
      { role: 'user', content: messageContentLines.join('\n') }
    ],
    ...(reasoningEffort
      ? {
          providerOptions: {
            openai: { reasoningEffort }
          }
        }
      : {})
  })

  tgClient.log.warn(
    'Model response: chat=%s, model=%s, finishReason=%s, usage=%o',
    chatId,
    result.response.modelId,
    result.finishReason,
    result.usage
  )

  if (!result.text) {
    tgClient.log.error('Failed to summarise chat: empty response')
    return `Failed. Empty response (finish_reason="${result.finishReason}")`
  }

  const { inputTokens, outputTokens } = result.usage

  const usageStr = `${inputTokens ?? '?'}+${outputTokens ?? '?'} tokens`

  const end = process.hrtime.bigint()
  const elapsed = (Number(end - start) / 1_000_000_000).toFixed(2)
  tgClient.log.warn('Summarisation complete: chat=%s, %ss', chatId, elapsed)

  return html`
    <b>Summary:</b> <br />
    <blockquote expandable>${md(result.text)}</blockquote>
    <br />
    ${result.response.modelId}; ${usageStr};
    ${elapsed}s
  `
}

main()

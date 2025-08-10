import { SqliteStorage, TelegramClient, Peer } from '@mtcute/node'
import { html } from '@mtcute/html-parser'
import { md } from '@mtcute/markdown-parser'
import OpenAI from 'openai'

import { fetchMessages } from './fetch-messages.js'
import { appendMessage } from './utils.js'

const tgClient = new TelegramClient({
  storage: new SqliteStorage(process.env.SESSION_FILE),
  apiId: Number(process.env.API_ID!),
  apiHash: process.env.API_HASH!
})

const openai = new OpenAI({
  apiKey: process.env.BOTHUB_API_KEY,
  baseURL: 'https://bothub.chat/api/v2/openai/v1'
})

const summPrompt = `You are a chat summariser. Your task is to collect and concisely retell the key events and discussions, while maintaining enough information for the reader to understand the context.
Rules:
  - Answer in paragraphs, each containing a sub-topic with brief title, for example:
    **Subtopic title (start timestamp - end timestamp, ABBREVIATED timezone)**
    Subtopic summary (no more than 3 sentences, very concise and dry, no details)
  - When mentioning participants of the chat, you MUST include their names
  - The summary MUST contain all the important points, in theses
  - The summary MUST be brief and as concise as possible, highlight only the most important details
  - The summary MUST be provided in ${process.env.SUMMARY_LANGUAGE} language
  - The summary MUST be laid out in a dry, concise, facts/statemets only manner, drop ALL non-important details and synonymous/redundant facts
  - The summary's paragraphs MUST follow the chronological order of the chat history, timestamps can be included in a sub-topic summary
  - DO NOT mention all non-important info and messages
  - DO NOT make up any information that was not said by the participants
  - DO NOT suggest any follow-up steps or append anything of your own at the end
  - DO NOT mention such terms as "start of the chat history" and "end of the chat history" as the history you're provided with is an arbitrary chunk of the full chat history
  - DO NOT use complicated and long words for description, prefer shorter ones
  - The user can provide an additional query for the summary. If you are provided with such a query, answering this query MUST be your first priority, discard answering in paragraphs if needed
  - Timestamps will be provided to you in the "${
    process.env.SUMMARY_TIMEZONE || process.env.TZ || 'Europe/Moscow'
  }" timezone`

async function main() {
  tgClient.onNewMessage.add(async msg => {
    if (!msg.isOutgoing || !msg.text.startsWith('/summary')) return

    appendMessage(tgClient, msg, 'Summarising...')

    try {
      const [limit, ...extraQuery] = msg.text.split(' ').slice(1)
      tgClient.log.warn(
        'Begin summarising: chat=%s, limit=%s, query=%s',
        msg.chat.id,
        limit,
        extraQuery.join(' ')
      )
      const response = await summarise(msg.chat, Number(limit), extraQuery.join(' '))

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

async function summarise(peer: Peer, limit: number, extraQuery: string = '') {
  const start = process.hrtime.bigint()

  const messages = await fetchMessages({
    client: tgClient,
    peer: peer.inputPeer,
    limit
  })

  const messageContentLines = ['Chat history:', ...messages.map(e => JSON.stringify(e)).reverse()]
  if (extraQuery) {
    messageContentLines.push(
      'User provided an extra query, you MUST prioritise answering to this:',
      `"${extraQuery}"`
    )
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-5-nano',
    reasoning_effort: 'minimal',
    messages: [
      { role: 'system', content: summPrompt },
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

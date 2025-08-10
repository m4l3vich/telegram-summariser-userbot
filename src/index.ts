import fs from 'fs'
import { html } from '@mtcute/html-parser'
import { md } from '@mtcute/markdown-parser'
import { SqliteStorage, TelegramClient, Peer, Message } from '@mtcute/node'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.BOTHUB_API_KEY,
  baseURL: 'https://bothub.chat/api/v2/openai/v1'
})

const summPrompt = `Ты получишь массив сообщений из Telegram в JSON-формате. Каждое сообщение содержит поля:
- sender: имя отправителя
- text: текст сообщения или служебная информация

Служебные сообщения могут иметь следующие форматы:
- "(action тип_действия)" - действия пользователей (присоединение, выход, изменение настроек и т.д.)
- "(media тип_медиа)" - отправленные медиафайлы (фото, видео, документы и т.д.)
- "(forwarded message)" - пересланные сообщения
- "(unknown message)" - нераспознанные сообщения

Игнорируй:
- Команду /summary, НИ ЗА ЧТО НЕ УПОМИНАЙ ЭТУ КОМАНДУ в своем ответе!!!!!!!!!!!!!!!!!!!!!!!!
- Спам, флуд и малозначимые сообщения

Твоя задача - создать краткую суммаризацию в следующем формате:

**Резюме:** [1 предложение об общем содержании]

**Темы:** [список основных тем через запятую]

**События:** [важные действия/медиа, если есть]

Отвечай только суммаризацией, без дополнительных предложений и комментариев.
`

async function main() {
  const tgClient = new TelegramClient({
    storage: new SqliteStorage(process.env.SESSION_FILE),
    apiId: Number(process.env.API_ID!),
    apiHash: process.env.API_HASH!
  })

  tgClient.onNewMessage.add(async msg => {
    if (msg.isOutgoing && msg.text.startsWith('/summary')) {
      tgClient.editMessage({
        chatId: msg.chat.inputPeer,
        message: msg.id,
        text: msg.text + '\n\nSummarising...'
      })

      const response = await summarise(tgClient, msg.chat, Number(msg.text.split(' ')[1]))

      tgClient.editMessage({
        chatId: msg.chat.inputPeer,
        message: msg.id,
        text: response
      })
    }
  })

  return tgClient.start()
}

interface IMessageToSummarise {
  id: number
  date: number
  sender: { name: string, id: string }
  text: string
}

function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max)
}

function getMsgDescription(msg: Message): string {
  if (msg.action) return `(action ${msg.action.type})`
  if (msg.media) return `(media ${msg.media.type})`
  if (msg.forward) return '(forwarded message)'
  return '(unknown message)'
}

async function summarise(client: TelegramClient, peer: Peer, limit: number) {
  const start = process.hrtime.bigint()

  let pagesToFetch = Math.floor(limit / 100)
  const messages: IMessageToSummarise[] = []
  do {
    const lastMsg = messages[messages.length - 1]
    const resp = await client.getHistory(peer.inputPeer, {
      limit: clamp(limit - messages.length, 0, 100),
      offset: lastMsg ? { id: lastMsg.id, date: lastMsg.date } : undefined
    })

    messages.push(
      ...resp.map(msg => ({
        id: msg.id,
        date: Math.floor(msg.date.getTime() / 1000),
        sender: { name: msg.sender.displayName, id: msg.sender.id.toString() },
        text: msg.text ?? getMsgDescription(msg)
      }))
    )

    pagesToFetch--
  } while (pagesToFetch > 1)
  
  const msgsForModel = messages.map(message => ({
    sender: message.sender,
    text: message.text
  }))

  // fs.writeFileSync('messages.json', JSON.stringify(msgsForModel))

  const response = await openai.chat.completions.create({
    model: 'gpt-5-nano',
    reasoning_effort: 'minimal',
    messages: [
      { role: 'system', content: summPrompt },
      { role: 'user', content: JSON.stringify(msgsForModel) }
    ]
  })

  const modelResp = response.choices[0]
  if (!modelResp.message.content) {
    console.dir(response)
    return `Failed. See console (finish_reason="${modelResp.finish_reason}", refusal="${modelResp.message.refusal}")`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usageCaps = (response.usage as any).cost * 750_000

  const end = process.hrtime.bigint()
  return html`
  /summary ${limit}<br>
  <br>
  Summary: <br>
  <blockquote expandable>
  ${md(modelResp.message.content)}
  </blockquote><br>
  <br>
  ${usageCaps.toFixed(2)} CAPS; ${(Number(end - start) / 1_000_000_000).toFixed(2)}s
  `
}

main()
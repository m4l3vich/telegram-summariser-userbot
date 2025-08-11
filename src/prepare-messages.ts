import { Message, TelegramClient } from '@mtcute/node'
import { DateTime } from 'luxon'

export interface PreparedMessage {
  date: string // ISO format
  sender: { name: string; id: string }
  text: string
  reply?: ReplyInfo
}

type ReplyInfo = PreparedReply | '(story)' | undefined

interface PreparedReply {
  date: string // ISO format
  sender: { type?: string; id?: string; name: string }
  text: string
  hasReply?: true
}

function prepareTimestamp(date?: Date | null): string {
  if (!date) return '(unknown)'

  const zone = process.env.SUMMARY_TIMEZONE || process.env.TZ || 'Europe/Moscow'
  return DateTime.fromJSDate(date, { zone }).toISO()!
}

function prepareMessageText(msg: Message) {
  if (msg.isOutgoing && msg.text.startsWith('/summary')) return '(old summary)'
  if (msg.text) return msg.text
  if (msg.action) return `(action ${msg.action.type})`
  if (msg.media) return `(media ${msg.media.type})`
  if (msg.forward) return '(forwarded message)'
  return '(unknown message)'
}

async function prepareReply(client: TelegramClient, message: Message): Promise<ReplyInfo> {
  if (!message.replyToMessage) return undefined
  if (message.replyToStory) return '(story)'

  const replyInfo = message.replyToMessage

  if (replyInfo.isQuote) {
    return {
      date: prepareTimestamp(replyInfo.date),
      text: replyInfo.quoteText,
      sender: {
        name: replyInfo.sender?.displayName ?? '(unknown)',
        type: replyInfo.sender?.type
      }
    }
  }

  const resp = await client.getMessages(message.chat.inputPeer, [message.replyToMessage.id!])
  const replyMsg = resp[0]!

  return {
    date: prepareTimestamp(replyMsg.date),
    text: prepareMessageText(replyMsg),
    sender: {
      id: replyMsg.sender.id.toString(),
      name: replyInfo.sender?.displayName ?? '(unknown)',
      type: replyInfo.sender?.type
    }
  }
}

async function prepareMessage(client: TelegramClient, message: Message) {
  return {
    date: prepareTimestamp(message.date),
    sender: { name: message.sender.displayName, id: message.sender.id.toString() },
    text: prepareMessageText(message),
    reply: await prepareReply(client, message)
  }
}

export async function prepareMessages(
  client: TelegramClient,
  messages: Message[]
): Promise<PreparedMessage[]> {
  return Promise.all(messages.map(msg => prepareMessage(client, msg)))
}

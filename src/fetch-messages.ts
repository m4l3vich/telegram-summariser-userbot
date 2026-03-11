import { InputPeerLike, Message, TelegramClient } from '@mtcute/node'
import { DateTime } from 'luxon'
import { PreparedMessage, prepareMessages } from './prepare-messages.js'

interface FetchMessagesParameters {
  client: TelegramClient
  chatId: InputPeerLike
  limit: string
}

type ParsedLimit =
  | { type: 'count'; value: number }
  | { type: 'date'; value: Date }
  | { type: 'last_out_msg' }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function parseLimit(limit: string): ParsedLimit {
  const zone = process.env.SUMMARY_TIMEZONE || process.env.TZ || 'Europe/Moscow'

  if (limit === 'since:last_out_msg') {
    return { type: 'last_out_msg' }
  }

  // since:HH:MM — today at that time
  const timeMatch = limit.match(/^since:(\d{1,2}:\d{2})$/)
  if (timeMatch) {
    const dt = DateTime.now()
      .setZone(zone)
      .set({
        hour: parseInt(timeMatch[1].split(':')[0]),
        minute: parseInt(timeMatch[1].split(':')[1]),
        second: 0,
        millisecond: 0
      })
    if (!dt.isValid) throw new Error(`Invalid time: ${timeMatch[1]}`)
    return { type: 'date', value: dt.toJSDate() }
  }

  // since:DD-MM-YYYY_HH:MM — specific date+time
  const dateTimeMatch = limit.match(/^since:(\d{1,2}-\d{1,2}-\d{4}_\d{1,2}:\d{2})$/)
  if (dateTimeMatch) {
    const dt = DateTime.fromFormat(dateTimeMatch[1], 'd-M-yyyy_H:mm', { zone })
    if (!dt.isValid) throw new Error(`Invalid date/time: ${dateTimeMatch[1]}`)
    return { type: 'date', value: dt.toJSDate() }
  }

  // last:Nm / last:Nh / last:Nd — relative time
  const relativeMatch = limit.match(/^last:(\d+)([mhd])$/)
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1])
    const unitMap = { m: 'minutes', h: 'hours', d: 'days' } as const
    const unit = unitMap[relativeMatch[2] as keyof typeof unitMap]
    const dt = DateTime.now().setZone(zone).minus({ [unit]: amount })
    return { type: 'date', value: dt.toJSDate() }
  }

  const count = Number(limit)
  if (isNaN(count) || count <= 0) {
    throw new Error(
      `Invalid limit: "${limit}". Use a number, since:HH:MM, since:DD-MM-YYYY_HH:MM, last:Nm/Nh/Nd, or since:last_out_msg`
    )
  }
  return { type: 'count', value: count }
}

async function fetchByCount(
  client: TelegramClient,
  chatId: InputPeerLike,
  count: number
): Promise<PreparedMessage[]> {
  let pagesToFetch = Math.ceil(count / 100)
  const messages: PreparedMessage[] = []
  let lastMsg: Message | null = null

  do {
    const resp = await client.getHistory(chatId, {
      limit: Math.min(count - messages.length, 100),
      offset: lastMsg
        ? { id: lastMsg.id, date: Math.floor(lastMsg.date.getTime() / 1000) }
        : undefined
    })

    lastMsg = resp.at(-1)!
    messages.push(...(await prepareMessages(client, resp)))
    pagesToFetch--

    if (pagesToFetch > 0) await sleep(500)
  } while (pagesToFetch > 0)

  return messages
}

async function fetchByDate(
  client: TelegramClient,
  chatId: InputPeerLike,
  minDate: Date
): Promise<PreparedMessage[]> {
  const raw: Message[] = []

  for await (const msg of client.iterSearchMessages({
    chatId,
    minDate
  })) {
    raw.push(msg)
  }

  return prepareMessages(client, raw)
}

async function fetchSinceLastOutgoing(
  client: TelegramClient,
  chatId: InputPeerLike
): Promise<PreparedMessage[]> {
  const results = await client.searchMessages({
    chatId,
    fromUser: 'me',
    limit: 1
  })

  const lastOutMsg = results[0]
  if (!lastOutMsg) {
    throw new Error('No outgoing messages found in this chat')
  }

  return fetchByDate(client, chatId, lastOutMsg.date)
}

export async function fetchMessages({
  client,
  chatId,
  limit
}: FetchMessagesParameters): Promise<PreparedMessage[]> {
  const parsed = parseLimit(limit)

  switch (parsed.type) {
    case 'count':
      return fetchByCount(client, chatId, parsed.value)
    case 'date':
      return fetchByDate(client, chatId, parsed.value)
    case 'last_out_msg':
      return fetchSinceLastOutgoing(client, chatId)
  }
}

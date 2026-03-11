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
  | { type: 'lastout' }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function parseLimit(limit: string): ParsedLimit {
  const zone = process.env.SUMMARY_TIMEZONE || process.env.TZ || 'Europe/Moscow'

  if (limit === 'since:lastout') {
    return { type: 'lastout' }
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
      `Invalid limit: "${limit}". Use a number, since:HH:MM, since:DD-MM-YYYY_HH:MM, last:Nm/Nh/Nd, or since:lastout`
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
  let page = 0

  do {
    page++
    const batchSize = Math.min(count - messages.length, 100)
    client.log.warn('fetchByCount: page=%s, batchSize=%s, fetched=%s/%s', page, batchSize, messages.length, count)

    const resp = await client.getHistory(chatId, {
      limit: batchSize,
      offset: lastMsg
        ? { id: lastMsg.id, date: Math.floor(lastMsg.date.getTime() / 1000) }
        : undefined
    })

    client.log.warn('fetchByCount: page=%s returned %s messages', page, resp.length)
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
  client.log.warn('fetchByDate: minDate=%s', minDate.toISOString())
  const raw: Message[] = []

  for await (const msg of client.iterSearchMessages({
    chatId,
    minDate
  })) {
    raw.push(msg)
    if (raw.length % 100 === 0) {
      client.log.warn('fetchByDate: fetched %s messages so far...', raw.length)
    }
  }

  client.log.warn('fetchByDate: total %s raw messages, preparing...', raw.length)
  return prepareMessages(client, raw)
}

async function fetchSinceLastOutgoing(
  client: TelegramClient,
  chatId: InputPeerLike
): Promise<PreparedMessage[]> {
  client.log.warn('fetchSinceLastOutgoing: searching for last outgoing message...')
  const results = await client.searchMessages({
    chatId,
    fromUser: 'me',
    limit: 1
  })

  const lastOutMsg = results[0]
  if (!lastOutMsg) {
    throw new Error('No outgoing messages found in this chat')
  }

  client.log.warn('fetchSinceLastOutgoing: last outgoing msg id=%s date=%s', lastOutMsg.id, lastOutMsg.date.toISOString())
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
    case 'lastout':
      return fetchSinceLastOutgoing(client, chatId)
  }
}

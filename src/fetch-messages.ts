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
  | { type: 'lastout'; skipMessages?: number; skipMinutes?: number }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function parseLimit(limit: string): ParsedLimit {
  const zone = process.env.SUMMARY_TIMEZONE || process.env.TZ || 'Europe/Moscow'

  // since:lastout, since:lastout-N (skip N messages), since:lastout-N[mhd] (skip time)
  const lastoutMatch = limit.match(/^since:lastout(?:-(\d+)([mhd])?)?$/)
  if (lastoutMatch) {
    if (!lastoutMatch[1]) {
      return { type: 'lastout' }
    }
    const amount = parseInt(lastoutMatch[1])
    const unit = lastoutMatch[2]
    if (unit) {
      const minutesMap = { m: 1, h: 60, d: 1440 } as const
      return { type: 'lastout', skipMinutes: amount * minutesMap[unit as keyof typeof minutesMap] }
    }
    return { type: 'lastout', skipMessages: amount }
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
      `Invalid limit: "${limit}". Use a number, since:HH:MM, since:DD-MM-YYYY_HH:MM, last:Nm/Nh/Nd, since:lastout, since:lastout-N, or since:lastout-N[mhd]`
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

    if (pagesToFetch > 0) await sleep(200)
  } while (pagesToFetch > 0)

  return messages
}

const MAX_MESSAGES = 5000

async function fetchByDate(
  client: TelegramClient,
  chatId: InputPeerLike,
  minDate: Date
): Promise<PreparedMessage[]> {
  client.log.warn('fetchByDate: minDate=%s', minDate.toISOString())
  const raw: Message[] = []
  let lastMsg: Message | null = null
  let page = 0

  while (raw.length < MAX_MESSAGES) {
    page++
    const resp = await client.getHistory(chatId, {
      limit: 100,
      offset: lastMsg
        ? { id: lastMsg.id, date: Math.floor(lastMsg.date.getTime() / 1000) }
        : undefined
    })

    if (resp.length === 0) break

    let hitBoundary = false
    for (const msg of resp) {
      if (msg.date < minDate) {
        hitBoundary = true
        break
      }
      raw.push(msg)
    }

    client.log.warn('fetchByDate: page=%s, fetched=%s total', page, raw.length)

    if (hitBoundary) break
    lastMsg = resp.at(-1)!

    await sleep(200)
  }

  if (raw.length >= MAX_MESSAGES) {
    client.log.warn('fetchByDate: hit message cap (%s), stopping', MAX_MESSAGES)
  }

  client.log.warn('fetchByDate: total %s messages, preparing...', raw.length)
  return prepareMessages(client, raw)
}

async function fetchSinceLastOutgoing(
  client: TelegramClient,
  chatId: InputPeerLike,
  options: { skipMessages?: number; skipMinutes?: number } = {}
): Promise<PreparedMessage[]> {
  const { skipMessages = 0, skipMinutes } = options

  const fetchLimit = Math.max(10, skipMessages + 5)
  client.log.warn('fetchSinceLastOutgoing: searching outgoing messages (fetchLimit=%s, skip=%s, skipMin=%s)', fetchLimit, skipMessages, skipMinutes ?? 'none')

  const results = await client.searchMessages({
    chatId,
    fromUser: 'me',
    limit: fetchLimit
  })

  const outgoing = results.filter(msg => !msg.text.startsWith('/summary'))

  let targetMsg: Message | undefined

  if (skipMinutes != null) {
    const cutoff = new Date(Date.now() - skipMinutes * 60_000)
    targetMsg = outgoing.find(msg => msg.date < cutoff)
    if (!targetMsg) {
      throw new Error(`No outgoing messages found older than ${skipMinutes} minutes`)
    }
  } else {
    targetMsg = outgoing[skipMessages]
    if (!targetMsg) {
      throw new Error(`Not enough outgoing messages to skip ${skipMessages} (found ${outgoing.length})`)
    }
  }

  client.log.warn('fetchSinceLastOutgoing: target msg id=%s date=%s', targetMsg.id, targetMsg.date.toISOString())
  return fetchByDate(client, chatId, targetMsg.date)
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
      return fetchSinceLastOutgoing(client, chatId, {
        skipMessages: parsed.skipMessages,
        skipMinutes: parsed.skipMinutes
      })
  }
}

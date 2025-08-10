import { InputPeerLike, TelegramClient } from '@mtcute/node'
import { PreparedMessage, prepareMessages } from './prepare-messages.js'

interface FetchMessagesParameters {
  client: TelegramClient
  peer: InputPeerLike
  limit: number
}

export async function fetchMessages({
  client,
  peer,
  limit
}: FetchMessagesParameters): Promise<PreparedMessage[]> {
  let pagesToFetch = Math.floor(limit / 100)
  const messages: PreparedMessage[] = []
  let lastMsg: { id: number; date: number } | null = null

  do {
    const resp = await client.getHistory(peer, {
      limit: Math.min(limit - messages.length, 100),
      offset: lastMsg ?? undefined
    })

    lastMsg = { id: resp.at(-1)!.id, date: Math.floor(resp.at(-1)!.date.getTime() / 1000) }

    messages.push(...(await prepareMessages(client, resp)))

    pagesToFetch--
  } while (pagesToFetch > 1)

  return messages
}

import { InputPeerLike, Message, TelegramClient } from '@mtcute/node'
import { PreparedMessage, prepareMessages } from './prepare-messages.js'

interface FetchMessagesParameters {
  client: TelegramClient
  peer: InputPeerLike
  limit: string
}

// const timeRegex = /([012]?\d):(\d\d)$/
// const dateRegex = /^([0123]?\d)[-.]([01]?\d)([-.](\d\d\d\d))?/
// const relativeTime = ['today', 'yesterday']

// async function fetchMessagesByDate(client, peer, date, time) {}

export async function fetchMessages({
  client,
  peer,
  limit
}: FetchMessagesParameters): Promise<PreparedMessage[]> {
  // if (timeRegex.test(limit)) {
  //   return fetch
  // }

  let pagesToFetch = Math.ceil(Number(limit) / 100)
  const messages: PreparedMessage[] = []
  let lastMsg: Message | null = null

  do {
    const resp = await client.getHistory(peer, {
      limit: Math.min(Number(limit) - messages.length, 100),
      offset: lastMsg
        ? { id: lastMsg.id, date: Math.floor(lastMsg.date.getTime() / 1000) }
        : undefined
    })

    lastMsg = resp.at(-1)!

    messages.push(...(await prepareMessages(client, resp)))

    pagesToFetch--
  } while (pagesToFetch > 0)

  return messages
}

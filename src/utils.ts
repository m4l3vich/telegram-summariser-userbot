import { Message, InputText, TextWithEntities, TelegramClient } from '@mtcute/node'

export function appendMessage(client: TelegramClient, msg: Message, append: InputText) {
  const origText = msg.textWithEntities
  let newText: TextWithEntities

  if (typeof append === 'string') {
    newText = {
      text: origText.text + '\n\n' + append,
      entities: origText.entities
    }
  } else {
    const addToOffset = (origText.text + '\n\n').length
    let newEntities = origText.entities

    if (append.entities) {
      newEntities = (newEntities || []).concat(
        append.entities.map(e => {
          e.offset += addToOffset
          return e
        })
      )
    }

    newText = {
      text: origText.text + '\n\n' + append.text,
      entities: newEntities
    }
  }

  return client.editMessage({
    chatId: msg.chat.inputPeer,
    message: msg.id,
    text: newText
  })
}

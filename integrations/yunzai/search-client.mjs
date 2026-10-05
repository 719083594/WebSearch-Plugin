import {config, searcher} from '../../lib/runtime.mjs'
import {deliverResult} from '../../lib/commands.mjs'
import {formatText} from '../../lib/format.mjs'

export async function browserSearch(query, requested = 'auto') {
  const protection = globalThis[Symbol.for('qqbot.chatResilience')]
  const turn = protection?.extendForSearch?.()
  if (turn?.expired) throw new Error('本次对话已超过等待上限。')
  return searcher.search(query, requested, {signal:turn?.signal})
}
export const formatSearchText = result => formatText(result, config)
export function deliverSearchResult(event, result) {
  return deliverResult(event, result, {config, image:buffer => {
    if (!globalThis.segment?.image) throw new Error('图片消息接口不可用')
    return globalThis.segment.image(buffer)
  }})
}

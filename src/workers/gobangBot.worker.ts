import { findBestMove, type BotRequest } from '@/logic/gobangBot'

self.onmessage = (event: MessageEvent<BotRequest>) => {
  self.postMessage(findBestMove(event.data))
}
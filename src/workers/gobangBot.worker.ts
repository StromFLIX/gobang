import { findBestMove, type BotRequest } from '@/logic/gobangBot'
import { findBestMoveWasm } from '@/wasm/gobangBotWasm'

self.onmessage = async (event: MessageEvent<BotRequest>) => {
  const request = event.data
  if (!request.difficulty || request.difficulty === 'easy') {
    self.postMessage(findBestMove(request))
    return
  }

  try {
    self.postMessage(await findBestMoveWasm(request))
  } catch (error) {
    console.warn('Rust bot unavailable; using the TypeScript engine.', error)
    self.postMessage(findBestMove(request))
  }
}
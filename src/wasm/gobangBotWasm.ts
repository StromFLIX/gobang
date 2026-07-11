import wasmUrl from './gobang_bot.wasm?url'

import { BOT_PROFILES, type BotDifficulty, type BotRequest, type BotResult } from '@/logic/gobangBot'

const BOARD_CELLS = 225
const INPUT_BYTES = BOARD_CELLS * 2
const NO_MOVE = 255

interface BotWasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory
  bot_alloc(length: number): number
  bot_dealloc(pointer: number, length: number): void
  bot_search(
    inputPointer: number,
    stone: number,
    difficulty: number,
    timeBudgetMs: number,
    maxDepth: number,
  ): number
}

let exportsPromise: Promise<BotWasmExports> | null = null

export async function findBestMoveWasm(request: BotRequest): Promise<BotResult> {
  const startedAt = performance.now()
  const difficulty = request.difficulty ?? 'easy'
  const profile = BOT_PROFILES[difficulty]
  const timeBudgetMs = request.timeBudgetMs ?? profile.timeBudgetMs
  const maxDepth = request.maxDepth ?? profile.maxDepth
  const wasm = await loadEngine()
  const inputPointer = wasm.bot_alloc(INPUT_BYTES)

  try {
    const input = new Uint8Array(wasm.memory.buffer, inputPointer, INPUT_BYTES)
    for (let position = 0; position < BOARD_CELLS; position += 1) {
      input[position] = request.board[position] === 'black'
        ? 1
        : request.board[position] === 'white'
          ? 2
          : 0
    }
    input.fill(0, BOARD_CELLS)
    for (const position of request.blockedPositions) {
      if (position >= 0 && position < BOARD_CELLS) input[BOARD_CELLS + position] = 1
    }

    const packed = wasm.bot_search(
      inputPointer,
      request.stone === 'black' ? 1 : 2,
      difficultyIndex(difficulty),
      timeBudgetMs,
      maxDepth,
    )
    const position = packed % 256
    const depth = Math.floor(packed / 256) % 256
    const nodes = Math.floor(packed / 65_536)
    return {
      position: position === NO_MOVE ? null : position,
      depth,
      elapsedMs: Math.round(performance.now() - startedAt),
      nodes,
      engine: 'wasm',
    }
  } finally {
    wasm.bot_dealloc(inputPointer, INPUT_BYTES)
  }
}

async function loadEngine(): Promise<BotWasmExports> {
  exportsPromise ??= instantiateEngine()
  return exportsPromise
}

async function instantiateEngine(): Promise<BotWasmExports> {
  const imports = { env: { now_ms: () => performance.now() } }
  const response = await fetch(wasmUrl)
  const bytes = await response.arrayBuffer()
  const result = await WebAssembly.instantiate(bytes, imports)
  return result.instance.exports as BotWasmExports
}

function difficultyIndex(difficulty: BotDifficulty) {
  if (difficulty === 'hard') return 2
  if (difficulty === 'medium') return 1
  return 0
}
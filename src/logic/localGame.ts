import type { Stone } from '@/types/game'

export const BOARD_SIZE = 15
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE

const PRIMARY_DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const
const CAPTURE_DIRECTIONS = [
  ...PRIMARY_DIRECTIONS,
  ...PRIMARY_DIRECTIONS.map(([rowStep, columnStep]) => [-rowStep, -columnStep] as const),
]

export interface LocalMoveResult {
  board: (Stone | null)[]
  captured: number[]
  winner: Stone | null
  isDraw: boolean
}

export function emptyBoard(): (Stone | null)[] {
  return Array.from({ length: CELL_COUNT }, () => null)
}

export function opponent(stone: Stone): Stone {
  return stone === 'black' ? 'white' : 'black'
}

export function applyLocalMove(
  board: readonly (Stone | null)[],
  position: number,
  stone: Stone,
  blockedPositions: readonly number[] = [],
): LocalMoveResult {
  if (board.length !== CELL_COUNT) throw new Error(`Board must contain exactly ${CELL_COUNT} cells`)
  if (position < 0 || position >= CELL_COUNT) throw new Error('Position is outside the board')
  if (board[position] !== null) throw new Error('Position is already occupied')
  if (blockedPositions.includes(position)) {
    throw new Error('That captured position is blocked for one turn')
  }

  const nextBoard = [...board]
  nextBoard[position] = stone
  const captured = capturedPositions(nextBoard, position, stone)
  for (const capturedPosition of captured) nextBoard[capturedPosition] = null

  const winner = hasFive(nextBoard, stone) ? stone : null
  return {
    board: nextBoard,
    captured,
    winner,
    isDraw: winner === null && nextBoard.every((cell) => cell !== null),
  }
}

export function hasFive(board: readonly (Stone | null)[], stone: Stone): boolean {
  for (let position = 0; position < board.length; position += 1) {
    if (board[position] !== stone) continue
    const row = Math.floor(position / BOARD_SIZE)
    const column = position % BOARD_SIZE

    for (const [rowStep, columnStep] of PRIMARY_DIRECTIONS) {
      const previousRow = row - rowStep
      const previousColumn = column - columnStep
      if (
        inBounds(previousRow, previousColumn) &&
        board[previousRow * BOARD_SIZE + previousColumn] === stone
      ) {
        continue
      }

      let runLength = 0
      let currentRow = row
      let currentColumn = column
      while (inBounds(currentRow, currentColumn)) {
        if (board[currentRow * BOARD_SIZE + currentColumn] !== stone) break
        runLength += 1
        if (runLength >= 5) return true
        currentRow += rowStep
        currentColumn += columnStep
      }
    }
  }
  return false
}

function capturedPositions(board: readonly (Stone | null)[], position: number, stone: Stone) {
  const row = Math.floor(position / BOARD_SIZE)
  const column = position % BOARD_SIZE
  const enemy = opponent(stone)
  const captured = new Set<number>()

  for (const [rowStep, columnStep] of CAPTURE_DIRECTIONS) {
    const coordinates = [1, 2, 3].map(
      (distance) => [row + rowStep * distance, column + columnStep * distance] as const,
    )
    if (!coordinates.every(([candidateRow, candidateColumn]) => inBounds(candidateRow, candidateColumn))) {
      continue
    }

    const [first, second, bracket] = coordinates.map(
      ([candidateRow, candidateColumn]) => candidateRow * BOARD_SIZE + candidateColumn,
    )
    if (board[first] === enemy && board[second] === enemy && board[bracket] === stone) {
      captured.add(first)
      captured.add(second)
    }
  }

  return [...captured].sort((left, right) => left - right)
}

function inBounds(row: number, column: number) {
  return row >= 0 && row < BOARD_SIZE && column >= 0 && column < BOARD_SIZE
}
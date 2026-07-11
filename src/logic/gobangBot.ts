import { applyLocalMove, BOARD_SIZE, CELL_COUNT, opponent } from '@/logic/localGame'
import type { Stone } from '@/types/game'

const WIN_SCORE = 1_000_000_000
const TACTICAL_EXTENSION_DEPTH = 4
const PRIMARY_DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const
const LINES = buildLines()

export interface BotRequest {
  board: (Stone | null)[]
  stone: Stone
  blockedPositions: number[]
  timeBudgetMs?: number
  maxDepth?: number
}

export interface BotResult {
  position: number | null
  depth: number
  elapsedMs: number
  nodes: number
}

interface SearchPosition {
  board: (Stone | null)[]
  turn: Stone
  blockedPositions: number[]
}

interface SearchContext {
  botStone: Stone
  deadline: number
  nodes: number
  table: Map<string, TableEntry>
}

interface TableEntry {
  depth: number
  score: number
  flag: 'exact' | 'lower' | 'upper'
  bestMove: number | null
}

type PatternCell = Stone | 'blocked' | null

class SearchTimeout extends Error {}

export function findBestMove({
  board,
  stone,
  blockedPositions,
  timeBudgetMs = 1_000,
  maxDepth = 8,
}: BotRequest): BotResult {
  const startedAt = Date.now()
  const position: SearchPosition = { board: [...board], turn: stone, blockedPositions: [...blockedPositions] }
  const context: SearchContext = {
    botStone: stone,
    deadline: startedAt + Math.max(1, timeBudgetMs),
    nodes: 0,
    table: new Map(),
  }
  const initialMoves = orderedMoves(position).slice(0, 24)
  let bestMove = initialMoves[0] ?? null
  let completedDepth = 0

  for (let depth = 1; depth <= maxDepth && bestMove !== null; depth += 1) {
    try {
      const result = searchRoot(position, depth, context, bestMove)
      bestMove = result.position
      completedDepth = depth
      if (Math.abs(result.score) >= WIN_SCORE - depth) break
    } catch (error) {
      if (!(error instanceof SearchTimeout)) throw error
      break
    }
  }

  return {
    position: bestMove,
    depth: completedDepth,
    elapsedMs: Date.now() - startedAt,
    nodes: context.nodes,
  }
}

function searchRoot(
  position: SearchPosition,
  depth: number,
  context: SearchContext,
  previousBest: number,
) {
  const moves = orderedMoves(position)
    .slice(0, 24)
    .sort((left, right) => Number(right === previousBest) - Number(left === previousBest))
  let bestMove = moves[0] ?? previousBest
  let bestScore = -Infinity
  let alpha = -Infinity

  for (const move of moves) {
    checkDeadline(context)
    const result = applyLocalMove(position.board, move, position.turn, position.blockedPositions)
    const score = result.winner
      ? WIN_SCORE - 1
      : result.isDraw
        ? 0
        : alphaBeta(
            {
              board: result.board,
              turn: opponent(position.turn),
              blockedPositions: result.captured,
            },
            depth - 1,
            alpha,
            Infinity,
            1,
            context,
          )
    if (score > bestScore) {
      bestScore = score
      bestMove = move
    }
    alpha = Math.max(alpha, bestScore)
  }

  return { position: bestMove, score: bestScore }
}

function alphaBeta(
  position: SearchPosition,
  depth: number,
  initialAlpha: number,
  initialBeta: number,
  ply: number,
  context: SearchContext,
): number {
  context.nodes += 1
  checkDeadline(context)
  if (depth === 0) {
    return quiescence(
      position,
      initialAlpha,
      initialBeta,
      ply,
      TACTICAL_EXTENSION_DEPTH,
      context,
    )
  }

  const key = positionKey(position)
  const cached = context.table.get(key)
  let alpha = initialAlpha
  let beta = initialBeta
  if (cached && cached.depth >= depth) {
    if (cached.flag === 'exact') return cached.score
    if (cached.flag === 'lower') alpha = Math.max(alpha, cached.score)
    else beta = Math.min(beta, cached.score)
    if (alpha >= beta) return cached.score
  }

  const maximizing = position.turn === context.botStone
  const candidateLimit = depth >= 4 ? 10 : 14
  const moves = orderedMoves(position)
    .slice(0, candidateLimit)
    .sort(
      (left, right) =>
        Number(right === cached?.bestMove) - Number(left === cached?.bestMove),
    )
  if (!moves.length) return 0

  let bestMove: number | null = null
  let score = maximizing ? -Infinity : Infinity
  for (const move of moves) {
    const result = applyLocalMove(position.board, move, position.turn, position.blockedPositions)
    let childScore: number
    if (result.winner) {
      childScore = result.winner === context.botStone ? WIN_SCORE - ply : -WIN_SCORE + ply
    } else if (result.isDraw) {
      childScore = 0
    } else {
      childScore = alphaBeta(
        {
          board: result.board,
          turn: opponent(position.turn),
          blockedPositions: result.captured,
        },
        depth - 1,
        alpha,
        beta,
        ply + 1,
        context,
      )
    }

    if ((maximizing && childScore > score) || (!maximizing && childScore < score)) {
      score = childScore
      bestMove = move
    }
    if (maximizing) alpha = Math.max(alpha, score)
    else beta = Math.min(beta, score)
    if (alpha >= beta) break
  }

  context.table.set(key, {
    depth,
    score,
    flag: score <= initialAlpha ? 'upper' : score >= initialBeta ? 'lower' : 'exact',
    bestMove,
  })
  return score
}

function quiescence(
  position: SearchPosition,
  initialAlpha: number,
  initialBeta: number,
  ply: number,
  remainingDepth: number,
  context: SearchContext,
): number {
  checkDeadline(context)
  const staticScore = evaluate(position, context.botStone)
  if (remainingDepth === 0) return staticScore

  const tactical = tacticalMoves(position, context)
  if (tactical.forcedLoss) {
    return position.turn === context.botStone ? -WIN_SCORE + ply : WIN_SCORE - ply
  }
  if (!tactical.moves.length) return staticScore

  const maximizing = position.turn === context.botStone
  let alpha = initialAlpha
  let beta = initialBeta
  let score = maximizing ? -Infinity : Infinity
  for (const move of tactical.moves) {
    const result = applyLocalMove(position.board, move, position.turn, position.blockedPositions)
    let childScore: number
    if (result.winner) {
      childScore = result.winner === context.botStone ? WIN_SCORE - ply : -WIN_SCORE + ply
    } else if (result.isDraw) {
      childScore = 0
    } else {
      childScore = quiescence(
        {
          board: result.board,
          turn: opponent(position.turn),
          blockedPositions: result.captured,
        },
        alpha,
        beta,
        ply + 1,
        remainingDepth - 1,
        context,
      )
    }

    score = maximizing ? Math.max(score, childScore) : Math.min(score, childScore)
    if (maximizing) alpha = Math.max(alpha, score)
    else beta = Math.min(beta, score)
    if (alpha >= beta) break
  }
  return score
}

function tacticalMoves(position: SearchPosition, context: SearchContext) {
  const enemy = opponent(position.turn)
  const ownStoneCount = position.board.filter((cell) => cell === position.turn).length
  const enemyStoneCount = position.board.filter((cell) => cell === enemy).length
  if (ownStoneCount < 3 && enemyStoneCount < 4) {
    return { moves: [], forcedLoss: false }
  }

  const candidates = orderedMoves(position).slice(0, 18)
  const winningMoves = ownStoneCount >= 4
    ? immediateWinningMoves(position, candidates, context)
    : []
  if (winningMoves.length) return { moves: winningMoves, forcedLoss: false }

  const enemyPosition: SearchPosition = {
    board: position.board,
    turn: enemy,
    blockedPositions: [],
  }
  const enemyWins = enemyStoneCount >= 4
    ? immediateWinningMoves(
        enemyPosition,
        nearbyCandidates(enemyPosition),
        context,
      )
    : []
  if (enemyWins.length) {
    const defenses = candidates.filter((move) => {
      checkDeadline(context)
      const result = applyLocalMove(
        position.board,
        move,
        position.turn,
        position.blockedPositions,
      )
      if (result.winner) return true
      const replyPosition: SearchPosition = {
        board: result.board,
        turn: enemy,
        blockedPositions: result.captured,
      }
      return immediateWinningMoves(
        replyPosition,
        nearbyCandidates(replyPosition),
        context,
      ).length === 0
    })
    return { moves: defenses, forcedLoss: defenses.length === 0 }
  }

  const forcingMoves = ownStoneCount >= 3 ? candidates.filter((move) => {
    checkDeadline(context)
    const result = applyLocalMove(
      position.board,
      move,
      position.turn,
      position.blockedPositions,
    )
    if (result.winner) return true
    return localShapeScore(result.board, move, position.turn) >= 180_000
  }) : []
  return { moves: forcingMoves.slice(0, 8), forcedLoss: false }
}

function immediateWinningMoves(
  position: SearchPosition,
  candidates: readonly number[],
  context: SearchContext,
) {
  return candidates.filter((move) => {
    checkDeadline(context)
    return applyLocalMove(
      position.board,
      move,
      position.turn,
      position.blockedPositions,
    ).winner === position.turn
  })
}

function orderedMoves(position: SearchPosition) {
  const candidates = nearbyCandidates(position)
  return candidates
    .map((candidate) => ({
      position: candidate,
      score: quickMoveScore(position, candidate),
    }))
    .sort((left, right) => right.score - left.score || left.position - right.position)
    .map(({ position: candidate }) => candidate)
}

function nearbyCandidates({ board, blockedPositions }: SearchPosition) {
  const blocked = new Set(blockedPositions)
  const occupied = board.flatMap((cell, position) => (cell === null ? [] : [position]))
  if (!occupied.length) {
    const center = Math.floor(CELL_COUNT / 2)
    if (!blocked.has(center)) return [center]
  }

  const candidates = new Set<number>()
  for (const position of occupied) {
    const row = Math.floor(position / BOARD_SIZE)
    const column = position % BOARD_SIZE
    for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
      for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
        const candidateRow = row + rowOffset
        const candidateColumn = column + columnOffset
        if (
          candidateRow < 0 ||
          candidateRow >= BOARD_SIZE ||
          candidateColumn < 0 ||
          candidateColumn >= BOARD_SIZE
        ) {
          continue
        }
        const candidate = candidateRow * BOARD_SIZE + candidateColumn
        if (board[candidate] === null && !blocked.has(candidate)) candidates.add(candidate)
      }
    }
  }

  if (!candidates.size) {
    for (let position = 0; position < CELL_COUNT; position += 1) {
      if (board[position] === null && !blocked.has(position)) candidates.add(position)
    }
  }
  return [...candidates]
}

function quickMoveScore(position: SearchPosition, move: number) {
  const ownResult = applyLocalMove(
    position.board,
    move,
    position.turn,
    position.blockedPositions,
  )
  if (ownResult.winner) return WIN_SCORE

  const enemy = opponent(position.turn)
  let enemyResult
  try {
    enemyResult = applyLocalMove(position.board, move, enemy)
  } catch {
    enemyResult = null
  }
  const center = (BOARD_SIZE - 1) / 2
  const row = Math.floor(move / BOARD_SIZE)
  const column = move % BOARD_SIZE
  const centerBonus = BOARD_SIZE - (Math.abs(row - center) + Math.abs(column - center))

  return (
    (enemyResult?.winner ? WIN_SCORE / 2 : 0) +
    ownResult.captured.length * 12_000 +
    (enemyResult?.captured.length ?? 0) * 4_000 +
    localShapeScore(ownResult.board, move, position.turn) * 2 +
    (enemyResult ? localShapeScore(enemyResult.board, move, enemy) : 0) +
    centerBonus
  )
}

function localShapeScore(board: readonly (Stone | null)[], position: number, stone: Stone) {
  const row = Math.floor(position / BOARD_SIZE)
  const column = position % BOARD_SIZE
  let score = 0
  for (const [rowStep, columnStep] of PRIMARY_DIRECTIONS) {
    const cells: (Stone | null)[] = []
    let centerIndex = -1
    for (let distance = -5; distance <= 5; distance += 1) {
      const nextRow = row + rowStep * distance
      const nextColumn = column + columnStep * distance
      if (!inBounds(nextRow, nextColumn)) continue
      if (distance === 0) centerIndex = cells.length
      cells.push(board[nextRow * BOARD_SIZE + nextColumn])
    }
    score += scoreWindows(cells, stone, centerIndex)
  }
  return score
}

function evaluate(position: SearchPosition, botStone: Stone) {
  const blocked = new Set(position.blockedPositions)
  const enemy = opponent(botStone)
  return (
    scoreStone(position.board, botStone, position.turn === botStone ? blocked : undefined) -
    scoreStone(position.board, enemy, position.turn === enemy ? blocked : undefined) * 1.08
  )
}

function scoreStone(
  board: readonly (Stone | null)[],
  stone: Stone,
  blockedPositions?: ReadonlySet<number>,
) {
  let score = 0
  for (const line of LINES) {
    let index = 0
    while (index < line.length) {
      if (cellForStone(board, line[index], blockedPositions) !== stone) {
        index += 1
        continue
      }
      const start = index
      while (
        index < line.length &&
        cellForStone(board, line[index], blockedPositions) === stone
      ) {
        index += 1
      }
      const openEnds = Number(
        start > 0 && cellForStone(board, line[start - 1], blockedPositions) === null,
      ) + Number(
        index < line.length && cellForStone(board, line[index], blockedPositions) === null,
      )
      const runLength = index - start
      if (runLength >= 5) return WIN_SCORE
      score += shapeValue(runLength, openEnds)
    }

    for (let start = 0; start <= line.length - 5; start += 1) {
      const window = line
        .slice(start, start + 5)
        .map((position) => cellForStone(board, position, blockedPositions))
      score += windowValue(window, stone)
    }

    for (let start = 0; start <= line.length - 6; start += 1) {
      const window = line
        .slice(start, start + 6)
        .map((position) => cellForStone(board, position, blockedPositions))
      score += openWindowValue(window, stone)
    }
  }
  return score
}

function scoreWindows(cells: readonly (Stone | null)[], stone: Stone, centerIndex: number) {
  let score = 0
  for (const length of [5, 6]) {
    const firstStart = Math.max(0, centerIndex - length + 1)
    const lastStart = Math.min(centerIndex, cells.length - length)
    for (let start = firstStart; start <= lastStart; start += 1) {
      const window = cells.slice(start, start + length)
      score += length === 5 ? windowValue(window, stone) : openWindowValue(window, stone)
    }
  }
  return score
}

function windowValue(window: readonly PatternCell[], stone: Stone) {
  if (window.some((cell) => cell !== null && cell !== stone)) return 0
  const stoneCount = window.filter((cell) => cell === stone).length
  if (stoneCount === 5) return WIN_SCORE
  if (stoneCount === 4) return 180_000
  if (stoneCount === 3) return 6_000
  if (stoneCount === 2) return 180
  return 0
}

function openWindowValue(window: readonly PatternCell[], stone: Stone) {
  if (window[0] !== null || window[window.length - 1] !== null) return 0
  const middle = window.slice(1, -1)
  if (middle.some((cell) => cell !== null && cell !== stone)) return 0
  const stoneCount = middle.filter((cell) => cell === stone).length
  if (stoneCount === 4) return 2_000_000
  if (stoneCount === 3) return 30_000
  if (stoneCount === 2) return 800
  return 0
}

function cellForStone(
  board: readonly (Stone | null)[],
  position: number,
  blockedPositions?: ReadonlySet<number>,
): PatternCell {
  if (blockedPositions?.has(position)) return 'blocked'
  return board[position]
}

function shapeValue(stones: number, openEnds: number) {
  if (stones >= 5) return WIN_SCORE
  if (stones === 4) return openEnds === 2 ? 2_000_000 : openEnds === 1 ? 180_000 : 0
  if (stones === 3) return openEnds === 2 ? 24_000 : openEnds === 1 ? 1_800 : 0
  if (stones === 2) return openEnds === 2 ? 700 : openEnds === 1 ? 90 : 0
  return openEnds === 2 ? 12 : 2
}

function positionKey(position: SearchPosition) {
  const cells = position.board.map((cell) => (cell === 'black' ? 'b' : cell === 'white' ? 'w' : '.'))
  return `${cells.join('')}|${position.turn}|${position.blockedPositions.join(',')}`
}

function checkDeadline(context: SearchContext) {
  if (Date.now() >= context.deadline) throw new SearchTimeout()
}

function buildLines() {
  const lines: number[][] = []
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    lines.push(Array.from({ length: BOARD_SIZE }, (_, column) => row * BOARD_SIZE + column))
  }
  for (let column = 0; column < BOARD_SIZE; column += 1) {
    lines.push(Array.from({ length: BOARD_SIZE }, (_, row) => row * BOARD_SIZE + column))
  }
  for (let startColumn = 0; startColumn < BOARD_SIZE; startColumn += 1) {
    addDiagonal(lines, 0, startColumn, 1, 1)
    addDiagonal(lines, 0, startColumn, 1, -1)
  }
  for (let startRow = 1; startRow < BOARD_SIZE; startRow += 1) {
    addDiagonal(lines, startRow, 0, 1, 1)
    addDiagonal(lines, startRow, BOARD_SIZE - 1, 1, -1)
  }
  return lines.filter((line) => line.length >= 5)
}

function addDiagonal(
  lines: number[][],
  startRow: number,
  startColumn: number,
  rowStep: number,
  columnStep: number,
) {
  const line: number[] = []
  let row = startRow
  let column = startColumn
  while (inBounds(row, column)) {
    line.push(row * BOARD_SIZE + column)
    row += rowStep
    column += columnStep
  }
  lines.push(line)
}

function inBounds(row: number, column: number) {
  return row >= 0 && row < BOARD_SIZE && column >= 0 && column < BOARD_SIZE
}
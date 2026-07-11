<script setup lang="ts">
import { ChevronLeft, Cpu, Crown, Flag, RefreshCw, RotateCcw, ShieldCheck } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import AvatarImage from '@/components/AvatarImage.vue'
import ComicBrand from '@/components/ComicBrand.vue'
import GridComponent from '@/components/GridComponent.vue'
import { useSession } from '@/composables/useSession'
import type { BotDifficulty, BotRequest, BotResult } from '@/logic/gobangBot'
import { applyLocalMove, emptyBoard, opponent } from '@/logic/localGame'
import type { Player, Stone } from '@/types/game'

const STORAGE_KEY = 'gobang.local-ai-match.v1'
const BOT_DIFFICULTIES: { value: BotDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]
const DIFFICULTY_COPY: Record<BotDifficulty, { title: string; description: string }> = {
  easy: {
    title: 'One-second search',
    description: 'Fast pattern scoring and alpha-beta search.',
  },
  medium: {
    title: 'Five-second search',
    description: 'Deeper alpha-beta search and tactical lines.',
  },
  hard: {
    title: 'Five-second threat search',
    description: 'Deeper search plus open-three attack and defense lines.',
  },
}
const BOT_PLAYER: Player = {
  id: 'local-bot',
  display_name: 'Gobang Bot',
  avatar_seed: 'pixel',
  is_guest: true,
}

type LocalStatus = 'active' | 'won' | 'draw' | 'resigned'

interface LocalMatch {
  version: 1
  board: (Stone | null)[]
  turn: Stone
  blockedPositions: number[]
  lastMove: number | null
  status: LocalStatus
  winner: Stone | null
  blackCaptures: number
  whiteCaptures: number
  humanStone: Stone
  difficulty: BotDifficulty
  humanScore: number
  botScore: number
  draws: number
  round: number
  revision: number
}

const { player } = useSession()
const match = ref(loadMatch())
const botThinking = ref(false)
const actionError = ref('')
const lastSearch = ref<BotResult | null>(null)
const resignArmed = ref(false)
let botWorker: Worker | null = null
let botStartTimer: ReturnType<typeof setTimeout> | null = null

const humanPlayer = computed<Player>(() => ({
  id: player.value?.id ?? 'local-player',
  display_name:
    player.value?.display_name && player.value.display_name !== 'Player'
      ? player.value.display_name
      : 'You',
  avatar_seed: player.value?.avatar_seed ?? 'nova',
  is_guest: player.value?.is_guest ?? true,
}))
const botStone = computed(() => opponent(match.value.humanStone))
const blackPlayer = computed(() =>
  match.value.humanStone === 'black' ? humanPlayer.value : BOT_PLAYER,
)
const whitePlayer = computed(() =>
  match.value.humanStone === 'white' ? humanPlayer.value : BOT_PLAYER,
)
const blackStoneCount = computed(
  () => match.value.board.filter((stone) => stone === 'black').length,
)
const whiteStoneCount = computed(
  () => match.value.board.filter((stone) => stone === 'white').length,
)
const boardDisabled = computed(
  () =>
    match.value.status !== 'active' ||
    botThinking.value ||
    match.value.turn !== match.value.humanStone,
)
const boardDisabledLabel = computed(() => {
  if (match.value.status !== 'active') return 'Round finished'
  if (botThinking.value) return 'Bot is thinking'
  if (match.value.turn !== match.value.humanStone) return "Bot's turn"
  return ''
})
const statusLabel = computed(() => {
  if (botThinking.value) return 'Bot is thinking'
  if (match.value.status === 'draw') return 'Draw'
  if (match.value.status === 'resigned') return 'You resigned'
  if (match.value.status === 'won') {
    return match.value.winner === match.value.humanStone ? 'You win' : 'Bot wins'
  }
  return match.value.turn === match.value.humanStone ? 'Your turn' : "Bot's turn"
})
const winnerPlayer = computed(() => {
  if (!match.value.winner) return null
  return match.value.winner === match.value.humanStone ? humanPlayer.value : BOT_PLAYER
})
const difficultyCopy = computed(() => DIFFICULTY_COPY[match.value.difficulty])

onMounted(() => {
  if (match.value.status === 'active' && match.value.turn === botStone.value) scheduleBotTurn()
})

onBeforeUnmount(() => {
  if (botStartTimer) clearTimeout(botStartTimer)
  botWorker?.terminate()
})

function playHumanMove(position: number) {
  if (boardDisabled.value) return
  actionError.value = ''
  resignArmed.value = false
  commitMove(position, match.value.humanStone)
  if (match.value.status === 'active') scheduleBotTurn()
}

function scheduleBotTurn() {
  if (botStartTimer) clearTimeout(botStartTimer)
  botStartTimer = setTimeout(() => {
    botStartTimer = null
    startBotTurn()
  }, 120)
}

function startBotTurn() {
  if (
    botThinking.value ||
    match.value.status !== 'active' ||
    match.value.turn !== botStone.value
  ) {
    return
  }

  botWorker?.terminate()
  botWorker = new Worker(new URL('../workers/gobangBot.worker.ts', import.meta.url), {
    type: 'module',
  })
  const requestedRevision = match.value.revision
  botThinking.value = true
  actionError.value = ''

  botWorker.onmessage = (event: MessageEvent<BotResult>) => {
    botThinking.value = false
    lastSearch.value = event.data
    botWorker?.terminate()
    botWorker = null
    if (
      match.value.revision !== requestedRevision ||
      match.value.status !== 'active' ||
      match.value.turn !== botStone.value
    ) {
      return
    }
    if (event.data.position === null) {
      actionError.value = 'The bot could not find a legal move.'
      return
    }
    try {
      commitMove(event.data.position, botStone.value)
    } catch {
      actionError.value = 'The bot move could not be applied. Start a new round.'
    }
  }
  botWorker.onerror = () => {
    botThinking.value = false
    actionError.value = 'The local bot stopped unexpectedly. Try the round again.'
    botWorker?.terminate()
    botWorker = null
  }

  const request: BotRequest = {
    board: [...match.value.board],
    stone: botStone.value,
    blockedPositions: [...match.value.blockedPositions],
    difficulty: match.value.difficulty,
  }
  botWorker.postMessage(request)
}

function setDifficulty(difficulty: BotDifficulty) {
  if (botThinking.value || match.value.difficulty === difficulty) return
  match.value = { ...match.value, difficulty }
  lastSearch.value = null
  persistMatch()
}

function commitMove(position: number, stone: Stone) {
  const result = applyLocalMove(
    match.value.board,
    position,
    stone,
    match.value.blockedPositions,
  )
  const humanWon = result.winner === match.value.humanStone
  const botWon = result.winner === botStone.value
  match.value = {
    ...match.value,
    board: result.board,
    turn: result.winner || result.isDraw ? match.value.turn : opponent(stone),
    blockedPositions: result.captured,
    lastMove: position,
    status: result.winner ? 'won' : result.isDraw ? 'draw' : 'active',
    winner: result.winner,
    blackCaptures:
      match.value.blackCaptures + (stone === 'black' ? result.captured.length / 2 : 0),
    whiteCaptures:
      match.value.whiteCaptures + (stone === 'white' ? result.captured.length / 2 : 0),
    humanScore: match.value.humanScore + Number(humanWon),
    botScore: match.value.botScore + Number(botWon),
    draws: match.value.draws + Number(result.isDraw),
    revision: match.value.revision + 1,
  }
  persistMatch()
}

function resign() {
  if (match.value.status !== 'active') return
  if (!resignArmed.value) {
    resignArmed.value = true
    return
  }
  botWorker?.terminate()
  botWorker = null
  botThinking.value = false
  match.value = {
    ...match.value,
    status: 'resigned',
    winner: botStone.value,
    botScore: match.value.botScore + 1,
    revision: match.value.revision + 1,
  }
  resignArmed.value = false
  persistMatch()
}

function startNextRound() {
  startRound(opponent(match.value.humanStone), false)
}

function resetMatch() {
  if (
    match.value.status === 'active' &&
    !window.confirm('Reset this local match and its score?')
  ) {
    return
  }
  startRound('black', true)
}

function startRound(humanStone: Stone, resetScore: boolean) {
  botWorker?.terminate()
  botWorker = null
  botThinking.value = false
  actionError.value = ''
  resignArmed.value = false
  lastSearch.value = null
  match.value = createMatch(
    humanStone,
    resetScore ? 1 : match.value.round + 1,
    resetScore ? 0 : match.value.humanScore,
    resetScore ? 0 : match.value.botScore,
    resetScore ? 0 : match.value.draws,
    match.value.difficulty,
  )
  persistMatch()
  if (match.value.turn === botStone.value) scheduleBotTurn()
}

function persistMatch() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(match.value))
}

function loadMatch(): LocalMatch {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createMatch('black')
    const stored = JSON.parse(raw) as LocalMatch
    if (
      stored.version !== 1 ||
      !Array.isArray(stored.board) ||
      stored.board.length !== 225 ||
      !stored.board.every((cell) => cell === null || cell === 'black' || cell === 'white') ||
      !['black', 'white'].includes(stored.turn) ||
      !['black', 'white'].includes(stored.humanStone) ||
      !['active', 'won', 'draw', 'resigned'].includes(stored.status)
    ) {
      throw new Error('Invalid local match')
    }
    return {
      ...stored,
      difficulty: BOT_DIFFICULTIES.some(({ value }) => value === stored.difficulty)
        ? stored.difficulty
        : 'easy',
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return createMatch('black')
  }
}

function createMatch(
  humanStone: Stone,
  round = 1,
  humanScore = 0,
  botScore = 0,
  draws = 0,
  difficulty: BotDifficulty = 'easy',
): LocalMatch {
  return {
    version: 1,
    board: emptyBoard(),
    turn: 'black',
    blockedPositions: [],
    lastMove: null,
    status: 'active',
    winner: null,
    blackCaptures: 0,
    whiteCaptures: 0,
    humanStone,
    difficulty,
    humanScore,
    botScore,
    draws,
    round,
    revision: 0,
  }
}
</script>

<template>
  <div class="app-shell game-shell">
    <header class="app-header game-header">
      <RouterLink
        to="/"
        class="brand-mark brand-mark--back"
        aria-label="Back to lobby"
        title="Back to lobby"
      >
        <ChevronLeft :size="20" />
        <ComicBrand />
      </RouterLink>
      <div class="game-header__actions">
        <span class="local-mode-badge"><ShieldCheck :size="15" /> Local</span>
        <span class="round-label">Round {{ match.round }}</span>
      </div>
    </header>

    <main class="game-layout">
      <section class="match-strip" aria-label="Players">
        <div
          :class="[
            'player-rail',
            { 'player-rail--turn': match.status === 'active' && match.turn === 'black' },
          ]"
        >
          <AvatarImage :seed="blackPlayer.avatar_seed" color="black" size="medium" />
          <div>
            <span class="stone-label">
              Black
              <em v-if="match.status === 'active' && match.turn === 'black'" class="turn-label">
                Turn
              </em>
            </span>
            <strong class="player-name">
              <Crown
                v-if="match.winner === 'black'"
                class="winner-crown"
                :size="16"
                fill="currentColor"
              />
              <span>{{ blackPlayer.display_name }}</span>
            </strong>
            <small class="player-short-id">{{ match.blackCaptures }} captures</small>
          </div>
          <span class="stone-total stone-total--black" aria-label="Black stones on board">
            <i aria-hidden="true" />
            <strong>{{ blackStoneCount }}</strong>
          </span>
        </div>

        <div
          :class="[
            'player-rail player-rail--right',
            { 'player-rail--turn': match.status === 'active' && match.turn === 'white' },
          ]"
        >
          <span class="stone-total stone-total--white" aria-label="White stones on board">
            <i aria-hidden="true" />
            <strong>{{ whiteStoneCount }}</strong>
          </span>
          <div>
            <span class="stone-label">
              <em v-if="match.status === 'active' && match.turn === 'white'" class="turn-label">
                Turn
              </em>
              White
            </span>
            <strong class="player-name">
              <span>{{ whitePlayer.display_name }}</span>
              <Crown
                v-if="match.winner === 'white'"
                class="winner-crown"
                :size="16"
                fill="currentColor"
              />
            </strong>
            <small class="player-short-id">{{ match.whiteCaptures }} captures</small>
          </div>
          <AvatarImage :seed="whitePlayer.avatar_seed" color="white" size="medium" />
        </div>
      </section>

      <section class="game-workspace">
        <div class="game-board-column">
          <GridComponent
            :board="match.board"
            :turn="match.turn"
            :black-player="blackPlayer"
            :white-player="whitePlayer"
            :disabled="boardDisabled"
            :disabled-label="boardDisabledLabel"
            :blocked-positions="match.status === 'active' ? match.blockedPositions : []"
            :revision="match.revision"
            :last-move="match.lastMove"
            @move="playHumanMove"
          />
          <div
            v-if="winnerPlayer"
            :key="`${match.round}-${winnerPlayer.id}`"
            class="winner-celebration"
            role="status"
            aria-live="assertive"
          >
            <div class="winner-celebration__player">
              <Crown class="winner-celebration__crown" :size="48" fill="currentColor" />
              <AvatarImage :seed="winnerPlayer.avatar_seed" size="large" />
              <strong>{{ winnerPlayer.display_name }} wins!</strong>
            </div>
          </div>
          <p v-if="actionError" class="board-message" role="alert">{{ actionError }}</p>
        </div>

        <aside class="game-actions">
          <section class="action-block local-match-status" aria-live="polite">
            <p class="section-kicker"><Cpu :size="14" /> Against the bot</p>
            <h2>{{ statusLabel }}</h2>
            <p class="local-score">
              You <strong>{{ match.humanScore }}</strong>
              <span>·</span>
              Bot <strong>{{ match.botScore }}</strong>
              <span v-if="match.draws">· {{ match.draws }} draw{{ match.draws === 1 ? '' : 's' }}</span>
            </p>
            <div class="segmented-control bot-difficulty" aria-label="Bot difficulty">
              <button
                v-for="difficulty in BOT_DIFFICULTIES"
                :key="difficulty.value"
                type="button"
                :class="{ active: match.difficulty === difficulty.value }"
                :aria-pressed="match.difficulty === difficulty.value"
                :disabled="botThinking"
                @click="setDifficulty(difficulty.value)"
              >
                {{ difficulty.label }}
              </button>
            </div>
            <div v-if="botThinking" class="bot-thinking-bar" aria-hidden="true"><i /></div>
            <p v-else-if="lastSearch" class="bot-search-detail">
              Depth {{ lastSearch.depth }} · {{ lastSearch.elapsedMs }} ms
            </p>
            <button
              v-if="match.status !== 'active'"
              type="button"
              class="button button--primary"
              @click="startNextRound"
            >
              <RefreshCw :size="18" /> Play again
            </button>
          </section>

          <section class="action-block action-block--compact rules-block" aria-label="Gobang rules">
            <p class="section-kicker">Local match</p>
            <div class="quick-rules">
              <p>
                <strong>{{ difficultyCopy.title }}</strong>
                {{ difficultyCopy.description }}
              </p>
              <p>
                <strong>No Elo</strong>
                This score and board stay in this browser or app.
              </p>
            </div>
          </section>

          <div class="local-round-actions" aria-label="Round actions">
            <button
              type="button"
              class="button button--secondary"
              title="Reset local match"
              @click="resetMatch"
            >
              <RotateCcw :size="17" /> Reset
            </button>
            <div v-if="match.status === 'active'">
              <div v-if="resignArmed" class="resign-confirm">
                <span>Resign this round?</span>
                <button
                  type="button"
                  class="button button--danger"
                  @click="resign"
                >
                  Confirm
                </button>
              </div>
              <button v-else type="button" class="button button--danger-quiet" @click="resign">
                <Flag :size="17" /> Resign
              </button>
            </div>
          </div>
        </aside>
      </section>
    </main>
  </div>
</template>
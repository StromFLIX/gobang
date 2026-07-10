<script setup lang="ts">
import {
  Check,
  ChevronLeft,
  Copy,
  Flag,
  Grid3X3,
  House,
  RefreshCw,
  Share2,
  Wifi,
  WifiOff,
  X,
} from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import AvatarImage from '@/components/AvatarImage.vue'
import AvatarPicker from '@/components/AvatarPicker.vue'
import GridComponent from '@/components/GridComponent.vue'
import { useSession } from '@/composables/useSession'
import { AVATAR_PRESETS } from '@/logic/avatar'
import { shortPlayerId } from '@/logic/games'
import { ApiError, api } from '@/services/api'
import { subscribeToGame } from '@/services/pocketbase'
import type { Game, Player, Stone } from '@/types/game'

const route = useRoute()
const { player, ready, profileConfigured, bootstrapSession, updateProfile } = useSession()
const game = ref<Game | null>(null)
const loading = ref(true)
const pageError = ref('')
const actionError = ref('')
const pending = ref(false)
const connection = ref<'live' | 'offline' | 'reconnecting'>('reconnecting')
const copied = ref(false)
const resignArmed = ref(false)
const displayName = ref('')
const avatarSeed = ref<string>(AVATAR_PRESETS[0])
let unsubscribe: (() => void) | null = null

const inviteCode = computed(() => String(route.params.inviteCode ?? ''))
const blackPlayer = computed(() => playerById(game.value?.black_player_id ?? null))
const whitePlayer = computed(() => playerById(game.value?.white_player_id ?? null))
const blackStoneCount = computed(
  () => game.value?.board.filter((stone) => stone === 'black').length ?? 0,
)
const whiteStoneCount = computed(
  () => game.value?.board.filter((stone) => stone === 'white').length ?? 0,
)
const lastMove = computed(() => {
  const moves = game.value?.moves
  return moves?.length ? moves[moves.length - 1].position : null
})
const blockedPositions = computed(() => {
  const moves = game.value?.moves
  return game.value?.status === 'active' && moves?.length ? moves[moves.length - 1].captured : []
})
const currentTurnPlayer = computed(() =>
  game.value?.turn === 'black' ? blackPlayer.value : whitePlayer.value,
)
const isMyTurn = computed(
  () =>
    game.value?.status === 'active' &&
    currentTurnPlayer.value?.id === player.value?.id &&
    connection.value !== 'offline',
)
const boardDisabled = computed(() => !isMyTurn.value || pending.value)
const boardDisabledLabel = computed(() => {
  if (!game.value || !boardDisabled.value) return ''
  if (pending.value) return 'Saving move'
  if (connection.value === 'offline') return 'Offline'
  if (game.value.status === 'waiting') return 'Waiting for player two'
  if (isTerminal.value) return 'Round finished'
  return "Opponent's turn"
})
const isHost = computed(() => game.value?.host.id === player.value?.id)
const isTerminal = computed(() =>
  game.value ? ['won', 'draw', 'resigned'].includes(game.value.status) : false,
)
const myRematchReady = computed(() => {
  if (!game.value || !player.value) return false
  return isHost.value ? game.value.host_rematch : game.value.guest_rematch
})
const opponentRematchReady = computed(() => {
  if (!game.value || !player.value) return false
  return isHost.value ? game.value.guest_rematch : game.value.host_rematch
})
const rematchStateLabel = computed(() => {
  if (myRematchReady.value && opponentRematchReady.value) return 'Starting…'
  if (opponentRematchReady.value) return 'Opponent wants a rematch'
  return 'Waiting for opponent'
})
const statusLabel = computed(() => {
  if (!game.value) return ''
  if (game.value.status === 'waiting') return 'Waiting for player two'
  if (game.value.status === 'draw') return 'Draw'
  if (game.value.status === 'cancelled') return 'Game cancelled'
  if (game.value.status === 'won' || game.value.status === 'resigned') {
    const winner = playerById(game.value.winner_player_id)
    return winner ? `${winner.display_name} wins` : 'Round finished'
  }
  return isMyTurn.value ? 'Your turn' : 'Waiting'
})

onMounted(async () => {
  await bootstrapSession()
  if (player.value) {
    displayName.value = player.value.display_name === 'Player' ? '' : player.value.display_name
    avatarSeed.value = player.value.avatar_seed || AVATAR_PRESETS[0]
  }
  if (profileConfigured.value) await joinRoom()
  else loading.value = false
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
})

onBeforeUnmount(() => {
  unsubscribe?.()
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
})

function playerById(playerId: string | null): Player | null {
  if (!game.value || !playerId) return null
  if (game.value.host.id === playerId) return game.value.host
  return game.value.guest?.id === playerId ? game.value.guest : null
}

async function completeProfile() {
  const name = displayName.value.trim()
  if (!name) {
    pageError.value = 'Choose a player name first.'
    return
  }
  pending.value = true
  try {
    await updateProfile(name, avatarSeed.value)
    await joinRoom()
  } catch (error) {
    pageError.value = error instanceof ApiError ? error.message : 'Could not save your player.'
  } finally {
    pending.value = false
  }
}

async function joinRoom() {
  loading.value = true
  pageError.value = ''
  try {
    game.value = await api.joinGame(inviteCode.value)
    await startSubscription()
    connection.value = navigator.onLine ? 'live' : 'offline'
  } catch (error) {
    pageError.value =
      error instanceof ApiError && error.status === 404
        ? 'This game is unavailable or already full.'
        : error instanceof ApiError
          ? error.message
          : 'Could not open the game.'
  } finally {
    loading.value = false
  }
}

async function startSubscription() {
  unsubscribe?.()
  if (!game.value) return
  unsubscribe = await subscribeToGame(game.value.id, (nextGame) => {
    if (!game.value || nextGame.revision >= game.value.revision) game.value = nextGame
    connection.value = 'live'
  })
}

async function syncGame() {
  if (!game.value) return
  connection.value = 'reconnecting'
  try {
    game.value = await api.getGame(game.value.id)
    connection.value = 'live'
  } catch {
    connection.value = navigator.onLine ? 'reconnecting' : 'offline'
  }
}

function handleOffline() {
  connection.value = 'offline'
}

async function handleOnline() {
  await syncGame()
  await startSubscription()
}

async function playMove(position: number) {
  if (!game.value || boardDisabled.value) return
  pending.value = true
  actionError.value = ''
  try {
    game.value = await api.playMove(game.value.id, position, game.value.revision)
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      await syncGame()
      actionError.value = 'The board changed. Your view is up to date.'
    } else {
      actionError.value = error instanceof ApiError ? error.message : 'Move rejected.'
    }
  } finally {
    pending.value = false
  }
}

async function shareRoom() {
  const url = window.location.href
  try {
    if (navigator.share) await navigator.share({ title: 'Gobang game', url })
    else {
      await navigator.clipboard.writeText(url)
      copied.value = true
      window.setTimeout(() => (copied.value = false), 1800)
    }
  } catch {
    copied.value = false
  }
}

async function cancelRoom() {
  if (!game.value || pending.value) return
  pending.value = true
  try {
    game.value = await api.cancelGame(game.value.id)
  } finally {
    pending.value = false
  }
}

async function resign() {
  if (!game.value || pending.value) return
  if (!resignArmed.value) {
    resignArmed.value = true
    return
  }
  pending.value = true
  try {
    game.value = await api.resignGame(game.value.id)
    resignArmed.value = false
  } finally {
    pending.value = false
  }
}

async function toggleRematch() {
  if (!game.value || pending.value) return
  pending.value = true
  try {
    game.value = await api.setRematch(game.value.id, !myRematchReady.value)
  } finally {
    pending.value = false
  }
}

function stoneFor(playerId: string): Stone | null {
  if (game.value?.black_player_id === playerId) return 'black'
  if (game.value?.white_player_id === playerId) return 'white'
  return null
}
</script>

<template>
  <div class="app-shell game-shell">
    <header class="app-header game-header">
      <RouterLink to="/" class="brand-mark brand-mark--back" aria-label="Back to lobby" title="Back to lobby">
        <ChevronLeft :size="20" />
        <strong>Gobang</strong>
      </RouterLink>
      <div class="game-header__actions">
        <span v-if="game" class="round-label">Round {{ game.round }}</span>
        <span :class="['connection-pill', `connection-pill--${connection}`]">
          <Wifi v-if="connection === 'live'" :size="14" />
          <WifiOff v-else-if="connection === 'offline'" :size="14" />
          <RefreshCw v-else :size="14" />
          {{ connection }}
        </span>
        <button
          v-if="game"
          type="button"
          class="icon-button icon-button--muted"
          :title="copied ? 'Copied' : 'Share game'"
          :aria-label="copied ? 'Game link copied' : 'Share game'"
          @click="shareRoom"
        >
          <Check v-if="copied" :size="18" />
          <Share2 v-else :size="18" />
        </button>
      </div>
    </header>

    <main v-if="loading || !ready" class="loading-screen" aria-live="polite">
      <span class="loading-mark"><Grid3X3 :size="28" /></span>
      <p>Opening game…</p>
    </main>

    <main v-else-if="!profileConfigured && player" class="profile-gate">
      <section class="profile-tool">
        <p class="section-kicker">Before joining</p>
        <h1>Choose your player.</h1>
        <label class="field-label" for="join-player-name">Name</label>
        <input
          id="join-player-name"
          v-model="displayName"
          class="text-input"
          maxlength="24"
          autocomplete="nickname"
          placeholder="Your name"
        />
        <span class="field-label">Avatar</span>
        <AvatarPicker v-model="avatarSeed" />
        <p v-if="pageError" class="form-error" role="alert">{{ pageError }}</p>
        <button type="button" class="button button--primary" :disabled="pending" @click="completeProfile">
          Join game
        </button>
      </section>
    </main>

    <main v-else-if="pageError || !game" class="room-error">
      <Grid3X3 :size="36" />
      <h1>Game unavailable</h1>
      <p>{{ pageError }}</p>
      <RouterLink to="/" class="button button--primary"><House :size="18" /> Lobby</RouterLink>
    </main>

    <main v-else class="game-layout">
      <section class="match-strip" aria-label="Players">
        <div :class="['player-rail', { 'player-rail--turn': game.status === 'active' && game.turn === 'black' }]">
          <AvatarImage :seed="blackPlayer?.avatar_seed ?? 'black'" color="black" size="medium" />
          <div>
            <span class="stone-label">
              Black
              <em v-if="game.status === 'active' && game.turn === 'black'" class="turn-label">Turn</em>
            </span>
            <strong>{{ blackPlayer?.display_name ?? 'Waiting' }}</strong>
            <small v-if="blackPlayer" class="player-short-id">{{ shortPlayerId(blackPlayer.id) }}</small>
          </div>
          <span class="stone-total stone-total--black" aria-label="Black stones on board" title="Black stones on board">
            <i aria-hidden="true" />
            <strong>{{ blackStoneCount }}</strong>
          </span>
        </div>

        <div :class="['player-rail player-rail--right', { 'player-rail--turn': game.status === 'active' && game.turn === 'white' }]">
          <span class="stone-total stone-total--white" aria-label="White stones on board" title="White stones on board">
            <i aria-hidden="true" />
            <strong>{{ whiteStoneCount }}</strong>
          </span>
          <div>
            <span class="stone-label">
              <em v-if="game.status === 'active' && game.turn === 'white'" class="turn-label">Turn</em>
              White
            </span>
            <strong>{{ whitePlayer?.display_name ?? 'Waiting' }}</strong>
            <small v-if="whitePlayer" class="player-short-id">{{ shortPlayerId(whitePlayer.id) }}</small>
          </div>
          <AvatarImage :seed="whitePlayer?.avatar_seed ?? 'white'" color="white" size="medium" />
        </div>
      </section>

      <section class="game-workspace">
        <div class="game-board-column">
          <GridComponent
            :board="game.board"
            :turn="game.turn"
            :black-player="blackPlayer"
            :white-player="whitePlayer"
            :disabled="boardDisabled"
            :disabled-label="boardDisabledLabel"
            :blocked-positions="blockedPositions"
            :revision="game.revision"
            :last-move="lastMove"
            @move="playMove"
          />
          <p v-if="actionError" class="board-message" role="status">{{ actionError }}</p>
        </div>

        <aside class="game-actions">
          <div v-if="game.status === 'waiting'" class="action-block">
            <p class="section-kicker">Invite</p>
            <h2>Game is open</h2>
            <div class="invite-code">
              <code>{{ game.invite_code }}</code>
              <button type="button" class="icon-button icon-button--muted" title="Copy link" aria-label="Copy game link" @click="shareRoom">
                <Copy :size="18" />
              </button>
            </div>
            <button type="button" class="button button--secondary" @click="shareRoom">
              <Share2 :size="18" /> Share game
            </button>
            <button v-if="isHost" type="button" class="button button--danger-quiet" @click="cancelRoom">
              <X :size="18" /> Cancel game
            </button>
          </div>

          <div v-else-if="isTerminal" class="action-block">
            <p class="section-kicker">Round {{ game.round }}</p>
            <h2>{{ statusLabel }}</h2>
            <button type="button" class="button button--primary" :disabled="pending" @click="toggleRematch">
              <RefreshCw :size="18" />
              {{ myRematchReady ? 'Cancel rematch' : 'Ready for rematch' }}
            </button>
            <span
              v-if="game.host_rematch || game.guest_rematch"
              :class="['rematch-state', { 'rematch-state--incoming': opponentRematchReady && !myRematchReady }]"
              role="status"
            >
              <i v-if="opponentRematchReady && !myRematchReady" class="presence-dot presence-dot--rematch presence-dot--pulse" />
              {{ rematchStateLabel }}
            </span>
          </div>

          <div v-else class="action-block action-block--compact">
            <div v-if="resignArmed" class="resign-confirm">
              <span>Resign this round?</span>
              <button type="button" class="icon-button icon-button--muted" title="Keep playing" aria-label="Keep playing" @click="resignArmed = false">
                <X :size="18" />
              </button>
              <button type="button" class="icon-button icon-button--danger" title="Confirm resign" aria-label="Confirm resign" @click="resign">
                <Check :size="18" />
              </button>
            </div>
            <button v-else type="button" class="button button--danger-quiet" @click="resign">
              <Flag :size="17" /> Resign
            </button>
          </div>
        </aside>
      </section>
    </main>
  </div>
</template>
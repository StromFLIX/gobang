<script setup lang="ts">
import { RefreshCw, Trophy, Users } from '@lucide/vue'
import { computed, ref } from 'vue'

import AvatarImage from '@/components/AvatarImage.vue'
import { shortPlayerId } from '@/logic/games'
import type {
  HeadToHeadEntry,
  Leaderboard,
  LeaderboardEntry,
  LeaderboardResult,
  Performance,
  PeriodPerformance,
} from '@/types/game'

const props = defineProps<{
  leaderboard: Leaderboard | null
  playerId: string
  loading: boolean
  error: string
}>()

defineEmits<{ retry: [] }>()

type Period = keyof PeriodPerformance
type View = 'overall' | 'friends'

const period = ref<Period>('last_7_days')
const view = ref<View>('overall')

const overallRows = computed(() =>
  [...(props.leaderboard?.overall ?? [])].sort(
    (left, right) =>
      right.elo_rating - left.elo_rating ||
      comparePerformance(
        left.performance[period.value],
        right.performance[period.value],
        names(left, right),
      ),
  ),
)

const friendRows = computed(() =>
  [...(props.leaderboard?.opponents ?? [])].sort((left, right) =>
    comparePerformance(left.performance[period.value], right.performance[period.value], opponentNames(left, right)),
  ),
)

const personalPerformance = computed(
  () => props.leaderboard?.player.performance[period.value] ?? emptyPerformance(),
)

const personalRank = computed(() => {
  if (!props.leaderboard?.player.performance.all_time.games_played) return null
  const index = overallRows.value.findIndex((entry) => entry.player.id === props.playerId)
  return index < 0 ? null : index + 1
})

const visibleResults = computed(() => {
  const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000
  return (props.leaderboard?.results ?? [])
    .filter((result) => period.value === 'all_time' || Date.parse(result.completed_at) >= threshold)
    .filter(
      (result) =>
        view.value === 'overall' ||
        result.host.id === props.playerId ||
        result.guest.id === props.playerId,
    )
    .slice(0, 12)
})

function emptyPerformance(): Performance {
  return { wins: 0, losses: 0, draws: 0, games_played: 0, win_rate: 0 }
}

function comparePerformance(left: Performance, right: Performance, nameOrder: number) {
  return (
    right.wins - left.wins ||
    right.win_rate - left.win_rate ||
    right.games_played - left.games_played ||
    nameOrder
  )
}

function names(left: LeaderboardEntry, right: LeaderboardEntry) {
  return left.player.display_name.localeCompare(right.player.display_name)
}

function opponentNames(left: HeadToHeadEntry, right: HeadToHeadEntry) {
  return left.opponent.display_name.localeCompare(right.opponent.display_name)
}

function selected(entry: LeaderboardEntry | HeadToHeadEntry) {
  return entry.performance[period.value]
}

function record(performance: Performance) {
  return `${performance.wins}–${performance.losses}–${performance.draws}`
}

function resultText(result: LeaderboardResult) {
  if (!result.winner) {
    return `${result.host.display_name} drew ${result.guest.display_name}`
  }
  const loser = result.winner.id === result.host.id ? result.guest : result.host
  return `${result.winner.display_name} beat ${loser.display_name}`
}

function resultDate(result: LeaderboardResult) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(result.completed_at),
  )
}
</script>

<template>
  <section class="leaderboard-panel" aria-labelledby="leaderboard-title">
    <div class="leaderboard-header">
      <div>
        <p class="section-kicker">Records</p>
        <h2 id="leaderboard-title">Leaderboard</h2>
      </div>
      <div class="period-control" aria-label="Leaderboard period">
        <button
          type="button"
          :class="{ active: period === 'last_7_days' }"
          @click="period = 'last_7_days'"
        >
          Last 7 days
        </button>
        <button type="button" :class="{ active: period === 'all_time' }" @click="period = 'all_time'">
          All time
        </button>
      </div>
    </div>

    <div class="leaderboard-tabs" role="tablist" aria-label="Leaderboard view">
      <button
        type="button"
        role="tab"
        :aria-selected="view === 'overall'"
        :class="{ active: view === 'overall' }"
        @click="view = 'overall'"
      >
        <Trophy :size="17" />
        Overall
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="view === 'friends'"
        :class="{ active: view === 'friends' }"
        @click="view = 'friends'"
      >
        <Users :size="17" />
        Against friends
      </button>
    </div>

    <div v-if="loading" class="leaderboard-state" aria-live="polite">Loading standings…</div>
    <div v-else-if="error" class="leaderboard-state leaderboard-state--error">
      <span>{{ error }}</span>
      <button type="button" class="icon-button icon-button--muted" title="Retry" aria-label="Retry" @click="$emit('retry')">
        <RefreshCw :size="17" />
      </button>
    </div>
    <template v-else-if="leaderboard">
      <div class="personal-summary">
        <div>
          <span>Your record</span>
          <strong>{{ record(personalPerformance) }}</strong>
          <small>W–L–D</small>
        </div>
        <div>
          <span>Win rate</span>
          <strong>{{ personalPerformance.win_rate }}%</strong>
          <small>{{ personalPerformance.games_played }} rounds</small>
        </div>
        <div>
          <span>Elo rating</span>
          <strong>{{ leaderboard.player.elo_rating }}</strong>
          <small>Current</small>
        </div>
        <div>
          <span>Overall rank</span>
          <strong>{{ personalRank ? `#${personalRank}` : '—' }}</strong>
          <small>Elo standings</small>
        </div>
      </div>

      <div v-if="view === 'overall'" class="standings" role="table" aria-label="Overall standings">
        <div class="standings__header" role="row">
          <span>Rank</span><span>Player</span><span>Elo</span><span>W–L–D</span><span>Win rate</span>
        </div>
        <div
          v-for="(entry, index) in overallRows"
          :key="entry.player.id"
          class="standing-row"
          :class="{ 'standing-row--current': entry.player.id === playerId }"
          role="row"
        >
          <strong class="standing-rank">{{ selected(entry).games_played ? index + 1 : '—' }}</strong>
          <div class="standing-player">
            <AvatarImage :seed="entry.player.avatar_seed" size="small" />
            <div class="standing-player__identity">
              <strong>{{ entry.player.display_name }}</strong>
              <small>{{ shortPlayerId(entry.player.id) }}</small>
            </div>
            <span v-if="entry.player.id === playerId">You</span>
          </div>
          <strong class="standing-elo">{{ entry.elo_rating }}</strong>
          <strong class="standing-record">{{ record(selected(entry)) }}</strong>
          <span class="standing-rate">{{ selected(entry).win_rate }}%</span>
        </div>
      </div>

      <div v-else-if="friendRows.length" class="matchup-list">
        <div v-for="entry in friendRows" :key="entry.opponent.id" class="matchup-row">
          <div class="standing-player">
            <AvatarImage :seed="entry.opponent.avatar_seed" size="small" />
            <div class="standing-player__identity">
              <strong>{{ entry.opponent.display_name }}</strong>
              <small>{{ shortPlayerId(entry.opponent.id) }}</small>
            </div>
          </div>
          <div class="matchup-record">
            <strong>{{ record(selected(entry)) }}</strong>
            <span>W–L–D</span>
          </div>
          <div class="matchup-rate">
            <strong>{{ selected(entry).win_rate }}%</strong>
            <span>{{ selected(entry).games_played }} rounds</span>
          </div>
        </div>
      </div>
      <p v-else class="leaderboard-state">No finished rounds against friends in this period.</p>

      <div class="result-history">
        <div class="result-history__heading">
          <strong>Result history</strong>
          <span>{{ view === 'overall' ? 'Everyone' : 'Your matches' }}</span>
        </div>
        <div v-if="visibleResults.length" class="result-list">
          <div v-for="result in visibleResults" :key="`${result.completed_at}-${result.host.id}-${result.round}`" class="result-row">
            <div class="result-avatars">
              <AvatarImage :seed="result.host.avatar_seed" size="small" />
              <AvatarImage :seed="result.guest.avatar_seed" size="small" />
            </div>
            <strong>{{ resultText(result) }}</strong>
            <span>{{ resultDate(result) }} · Round {{ result.round }}</span>
          </div>
        </div>
        <p v-else class="leaderboard-state">No recorded results in this period.</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.leaderboard-panel {
  grid-column: 1 / -1;
  min-width: 0;
  margin-top: 1.2rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-surface);
}

.leaderboard-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem;
}

.leaderboard-header h2 {
  margin-top: 0.15rem;
  font-size: 1.25rem;
}

.period-control,
.leaderboard-tabs {
  display: flex;
  padding: 0.2rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-muted);
}

.period-control button,
.leaderboard-tabs button {
  min-height: 2.25rem;
  padding: 0.45rem 0.75rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  font-size: 0.76rem;
  font-weight: 800;
  cursor: pointer;
}

.period-control button.active,
.leaderboard-tabs button.active {
  background: #fff;
  box-shadow: 0 1px 4px rgba(23, 34, 28, 0.12);
}

.leaderboard-tabs {
  display: grid;
  grid-template-columns: repeat(2, max-content);
  width: fit-content;
  margin: 0 1.25rem 1.25rem;
}

.leaderboard-tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
}

.personal-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  background: #f6f8f6;
}

.personal-summary > div {
  display: grid;
  gap: 0.1rem;
  padding: 1rem 1.25rem;
  border-right: 1px solid var(--color-border);
}

.personal-summary > div:last-child {
  border-right: 0;
}

.personal-summary span,
.personal-summary small,
.matchup-record span,
.matchup-rate span,
.result-row span,
.result-history__heading span {
  color: var(--color-text-muted);
  font-size: 0.7rem;
}

.personal-summary > div > strong {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.65rem;
  line-height: 1.1;
}

.standings {
  padding: 0.5rem 1.25rem 1.25rem;
}

.standings__header,
.standing-row {
  display: grid;
  grid-template-columns: 3rem minmax(0, 1fr) 4.5rem 6rem 5rem;
  gap: 0.75rem;
  align-items: center;
}

.standings__header {
  min-height: 2.3rem;
  color: var(--color-text-muted);
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
}

.standing-row {
  min-height: 3.25rem;
  border-top: 1px solid var(--color-border);
}

.standing-row--current {
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
  background: #e9f0eb;
}

.standing-rank,
.standing-rate {
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.standing-elo {
  color: var(--color-green-dark);
  font-variant-numeric: tabular-nums;
}

.standing-player {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.65rem;
}

.standing-player strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.standing-player__identity {
  display: grid;
  min-width: 0;
  line-height: 1.15;
}

.standing-player__identity small {
  color: var(--color-text-muted);
  font-size: 0.61rem;
  font-weight: 700;
}

.standing-player > span {
  padding: 0.15rem 0.35rem;
  border-radius: 999px;
  color: var(--color-green-dark);
  background: #d8e6dc;
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
}

.standing-record {
  font-variant-numeric: tabular-nums;
}

.matchup-list {
  padding: 0.5rem 1.25rem 1.25rem;
}

.matchup-row {
  display: grid;
  min-height: 3.8rem;
  grid-template-columns: minmax(0, 1fr) 6rem 6rem;
  gap: 1rem;
  align-items: center;
  border-bottom: 1px solid var(--color-border);
}

.matchup-row:last-child {
  border-bottom: 0;
}

.matchup-record,
.matchup-rate {
  display: grid;
}

.result-history {
  border-top: 1px solid var(--color-border);
  padding: 1.25rem;
  background: #fbfcfb;
}

.result-history__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}

.result-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 1.5rem;
}

.result-row {
  display: grid;
  min-width: 0;
  min-height: 3.4rem;
  grid-template-columns: 2.8rem minmax(0, 1fr);
  align-content: center;
  column-gap: 0.7rem;
  border-top: 1px solid var(--color-border);
}

.result-row > strong,
.result-row > span {
  grid-column: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-avatars {
  display: flex;
  grid-row: 1 / 3;
  align-items: center;
}

.result-avatars :deep(.avatar + .avatar) {
  margin-left: -0.7rem;
}

.leaderboard-state {
  display: flex;
  min-height: 6rem;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1rem;
  color: var(--color-text-muted);
  text-align: center;
}

.leaderboard-state--error {
  color: var(--color-red);
}

@media (max-width: 760px) {
  .leaderboard-panel {
    grid-column: 1;
  }

  .result-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 540px) {
  .leaderboard-header {
    align-items: stretch;
    flex-direction: column;
  }

  .period-control {
    width: 100%;
  }

  .period-control button {
    flex: 1;
  }

  .leaderboard-tabs {
    width: calc(100% - 2.5rem);
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .leaderboard-tabs button {
    min-width: 0;
  }

  .personal-summary > div {
    padding: 0.8rem;
  }

  .personal-summary {
    grid-template-columns: repeat(2, 1fr);
  }

  .personal-summary > div:nth-child(2) {
    border-right: 0;
  }

  .personal-summary > div:nth-child(n + 3) {
    border-top: 1px solid var(--color-border);
  }

  .personal-summary > div > strong {
    font-size: 1.25rem;
  }

  .standings__header,
  .standing-row {
    grid-template-columns: 2rem minmax(0, 1fr) 3.25rem 4.5rem;
  }

  .standings__header span:last-child,
  .standing-rate {
    display: none;
  }

  .matchup-row {
    grid-template-columns: minmax(0, 1fr) 4.5rem;
  }

  .matchup-rate {
    display: none;
  }
}
</style>
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import LeaderboardPanel from '@/components/LeaderboardPanel.vue'
import type { Leaderboard, Performance, Player } from '@/types/game'

const me: Player = {
  id: 'me',
  display_name: 'Flo',
  avatar_seed: 'flo',
  is_guest: false,
}

const alex: Player = {
  id: 'alex',
  display_name: 'Alex',
  avatar_seed: 'alex',
  is_guest: false,
}

const sam: Player = {
  id: 'sam',
  display_name: 'Sam',
  avatar_seed: 'sam',
  is_guest: true,
}

function performance(wins: number, losses: number, draws = 0): Performance {
  const gamesPlayed = wins + losses + draws
  return {
    wins,
    losses,
    draws,
    games_played: gamesPlayed,
    win_rate: gamesPlayed ? Math.round((wins / gamesPlayed) * 1000) / 10 : 0,
  }
}

function leaderboard(): Leaderboard {
  const recent = new Date().toISOString()
  const older = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
  const myPerformance = {
    last_7_days: performance(1, 0),
    all_time: performance(2, 1),
  }
  return {
    player: { player: me, performance: myPerformance, elo_rating: 1198 },
    overall: [
      { player: me, performance: myPerformance, elo_rating: 1198 },
      {
        player: alex,
        performance: { last_7_days: performance(0, 2), all_time: performance(1, 2) },
        elo_rating: 1305,
      },
      {
        player: sam,
        performance: { last_7_days: performance(1, 0), all_time: performance(1, 0) },
        elo_rating: 1208,
      },
    ],
    opponents: [
      {
        opponent: alex,
        performance: { last_7_days: performance(1, 0), all_time: performance(2, 1) },
      },
    ],
    results: [
      { round: 3, completed_at: recent, status: 'won', host: me, guest: alex, winner: me },
      { round: 2, completed_at: recent, status: 'won', host: sam, guest: alex, winner: sam },
      { round: 1, completed_at: older, status: 'won', host: me, guest: alex, winner: alex },
    ],
  }
}

describe('LeaderboardPanel', () => {
  it('reveals full controls when loaded results leave compact mode', async () => {
    const wrapper = mount(LeaderboardPanel, {
      props: {
        leaderboard: null,
        playerId: me.id,
        loading: true,
        error: '',
        compact: true,
      },
    })

    await wrapper.setProps({
      leaderboard: leaderboard(),
      loading: false,
      compact: false,
    })

    expect(wrapper.get('.leaderboard-tabs').isVisible()).toBe(true)
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('Overall')
  })

  it('collapses zero-value records until a new player explores the leaderboard', async () => {
    const data = leaderboard()
    const noRounds = {
      last_7_days: performance(0, 0),
      all_time: performance(0, 0),
    }
    data.player = { player: me, performance: noRounds, elo_rating: 1200 }
    const wrapper = mount(LeaderboardPanel, {
      props: {
        leaderboard: data,
        playerId: me.id,
        loading: false,
        error: '',
        compact: true,
      },
    })

    expect(wrapper.find('.personal-summary').exists()).toBe(false)
    expect(wrapper.text()).toContain('Standings, challenges, and results')

    await wrapper.get('button[aria-expanded="false"]').trigger('click')

    expect(wrapper.text()).toContain('Your record starts with your first finished round')
    expect(wrapper.findAll('.standing-row')).toHaveLength(3)
  })

  it('switches time periods and limits friend results to the current player', async () => {
    const wrapper = mount(LeaderboardPanel, {
      props: {
        leaderboard: leaderboard(),
        playerId: me.id,
        loading: false,
        error: '',
      },
    })

    expect(wrapper.text()).toContain('1–0–0')
    expect(wrapper.text()).toContain('1198')
    expect(wrapper.text()).toContain('Sam beat Alex')
    expect(wrapper.text()).not.toContain('Alex beat Flo')
    expect(wrapper.findAll('.standing-row')[0].text()).toContain('Alex')

    await wrapper.get('.period-control button:last-child').trigger('click')
    expect(wrapper.text()).toContain('2–1–0')
    expect(wrapper.text()).toContain('Alex beat Flo')
    expect(wrapper.findAll('.standing-row')[0].text()).toContain('Alex')

    await wrapper.get('.leaderboard-tabs button:last-child').trigger('click')
    expect(wrapper.text()).toContain('Alex')
    expect(wrapper.text()).not.toContain('Sam beat Alex')
  })

  it('only challenges registered opponents and shows pending invitations', async () => {
    const wrapper = mount(LeaderboardPanel, {
      props: {
        leaderboard: leaderboard(),
        playerId: me.id,
        loading: false,
        error: '',
        canChallenge: true,
        pendingPlayerIds: [],
      },
    })

    const challengeButton = wrapper.get('button[aria-label="Challenge Alex"]')
    expect(wrapper.find('button[aria-label="Challenge Sam"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Challenge Flo"]').exists()).toBe(false)

    await challengeButton.trigger('click')
    expect(wrapper.emitted('challenge')).toEqual([[alex.id]])

    await wrapper.setProps({ pendingPlayerIds: [alex.id] })
    expect(wrapper.find('button[aria-label="Challenge Alex"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Sent')
  })

  it('opens the top ten on page one and pages through absolute ranks', async () => {
    const data = leaderboard()
    data.overall = Array.from({ length: 25 }, (_, index) => ({
      player:
        index === 17
          ? me
          : {
              id: `player-${index + 1}`,
              display_name: `Player ${index + 1}`,
              avatar_seed: `player-${index + 1}`,
              is_guest: false,
            },
      performance: {
        last_7_days: performance(1, 0),
        all_time: performance(1, 0),
      },
      elo_rating: 1400 - index,
    }))
    data.player = data.overall[17]
    const wrapper = mount(LeaderboardPanel, {
      props: {
        leaderboard: data,
        playerId: me.id,
        loading: false,
        error: '',
        canChallenge: true,
      },
    })

    await wrapper.findAll('.ranking-scope button')[1].trigger('click')
    expect(wrapper.findAll('.standing-row')).toHaveLength(10)
    expect(wrapper.findAll('.standing-rank')[0].text()).toBe('1')
    expect(wrapper.findAll('.standing-rank')[9].text()).toBe('10')
    expect(wrapper.text()).toContain('Page 1 of 3')

    await wrapper.get('button[aria-label="Next leaderboard page"]').trigger('click')
    expect(wrapper.findAll('.standing-row')).toHaveLength(10)
    expect(wrapper.findAll('.standing-rank')[0].text()).toBe('11')
    expect(wrapper.findAll('.standing-rank')[9].text()).toBe('20')
    expect(wrapper.text()).toContain('Page 2 of 3')

    await wrapper.findAll('.ranking-scope button')[2].trigger('click')
    expect(wrapper.text()).toContain('Page 2 of 3')
    expect(wrapper.find('.standing-row--current').exists()).toBe(true)

    await wrapper.get('input[aria-label="Find a player"]').setValue('Player 25')
    expect(wrapper.findAll('.standing-row')).toHaveLength(1)
    expect(wrapper.find('.standing-player').text()).toContain('Player 25')
  })
})

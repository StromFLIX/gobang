<script setup lang="ts">
import type { ReactionKind } from '@/types/game'

withDefaults(defineProps<{ kind: ReactionKind; animated?: boolean }>(), { animated: true })
</script>

<template>
  <svg
    :class="[
      'comic-reaction',
      `comic-reaction--${kind.replace('_', '-')}`,
      { 'comic-reaction--still': !animated },
    ]"
    :data-reaction-art="kind"
    viewBox="0 0 72 72"
    aria-hidden="true"
  >
    <g v-if="kind === 'wow'" class="reaction-art reaction-wow">
      <path class="reaction-line reaction-wow__ray" d="M8 18 2 12m61 8 7-5M9 55l-7 4m62-7 6 5" />
      <text class="reaction-wow__shadow" x="37" y="48" text-anchor="middle">WOW!</text>
      <text class="reaction-wow__text" x="34" y="44" text-anchor="middle">WOW!</text>
    </g>

    <g v-else-if="kind === 'plus_one'" class="reaction-art reaction-plus-one">
      <path
        class="reaction-ink reaction-plus-one__hand"
        d="M24 61V34c7-4 11-11 13-22 1-5 8-5 10-1 2 4 0 12-2 18h11c7 0 11 6 9 12l-5 14c-1 5-6 8-11 8H31Z"
      />
      <path class="reaction-ink reaction-plus-one__cuff" d="M8 34h18v29H8Z" />
      <path class="reaction-line reaction-plus-one__crease" d="M45 29h-6m21 9H50" />
      <circle class="reaction-plus-one__badge" cx="56" cy="17" r="14" />
      <text class="reaction-plus-one__text" x="56" y="22" text-anchor="middle">+1</text>
    </g>

    <g v-else-if="kind === 'poop'" class="reaction-art reaction-poop">
      <path
        class="reaction-line reaction-poop__stink"
        d="M18 20c-6-5 4-7-1-13m38 13c6-5-4-7 1-13"
      />
      <path
        class="reaction-ink reaction-poop__body"
        d="M16 63C7 63 4 53 12 48c-5-6-1-14 7-15-3-7 2-13 10-12-1-6 3-11 9-15 0 7 7 10 8 16 9-1 14 6 10 13 9 2 11 11 5 16 6 6 1 12-7 12Z"
      />
      <ellipse class="reaction-poop__eye" cx="28" cy="40" rx="5" ry="6" />
      <ellipse class="reaction-poop__eye" cx="46" cy="40" rx="5" ry="6" />
      <circle class="reaction-poop__pupil" cx="29" cy="42" r="2" />
      <circle class="reaction-poop__pupil" cx="45" cy="42" r="2" />
      <path class="reaction-poop__mouth" d="M27 51c5 7 14 7 20 0Z" />
      <path class="reaction-poop__tongue" d="M34 56c3-2 6-2 8 0-2 3-6 4-8 0Z" />
    </g>

    <g v-else-if="kind === 'mind_blown'" class="reaction-art reaction-mind-blown">
      <path
        class="reaction-ink reaction-mind-blown__blast"
        d="m36 28-7-10-11 5 1-12L7 7l13-3 2-12 10 9 8-10 5 12 13-4-4 13 12 6-12 7 1 12-12-5Z"
      />
      <path
        class="reaction-mind-blown__blast-core"
        d="m35 27-4-8-7 3 2-8-8-3 9-2 2-8 6 7 7-7 2 9 9-2-5 8 6 6-9 1-2 8Z"
      />
      <path
        class="reaction-ink reaction-mind-blown__face"
        d="M15 35c0-10 9-17 21-17s21 7 21 17v14c0 12-9 20-21 20s-21-8-21-20Z"
      />
      <ellipse class="reaction-mind-blown__eye" cx="27" cy="43" rx="5" ry="7" />
      <ellipse class="reaction-mind-blown__eye" cx="45" cy="43" rx="5" ry="7" />
      <ellipse class="reaction-mind-blown__mouth" cx="36" cy="58" rx="7" ry="8" />
      <circle class="reaction-mind-blown__shine" cx="25" cy="40" r="2" />
      <circle class="reaction-mind-blown__shine" cx="43" cy="40" r="2" />
    </g>

    <g v-else-if="kind === 'facepalm'" class="reaction-art reaction-facepalm">
      <circle class="reaction-ink reaction-facepalm__face" cx="36" cy="38" r="27" />
      <path
        class="reaction-facepalm__hair"
        d="M11 31C11 15 22 8 36 8c15 0 25 8 26 23-7-1-12-6-15-12-9 7-21 11-36 12Z"
      />
      <circle class="reaction-facepalm__cheek" cx="51" cy="45" r="4" />
      <path class="reaction-line reaction-facepalm__eye" d="M47 36c3-2 7-2 10 0" />
      <path class="reaction-line reaction-facepalm__mouth" d="M31 54c6-4 13-4 19 0" />
      <path
        class="reaction-ink reaction-facepalm__hand"
        d="M5 38c-2-4 0-8 4-10l28-14c4-2 7 3 3 6l-11 6 17-6c5-2 8 4 4 7L27 41c-8 5-17 4-22-3Z"
      />
      <path
        class="reaction-line reaction-facepalm__fingers"
        d="m12 29 15-7m-11 12 17-8m-11 12 17-9"
      />
    </g>

    <g v-else-if="kind === 'heart'" class="reaction-art reaction-heart">
      <path class="reaction-line reaction-heart__beat" d="M2 38h14l4-9 7 20 6-12h9" />
      <path
        class="reaction-heart__shadow"
        d="M39 67C18 54 9 44 9 29 9 17 17 9 28 9c6 0 11 3 14 9 3-6 8-9 14-9 11 0 18 8 18 20 0 15-10 25-35 38Z"
      />
      <path
        class="reaction-ink reaction-heart__body"
        d="M36 63C15 50 6 40 6 25 6 13 14 5 25 5c6 0 11 3 14 9 3-6 8-9 14-9 11 0 18 8 18 20 0 15-10 25-35 38Z"
      />
      <path class="reaction-line reaction-heart__shine" d="M18 16c5-5 11-4 14 1" />
      <path
        class="reaction-line reaction-heart__motion"
        d="M5 13 0 8m67 6 5-5M2 57l-5 4m70-5 5 4"
      />
    </g>

    <g v-else class="reaction-art reaction-gg">
      <path
        class="reaction-ink reaction-gg__handle"
        d="M18 18H7v9c0 9 7 15 15 15m32-24h11v9c0 9-7 15-15 15"
      />
      <path class="reaction-ink reaction-gg__cup" d="M17 10h38v17c0 13-8 22-19 22s-19-9-19-22Z" />
      <path class="reaction-ink reaction-gg__stem" d="M32 48h8v10H32Zm-12 10h32v9H20Z" />
      <path class="reaction-gg__shine" d="M23 16h7v5h-7Z" />
      <text class="reaction-gg__text" x="36" y="36" text-anchor="middle">GG!</text>
    </g>
  </svg>
</template>

<style scoped>
.comic-reaction {
  display: block;
  overflow: visible;
  filter: drop-shadow(0 2px 0 rgba(23, 34, 28, 0.22));
}

.reaction-art {
  transform-box: fill-box;
  transform-origin: center;
}

.reaction-ink {
  stroke: #17221c;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
}

.reaction-line {
  fill: none;
  stroke: #17221c;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
}

.reaction-wow {
  transform: rotate(-6deg);
}

.reaction-wow__ray {
  stroke: #bf473a;
  stroke-width: 4;
}

.reaction-wow__shadow,
.reaction-wow__text,
.reaction-plus-one__text,
.reaction-gg__text {
  font-family: Bangers, Impact, sans-serif;
  letter-spacing: 0;
  paint-order: stroke fill;
  stroke-linejoin: round;
}

.reaction-wow__shadow {
  fill: #bf473a;
  font-size: 34px;
  stroke: #17221c;
  stroke-width: 7px;
}

.reaction-wow__text {
  fill: #ffd43b;
  font-size: 34px;
  stroke: #fff9df;
  stroke-width: 3px;
}

.reaction-plus-one__hand {
  fill: #f0ae72;
}

.reaction-plus-one__cuff {
  fill: #2ea8d1;
}

.reaction-plus-one__crease {
  stroke: #c27448;
  stroke-width: 2;
}

.reaction-plus-one__badge {
  fill: #ffd43b;
  stroke: #17221c;
  stroke-width: 3;
}

.reaction-plus-one__text {
  fill: #17221c;
  font-size: 18px;
  stroke: #fff9df;
  stroke-width: 2px;
}

.reaction-poop__stink {
  stroke: #67a65e;
}

.reaction-poop__body {
  fill: #9a5d38;
}

.reaction-poop__eye {
  fill: #fff;
  stroke: #1d2520;
  stroke-width: 2;
}

.reaction-poop__pupil,
.reaction-poop__mouth {
  fill: #17221c;
}

.reaction-poop__tongue {
  fill: #ef7182;
}

.reaction-mind-blown__blast {
  fill: #ff5a3d;
}

.reaction-mind-blown__blast-core {
  fill: #ffd43b;
}

.reaction-mind-blown__face {
  fill: #f2b36f;
}

.reaction-mind-blown__eye {
  fill: #fff;
  stroke: #17221c;
  stroke-width: 2;
}

.reaction-mind-blown__mouth {
  fill: #17221c;
}

.reaction-mind-blown__shine {
  fill: #fff;
}

.reaction-facepalm__face {
  fill: #f2b36f;
}

.reaction-facepalm__hair {
  fill: #68412f;
}

.reaction-facepalm__cheek {
  fill: #df7968;
}

.reaction-facepalm__hand {
  fill: #ffd0a3;
}

.reaction-facepalm__eye,
.reaction-facepalm__mouth {
  stroke-width: 2.5;
}

.reaction-facepalm__fingers {
  stroke: #bd7652;
  stroke-width: 2;
}

.reaction-heart {
  animation: heart-beat 1.8s ease-in-out infinite;
}

.comic-reaction--still .reaction-heart {
  animation: none;
}

.reaction-heart__beat {
  stroke: #e83d55;
  stroke-width: 4;
}

.reaction-heart__shadow {
  fill: #17221c;
}

.reaction-heart__body {
  fill: #e83d55;
}

.reaction-heart__shine {
  stroke: #fff4f4;
  stroke-width: 4;
}

.reaction-heart__motion {
  stroke: #bf473a;
}

.reaction-gg__handle,
.reaction-gg__cup,
.reaction-gg__stem {
  fill: #f3bd3f;
}

.reaction-gg__shine {
  fill: #fff3ad;
}

.reaction-gg__text {
  fill: #174b33;
  font-size: 19px;
  stroke: #fff9df;
  stroke-width: 2px;
}

@keyframes heart-beat {
  0%,
  38%,
  100% {
    transform: scale(1);
  }
  10% {
    transform: scale(1.12);
  }
  20% {
    transform: scale(0.98);
  }
  28% {
    transform: scale(1.07);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reaction-heart {
    animation: none;
  }
}
</style>

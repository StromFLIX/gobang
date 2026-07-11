<template>
  <svg class="comic-brand" viewBox="0 0 142 50" aria-hidden="true">
    <path
      class="comic-brand__shadow"
      d="m88 2 8 9 14-6 3 11 16-3-3 13 14 7-14 6 3 9-17-5-6 7-12-7-11 5-4-8-16 4-1-9-17-1 9-10-12-8 16-3-1-10 16 5 6-10 8 10Z"
    />
    <path
      class="comic-brand__burst"
      d="m88 0 8 9 14-6 3 11 16-3-3 13 14 7-14 6 3 9-17-5-6 7-12-7-11 5-4-8-16 4-1-9-17-1 9-10-12-8 16-3-1-10 16 5 6-10 8 10Z"
    />
    <path class="comic-brand__flash" d="m49 13 8-8m73 39 8-5M44 42l8-4" />
    <text class="comic-brand__go" x="2" y="35">GO</text>
    <text class="comic-brand__bang" x="58" y="34">BANG!</text>
  </svg>
</template>

<style scoped>
.comic-brand {
  display: block;
  width: 8rem;
  height: 2.7rem;
  flex: 0 0 auto;
  overflow: visible;
}

.comic-brand__shadow {
  fill: #17221c;
  transform: translate(1.5px, 2px);
}

.comic-brand__burst {
  fill: #ffd43b;
  stroke: #17221c;
  stroke-linejoin: round;
  stroke-width: 2.5px;
}

.comic-brand__flash {
  fill: none;
  stroke: #bf473a;
  stroke-linecap: round;
  stroke-width: 3px;
}

.comic-brand__go,
.comic-brand__bang {
  font-family: Bangers, Impact, sans-serif;
  letter-spacing: 0;
  paint-order: stroke fill;
  stroke-linejoin: round;
}

.comic-brand__go {
  fill: #174b33;
  font-size: 31px;
  stroke: #fff;
  stroke-width: 2.5px;
}

.comic-brand__bang {
  fill: #bf473a;
  font-size: 25px;
  stroke: #fff8dc;
  stroke-width: 3px;
}

@media (max-width: 380px) {
  .comic-brand {
    width: 7.3rem;
  }
}
</style>

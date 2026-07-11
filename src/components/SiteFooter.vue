<template>
  <footer class="site-footer">
    <span>Gobang</span>
    <nav aria-label="Footer navigation">
      <RouterLink to="/">Home</RouterLink>
      <RouterLink to="/account">Account</RouterLink>
      <RouterLink to="/privacy">Privacy</RouterLink>
      <RouterLink to="/impressum">Impressum</RouterLink>
      <RouterLink to="/account-deletion">Delete account</RouterLink>
    </nav>
  </footer>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<style scoped>
.site-footer {
  display: flex;
  width: min(100% - 2rem, 72rem);
  min-height: 4.5rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 0 auto;
  padding: 1rem 0 max(1rem, env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.site-footer > span {
  font-weight: 800;
}

.site-footer nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem 1rem;
}

.site-footer a {
  color: var(--color-text-muted);
  font-weight: 700;
}

.site-footer a:hover,
.site-footer a:focus-visible,
.site-footer a.router-link-exact-active {
  color: var(--color-green-dark);
  text-decoration: underline;
}

@media (max-width: 520px) {
  .site-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .site-footer nav {
    justify-content: flex-start;
  }
}
</style>

<script setup lang="ts">
import { ArrowLeft, Grid3X3 } from '@lucide/vue'
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="legal-shell">
    <header class="legal-header">
      <RouterLink to="/" class="brand-mark" aria-label="Gobang home">
        <Grid3X3 :size="23" />
        <strong>Gobang</strong>
      </RouterLink>
      <RouterLink to="/" class="button button--quiet">
        <ArrowLeft :size="17" />
        Back
      </RouterLink>
    </header>

    <main class="legal-document">
      <p class="section-kicker">Effective July 11, 2026</p>
      <h1>Privacy policy</h1>
      <p class="legal-lead">
        Gobang is a realtime board game operated at gobang.stromflix.com. This policy describes the
        information used by the website, Android app, FastAPI service, PocketBase database, and
        push-notification delivery.
      </p>

      <section>
        <h2>Information we process</h2>
        <ul>
          <li>Account email address and password credential managed by PocketBase.</li>
          <li>Your display name, avatar configuration, account identifier, and session token.</li>
          <li>Games, moves, scores, ratings, invitations, matchmaking state, and reactions.</li>
          <li>
            Android notification installation tokens and notification events needed to deliver move,
            challenge, and rematch alerts.
          </li>
          <li>
            Short-lived presence information used for approximate online and active-game counts.
          </li>
          <li>
            Basic network and server logs needed to operate, secure, and diagnose the service.
          </li>
        </ul>
      </section>

      <section>
        <h2>How information is used</h2>
        <p>
          Information is used only to authenticate accounts, run games and rankings, synchronize
          realtime state, deliver requested notifications, prevent abuse, and maintain the service.
          Gobang does not include advertising, behavioral analytics, payments, or data brokerage.
        </p>
      </section>

      <section>
        <h2>Service providers</h2>
        <p>
          Game and account data is stored by the Gobang deployment. Firebase Cloud Messaging is used
          only to deliver Android notifications. Firebase receives an installation token and the
          notification payload, which may contain the other player's display name, the event type,
          and an in-app game path. Google processes this information under its Firebase terms. No
          Firebase Analytics SDK is included.
        </p>
      </section>

      <section>
        <h2>Retention and deletion</h2>
        <p>
          Account and game information is retained while the account exists. Approximate presence
          entries expire shortly after activity stops. You can permanently delete your account from
          the player settings in the app or through the public deletion page. Deletion erases the
          profile, authentication record, notification devices, invitations, queue entries, and
          every shared game involving the account, including embedded move and score history.
        </p>
        <RouterLink to="/account-deletion" class="button button--danger-quiet">
          Delete a Gobang account
        </RouterLink>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Production traffic uses HTTPS. Android cleartext traffic and device backup are disabled.
          Passwords are handled by PocketBase and are not returned by the Gobang API. No method of
          storage or transmission can be guaranteed completely secure.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          Gobang is not directed to children under 13. Do not create an account if local law does
          not permit you to provide the required account information.
        </p>
      </section>

      <section>
        <h2>Contact and changes</h2>
        <p>
          Privacy questions can be sent to
          <a href="mailto:privacy@stromflix.com">privacy@stromflix.com</a>. Material policy changes
          will be reflected on this page with a new effective date.
        </p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.legal-shell {
  min-height: 100dvh;
  background: var(--color-background);
}

.legal-header {
  position: sticky;
  z-index: 10;
  top: 0;
  display: flex;
  min-height: var(--header-height);
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem max(1rem, env(safe-area-inset-right)) 0.6rem max(1rem, env(safe-area-inset-left));
  border-bottom: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.96);
}

.legal-document {
  width: min(100% - 2rem, 46rem);
  margin: 0 auto;
  padding: clamp(2rem, 6vw, 4rem) 0 4rem;
}

.legal-document h1 {
  margin: 0.35rem 0 0.8rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(2.2rem, 7vw, 3.4rem);
  line-height: 1;
}

.legal-lead {
  color: var(--color-text-muted);
  font-size: 1rem;
  line-height: 1.65;
}

.legal-document section {
  padding-top: 2rem;
}

.legal-document h2 {
  margin-bottom: 0.55rem;
  font-size: 1.15rem;
}

.legal-document p,
.legal-document li {
  color: var(--color-text-muted);
  line-height: 1.65;
}

.legal-document ul {
  display: grid;
  gap: 0.45rem;
  padding-left: 1.2rem;
}

.legal-document a:not(.button) {
  color: var(--color-green-dark);
  font-weight: 700;
  text-decoration: underline;
}

.legal-document .button {
  margin-top: 1rem;
}
</style>

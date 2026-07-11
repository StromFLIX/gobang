<script setup lang="ts">
import { ArrowLeft, Grid3X3 } from '@lucide/vue'
import { RouterLink } from 'vue-router'

import LegalPostalAddress from '@/components/LegalPostalAddress.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { hasCompleteLegalOperator, legalOperator, missingLegalOperatorFields } from '@/logic/legal'
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
      <p class="section-kicker">Provider information</p>
      <h1>Impressum</h1>
      <p class="legal-lead">
        Provider and controller information for Gobang, a free hobby project operated from
        Switzerland.
      </p>

      <div v-if="!hasCompleteLegalOperator" class="configuration-warning" role="alert">
        <strong>Legal notice configuration required.</strong>
        The deployment owner must provide the missing {{ missingLegalOperatorFields.join(', ') }}
        before publishing this service.
      </div>

      <section>
        <h2>Responsible operator</h2>
        <address>
          <strong v-if="legalOperator.name">{{ legalOperator.name }}</strong>
          <LegalPostalAddress :country="legalOperator.country" />
        </address>
      </section>

      <section>
        <h2>Contact</h2>
        <p v-if="legalOperator.email">
          Email: <a :href="`mailto:${legalOperator.email}`">{{ legalOperator.email }}</a>
        </p>
      </section>

      <section v-if="legalOperator.registerEntry || legalOperator.vatId">
        <h2>Registration details</h2>
        <p v-if="legalOperator.registerEntry">{{ legalOperator.registerEntry }}</p>
        <p v-if="legalOperator.vatId">VAT identification number: {{ legalOperator.vatId }}</p>
      </section>

      <section>
        <h2>Current service status</h2>
        <p>
          Gobang is currently operated as a free personal hobby project without advertising,
          payments, sponsorship, or data sales. No VAT identification number applies. The legal
          information will be reviewed before any paid operation is introduced.
        </p>
      </section>
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.legal-shell {
  display: flex;
  min-height: 100dvh;
  flex-direction: column;
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
  flex: 1;
  margin: 0 auto;
  padding: clamp(2rem, 6vw, 4rem) 0 4rem;
}

.legal-document h1 {
  margin: 0.35rem 0 0.8rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(2.2rem, 7vw, 3.4rem);
  line-height: 1;
}

.legal-lead,
.legal-document p {
  color: var(--color-text-muted);
  line-height: 1.65;
}

.legal-document section {
  padding-top: 2rem;
}

.legal-document h2 {
  margin-bottom: 0.55rem;
  font-size: 1.15rem;
}

.legal-document address {
  display: grid;
  gap: 0.25rem;
  color: var(--color-text-muted);
  font-style: normal;
  line-height: 1.55;
}

.legal-document a {
  color: var(--color-green-dark);
  font-weight: 700;
  text-decoration: underline;
}

.configuration-warning {
  margin-top: 1.5rem;
  padding: 1rem;
  border: 1px solid var(--color-red);
  border-radius: 8px;
  color: var(--color-red);
  background: rgba(191, 71, 58, 0.08);
  line-height: 1.55;
}

.configuration-warning strong {
  display: block;
}
</style>

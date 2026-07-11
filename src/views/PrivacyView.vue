<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { RouterLink } from 'vue-router'

import ComicBrand from '@/components/ComicBrand.vue'
import LegalPostalAddress from '@/components/LegalPostalAddress.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import {
  hasCompletePrivacyConfiguration,
  legalOperator,
  missingPrivacyConfigurationFields,
} from '@/logic/legal'
</script>

<template>
  <div class="legal-shell">
    <header class="legal-header">
      <RouterLink to="/" class="brand-mark" aria-label="Gobang home">
        <ComicBrand />
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
        This notice explains how personal data is processed when you use the Gobang website, Android
        app, game service, and push notifications. It provides information under Article 19 of the
        Swiss Federal Act on Data Protection (FADP/DSG) and, where applicable, Article 13 of the
        General Data Protection Regulation (GDPR).
      </p>

      <div v-if="!hasCompletePrivacyConfiguration" class="configuration-warning" role="alert">
        <strong>Privacy configuration is incomplete.</strong>
        The deployment owner must provide the missing
        {{ missingPrivacyConfigurationFields.join(', ') }} before publishing this service.
      </div>

      <section>
        <h2>Controller</h2>
        <address>
          <strong v-if="legalOperator.name">{{ legalOperator.name }}</strong>
          <LegalPostalAddress :country="legalOperator.country" />
          <a v-if="legalOperator.email" :href="`mailto:${legalOperator.email}`">
            {{ legalOperator.email }}
          </a>
        </address>
        <p>
          The controller is the person or organization that operates Gobang. The same details are
          available in the <RouterLink to="/impressum">Impressum</RouterLink>.
        </p>
      </section>

      <section>
        <h2>Data, purposes, and legal grounds</h2>
        <p>
          Processing follows the Swiss FADP principles of transparency, proportionality, purpose
          limitation, and data minimization. Where the GDPR applies, the corresponding legal bases
          are stated below.
        </p>
        <ul>
          <li>
            <strong>Account and game operation:</strong> email address, password credential when you
            use email sign-in, Google account identifier and basic profile when you choose Google
            sign-in, display name, avatar, account and session identifiers, games, moves, scores,
            ratings, invitations, matchmaking state, and reactions. These are processed to create
            and authenticate your account and provide the requested multiplayer game. Where the
            GDPR applies, the basis is performance of the user agreement under Article 6(1)(b).
          </li>
          <li>
            <strong>Presence and realtime updates:</strong> recent activity and game connection
            state are processed to show approximate online counts and synchronize the requested
            games. Where the GDPR applies, the basis is Article 6(1)(b).
          </li>
          <li>
            <strong>Push notifications:</strong> with Android notification permission, the app sends
            an installation token to Gobang so Firebase Cloud Messaging can deliver move,
            invitation, and rematch alerts. This optional processing is based on your permission;
            where the GDPR applies, the basis is consent under Article 6(1)(a). Permission can be
            withdrawn in Android settings. The stored token is removed the next time the app opens
            without permission, when you sign out, or when you delete the account.
          </li>
          <li>
            <strong>Security and reliability:</strong> IP address, request time, requested path,
            response status, and technical error information may appear in limited server logs. This
            is processed to prevent abuse, diagnose failures, and keep the service secure. Where the
            GDPR applies, Article 6(1)(f) covers the legitimate interest in operating a secure and
            reliable game.
          </li>
          <li>
            <strong>Legal obligations:</strong> information may be preserved or disclosed where the
            controller is legally required to do so. Where the GDPR applies, the basis is Article
            6(1)(c).
          </li>
        </ul>
      </section>

      <section>
        <h2>Required and optional information</h2>
        <p>
          An email address, display name, avatar choice, and either a password or Google sign-in are
          required to create an Android account. Without them, the registered multiplayer service
          cannot be provided. Google sign-in is optional because email and password remain
          available. The website can create a temporary guest profile without an email address.
          Push notifications are optional; refusing permission does not prevent gameplay. Gobang
          does not use advertising, behavioral analytics, payments, or data brokerage. This notice
          will be updated before any planned payment feature is enabled.
        </p>
      </section>

      <section>
        <h2>Recipients and service providers</h2>
        <p>
          Account and game data is processed by
          <strong v-if="legalOperator.hostingProvider">{{ legalOperator.hostingProvider }}</strong>
          <span v-else>the configured infrastructure provider</span>
          on infrastructure in
          <strong v-if="legalOperator.hostingLocation">{{ legalOperator.hostingLocation }}</strong>
          <span v-else>the configured hosting location</span>. The controller rents the virtual
          servers and administers the application, database, and Coolify deployment. The hosting
          providers operate the underlying data-centre and network infrastructure and may process
          infrastructure and network data on the controller's instructions. Other players receive
          the display name, avatar, moves, reactions, and results needed for shared games and
          rankings.
        </p>
        <p>
          When you choose Google sign-in, Google receives the authentication request, redirect URI,
          IP address, and browser or device information needed for the sign-in flow. Google returns
          a provider identifier, email address, display name, and profile image URL to PocketBase.
          Gobang stores the provider link, email, and chosen Gobang profile; it does not store the
          Google profile image or receive the Google password. Google's use of this information is
          governed by its privacy policy.
        </p>
        <p>
          Google Firebase Cloud Messaging is used only for optional Android notifications. Google
          receives the installation token, IP and technical device information, and a notification
          payload containing an event type, an in-app path, and possibly another player's display
          name. Firebase Analytics is not included.
        </p>
      </section>

      <section>
        <h2>International transfers</h2>
        <p>
          The primary Gobang servers are in the countries stated in the recipients section. Firebase
          authentication and Firebase data may additionally be processed outside Switzerland and
          the European Economic Area, depending on Google's processing locations. For transfers
          from Switzerland, data is sent to countries recognized as providing adequate protection
          or under safeguards recognized by Article 16 FADP. Where the GDPR applies and no adequacy
          decision covers a destination, Google states that it uses safeguards such as the European
          Commission's standard contractual clauses. Details about Firebase are available in Google's
          <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noreferrer">
            Firebase privacy information</a
          >.
        </p>
      </section>

      <section>
        <h2>Retention and deletion</h2>
        <p>
          Account and game information is retained until the account is deleted. Matchmaking and
          presence records expire when they are no longer needed for the active queue or online
          count. Push tokens are removed on sign-out or account deletion and invalid tokens are
          removed after Firebase rejects them. Operational logs are rotated based on storage limits
          and retained only as long as needed to investigate reliability or security events. Data
          required for a legal claim or obligation may be retained until that purpose expires.
        </p>
        <p>
          Account deletion erases the profile, authentication record, notification devices,
          invitations, queue entries, and every shared game involving the account, including move
          and score history. Because games are shared, this also removes them from opponents'
          histories.
        </p>
        <RouterLink to="/account-deletion" class="button button--danger-quiet">
          Delete a Gobang account
        </RouterLink>
      </section>

      <section>
        <h2>Local storage and cookies</h2>
        <p>
          Gobang uses browser or app local storage for the session, profile recovery data, and an
          Android push token. For a web guest, profile recovery data includes a randomly generated
          guest login credential; it is removed when the guest is replaced or upgraded. Short-lived
          session storage holds interface state and failed-update recovery. These items are
          necessary to provide the requested service. Gobang does not set advertising or analytics
          cookies and does not use cross-site tracking.
        </p>
      </section>

      <section>
        <h2>Your data-protection rights</h2>
        <p>
          Subject to the applicable Swiss FADP and GDPR conditions, you may request access,
          correction, deletion, restriction of processing, and a portable copy of data you provided.
          Where the GDPR applies, you may object to processing based on legitimate interests. Where
          processing depends on permission or consent, you may withdraw it at any time without
          affecting earlier lawful processing. Requests can be sent to the controller's email
          address above; identity may need to be verified before a request is completed.
        </p>
        <p>
          In Switzerland, you may contact the
          <a href="https://www.edoeb.admin.ch/" target="_blank" rel="noreferrer">
            Federal Data Protection and Information Commissioner (FDPIC/EDÖB)</a
          >. Where the GDPR applies, you may also lodge a complaint with a data-protection authority
          in the EU or EEA country of your residence, workplace, or the alleged infringement. The
          <a
            href="https://www.edpb.europa.eu/about-edpb/about-edpb/members_en"
            target="_blank"
            rel="noreferrer"
          >
            European Data Protection Board lists the national authorities</a
          >.
        </p>
      </section>

      <section>
        <h2>Automated decisions</h2>
        <p>
          Gobang does not make decisions producing legal or similarly significant effects through
          automated processing and does not create advertising or behavioral profiles. Matchmaking
          and rating calculations only organize gameplay and leaderboards.
        </p>
      </section>

      <section>
        <h2>Children and changes</h2>
        <p>
          Gobang is not directed to children. A person who cannot validly agree to the account terms
          or data processing under the law of their country must not create an account without the
          authorization required by that law. Material changes to this notice will appear here with
          a revised effective date.
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

.legal-document li strong {
  color: var(--color-text);
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

.legal-document address {
  display: grid;
  gap: 0.25rem;
  color: var(--color-text-muted);
  font-style: normal;
  line-height: 1.55;
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

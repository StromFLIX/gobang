import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import { initializeAppLinks } from './composables/useAppLinks'
import router from './router'
import { initializeAnalytics } from './services/analytics'

const app = createApp(App)

initializeAnalytics()
app.use(router)

app.mount('#app')

void initializeAppLinks(router)

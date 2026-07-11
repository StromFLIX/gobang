import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.stromflix.gobang',
  appName: 'Gobang',
  webDir: 'dist',
  backgroundColor: '#edf1ed',
  loggingBehavior: 'production',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: [],
    },
  },
}

export default config

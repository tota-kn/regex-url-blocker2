import { createApp } from 'vue'
import App from './PopupPage.vue'
import '../../assets/css/tailwind.css'
import { initializeLanguage, installI18n, setLanguage } from '@/utils/i18n'
import { initializeTheme, normalizeTheme, setTheme } from '@/utils/theme'

Promise.all([initializeLanguage(), initializeTheme()]).then(() => {
  const app = createApp(App)
  installI18n(app)
  app.mount('#app')
})
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.global?.newValue) {
    const global = changes.global.newValue as {
      language?: 'auto' | 'en' | 'ja'
      theme?: unknown
    }
    setLanguage(global.language ?? 'auto')
    setTheme(normalizeTheme(global.theme))
  }
})

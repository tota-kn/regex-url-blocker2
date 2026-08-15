import { createApp } from 'vue'
import App from './OptionsPage.vue'
import '../../assets/css/tailwind.css'
import { i18n, initializeLanguage, installI18n, setLanguage } from '@/utils/i18n'
import { initializeTheme, normalizeTheme, setTheme } from '@/utils/theme'

Promise.all([initializeLanguage(), initializeTheme()]).then(() => {
  document.title = i18n.global.t('Regex URL Guard - Options')
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

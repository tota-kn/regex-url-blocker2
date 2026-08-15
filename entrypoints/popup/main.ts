import { createApp } from 'vue'
import App from './PopupPage.vue'
import '../../assets/css/tailwind.css'
import { initializeLanguage, installI18n, setLanguage } from '@/utils/i18n'

initializeLanguage().then(() => {
  const app = createApp(App)
  installI18n(app)
  app.mount('#app')
})
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.global?.newValue)
    setLanguage((changes.global.newValue as { language?: 'auto' | 'en' | 'ja' }).language ?? 'auto')
})

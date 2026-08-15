import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    version: '1.5.0',
    permissions: ['tabs', 'webNavigation', 'storage', 'alarms', 'idle', 'notifications'],
    options_ui: {
      page: 'options/index.html',
    },
  },
  vite: () => ({
    plugins: [tailwindcss() as any],
  }),
})

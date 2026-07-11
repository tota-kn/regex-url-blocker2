import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Regex URL Guard',
    description: 'Block distracting websites with customizable regular expression URL rules.',
    version: '1.3.0',
    permissions: ['tabs', 'webNavigation', 'storage', 'alarms', 'idle', 'notifications'],
    options_ui: {
      page: 'options/index.html',
    },
  },
  vite: () => ({
    plugins: [tailwindcss() as any],
  }),
})

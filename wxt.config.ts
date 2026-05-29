import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Regex URL Guard',
    description: 'Block distracting websites with customizable regular expression URL rules.',
    version: '1.0.0',
    permissions: ['tabs', 'webNavigation', 'storage', 'alarms', 'idle', 'notifications'],
    options_ui: {
      page: 'options/index.html',
    },
  },
  vite: () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugins: [tailwindcss() as any],
  }),
})

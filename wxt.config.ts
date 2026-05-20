import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'URL Guard',
    description: '正規表現で指定したURLをブロックする拡張機能',
    version: '1.0.0',
    permissions: ['tabs', 'webNavigation', 'storage', 'alarms', 'idle', 'notifications'],
    host_permissions: ['<all_urls>'],
    options_ui: {
      page: 'options/index.html',
    },
  },
  vite: () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugins: [tailwindcss() as any],
  }),
})

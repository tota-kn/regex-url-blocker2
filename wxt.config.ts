import { defineConfig } from 'wxt'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  manifest: {
    name: 'Regex URL Blocker',
    description: '正規表現で指定したURLをブロックする拡張機能',
    version: '1.0.0',
    permissions: [],
    options_ui: {
      page: 'options/index.html',
    },
  },
  vite: () => ({
    plugins: [
      vue(),
      tailwindcss(),
    ],
  }),
})

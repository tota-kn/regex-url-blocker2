// @ts-check
import pluginVue from 'eslint-plugin-vue'
import { includeIgnoreFile } from '@eslint/compat'
import eslint from '@eslint/js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tseslint from 'typescript-eslint'

import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'

const gitIgnoreFileConfig = () => {
  const fileName = fileURLToPath(import.meta.url)
  const dirName = path.dirname(fileName)
  const gitignorePath = path.resolve(dirName, '.gitignore')
  return includeIgnoreFile(gitignorePath)
}

export default tseslint.config(
  gitIgnoreFileConfig(),
  {
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      pluginVue.configs['flat/recommended'],
      stylistic.configs.recommended,
    ],
    files: ['**/*.{js,ts,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
)

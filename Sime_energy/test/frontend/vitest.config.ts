import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Les tests importent le code de sime-front directement (alias @ du projet).
// react/react-dom : une seule copie (celle de test/, même version que sime-front) partagée
// par le code de sime-front et Testing Library. xlsx : copie de sime-front.
const FRONT = path.resolve(__dirname, '../../sime-front')

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(FRONT, 'src'),
      react: path.join(__dirname, 'node_modules/react'),
      'react-dom': path.join(__dirname, 'node_modules/react-dom'),
      xlsx: path.join(FRONT, 'node_modules/xlsx'),
    },
  },
  envDir: FRONT,
  test: {
    root: __dirname,
    include: ['unitaire/**/*.test.{ts,tsx}'],
    environment: 'node',
    globals: false,
  },
})

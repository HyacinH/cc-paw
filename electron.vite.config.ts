import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/electron',
      emptyOutDir: false,
      lib: {
        entry: 'electron/main.ts',
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/electron',
      emptyOutDir: false,
      lib: {
        entry: 'electron/preload.ts',
      },
    },
  },
  renderer: {
    root: 'src',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: 'src/index.html',
      },
    },
    plugins: [react()],
  },
})

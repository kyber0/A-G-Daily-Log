import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    define: {
      // Vite reads .env automatically — SUPABASE_URL is safe to inject as default endpoint.
      // Never inject service role keys or secrets into the client build.
      'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL || '')
    },
    build: {
      rollupOptions: {
        external: ['electron', 'better-sqlite3'],
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }

  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['electron'],
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})

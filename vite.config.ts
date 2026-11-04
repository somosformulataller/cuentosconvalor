import { defineConfig, type Plugin } from 'vite'
import preact from '@preact/preset-vite'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// En desarrollo la API corre dentro del mismo servidor de Vite: un solo
// `npm run dev`. Se importa en tiempo de ejecución para que Vite no la empaquete.
function api(): Plugin {
  return {
    name: 'cuentos-api',
    async configureServer(server) {
      const desde = (f: string) => pathToFileURL(path.resolve('server', f)).href
      await import(desde('env.mjs'))
      const { api } = await import(desde('api.mjs'))
      server.middlewares.use((req, res, next) => api(req, res, next))
    },
  }
}

export default defineConfig({
  plugins: [preact(), api()],
  server: { port: 5230, host: '127.0.0.1' },
})

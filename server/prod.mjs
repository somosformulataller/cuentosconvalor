// Producción: `npm run build` y luego `npm start`. Sirve dist/ y la API.
import './env.mjs'
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { api } from './api.mjs'

const DIST = path.resolve('dist')
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
}

createServer((req, res) =>
  api(req, res, () => {
    const pedido = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let archivo = path.join(DIST, path.normalize(pedido))
    if (!archivo.startsWith(DIST) || !existsSync(archivo) || statSync(archivo).isDirectory()) archivo = path.join(DIST, 'index.html')
    const ext = path.extname(archivo)
    res.setHeader('Content-Type', TIPOS[ext] ?? 'application/octet-stream')
    if (pedido.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    createReadStream(archivo).pipe(res)
  }),
).listen(Number(process.env.PORT) || 5230, () => console.log(`Cuentos de valor en http://localhost:${process.env.PORT || 5230}`))

// La API en Vercel: una sola función que atiende todo /api (vercel.json
// reescribe /api/<ruta> hacia aquí con ?__ruta=<ruta>).
import { api } from '../server/api.mjs'

export default function handler(req, res) {
  const url = new URL(req.url, 'http://x')
  const ruta = url.searchParams.get('__ruta')
  if (ruta !== null) {
    url.searchParams.delete('__ruta')
    req.url = `/api/${ruta}${url.search}`
  }
  return api(req, res)
}

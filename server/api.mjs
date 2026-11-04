// La API de la app, todo bajo /api. Es un manejador (req, res, next): en
// desarrollo lo monta Vite (vite.config.ts), en Vercel api/index.mjs y en un
// servidor propio server/prod.mjs.
import { waitUntil } from '@vercel/functions'
import { db, q } from './db.mjs'
import { abrirSesion, cerrarSesion, claveCorrecta, hashClave, usuarioDe } from './auth.mjs'
import { errorAmable, escribir, hayIA } from './luna.mjs'
import { audioDe, hayVoz } from './voz.mjs'
import { leerRespuesta, TOTAL_CAPITULOS } from '../shared/formato.js'

const json = (res, status, data) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

async function cuerpo(req) {
  // Vercel ya lo trae leído en req.body
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  let raw = ''
  for await (const parte of req) {
    raw += parte
    if (raw.length > 100_000) throw new Error('muy_grande')
  }
  return raw ? JSON.parse(raw) : {}
}

const saludo = (nombre) =>
  `<mensaje>¡Hola, ${nombre}! 🌙 Soy Luna, y vamos a crear juntos un cuento con valor, hecho a la medida de tu hijo o hija.\n\nPara empezar, cuéntame de tu hijo: ¿cómo se llama, cuántos años tiene y qué es lo que más le gusta?</mensaje>`

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const cuentoDe = (usuario, id) =>
  q(db().from('cuentos').select('*').eq('id', Number(id)).eq('usuario_id', usuario.id).maybeSingle())

const capitulosDe = (id) =>
  q(db().from('capitulos').select('numero, titulo, texto, version').eq('cuento_id', id).order('numero'))

const rutas = [
  ['GET', /^\/api\/config$/, (req, res) => json(res, 200, { ia: hayIA(), voz: hayVoz(), capitulos: TOTAL_CAPITULOS })],

  ['GET', /^\/api\/yo$/, (req, res, u) => json(res, 200, { usuario: u })],

  [
    'POST',
    /^\/api\/registro$/,
    async (req, res) => {
      const { nombre = '', email = '', clave = '' } = await cuerpo(req)
      const correo = email.trim().toLowerCase()
      if (nombre.trim().length < 2) return json(res, 400, { error: 'Escribe tu nombre.' })
      if (!EMAIL.test(correo)) return json(res, 400, { error: 'Ese correo no parece correcto.' })
      if (clave.length < 6) return json(res, 400, { error: 'La contraseña necesita al menos 6 caracteres.' })
      const { data: u, error } = await db()
        .from('usuarios')
        .insert({ nombre: nombre.trim(), email: correo, clave: hashClave(clave) })
        .select('id, nombre, email')
        .single()
      // 23505: el correo ya existe (índice único)
      if (error?.code === '23505') return json(res, 409, { error: 'Ya hay una cuenta con ese correo. Inicia sesión.' })
      if (error) throw new Error(`supabase: ${error.message}`)
      await abrirSesion(res, u.id)
      json(res, 200, { usuario: u })
    },
  ],

  [
    'POST',
    /^\/api\/entrar$/,
    async (req, res) => {
      const { email = '', clave = '' } = await cuerpo(req)
      const u = await q(db().from('usuarios').select('*').eq('email', email.trim().toLowerCase()).maybeSingle())
      if (!u || !claveCorrecta(clave, u.clave)) return json(res, 401, { error: 'El correo o la contraseña no coinciden.' })
      await abrirSesion(res, u.id)
      json(res, 200, { usuario: { id: u.id, nombre: u.nombre, email: u.email } })
    },
  ],

  [
    'POST',
    /^\/api\/salir$/,
    async (req, res) => {
      await cerrarSesion(req, res)
      json(res, 200, { ok: true })
    },
  ],

  [
    'GET',
    /^\/api\/cuentos$/,
    async (req, res, u) => {
      const filas = await q(
        db()
          .from('cuentos')
          .select('id, titulo, para, valores, estado, actualizado, capitulos(count)')
          .eq('usuario_id', u.id)
          .order('actualizado', { ascending: false }),
      )
      const cuentos = filas.map(({ capitulos, ...c }) => ({ ...c, capitulos: capitulos?.[0]?.count ?? 0 }))
      json(res, 200, { cuentos })
    },
  ],

  [
    'POST',
    /^\/api\/cuentos$/,
    async (req, res, u) => {
      // Si el último cuento sigue sin empezar (solo el saludo), se reutiliza.
      const ultimo = await q(
        db().from('cuentos').select('id').eq('usuario_id', u.id).order('id', { ascending: false }).limit(1).maybeSingle(),
      )
      if (ultimo) {
        const { count } = await db()
          .from('mensajes')
          .select('id', { count: 'exact', head: true })
          .eq('cuento_id', ultimo.id)
          .eq('rol', 'user')
        if (count === 0) return json(res, 200, { id: ultimo.id })
      }
      const nuevo = await q(db().from('cuentos').insert({ usuario_id: u.id }).select('id').single())
      await q(db().from('mensajes').insert({ cuento_id: nuevo.id, rol: 'assistant', texto: saludo(u.nombre.split(' ')[0]) }))
      json(res, 200, { id: nuevo.id })
    },
  ],

  [
    'GET',
    /^\/api\/cuentos\/(\d+)$/,
    async (req, res, u, [id]) => {
      const cuento = await cuentoDe(u, id)
      if (!cuento) return json(res, 404, { error: 'No encontramos ese cuento.' })
      const mensajes = await q(db().from('mensajes').select('id, rol, texto, creado').eq('cuento_id', cuento.id).order('id'))
      json(res, 200, { cuento, mensajes, capitulos: await capitulosDe(cuento.id) })
    },
  ],

  [
    'DELETE',
    /^\/api\/cuentos\/(\d+)$/,
    async (req, res, u, [id]) => {
      await q(db().from('cuentos').delete().eq('id', Number(id)).eq('usuario_id', u.id))
      json(res, 200, { ok: true })
    },
  ],

  ['POST', /^\/api\/cuentos\/(\d+)\/mensaje$/, conversar],

  [
    'GET',
    /^\/api\/cuentos\/(\d+)\/audio\/(\d+)$/,
    async (req, res, u, [id, numero]) => {
      const cuento = await cuentoDe(u, id)
      const cap = cuento
        ? await q(db().from('capitulos').select('*').eq('cuento_id', cuento.id).eq('numero', Number(numero)).maybeSingle())
        : null
      if (!cap) return json(res, 404, { error: 'No hay capítulo.' })
      if (!hayVoz()) return json(res, 404, { error: 'sin_voz' })
      try {
        // El audio vive en Supabase Storage: se manda al enlace firmado
        res.statusCode = 302
        res.setHeader('Location', await audioDe(cuento.id, cap))
        res.setHeader('Cache-Control', 'private, no-store')
        res.end()
      } catch (err) {
        console.error('[voz]', err)
        json(res, 502, { error: 'No se pudo preparar la voz. Prueba otra vez.' })
      }
    },
  ],
]

/** La mamá o el papá responde: Luna escribe en vivo (NDJSON) y se guarda. */
async function conversar(req, res, u, [id]) {
  const cuento = await cuentoDe(u, id)
  if (!cuento) return json(res, 404, { error: 'No encontramos ese cuento.' })
  const { texto = '' } = await cuerpo(req)
  if (!texto.trim()) return json(res, 400, { error: 'Escribe tu respuesta.' })
  if (texto.length > 4000) return json(res, 400, { error: 'Es un poco largo. Cuéntamelo en menos palabras.' })

  const mio = await q(db().from('mensajes').insert({ cuento_id: cuento.id, rol: 'user', texto: texto.trim() }).select('id').single())
  const historia = await q(db().from('mensajes').select('rol, texto').eq('cuento_id', cuento.id).order('id'))
  const respuestas = historia.filter((m) => m.rol === 'user').length
  const capitulos = (await capitulosDe(cuento.id)).length

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  const enviar = (ev) => res.write(`${JSON.stringify(ev)}\n`)
  const corte = new AbortController()
  res.on('close', () => !res.writableEnded && corte.abort())

  try {
    const raw = await escribir({ historia, respuestas, capitulos, alTexto: (t) => enviar({ type: 'text', text: t }), signal: corte.signal })
    await guardar(cuento, raw)
    const actualizado = await q(db().from('cuentos').select('*').eq('id', cuento.id).single())
    enviar({ type: 'done', cuento: actualizado, capitulos: await capitulosDe(cuento.id) })
  } catch (err) {
    console.error('[luna]', err)
    // La respuesta que no llegó no queda en la conversación: se puede reintentar.
    await db().from('mensajes').delete().eq('id', mio.id)
    enviar({ type: 'error', reason: errorAmable(err) })
  }
  res.end()
}

async function guardar(cuento, raw) {
  const r = leerRespuesta(raw)
  await q(db().from('mensajes').insert({ cuento_id: cuento.id, rol: 'assistant', texto: raw }))
  const cambios = { actualizado: new Date().toISOString() }
  if (r.titulo) cambios.titulo = r.titulo
  if (r.para) cambios.para = r.para
  if (r.valores) cambios.valores = r.valores
  const c = r.capitulo
  if (c && c.texto && c.numero >= 1 && c.numero <= TOTAL_CAPITULOS) {
    const cap = await q(
      db()
        .rpc('guardar_capitulo', { p_cuento: cuento.id, p_numero: c.numero, p_titulo: c.titulo || `Capítulo ${c.numero}`, p_texto: c.texto })
        .single(),
    )
    const { count } = await db().from('capitulos').select('numero', { count: 'exact', head: true }).eq('cuento_id', cuento.id)
    if (count >= TOTAL_CAPITULOS) cambios.estado = 'listo'
    // Con voz, el audio se va preparando mientras siguen conversando
    // (waitUntil deja a Vercel terminarlo después de responder).
    if (hayVoz()) waitUntil(audioDe(cuento.id, cap).catch((err) => console.error('[voz]', err)))
  }
  await q(db().from('cuentos').update(cambios).eq('id', cuento.id))
}

export async function api(req, res, next) {
  const url = new URL(req.url, 'http://x')
  if (!url.pathname.startsWith('/api/')) return next?.()
  try {
    for (const [metodo, patron, manejar] of rutas) {
      const m = url.pathname.match(patron)
      if (!m || req.method !== metodo) continue
      const publica = /^\/api\/(config|yo|registro|entrar|salir)$/.test(url.pathname)
      const u = url.pathname === '/api/config' ? null : await usuarioDe(req)
      if (!publica && !u) return json(res, 401, { error: 'Inicia sesión para seguir.' })
      return await manejar(req, res, u, m.slice(1))
    }
    json(res, 404, { error: 'No existe.' })
  } catch (err) {
    console.error('[api]', err)
    if (!res.headersSent) json(res, 500, { error: 'Algo falló. Prueba otra vez.' })
    else res.end()
  }
}

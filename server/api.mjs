// La API de la app, todo bajo /api. Es un manejador (req, res, next): en
// desarrollo lo monta Vite (vite.config.ts), en Vercel api/index.mjs y en un
// servidor propio server/prod.mjs.
import { waitUntil } from '@vercel/functions'
import { sql } from './db.mjs'
import { abrirSesion, cerrarSesion, claveCorrecta, hashClave, usuarioDe } from './auth.mjs'
import { errorAmable, escribir, hayClaude } from './luna.mjs'
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

async function cuentoDe(usuario, id) {
  const [c] = await sql`select * from cuentos where id = ${Number(id)} and usuario_id = ${usuario.id}`
  return c ?? null
}

const capitulosDe = (id) =>
  sql`select numero, titulo, texto, version from capitulos where cuento_id = ${id} order by numero`

const rutas = [
  ['GET', /^\/api\/config$/, (req, res) => json(res, 200, { claude: hayClaude(), voz: hayVoz(), capitulos: TOTAL_CAPITULOS })],

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
      const [u] = await sql`
        insert into usuarios (nombre, email, clave) values (${nombre.trim()}, ${correo}, ${hashClave(clave)})
        on conflict (email) do nothing
        returning id, nombre, email`
      if (!u) return json(res, 409, { error: 'Ya hay una cuenta con ese correo. Inicia sesión.' })
      await abrirSesion(res, u.id)
      json(res, 200, { usuario: u })
    },
  ],

  [
    'POST',
    /^\/api\/entrar$/,
    async (req, res) => {
      const { email = '', clave = '' } = await cuerpo(req)
      const [u] = await sql`select * from usuarios where email = ${email.trim().toLowerCase()}`
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
      const cuentos = await sql`
        select c.id, c.titulo, c.para, c.valores, c.estado, c.actualizado,
          (select count(*)::int from capitulos k where k.cuento_id = c.id) as capitulos
        from cuentos c where c.usuario_id = ${u.id} order by c.actualizado desc`
      json(res, 200, { cuentos })
    },
  ],

  [
    'POST',
    /^\/api\/cuentos$/,
    async (req, res, u) => {
      // Si ya hay uno sin empezar (solo el saludo), se reutiliza.
      const [vacio] = await sql`
        select c.id from cuentos c where c.usuario_id = ${u.id}
          and not exists (select 1 from mensajes m where m.cuento_id = c.id and m.rol = 'user')
        order by c.id desc limit 1`
      if (vacio) return json(res, 200, { id: vacio.id })
      const [nuevo] = await sql`insert into cuentos (usuario_id) values (${u.id}) returning id`
      await sql`insert into mensajes (cuento_id, rol, texto) values (${nuevo.id}, 'assistant', ${saludo(u.nombre.split(' ')[0])})`
      json(res, 200, { id: nuevo.id })
    },
  ],

  [
    'GET',
    /^\/api\/cuentos\/(\d+)$/,
    async (req, res, u, [id]) => {
      const cuento = await cuentoDe(u, id)
      if (!cuento) return json(res, 404, { error: 'No encontramos ese cuento.' })
      const mensajes = await sql`select id, rol, texto, creado from mensajes where cuento_id = ${cuento.id} order by id`
      json(res, 200, { cuento, mensajes, capitulos: await capitulosDe(cuento.id) })
    },
  ],

  [
    'DELETE',
    /^\/api\/cuentos\/(\d+)$/,
    async (req, res, u, [id]) => {
      await sql`delete from cuentos where id = ${Number(id)} and usuario_id = ${u.id}`
      json(res, 200, { ok: true })
    },
  ],

  ['POST', /^\/api\/cuentos\/(\d+)\/mensaje$/, conversar],

  [
    'GET',
    /^\/api\/cuentos\/(\d+)\/audio\/(\d+)$/,
    async (req, res, u, [id, numero]) => {
      const cuento = await cuentoDe(u, id)
      const [cap] = cuento ? await sql`select * from capitulos where cuento_id = ${cuento.id} and numero = ${Number(numero)}` : []
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

  const [mio] = await sql`insert into mensajes (cuento_id, rol, texto) values (${cuento.id}, 'user', ${texto.trim()}) returning id`
  const historia = await sql`select rol, texto from mensajes where cuento_id = ${cuento.id} order by id`
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
    const [actualizado] = await sql`select * from cuentos where id = ${cuento.id}`
    enviar({ type: 'done', cuento: actualizado, capitulos: await capitulosDe(cuento.id) })
  } catch (err) {
    console.error('[luna]', err)
    // La respuesta que no llegó no queda en la conversación: se puede reintentar.
    await sql`delete from mensajes where id = ${mio.id}`
    enviar({ type: 'error', reason: errorAmable(err) })
  }
  res.end()
}

async function guardar(cuento, raw) {
  const r = leerRespuesta(raw)
  await sql`insert into mensajes (cuento_id, rol, texto) values (${cuento.id}, 'assistant', ${raw})`
  const cambios = { actualizado: new Date() }
  if (r.titulo) cambios.titulo = r.titulo
  if (r.para) cambios.para = r.para
  if (r.valores) cambios.valores = r.valores
  const c = r.capitulo
  if (c && c.texto && c.numero >= 1 && c.numero <= TOTAL_CAPITULOS) {
    const [cap] = await sql`
      insert into capitulos (cuento_id, numero, titulo, texto)
      values (${cuento.id}, ${c.numero}, ${c.titulo || `Capítulo ${c.numero}`}, ${c.texto})
      on conflict (cuento_id, numero) do update
        set titulo = excluded.titulo, texto = excluded.texto, version = capitulos.version + 1
      returning *`
    const [{ total }] = await sql`select count(*)::int as total from capitulos where cuento_id = ${cuento.id}`
    if (total >= TOTAL_CAPITULOS) cambios.estado = 'listo'
    // Con voz, el audio se va preparando mientras siguen conversando
    // (waitUntil deja a Vercel terminarlo después de responder).
    if (hayVoz()) waitUntil(audioDe(cuento.id, cap).catch((err) => console.error('[voz]', err)))
  }
  await sql`update cuentos set ${sql(cambios)} where id = ${cuento.id}`
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

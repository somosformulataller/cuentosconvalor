// La API de la app, todo bajo /api. Es un manejador (req, res, next): en
// desarrollo lo monta Vite (vite.config.ts) y en producción server/prod.mjs.
import { createReadStream, statSync } from 'node:fs'
import { db } from './db.mjs'
import { abrirSesion, cerrarSesion, claveCorrecta, hashClave, usuarioDe } from './auth.mjs'
import { errorAmable, escribir, hayClaude } from './luna.mjs'
import { audioDe, hayVoz, tipoAudio } from './voz.mjs'
import { leerRespuesta, TOTAL_CAPITULOS } from '../shared/formato.js'

const json = (res, status, data) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

async function cuerpo(req) {
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

function cuentoDe(usuario, id) {
  return db.prepare('select * from cuentos where id = ? and usuario_id = ?').get(Number(id), usuario.id) ?? null
}

const capitulosDe = (id) =>
  db.prepare('select numero, titulo, texto, version from capitulos where cuento_id = ? order by numero').all(id)

const rutas = [
  ['GET', /^\/api\/config$/, (req, res) => json(res, 200, { claude: hayClaude(), voz: hayVoz(), capitulos: TOTAL_CAPITULOS })],

  ['GET', /^\/api\/yo$/, (req, res, u) => json(res, 200, { usuario: u })],

  [
    'POST',
    /^\/api\/registro$/,
    async (req, res) => {
      const { nombre = '', email = '', clave = '' } = await cuerpo(req)
      if (nombre.trim().length < 2) return json(res, 400, { error: 'Escribe tu nombre.' })
      if (!EMAIL.test(email.trim())) return json(res, 400, { error: 'Ese correo no parece correcto.' })
      if (clave.length < 6) return json(res, 400, { error: 'La contraseña necesita al menos 6 caracteres.' })
      const existe = db.prepare('select 1 from usuarios where email = ?').get(email.trim())
      if (existe) return json(res, 409, { error: 'Ya hay una cuenta con ese correo. Inicia sesión.' })
      const { lastInsertRowid } = db
        .prepare('insert into usuarios (nombre, email, clave) values (?, ?, ?)')
        .run(nombre.trim(), email.trim().toLowerCase(), hashClave(clave))
      abrirSesion(res, Number(lastInsertRowid))
      json(res, 200, { usuario: { id: Number(lastInsertRowid), nombre: nombre.trim(), email: email.trim().toLowerCase() } })
    },
  ],

  [
    'POST',
    /^\/api\/entrar$/,
    async (req, res) => {
      const { email = '', clave = '' } = await cuerpo(req)
      const u = db.prepare('select * from usuarios where email = ?').get(email.trim())
      if (!u || !claveCorrecta(clave, u.clave)) return json(res, 401, { error: 'El correo o la contraseña no coinciden.' })
      abrirSesion(res, u.id)
      json(res, 200, { usuario: { id: u.id, nombre: u.nombre, email: u.email } })
    },
  ],

  [
    'POST',
    /^\/api\/salir$/,
    (req, res) => {
      cerrarSesion(req, res)
      json(res, 200, { ok: true })
    },
  ],

  [
    'GET',
    /^\/api\/cuentos$/,
    (req, res, u) => {
      const cuentos = db
        .prepare(
          `select c.id, c.titulo, c.para, c.valores, c.estado, c.actualizado,
             (select count(*) from capitulos k where k.cuento_id = c.id) as capitulos
           from cuentos c where c.usuario_id = ? order by c.actualizado desc`,
        )
        .all(u.id)
      json(res, 200, { cuentos })
    },
  ],

  [
    'POST',
    /^\/api\/cuentos$/,
    (req, res, u) => {
      // Si ya hay uno sin empezar (solo el saludo), se reutiliza.
      const vacio = db
        .prepare(
          `select c.id from cuentos c where c.usuario_id = ?
             and (select count(*) from mensajes m where m.cuento_id = c.id and m.rol = 'user') = 0
           order by c.id desc limit 1`,
        )
        .get(u.id)
      if (vacio) return json(res, 200, { id: vacio.id })
      const { lastInsertRowid } = db.prepare('insert into cuentos (usuario_id) values (?)').run(u.id)
      db.prepare("insert into mensajes (cuento_id, rol, texto) values (?, 'assistant', ?)").run(
        lastInsertRowid,
        saludo(u.nombre.split(' ')[0]),
      )
      json(res, 200, { id: Number(lastInsertRowid) })
    },
  ],

  [
    'GET',
    /^\/api\/cuentos\/(\d+)$/,
    (req, res, u, [id]) => {
      const cuento = cuentoDe(u, id)
      if (!cuento) return json(res, 404, { error: 'No encontramos ese cuento.' })
      const mensajes = db.prepare('select id, rol, texto, creado from mensajes where cuento_id = ? order by id').all(cuento.id)
      json(res, 200, { cuento, mensajes, capitulos: capitulosDe(cuento.id) })
    },
  ],

  [
    'DELETE',
    /^\/api\/cuentos\/(\d+)$/,
    (req, res, u, [id]) => {
      db.prepare('delete from cuentos where id = ? and usuario_id = ?').run(Number(id), u.id)
      json(res, 200, { ok: true })
    },
  ],

  ['POST', /^\/api\/cuentos\/(\d+)\/mensaje$/, conversar],

  [
    'GET',
    /^\/api\/cuentos\/(\d+)\/audio\/(\d+)$/,
    async (req, res, u, [id, numero]) => {
      const cuento = cuentoDe(u, id)
      const cap = cuento && db.prepare('select * from capitulos where cuento_id = ? and numero = ?').get(cuento.id, Number(numero))
      if (!cap) return json(res, 404, { error: 'No hay capítulo.' })
      if (!hayVoz()) return json(res, 404, { error: 'sin_voz' })
      try {
        const ruta = await audioDe(cuento.id, cap)
        res.setHeader('Content-Type', tipoAudio(ruta))
        res.setHeader('Content-Length', statSync(ruta).size)
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
        createReadStream(ruta).pipe(res)
      } catch (err) {
        console.error('[voz]', err)
        json(res, 502, { error: 'No se pudo preparar la voz. Prueba otra vez.' })
      }
    },
  ],
]

/** La mamá o el papá responde: Luna escribe en vivo (NDJSON) y se guarda. */
async function conversar(req, res, u, [id]) {
  const cuento = cuentoDe(u, id)
  if (!cuento) return json(res, 404, { error: 'No encontramos ese cuento.' })
  const { texto = '' } = await cuerpo(req)
  if (!texto.trim()) return json(res, 400, { error: 'Escribe tu respuesta.' })
  if (texto.length > 4000) return json(res, 400, { error: 'Es un poco largo. Cuéntamelo en menos palabras.' })

  db.prepare("insert into mensajes (cuento_id, rol, texto) values (?, 'user', ?)").run(cuento.id, texto.trim())
  const historia = db.prepare('select rol, texto from mensajes where cuento_id = ? order by id').all(cuento.id)
  const respuestas = historia.filter((m) => m.rol === 'user').length
  const capitulos = capitulosDe(cuento.id).length

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  const enviar = (ev) => res.write(`${JSON.stringify(ev)}\n`)
  const corte = new AbortController()
  res.on('close', () => !res.writableEnded && corte.abort())

  try {
    const raw = await escribir({ historia, respuestas, capitulos, alTexto: (t) => enviar({ type: 'text', text: t }), signal: corte.signal })
    guardar(cuento, raw)
    const actualizado = db.prepare('select * from cuentos where id = ?').get(cuento.id)
    enviar({ type: 'done', cuento: actualizado, capitulos: capitulosDe(cuento.id) })
  } catch (err) {
    console.error('[luna]', err)
    // La respuesta que no llegó no queda en la conversación: se puede reintentar.
    db.prepare("delete from mensajes where cuento_id = ? and rol = 'user' and id = (select max(id) from mensajes where cuento_id = ?)").run(cuento.id, cuento.id)
    enviar({ type: 'error', reason: errorAmable(err) })
  }
  res.end()
}

function guardar(cuento, raw) {
  const r = leerRespuesta(raw)
  db.prepare("insert into mensajes (cuento_id, rol, texto) values (?, 'assistant', ?)").run(cuento.id, raw)
  const cambios = {}
  if (r.titulo) cambios.titulo = r.titulo
  if (r.para) cambios.para = r.para
  if (r.valores) cambios.valores = r.valores
  const c = r.capitulo
  if (c && c.texto && c.numero >= 1 && c.numero <= TOTAL_CAPITULOS) {
    db.prepare(
      `insert into capitulos (cuento_id, numero, titulo, texto) values (?, ?, ?, ?)
       on conflict (cuento_id, numero) do update set titulo = excluded.titulo, texto = excluded.texto, version = version + 1`,
    ).run(cuento.id, c.numero, c.titulo || `Capítulo ${c.numero}`, c.texto)
    const total = capitulosDe(cuento.id).length
    if (total >= TOTAL_CAPITULOS) cambios.estado = 'listo'
    // Con voz, el audio se va preparando mientras siguen conversando.
    if (hayVoz()) {
      const cap = db.prepare('select * from capitulos where cuento_id = ? and numero = ?').get(cuento.id, c.numero)
      audioDe(cuento.id, cap).catch((err) => console.error('[voz]', err))
    }
  }
  const sets = Object.keys(cambios).map((k) => `${k} = ?`)
  db.prepare(`update cuentos set ${[...sets, "actualizado = datetime('now')"].join(', ')} where id = ?`).run(
    ...Object.values(cambios),
    cuento.id,
  )
}

export async function api(req, res, next) {
  const url = new URL(req.url, 'http://x')
  if (!url.pathname.startsWith('/api/')) return next?.()
  try {
    for (const [metodo, patron, manejar] of rutas) {
      const m = url.pathname.match(patron)
      if (!m || req.method !== metodo) continue
      const publica = /^\/api\/(config|yo|registro|entrar|salir)$/.test(url.pathname)
      const u = usuarioDe(req)
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

// La API de la app, todo bajo /api. Es un manejador (req, res, next): en
// desarrollo lo monta Vite (vite.config.ts), en Vercel api/index.mjs y en un
// servidor propio server/prod.mjs.
import { waitUntil } from '@vercel/functions'
import { db, q } from './db.mjs'
import { abrirSesion, cerrarSesion, claveCorrecta, hashClave, usuarioDe } from './auth.mjs'
import { errorAmable, escribir, hayIA } from './luna.mjs'
import { audioDe, borrarAudios, hayVoz } from './voz.mjs'
import { evento, visita } from './eventos.mjs'
import { cuerpo, json } from './http.mjs'
import { rutasAdmin } from './rutas-admin.mjs'
import { rutasPagos } from './rutas-pagos.mjs'
import { activo, pagoRechazado } from './suscripcion.mjs'
import { leerRespuesta, TOTAL_CAPITULOS } from '../shared/formato.js'

/** Sin mensualidad al día no se crean ni se escriben cuentos (leer y escuchar, sí). */
const SIN_PAGO = { error: 'Activa tu cuenta con el pago de la mensualidad para seguir creando cuentos.', pago: true }

const saludo = (nombre) =>
  `<mensaje>¡Hola, ${nombre}! 🌙 Soy Luna, y vamos a crear juntos un cuento con valor, hecho a la medida de tu hijo o hija.\n\nPara empezar, cuéntame de tu hijo: ¿cómo se llama, cuántos años tiene y qué es lo que más le gusta?</mensaje>`

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const cuentoDe = (usuario, id) =>
  q(db().from('cuentos').select('*').eq('id', Number(id)).eq('usuario_id', usuario.id).maybeSingle())

const capitulosDe = (id) =>
  q(db().from('capitulos').select('numero, titulo, texto, version').eq('cuento_id', id).order('numero'))

const rutas = [
  ['GET', /^\/api\/config$/, (req, res) => json(res, 200, { ia: hayIA(), voz: hayVoz(), capitulos: TOTAL_CAPITULOS })],

  [
    'GET',
    /^\/api\/yo$/,
    (req, res, u) => {
      if (u) waitUntil(visita(u.id))
      json(res, 200, { usuario: u })
    },
  ],

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
        .select('id, nombre, email, es_admin, pagado_hasta')
        .single()
      // 23505: el correo ya existe (índice único)
      if (error?.code === '23505') return json(res, 409, { error: 'Ya hay una cuenta con ese correo. Inicia sesión.' })
      if (error) throw new Error(`supabase: ${error.message}`)
      await abrirSesion(res, u.id)
      await evento(u.id, 'registro')
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
      await evento(u.id, 'entrar')
      json(res, 200, { usuario: { id: u.id, nombre: u.nombre, email: u.email, es_admin: u.es_admin, pagado_hasta: u.pagado_hasta } })
    },
  ],

  [
    'POST',
    /^\/api\/salir$/,
    async (req, res, u) => {
      if (u) await evento(u.id, 'salir')
      await cerrarSesion(req, res)
      json(res, 200, { ok: true })
    },
  ],

  [
    'POST',
    /^\/api\/visita$/,
    async (req, res) => {
      // Para el embudo: la landing y el registro, una vez por navegador. Nunca falla hacia el usuario.
      try {
        const { pagina, visitante } = await cuerpo(req)
        if (['inicio', 'registro'].includes(pagina) && typeof visitante === 'string' && /^[\w-]{8,64}$/.test(visitante)) {
          await db().from('visitas').upsert({ pagina, visitante }, { onConflict: 'pagina,visitante', ignoreDuplicates: true })
        }
      } catch (err) {
        console.error('[visita]', err)
      }
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
      const vista = new URL(req.url, 'http://x').searchParams.get('vista')
      // «Abrió el chat» solo cuenta con el pago activo (sin pagar no puede escribirle a Luna)
      if (vista === 'libro' || activo(u)) waitUntil(evento(u.id, vista === 'libro' ? 'abrio_libro' : 'abrio_chat', { cuento: cuento.id }))
      json(res, 200, { cuento, mensajes, capitulos: await capitulosDe(cuento.id) })
    },
  ],

  [
    'DELETE',
    /^\/api\/cuentos\/(\d+)$/,
    async (req, res, u, [id]) => {
      const borrados = await q(db().from('cuentos').delete().eq('id', Number(id)).eq('usuario_id', u.id).select('id'))
      // Sus audios no se borran solos con la fila: se quitan del bucket
      if (borrados.length) {
        await borrarAudios(borrados[0].id).catch((err) => console.error('[voz]', err))
        await evento(u.id, 'borro_cuento', { cuento: borrados[0].id })
      }
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
      waitUntil(evento(u.id, 'escucho', { cuento: cuento.id, capitulo: cap.numero }))
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
  if (!activo(u)) return json(res, 402, SIN_PAGO)
  const cuento = await cuentoDe(u, id)
  if (!cuento) return json(res, 404, { error: 'No encontramos ese cuento.' })
  const { texto = '' } = await cuerpo(req)
  if (!texto.trim()) return json(res, 400, { error: 'Escribe tu respuesta.' })
  if (texto.length > 4000) return json(res, 400, { error: 'Es un poco largo. Cuéntamelo en menos palabras.' })

  const mio = await q(db().from('mensajes').insert({ cuento_id: cuento.id, rol: 'user', texto: texto.trim() }).select('id').single())
  const historia = await q(db().from('mensajes').select('rol, texto').eq('cuento_id', cuento.id).order('id'))
  const respuestas = historia.filter((m) => m.rol === 'user').length
  const capitulos = (await capitulosDe(cuento.id)).length
  // «Empezó un cuento» cuenta desde su primera respuesta a Luna (ya con el pago activo),
  // no cuando la app abre el chat vacío con el saludo
  if (respuestas === 1) waitUntil(evento(u.id, 'cuento_nuevo', { cuento: cuento.id }))
  waitUntil(evento(u.id, 'mensaje', { cuento: cuento.id, respuesta: respuestas }))

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  const enviar = (ev) => res.write(`${JSON.stringify(ev)}\n`)
  const corte = new AbortController()
  res.on('close', () => !res.writableEnded && corte.abort())

  try {
    const raw = await escribir({ historia, respuestas, capitulos, alTexto: (t) => enviar({ type: 'text', text: t }), signal: corte.signal })
    const cap = await guardar(cuento, raw)
    if (cap) await evento(u.id, cap.version > 1 ? 'capitulo_reescrito' : 'capitulo', { cuento: cuento.id, capitulo: cap.numero })
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

/** Guarda la respuesta de Luna; devuelve el capítulo si escribió uno. */
async function guardar(cuento, raw) {
  const r = leerRespuesta(raw)
  let cap = null
  await q(db().from('mensajes').insert({ cuento_id: cuento.id, rol: 'assistant', texto: raw }))
  const cambios = { actualizado: new Date().toISOString() }
  if (r.titulo) cambios.titulo = r.titulo
  if (r.para) cambios.para = r.para
  if (r.valores) cambios.valores = r.valores
  const c = r.capitulo
  if (c && c.texto && c.numero >= 1 && c.numero <= TOTAL_CAPITULOS) {
    cap = await q(
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
  return cap
}

export async function api(req, res, next) {
  const url = new URL(req.url, 'http://x')
  if (!url.pathname.startsWith('/api/')) return next?.()
  try {
    for (const [metodo, patron, manejar] of [...rutas, ...rutasPagos, ...rutasAdmin]) {
      const m = url.pathname.match(patron)
      if (!m || req.method !== metodo) continue
      // El cron trae su propia clave (CRON_SECRET)
      const publica = /^\/api\/(config|yo|registro|entrar|salir|visita|cron\/pagos)$/.test(url.pathname)
      const u = /^\/api\/(config|visita|cron\/pagos)$/.test(url.pathname) ? null : await usuarioDe(req)
      if (!publica && !u) return json(res, 401, { error: 'Inicia sesión para seguir.' })
      // El superadmin solo gestiona la app: no crea ni abre cuentos
      if (u?.es_admin && url.pathname.startsWith('/api/cuentos')) return json(res, 403, { error: 'El superadmin no crea cuentos.' })
      // Pago rechazado: sin cuentos hasta que soporte lo apruebe
      if (u && !u.es_admin && url.pathname.startsWith('/api/cuentos') && (await pagoRechazado(u.id)))
        return json(res, 403, { error: 'Tu pago fue rechazado. Escríbenos por WhatsApp a soporte.', rechazado: true })
      return await manejar(req, res, u, m.slice(1))
    }
    json(res, 404, { error: 'No existe.' })
  } catch (err) {
    console.error('[api]', err)
    if (err?.status === 413 && !res.headersSent) return json(res, 413, { error: 'La imagen es muy pesada. Prueba con otra captura.' })
    if (!res.headersSent) json(res, 500, { error: 'Algo falló. Prueba otra vez.' })
    else res.end()
  }
}

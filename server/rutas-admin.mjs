// Rutas del superadmin (solo usuarios con es_admin): resumen, pagos con su
// validación y usuarios con todo lo que hacen en la app.
import { db, q } from './db.mjs'
import { evento } from './eventos.mjs'
import { cuerpo, json } from './http.mjs'
import { bancoConfigurado, leerEstadoDeCuenta } from './pagos/banco.mjs'
import { conciliar, reclamarPagoManual } from './pagos/conciliar.mjs'
import { ocrConfigurado } from './pagos/ocr.mjs'
import { REVISION_TEXTO, cola6, mismaReferencia, validacionActiva } from './pagos/reglas.mjs'
import { activo, diasRestantes } from './suscripcion.mjs'

const soloAdmin = (manejar) => (req, res, u, args) =>
  u?.es_admin ? manejar(req, res, u, args) : json(res, 403, { error: 'Solo para el superadmin.' })

const hace = (ms) => new Date(Date.now() - ms).toISOString()

/** La última actividad de cada usuario (de los eventos más recientes). */
async function ultimaActividad() {
  const filas = await q(db().from('eventos').select('usuario_id, tipo, creado').order('creado', { ascending: false }).limit(1000))
  const m = new Map()
  for (const f of filas) if (!m.has(f.usuario_id)) m.set(f.usuario_id, f)
  return m
}

async function firmarCaptura(ruta) {
  if (!ruta) return null
  const { data } = await db().storage.from('comprobantes').createSignedUrl(ruta, 3600)
  return data?.signedUrl ?? null
}

export const rutasAdmin = [
  [
    'GET',
    /^\/api\/admin\/resumen$/,
    soloAdmin(async (req, res) => {
      const contar = async (consulta) => (await consulta).count ?? 0
      const ahora = new Date().toISOString()
      const [usuarios, activos, revisar, verificando, aprobados30, activos7, cuentos, ultimoCron] = await Promise.all([
        contar(db().from('usuarios').select('id', { count: 'exact', head: true }).eq('es_admin', false)),
        contar(db().from('usuarios').select('id', { count: 'exact', head: true }).eq('es_admin', false).gt('pagado_hasta', ahora)),
        contar(db().from('pagos').select('id', { count: 'exact', head: true }).eq('estado', 'verificando').not('revision', 'is', null)),
        contar(db().from('pagos').select('id', { count: 'exact', head: true }).eq('estado', 'verificando')),
        q(db().from('pagos').select('monto_usd').eq('estado', 'aprobado').gte('creado', hace(30 * 864e5)).limit(1000)),
        q(db().from('eventos').select('usuario_id').gte('creado', hace(7 * 864e5)).limit(1000)),
        contar(db().from('cuentos').select('id', { count: 'exact', head: true })),
        q(db().from('pagos').select('ultimo_intento').not('ultimo_intento', 'is', null).order('ultimo_intento', { ascending: false }).limit(1)),
      ])
      json(res, 200, {
        usuarios,
        activos,
        usaron_7_dias: new Set(activos7.map((e) => e.usuario_id)).size,
        cuentos,
        pagos_por_revisar: revisar,
        pagos_verificando: verificando,
        aprobados_30_dias: aprobados30.length,
        ingresos_30_dias_usd: aprobados30.reduce((a, p) => a + Number(p.monto_usd), 0),
        validacion: {
          activa: validacionActiva() && bancoConfigurado(),
          banco: bancoConfigurado(),
          ocr: ocrConfigurado(),
          cron: !!process.env.CRON_SECRET,
          ultima_busqueda: ultimoCron[0]?.ultimo_intento ?? null,
        },
      })
    }),
  ],

  [
    'GET',
    /^\/api\/admin\/embudo$/,
    soloAdmin(async (req, res) => {
      const dias = Number(new URL(req.url, 'http://x').searchParams.get('dias')) || 0
      const { data, error } = await db().rpc('embudo', { p_desde: dias > 0 ? hace(dias * 864e5) : null })
      if (error) {
        console.error('[embudo]', error)
        const falta = /embudo|visitas/.test(error.message ?? '') && /(not find|does not exist)/.test(error.message ?? '')
        return json(res, 500, { error: falta ? 'Falta correr la migración del embudo en Supabase.' : 'No se pudo calcular el embudo.' })
      }
      json(res, 200, data)
    }),
  ],

  [
    'GET',
    /^\/api\/admin\/pagos$/,
    soloAdmin(async (req, res) => {
      const filtro = new URL(req.url, 'http://x').searchParams.get('filtro') ?? 'revisar'
      let consulta = db().from('pagos').select('*, usuarios!pagos_usuario_id_fkey(nombre, email)')
      if (filtro === 'revisar') consulta = consulta.eq('estado', 'verificando').not('revision', 'is', null)
      else if (filtro === 'verificando') consulta = consulta.eq('estado', 'verificando')
      else consulta = consulta.eq('estado', filtro)
      const filas = await q(consulta.order('creado', { ascending: false }).limit(200))
      const pagos = await Promise.all(
        filas.map(async (p) => ({
          ...p,
          revision_texto: p.revision ? (REVISION_TEXTO[p.revision] ?? p.revision) : null,
          captura: await firmarCaptura(p.comprobante),
        })),
      )
      json(res, 200, { pagos })
    }),
  ],

  [
    'POST',
    /^\/api\/admin\/pagos\/([\w-]+)$/,
    soloAdmin(async (req, res, u, [id]) => {
      const { accion, nota = '' } = await cuerpo(req)
      const pago = await q(db().from('pagos').select('*').eq('id', id).maybeSingle())
      if (!pago) return json(res, 404, { error: 'No existe ese pago.' })

      if (accion === 'revalidar') {
        const r = await conciliar({ origen: 'superadmin', pago: id })
        return json(res, 200, { ok: true, resultado: r })
      }
      if (accion !== 'aprobar' && accion !== 'rechazar') return json(res, 400, { error: 'Acción desconocida.' })

      // Rechazado que soporte revisó y sí era bueno: se aprueba y vuelve a tener sus días
      if (accion === 'aprobar' && pago.estado === 'rechazado') {
        const nota = [pago.nota, 'Aprobado a mano después de rechazado.'].filter(Boolean).join(' ')
        const cambiado = await q(
          db().from('pagos')
            .update({ estado: 'aprobado', origen: 'manual', revisado_por: u.id, revisado_en: new Date().toISOString(), nota })
            .eq('id', id).eq('estado', 'rechazado').select('id'),
        )
        if (!cambiado.length) return json(res, 409, { error: 'Ese pago ya cambió. Recarga la lista.' })
        const dueno = await q(db().from('usuarios').select('pagado_hasta').eq('id', pago.usuario_id).single())
        const base = Math.max(Date.now(), dueno.pagado_hasta ? Date.parse(dueno.pagado_hasta) : 0)
        await q(db().from('usuarios').update({ pagado_hasta: new Date(base + (pago.dias ?? 30) * 864e5).toISOString() }).eq('id', pago.usuario_id))
        await evento(pago.usuario_id, 'pago_aprobado', { pago: id, origen: 'manual', nota })
        return json(res, 200, { ok: true })
      }
      if (pago.estado !== 'verificando') return json(res, 409, { error: 'Ese pago ya se decidió.' })
      if (accion === 'rechazar' && !nota.trim()) return json(res, 400, { error: 'Escribe por qué se rechaza.' })

      let banco = null
      let constancia = nota.trim() || null
      if (accion === 'aprobar') {
        // También se marca como usado en el banco, para que ninguna app lo vuelva a tomar
        const r = await reclamarPagoManual(pago)
        if (r.estado === 'reclamado') banco = r.movimiento
        else constancia = [constancia, `Aprobado a mano sin marcar en el banco (${r.estado}).`].filter(Boolean).join(' ')
      }
      const { data: ok, error } = await db().rpc('decidir_pago', {
        p_pago: id, p_estado: accion === 'aprobar' ? 'aprobado' : 'rechazado', p_origen: 'manual', p_admin: u.id, p_nota: constancia, p_banco: banco,
      })
      if (error || !ok) return json(res, 409, { error: 'No se pudo: el pago ya no está en verificación.' })
      await evento(pago.usuario_id, accion === 'aprobar' ? 'pago_aprobado' : 'pago_rechazado', { pago: id, origen: 'manual', nota: constancia })
      json(res, 200, { ok: true })
    }),
  ],

  [
    'GET',
    /^\/api\/admin\/banco$/,
    soloAdmin(async (req, res) => {
      // El estado de cuenta lo comparten tres apps (Cuentos de valor, La Mejor
      // Llave y Formula Taller). Cada abono se identifica así:
      //   cuentos   → lo tomó un pago nuestro (bank_tx_id) o lo espera uno «verificando»
      //   otra_app  → ya figura usado y no es nuestro: lo tomó La Mejor Llave o Formula Taller
      //   libre     → nadie lo ha reclamado todavía
      const movs = (await leerEstadoDeCuenta(200)).filter((m) => m.tipo === 'CREDITO')
      if (!movs.length) return json(res, 200, { movimientos: [] })
      const [aprobados, verificando] = await Promise.all([
        q(db().from('pagos').select('id, bank_tx_id, usuarios!pagos_usuario_id_fkey(nombre)').not('bank_tx_id', 'is', null)
          .in('bank_tx_id', movs.map((m) => m.id))),
        q(db().from('pagos').select('id, referencia, referencia_completa, revision, usuarios!pagos_usuario_id_fkey(nombre)').eq('estado', 'verificando')),
      ])
      const porMovimiento = new Map(aprobados.map((p) => [Number(p.bank_tx_id), p]))
      const movimientos = movs.map((m) => {
        const nuestro = porMovimiento.get(m.id)
        if (nuestro) return { ...m, app: 'cuentos', pago: { id: nuestro.id, estado: 'aprobado', nombre: nuestro.usuarios?.nombre ?? null } }
        const espera = !m.used && verificando.find((p) => String(m.referencia).endsWith(cola6(p.referencia)) &&
          (!p.referencia_completa || mismaReferencia(p.referencia_completa, m.referencia)))
        if (espera) return { ...m, app: 'cuentos', pago: { id: espera.id, estado: 'verificando', nombre: espera.usuarios?.nombre ?? null } }
        return { ...m, app: m.used ? 'otra_app' : 'libre', pago: null }
      })
      json(res, 200, { movimientos })
    }),
  ],

  [
    'GET',
    /^\/api\/admin\/usuarios$/,
    soloAdmin(async (req, res) => {
      const [filas, ultima] = await Promise.all([
        q(db().from('usuarios').select('id, nombre, email, creado, pagado_hasta, es_admin, cuentos(count)').order('creado', { ascending: false }).limit(1000)),
        ultimaActividad(),
      ])
      const usuarios = filas.map(({ cuentos, ...x }) => ({
        ...x,
        cuentos: cuentos?.[0]?.count ?? 0,
        activo: activo(x),
        dias_restantes: diasRestantes(x.pagado_hasta),
        ultima_actividad: ultima.get(x.id) ?? null,
      }))
      json(res, 200, { usuarios })
    }),
  ],

  [
    'GET',
    /^\/api\/admin\/usuarios\/(\d+)$/,
    soloAdmin(async (req, res, u, [id]) => {
      const usuario = await q(db().from('usuarios').select('id, nombre, email, creado, pagado_hasta, es_admin').eq('id', Number(id)).maybeSingle())
      if (!usuario) return json(res, 404, { error: 'No existe ese usuario.' })
      const [eventos, pagos, cuentos] = await Promise.all([
        q(db().from('eventos').select('id, tipo, detalle, creado').eq('usuario_id', usuario.id).order('creado', { ascending: false }).limit(300)),
        q(db().from('pagos').select('id, estado, monto_usd, monto_bs, referencia, revision, nota, origen, creado').eq('usuario_id', usuario.id).order('creado', { ascending: false })),
        q(db().from('cuentos').select('id, titulo, para, estado, prueba, creado, actualizado, capitulos(count)').eq('usuario_id', usuario.id).order('creado', { ascending: false })),
      ])
      json(res, 200, {
        usuario: { ...usuario, activo: activo(usuario), dias_restantes: diasRestantes(usuario.pagado_hasta) },
        eventos,
        pagos,
        cuentos: cuentos.map(({ capitulos, ...c }) => ({ ...c, capitulos: capitulos?.[0]?.count ?? 0 })),
      })
    }),
  ],

  [
    'GET',
    /^\/api\/admin\/cuentos\/(\d+)$/,
    soloAdmin(async (req, res, u, [id]) => {
      // La conversación completa de un cuento con Luna (solo lectura)
      const cuento = await q(db().from('cuentos').select('id, usuario_id, titulo, para, valores, estado, prueba, creado').eq('id', Number(id)).maybeSingle())
      if (!cuento) return json(res, 404, { error: 'No existe ese cuento.' })
      const mensajes = await q(db().from('mensajes').select('id, rol, texto, creado').eq('cuento_id', cuento.id).order('id'))
      json(res, 200, { cuento, mensajes })
    }),
  ],
]

// Rutas de la mensualidad: estado, subir la captura del Pago Móvil y el cron
// que concilia contra el banco.
import { waitUntil } from '@vercel/functions'
import { db, q } from './db.mjs'
import { evento } from './eventos.mjs'
import { cuerpo, json } from './http.mjs'
import { conciliar } from './pagos/conciliar.mjs'
import { leerComprobante } from './pagos/ocr.mjs'
import { cola6, mismaReferencia } from './pagos/reglas.mjs'
import { tasaBcv } from './pagos/tasa.mjs'
import { DIAS_POR_PAGO, PRECIO_USD, estadoSuscripcion, montoBs } from './suscripcion.mjs'
import { usuarioDe } from './auth.mjs'

const MAX_BYTES = 6 * 1024 * 1024

export const rutasPagos = [
  [
    'GET',
    /^\/api\/suscripcion$/,
    async (req, res, u) => {
      // Mientras haya un pago verificando, preguntar ayuda a que se apruebe antes
      const s = await estadoSuscripcion(u)
      if (s.verificando) waitUntil(conciliar({ origen: 'usuario' }))
      json(res, 200, s)
    },
  ],

  [
    'POST',
    /^\/api\/pagos$/,
    async (req, res, u) => {
      const { imagen = '', nombre = 'comprobante.jpg' } = await cuerpo(req, 9_000_000)
      const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(imagen)
      if (!m) return json(res, 400, { error: 'Elige la captura del pago.' })
      const bytes = Buffer.from(m[2], 'base64')
      if (bytes.length > MAX_BYTES) return json(res, 413, { error: 'La imagen es muy pesada. Prueba con otra captura.' })

      const lectura = await leerComprobante(bytes, nombre)
      if (lectura.estado === 'ilegible') {
        await evento(u.id, 'pago_ilegible')
        return json(res, 422, {
          error: 'No pudimos leer la referencia en la captura. Sube una captura completa y nítida del Pago Móvil.',
        })
      }
      if (lectura.estado === 'error') {
        return json(res, 503, { error: 'No pudimos revisar la captura en este momento. Prueba otra vez en un minuto.' })
      }
      const d = lectura.datos

      // La misma referencia no sirve dos veces (salvo que las completas digan que son pagos distintos)
      const iguales = await q(
        db().from('pagos').select('id, referencia_completa').in('estado', ['verificando', 'aprobado']).eq('referencia', cola6(d.reference)),
      )
      if (iguales.some((p) => !p.referencia_completa || !d.full_reference || mismaReferencia(p.referencia_completa, d.full_reference))) {
        await evento(u.id, 'pago_repetido', { referencia: d.reference })
        return json(res, 409, { error: 'Esa captura ya se usó para otro pago. Si crees que es un error, escríbenos.' })
      }

      const ruta = `${u.id}/${Date.now()}.${m[1].split('/')[1].replace('jpeg', 'jpg')}`
      await q(db().storage.from('comprobantes').upload(ruta, bytes, { contentType: m[1] }))

      const tasa = await tasaBcv()
      const pago = await q(
        db().rpc('registrar_pago', {
          p_usuario: u.id,
          p_monto_usd: PRECIO_USD(),
          p_monto_bs: montoBs(tasa?.tasa),
          p_tasa: tasa?.tasa ?? null,
          p_referencia: cola6(d.reference),
          p_referencia_completa: d.full_reference,
          p_ocr_monto: d.amount,
          p_ocr_banco: d.bank,
          p_ocr: d.raw,
          p_comprobante: ruta,
          p_dias: DIAS_POR_PAGO,
        }).single(),
      )
      await evento(u.id, 'pago_enviado', { pago: pago.id, referencia: pago.referencia, monto_ocr: d.amount })
      // Se busca en el banco ya, sin hacerle esperar
      waitUntil(conciliar({ origen: 'usuario', pago: pago.id }))

      const actualizado = await usuarioDe(req)
      json(res, 200, { ok: true, suscripcion: await estadoSuscripcion(actualizado) })
    },
  ],

  [
    'GET',
    /^\/api\/cron\/pagos$/,
    async (req, res) => {
      const clave = new URL(req.url, 'http://x').searchParams.get('key') ?? req.headers.authorization?.replace(/^Bearer /, '')
      if (!process.env.CRON_SECRET || clave !== process.env.CRON_SECRET) return json(res, 401, { error: 'No autorizado.' })
      json(res, 200, await conciliar({ origen: 'cron' }))
    },
  ],
]

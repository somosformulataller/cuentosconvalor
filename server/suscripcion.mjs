// La mensualidad: cuánto cuesta, hasta cuándo tiene acceso cada usuario y lo
// que se le muestra en la ventana de pago.
import { db, q } from './db.mjs'
import { DATOS_PAGO_MOVIL, diaCaracas } from './pagos/banco.mjs'
import { tasaBcv } from './pagos/tasa.mjs'

export const PRECIO_USD = () => Number(process.env.PRECIO_USD) || 9
export const DIAS_POR_PAGO = 30

/** ¿Puede crear y escribir cuentos? El superadmin siempre. */
export const activo = (u) => !!u && (u.es_admin || (!!u.pagado_hasta && Date.parse(u.pagado_hasta) > Date.now()))

/** Días de calendario (hora de Venezuela) que le quedan: 0 = vence hoy, negativo = vencido. */
export function diasRestantes(pagadoHasta) {
  if (!pagadoHasta) return null
  const hoy = Date.parse(diaCaracas(Date.now()))
  const vence = Date.parse(diaCaracas(pagadoHasta))
  return Math.round((vence - hoy) / 864e5)
}

export const montoBs = (tasa) => (tasa ? Math.round(PRECIO_USD() * tasa * 100) / 100 : null)

/** Todo lo que necesita la app: estado del acceso y los datos para pagar. */
export async function estadoSuscripcion(u) {
  const [tasa, verificando] = await Promise.all([
    tasaBcv(),
    q(db().from('pagos').select('id').eq('usuario_id', u.id).eq('estado', 'verificando').limit(1)),
  ])
  return {
    activo: activo(u),
    es_admin: !!u.es_admin,
    pagado_hasta: u.pagado_hasta ?? null,
    dias_restantes: diasRestantes(u.pagado_hasta),
    precio_usd: PRECIO_USD(),
    monto_bs: montoBs(tasa?.tasa),
    tasa: tasa?.tasa ?? null,
    fecha_tasa: tasa?.fecha ?? null,
    datos: DATOS_PAGO_MOVIL,
    verificando: verificando.length > 0,
  }
}

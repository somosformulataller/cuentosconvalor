// Reglas de la validación automática, sin red ni base de datos (se pueden
// probar solas). Adaptadas de Formula Taller (src/lib/pagos/reglas.ts) a una
// mensualidad de precio fijo: si pagó lo pedido o más, se aprueba; si pagó de
// menos, lo decide una persona.
import { esCuentaNuestra } from './banco.mjs'

/** Apagado de emergencia sin tocar código: PAGOS_VALIDACION_AUTOMATICA=false */
export const validacionActiva = () => process.env.PAGOS_VALIDACION_AUTOMATICA !== 'false'

/** El banco suele tardar 1–2 min; pasado esto se avisa en «Por revisar» (sin dejar de intentar). */
export const MINUTOS_ANTES_DE_REVISION = 10
export const VENTANA_ANTES_MS = 24 * 60 * 60 * 1000 // pagó anoche y subió la captura hoy
export const VENTANA_DESPUES_MS = 2 * 60 * 60 * 1000 // reloj del banco adelantado

/** Tolerancia en Bs por arriba y por abajo: cubre a quien redondea al transferir. */
export const tolerancia = (bs) => Math.max(0.5, bs * 0.005)
export const cola6 = (v) => String(v ?? '').replace(/\D/g, '').slice(-6)
export const bs = (n) => `Bs. ${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Por qué un pago lo tiene que mirar una persona. */
export const REVISION_TEXTO = {
  referencia_repetida: 'Referencia repetida',
  monto_menor: 'Pagó de menos',
  pago_usado: 'El pago ya figura usado en el banco',
  ambiguo: 'Varios pagos con esa referencia',
  fuera_de_ventana: 'Pago con fecha lejana',
  reclamo: 'Verificado, falta aprobar',
  no_aparece: 'No aparece en el banco',
}

/** «No aparece» se sigue intentando solo; los demás los decide una persona. */
export const sigueAutomatica = (r) => r === null || r === undefined || r === 'no_aparece'

/** Las dos referencias coinciden en todos los dígitos que tienen ambas (como mínimo los 6 últimos). */
export function mismaReferencia(a, b) {
  const x = String(a ?? '').replace(/\D/g, '')
  const y = String(b ?? '').replace(/\D/g, '')
  const n = Math.min(x.length, y.length)
  return n >= 6 && x.slice(-n) === y.slice(-n)
}

/**
 * Empareja un pago con su movimiento del banco. `tomados` son los movimientos
 * que ya pagaron otro pago nuestro: un movimiento paga UN solo pago.
 * Devuelve { estado: 'ok', movimiento, nota? } | { estado: 'no_encontrado' } |
 * { estado: 'revision', revision, detalle, movimiento? }.
 */
export function emparejar(p, movs, tomados = new Set()) {
  const cola = cola6(p.referencia)
  if (cola.length < 6) return { estado: 'no_encontrado' }
  const t = Date.parse(p.creado)

  const conEsaCola = movs.filter((m) => {
    if (!esCuentaNuestra(m) || m.tipo !== 'CREDITO' || !String(m.referencia).endsWith(cola)) return false
    const tm = Date.parse(m.fecha)
    return Number.isFinite(tm) && tm >= t - VENTANA_ANTES_MS && tm <= t + VENTANA_DESPUES_MS
  })
  // La cuenta la comparten tres apps: si la captura trae la referencia
  // completa, tiene que coincidir completa (no basta la cola de 6)
  const candidatos = conEsaCola.filter((m) => !p.referencia_completa || mismaReferencia(p.referencia_completa, m.referencia))
  const libres = candidatos.filter((m) => !m.used && !tomados.has(m.id))

  if (!libres.length) {
    if (candidatos.length) {
      const m = candidatos[0]
      return {
        estado: 'revision',
        revision: 'pago_usado',
        movimiento: m,
        detalle: `El pago de ${bs(m.monto)} (ref ${m.referencia}) ya figura usado: pudo tomarlo otro pago, La Mejor Llave o Formula Taller. Revisar antes de aprobar.`,
      }
    }
    return { estado: 'no_encontrado' }
  }

  const esperado = p.monto_bs === null ? null : Number(p.monto_bs)
  const alcanza = (m) => esperado === null || m.monto >= esperado - tolerancia(esperado)
  const exactos = libres.filter((m) => esperado !== null && Math.abs(m.monto - esperado) <= tolerancia(esperado))
  if (exactos.length === 1) return { estado: 'ok', movimiento: exactos[0] }
  if (exactos.length > 1) {
    return { estado: 'revision', revision: 'ambiguo', detalle: `${exactos.length} pagos comparten esa referencia y ese monto.` }
  }

  // Un solo pago con esa referencia: si cubre la mensualidad (pagó de más), se aprueba
  if (libres.length === 1) {
    const m = libres[0]
    if (alcanza(m)) return { estado: 'ok', movimiento: m, nota: `Pagó ${bs(m.monto)}, más de lo pedido (${bs(esperado)}).` }
    return {
      estado: 'revision',
      revision: 'monto_menor',
      movimiento: m,
      detalle: `En el banco hay ${bs(m.monto)} y la mensualidad era de ${bs(esperado)}` +
        (p.ocr_monto !== null ? `; la captura dice ${bs(p.ocr_monto)}.` : '.'),
    }
  }

  return {
    estado: 'revision',
    revision: 'ambiguo',
    movimiento: libres[0],
    detalle: `Hay ${libres.length} pagos con esa referencia y ninguno es de ${esperado !== null ? bs(esperado) : '—'}.`,
  }
}

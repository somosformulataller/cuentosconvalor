// Conexión con la Bank Automation API (la misma de La Mejor Llave y Formula
// Taller). Solo servidor: BANK_API_URL, BANK_API_TOKEN y BANK_API_ACCOUNT_NAME.
//
// Cuentos de valor cobra en la MISMA cuenta del Banco de Venezuela. No se abre
// otra sesión en el banco: las tres apps leen el estado de cuenta que guarda la
// API. Que un pago no se lo quede la app equivocada lo garantizan dos cosas:
//   1. Cada pago solo empareja con SU referencia (últimos 6 dígitos), dentro de
//      una ventana de tiempo y con el monto que cuadra.
//   2. Al aprobar, el movimiento se marca como USADO en la API (set_used=true):
//      ninguna de las tres apps lo vuelve a tomar.
//
// La API tiene DOS puertas muy distintas:
//   GET /transaction          → estado de cuenta YA GUARDADO. Gratis, no toca el banco.
//   GET /transaction/validate → si no encuentra la referencia, ENTRA AL BANCO
//                               (aguanta ~1 entrada por minuto entre todas las apps).

/** La cuenta en la que cobramos. Doble cerrojo: etiqueta de la API y número del banco. */
export const CUENTA_API = 'llave-bdv-4'
export const CUENTA_BANCO = '0102***7113'

/** A dónde paga la mamá o el papá (los mismos datos de La Mejor Llave). */
export const DATOS_PAGO_MOVIL = { banco: 'Banco de Venezuela (0102)', telefono: '0422-0166113', cedula: '18033691' }

const limpiar = (v) => String(v ?? '').trim().replace(/^"|"$/g, '')

function config() {
  const url = limpiar(process.env.BANK_API_URL)
  const token = limpiar(process.env.BANK_API_TOKEN)
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token, cuenta: limpiar(process.env.BANK_API_ACCOUNT_NAME) || CUENTA_API }
}

export const bancoConfigurado = () => config() !== null

/** Un movimiento solo se toca si viene de NUESTRA cuenta (etiqueta + número). */
export const esCuentaNuestra = (m) => m.accountName === CUENTA_API && m.cuenta === CUENTA_BANCO

async function llamar(camino, ms) {
  const c = config()
  if (!c) return { ok: false, status: 0, data: null }
  try {
    const res = await fetch(`${c.url}${camino}`, {
      headers: { Authorization: `Bearer ${c.token}` },
      signal: AbortSignal.timeout(ms),
    })
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

/** Día AAAA-MM-DD en hora de Venezuela (el banco lista en hora local). */
export const diaCaracas = (f) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(f))

/** Estado de cuenta guardado, del más reciente al más antiguo. No toca el banco. */
export async function leerEstadoDeCuenta(limite = 200) {
  const c = config()
  if (!c) return []
  const qs = new URLSearchParams({ account_name: c.cuenta, limit: String(limite) })
  const r = await llamar(`/transaction?${qs}`, 15_000)
  return r.ok && Array.isArray(r.data) ? r.data.filter(esCuentaNuestra) : []
}

/** Movimientos guardados cuya referencia termina en esta cola, sin límite de fecha. */
export async function buscarPorReferencia(cola) {
  const c = config()
  if (!c) return []
  const qs = new URLSearchParams({ account_name: c.cuenta, referencia: cola, limit: '20' })
  const r = await llamar(`/transaction?${qs}`, 15_000)
  return r.ok && Array.isArray(r.data) ? r.data.filter(esCuentaNuestra) : []
}

/**
 * Obliga a la API a bajar el estado de cuenta fresco: se le pregunta por una
 * referencia que NO puede existir (set_used=false, no reclama nada). Lo que
 * dice si entró al banco es lo que tardó (de su tabla contesta en < 1 s).
 */
export async function refrescarEstadoDeCuenta(imposible) {
  const c = config()
  if (!c) return 'sin_config'
  const qs = new URLSearchParams({
    account_name: c.cuenta, reference: imposible, date: diaCaracas(Date.now()), set_used: 'false', get_used: 'false',
  })
  const t0 = Date.now()
  // Entrar al banco tarda 20–60 s: se corta antes; la API termina igual de bajarlo
  const r = await llamar(`/transaction/validate?${qs}`, 45_000)
  if (r.status === 429) return 'enfriamiento'
  if (r.status === 0 && Date.now() - t0 >= 44_000) return 'scrapeada'
  if (r.status === 404 || r.status === 200) return Date.now() - t0 >= 5_000 ? 'scrapeada' : 'encontrada'
  return 'error'
}

/** Una cola de 6 dígitos que ningún movimiento tiene (para el latido). */
export function referenciaImposible(movs) {
  const usadas = new Set(movs.map((m) => String(m.referencia).replace(/\D/g, '').slice(-6)))
  for (let n = 100000; n <= 999999; n++) if (!usadas.has(String(n))) return String(n)
  return '100000'
}

/**
 * Marca el movimiento como usado (set_used=true) para que ninguna de las tres
 * apps lo vuelva a tomar. Se prueba con el día de Caracas y con el día UTC.
 */
export async function reclamarMovimiento(m) {
  const c = config()
  if (!c || !esCuentaNuestra(m)) return false
  for (const date of new Set([diaCaracas(m.fecha), String(m.fecha).slice(0, 10)])) {
    const qs = new URLSearchParams({
      account_name: c.cuenta, reference: m.referencia, date, set_used: 'true', get_used: 'false', monto: Number(m.monto).toFixed(2),
    })
    if ((await llamar(`/transaction/validate?${qs}`, 20_000)).ok) return true
  }
  return false
}

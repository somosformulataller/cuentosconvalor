// Tasa oficial BCV vía dolarapi.com, igual que La Mejor Llave y Formula Taller
// (la web del BCV falla TLS desde servidores; dolarapi replica el valor oficial).
// Caché en memoria de 1 h; si dolarapi falla se sirve la última conocida.
// Sábado y domingo se usa la tasa del lunes (el BCV la publica el viernes en la
// tarde y dolarapi ya la tiene en su histórico).

const OFICIAL = 'https://ve.dolarapi.com/v1/dolares/oficial'
const HISTORICO = 'https://ve.dolarapi.com/v1/historicos/dolares/oficial'
const FRESCA_MS = 60 * 60_000
const ESPERA_TRAS_FALLO_MS = 5 * 60_000

let guardada = null // { tasa, fecha }
let guardadaEn = 0
let guardadaFinDeSemana = false
let falloEn = 0

export function esFinDeSemanaEnVenezuela(ahora = new Date()) {
  const dia = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Caracas', weekday: 'short' }).format(ahora)
  return dia === 'Sat' || dia === 'Sun'
}

async function oficial() {
  const res = await fetch(OFICIAL, { signal: AbortSignal.timeout(3000) })
  if (!res.ok) throw new Error(`dolarapi ${res.status}`)
  const d = await res.json()
  const tasa = Number(d?.promedio)
  if (!(tasa > 0)) throw new Error('tasa inválida')
  return { tasa, fecha: d?.fechaActualizacion ?? new Date().toISOString() }
}

// La tasa con la fecha valor más reciente (el fin de semana, la del lunes)
async function masReciente() {
  const res = await fetch(HISTORICO, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`dolarapi histórico ${res.status}`)
  const filas = await res.json()
  let mejor = null
  for (const f of Array.isArray(filas) ? filas : []) {
    const tasa = Number(f?.promedio)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f?.fecha ?? '') || !(tasa > 0)) continue
    if (!mejor || f.fecha > mejor.fecha) mejor = { fecha: f.fecha, tasa }
  }
  if (!mejor) throw new Error('histórico sin tasas')
  return { tasa: mejor.tasa, fecha: `${mejor.fecha}T00:00:00-04:00` }
}

/** La tasa BCV de hoy, o null si no hay ninguna conocida. Nunca lanza. */
export async function tasaBcv() {
  const ahora = Date.now()
  const finDeSemana = esFinDeSemanaEnVenezuela()
  if (guardada && guardadaFinDeSemana === finDeSemana && ahora - guardadaEn < FRESCA_MS) return guardada
  if (falloEn && ahora - falloEn < ESPERA_TRAS_FALLO_MS) return guardada
  try {
    guardada = finDeSemana ? await masReciente().catch(() => oficial()) : await oficial()
    guardadaEn = ahora
    guardadaFinDeSemana = finDeSemana
    falloEn = 0
  } catch {
    falloEn = ahora
  }
  return guardada
}

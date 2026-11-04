// Pixel de Meta (solo navegador), mismo esquema que La Mejor Llave. El Pixel se
// inicializa en index.html; aquí van los eventos de los botones.

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: (...args: any[]) => void
  }
}

const CADA_24H = 24 * 60 * 60 * 1000
const enMemoria = new Map<string, number>()

/**
 * Evento personalizado (fbq('trackCustom', …)), como mucho UNA vez cada 24 h en
 * este navegador: tocar el botón varias veces (o reintentar tras un error) no
 * infla el conteo. Si el Pixel falla o lo bloquean, no rompe nada.
 */
export function eventoFbCada24h(nombre: string, datos: Record<string, unknown> = {}) {
  const clave = `fb-evento:${nombre}`
  const ahora = Date.now()
  let ultimo = enMemoria.get(clave) ?? 0
  try {
    ultimo = Math.max(ultimo, Number(localStorage.getItem(clave)) || 0)
  } catch {
    /* sin almacenamiento */
  }
  if (ahora - ultimo < CADA_24H) return
  enMemoria.set(clave, ahora)
  try {
    localStorage.setItem(clave, String(ahora))
  } catch {
    /* sin almacenamiento */
  }
  try {
    window.fbq?.('trackCustom', nombre, datos)
  } catch {
    /* pixel no disponible */
  }
}

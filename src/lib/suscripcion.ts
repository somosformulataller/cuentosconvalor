// El estado de la mensualidad, compartido entre pantallas. Se pide al entrar y
// se vuelve a pedir tras pagar.
import { api, type Suscripcion } from './api'
import { crearStore } from './store'

export const suscripcion = crearStore<Suscripcion | null>(null)

export async function cargarSuscripcion() {
  try {
    suscripcion.set(await api.suscripcion())
  } catch {
    // Sin conexión: se queda la última conocida
  }
  return suscripcion.get()
}

export const formatoBs = (n: number) => `Bs. ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Reduce la captura (máx. 1600 px, JPEG) para que suba rápido con datos móviles. */
export async function reducirImagen(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo)
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = mal
      i.src = url
    })
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height))
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(img.width * escala)
    lienzo.height = Math.round(img.height * escala)
    const ctx = lienzo.getContext('2d')
    if (!ctx) throw new Error('sin canvas')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, lienzo.width, lienzo.height)
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height)
    return lienzo.toDataURL('image/jpeg', 0.88)
  } finally {
    URL.revokeObjectURL(url)
  }
}

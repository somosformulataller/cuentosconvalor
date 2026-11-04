// Lee la captura del Pago Móvil con el servicio de OCR (el mismo de La Mejor
// Llave y Formula Taller). NO valida nada: quien dice que un pago existe es el
// estado de cuenta del banco. Sirve para no pedir que tecleen la referencia (un
// dígito mal es la causa nº 1 de «pagué y no se refleja») y para tener el monto.
// Solo servidor: PAYMENT_OCR_URL y PAYMENT_OCR_API_KEY.

const url = () => (process.env.PAYMENT_OCR_URL || 'https://payment-ocr-service-production.up.railway.app').replace(/\/$/, '')
const clave = () => String(process.env.PAYMENT_OCR_API_KEY ?? '').trim()

export const ocrConfigurado = () => clave().length > 0

/** { estado: 'leido', datos } | { estado: 'ilegible' } | { estado: 'error' }. Nunca lanza. */
export async function leerComprobante(bytes, nombre = 'comprobante.jpg') {
  if (!ocrConfigurado()) return { estado: 'error' }
  let res
  try {
    const fd = new FormData()
    fd.append('file', new Blob([bytes]), nombre)
    res = await fetch(`${url()}/v1/extract?template=ve_pago_movil&refDigits=6`, {
      method: 'POST',
      headers: { 'x-api-key': clave() },
      body: fd,
      signal: AbortSignal.timeout(15_000), // mediana 2,6 s, peor caso 11 s
    })
  } catch {
    return { estado: 'error' }
  }
  if (res.status === 422) return { estado: 'ilegible' }
  if (!res.ok) {
    console.error('[ocr] respuesta HTTP', res.status)
    return { estado: 'error' }
  }
  const r = await res.json().catch(() => null)
  if (!r) return { estado: 'error' }
  const reference = typeof r.reference === 'string' ? r.reference.trim() : ''
  // Una referencia deforme NO puede colarse en el camino del dinero
  if (r.legible !== true || !/^\d{6}$/.test(reference)) return { estado: 'ilegible' }
  return {
    estado: 'leido',
    datos: {
      reference,
      full_reference: typeof r.full_reference === 'string' ? r.full_reference.replace(/\D/g, '') || null : null,
      amount: typeof r.amount === 'number' && Number.isFinite(r.amount) ? r.amount : null,
      bank: typeof r.bank === 'string' && r.bank.trim() ? r.bank.trim() : null,
      raw: r,
    },
  }
}

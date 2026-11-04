// Ayudas para responder y leer el cuerpo de una petición (las usan api.mjs y
// las rutas de pagos y del superadmin).

export const json = (res, status, data) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

/** El cuerpo JSON. `limite` en caracteres (la captura del pago llega en base64). */
export async function cuerpo(req, limite = 100_000) {
  // Vercel ya lo trae leído en req.body
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  let raw = ''
  for await (const parte of req) {
    raw += parte
    if (raw.length > limite) throw Object.assign(new Error('muy_grande'), { status: 413 })
  }
  return raw ? JSON.parse(raw) : {}
}

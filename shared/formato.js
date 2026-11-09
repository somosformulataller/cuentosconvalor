// Lo que escribe Luna viene con etiquetas sencillas (<mensaje>, <capitulo>…)
// para separar lo que se le dice al papá o la mamá de lo que es el cuento.
// Lo usan el servidor (para guardar los capítulos) y la app (para dibujarlos
// mientras llegan), por eso es JavaScript sin dependencias.

export const TOTAL_CAPITULOS = 4

/** El cuento de prueba gratis: 3 capítulos cortos. */
export const CAPITULOS_PRUEBA = 3

/**
 * @typedef {{ numero: number, titulo: string, texto: string, completo: boolean }} CapituloLeido
 * @typedef {{ mensaje: string, titulo: string, para: string, valores: string,
 *   capitulo: CapituloLeido | null, pregunta: string }} Respuesta
 */

function etiqueta(raw, nombre) {
  const m = raw.match(new RegExp(`<${nombre}>([\\s\\S]*?)(?:</${nombre}>|$)`))
  return m ? limpiar(m[1]) : ''
}

/** Quita una etiqueta a medio llegar al final ("<pre") y espacios de más. */
function limpiar(texto) {
  return texto.replace(/<[^>]*$/, '').replace(/\*\*?/g, '').trim()
}

/** @param {string} raw @returns {Respuesta} */
export function leerRespuesta(raw) {
  const cap = raw.match(/<capitulo\s+numero="(\d+)"(?:\s+titulo="([^"]*)")?\s*>([\s\S]*?)(<\/capitulo>|$)/)
  const conEtiquetas = /<(mensaje|capitulo|pregunta)/.test(raw)
  return {
    // Si Luna no usó las etiquetas, todo es un mensaje.
    mensaje: conEtiquetas ? etiqueta(raw, 'mensaje') : limpiar(raw),
    titulo: etiqueta(raw, 'titulo'),
    para: etiqueta(raw, 'para'),
    valores: etiqueta(raw, 'valores'),
    capitulo: cap
      ? { numero: Number(cap[1]), titulo: (cap[2] ?? '').trim(), texto: limpiar(cap[3]), completo: !!cap[4] }
      : null,
    pregunta: etiqueta(raw, 'pregunta'),
  }
}

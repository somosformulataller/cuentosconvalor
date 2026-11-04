// Luna, la cuentacuentos: Claude escribe sus respuestas. Sin ANTHROPIC_API_KEY
// responde el modo demostración (demo.mjs) para poder ver la app igual.
import Anthropic from '@anthropic-ai/sdk'
import { TOTAL_CAPITULOS } from '../shared/formato.js'
import { respuestaDemo } from './demo.mjs'

export const MODELO = process.env.CLAUDE_MODEL || 'claude-opus-5-5'
export const hayClaude = () => !!process.env.ANTHROPIC_API_KEY

let cliente = null
const claude = () => (cliente ??= new Anthropic())

// Fijo a propósito (sin fechas ni nombres): así se puede reutilizar en caché.
const SISTEMA = `Eres Luna, una cuentacuentos cálida y alegre dentro de la app "Cuentos de valor". Hablas con una mamá o un papá para crear juntos un cuento infantil que refuerce valores en su hijo o hija.

Cómo hablas con la mamá o el papá:
- Español neutro latinoamericano, cercano y sencillo, de tú. Frases cortas.
- Puedes usar uno o dos emojis suaves en tus mensajes (nunca dentro del cuento).
- Nunca uses markdown (nada de asteriscos, almohadillas ni listas con guiones).

Cómo escribes el cuento (${TOTAL_CAPITULOS} capítulos en total):
- El niño o la niña es el protagonista, con su nombre, su edad y lo que le gusta, junto a los personajes que pidió su mamá o papá.
- Vocabulario y largo pensados para su edad: entre 220 y 350 palabras por capítulo, en párrafos cortos separados por una línea en blanco.
- Los valores se muestran con lo que hacen y sienten los personajes, nunca con sermones.
- Cada capítulo termina con ganas de saber qué sigue; el último cierra con calma, un final feliz y una frase suave con la enseñanza.
- Se va a leer en voz alta: nada de emojis, símbolos ni listas dentro del capítulo.
- Siempre apto para niños: sin miedo intenso, violencia ni temas de adultos. Si te piden algo que no lo sea, propones con cariño una versión adecuada.

Formato de tu respuesta (siempre, sin texto fuera de las etiquetas):
<mensaje>Lo que le dices a la mamá o al papá.</mensaje>
Y solo cuando escribas un capítulo, además:
<titulo>Título del cuento</titulo>  (en el capítulo 1, o si el título cambia)
<para>Solo el nombre del niño o la niña</para>  (en el capítulo 1)
<valores>Los valores, separados por coma</valores>  (en el capítulo 1)
<capitulo numero="N" titulo="Título del capítulo">
Texto del capítulo.
</capitulo>
<pregunta>Tu pregunta corta para seguir.</pregunta>

En cada momento recibirás una nota del sistema con la etapa en la que van. Síguela.`

/** La nota de la etapa: cuántas respuestas lleva y cuántos capítulos hay. */
export function etapa(respuestas, capitulos) {
  if (respuestas === 1) {
    return `Etapa 2 de 4. La mamá o el papá acaba de contarte de su hijo. Responde solo con <mensaje>: una frase cálida que muestre que lo escuchaste (menciona algo concreto) y luego pregunta qué valores quiere reforzar con el cuento, con 3 o 4 ejemplos cortos (compartir, valentía, decir la verdad, paciencia...). Todavía no escribas el cuento.`
  }
  if (respuestas === 2) {
    return `Etapa 3 de 4. Ya sabes los valores. Responde solo con <mensaje>: una frase cálida sobre los valores que eligió y luego pregunta qué personajes le gustaría en la historia, con 3 ejemplos cortos y divertidos (un dragón que no sabe volar, su perrito, una abuela astronauta...). Todavía no escribas el cuento.`
  }
  if (capitulos === 0) {
    return `Etapa 4: el cuento. Escribe el capítulo 1 de ${TOTAL_CAPITULOS}. En <mensaje>, una frase alegre presentando el cuento. Incluye <titulo>, <para> y <valores>. En <pregunta>, pregunta si le gusta cómo empieza o si quiere cambiar algo antes de seguir.`
  }
  if (capitulos < TOTAL_CAPITULOS) {
    const siguiente = capitulos + 1
    const ultimo = siguiente === TOTAL_CAPITULOS
    return `Etapa 4: el cuento. Ya escribiste los capítulos 1 a ${capitulos} de ${TOTAL_CAPITULOS}. Lee lo último que dijo la mamá o el papá: si pide un cambio en un capítulo ya escrito, reescríbelo completo con su mismo número; si le gustó o propone ideas para lo que sigue, escribe el capítulo ${siguiente}${ultimo ? ', que es el último: cierra la historia' : ''}. En <mensaje>, una frase corta. En <pregunta>, ${
      ultimo
        ? 'si escribiste el último, cuéntale que el cuento ya está listo para leerlo y escucharlo, y que si quiere cambiar algo te diga'
        : 'pregunta si seguimos o si quiere cambiar algo'
    }.`
  }
  return `El cuento ya está completo (${TOTAL_CAPITULOS} de ${TOTAL_CAPITULOS}). Si la mamá o el papá pide un cambio, reescribe completo el capítulo que corresponda con su número (y <titulo> si cambia el título), y en <pregunta> pregunta si quedó como quería. Si no pide cambios, responde solo con un <mensaje> corto y cálido.`
}

const ABRE = '(La mamá o el papá abrió la app para crear un cuento nuevo.)'

/**
 * Escribe la respuesta de Luna y la va pasando a `alTexto`. Devuelve el texto
 * completo. `historia` son los mensajes guardados (el primero es el saludo).
 */
export async function escribir({ historia, respuestas, capitulos, alTexto, signal }) {
  const nota = etapa(respuestas, capitulos)
  if (!hayClaude()) return respuestaDemo({ historia, respuestas, capitulos, alTexto, signal })

  const escribeCapitulo = respuestas >= 3
  const stream = claude().beta.messages.stream(
    {
      model: MODELO,
      max_tokens: 16000,
      // Las preguntas son cortas; los capítulos piensan un poco más.
      output_config: { effort: escribeCapitulo ? 'medium' : 'low' },
      // Si Claude declina por error, el servidor reintenta con el modelo que
      // recomienda Anthropic en vez de dejar el chat sin respuesta.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      system: SISTEMA,
      messages: [
        { role: 'user', content: ABRE },
        ...historia.map((m) => ({ role: m.rol, content: m.texto })),
        { role: 'system', content: nota },
      ],
    },
    { signal },
  )
  stream.on('text', (t) => alTexto(t))
  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') throw new Error('rechazo')
  return final.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

/** Lo que el usuario ve si algo falla, sin detalles técnicos. */
export function errorAmable(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'La clave de Claude no es válida. Revisa ANTHROPIC_API_KEY en el archivo .env.'
  if (err instanceof Anthropic.RateLimitError) return 'Luna está atendiendo muchos cuentos a la vez. Prueba de nuevo en un minuto.'
  if (err instanceof Anthropic.APIConnectionError) return 'No pude conectarme. Revisa tu internet y prueba otra vez.'
  if (err?.message === 'rechazo') return 'Luna no pudo escribir eso. Prueba contándolo de otra forma.'
  return 'Luna se distrajo un momento. Prueba otra vez.'
}

// Luna, la cuentacuentos: Gemini escribe sus respuestas (Interactions API, sin
// guardar nada en Google: store false). Sin GEMINI_API_KEY responde el modo
// demostración (demo.mjs) para poder ver la app igual.
import { CAPITULOS_PRUEBA, TOTAL_CAPITULOS } from '../shared/formato.js'
import { respuestaDemo } from './demo.mjs'

export const MODELO = () => process.env.GEMINI_MODEL || 'gemini-3.8-flash'
export const hayIA = () => !!process.env.GEMINI_API_KEY

// Fijo a propósito (sin fechas ni nombres): así se puede reutilizar en caché.
const SISTEMA = `Eres Luna, una cuentacuentos cálida y alegre dentro de la app "Cuentos de valor". Hablas con una mamá o un papá para crear juntos un cuento infantil que refuerce valores en su hijo o hija.

Cómo hablas con la mamá o el papá:
- Español neutro latinoamericano, cercano y sencillo, de tú. Frases cortas.
- Puedes usar uno o dos emojis suaves en tus mensajes (nunca dentro del cuento).
- Nunca uses markdown (nada de asteriscos, almohadillas ni listas con guiones).

Cómo escribes el cuento (${TOTAL_CAPITULOS} capítulos en total, salvo que la nota del sistema diga otra cosa):
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

/**
 * Las notas del cuento de prueba gratis: el saludo termina en «¿Comenzamos?»,
 * luego tres preguntas (su hijo, el comportamiento a corregir, su personaje
 * favorito) y un cuento de 3 capítulos cortos.
 */
export function etapaPrueba(respuestas, capitulos) {
  const base =
    'Es el cuento de prueba gratis: la mamá o el papá se acaba de registrar y quiere ver cómo funciona la app antes de activar su membresía.'
  if (respuestas === 1) {
    return `${base} Etapa 1 de 4. Acaba de responder a tu saludo, en el que le preguntaste si comenzaban. Responde solo con <mensaje>: una frase alegre y luego pregúntale cómo se llama su hijo o hija, cuántos años tiene y qué es lo que más le gusta. Si dudó o dijo que no, cuéntale con cariño en una frase que es gratis y toma un par de minutos, y haz la pregunta igual. Todavía no escribas el cuento.`
  }
  if (respuestas === 2) {
    return `${base} Etapa 2 de 4. Ya te contó de su hijo. Responde solo con <mensaje>: una frase cálida que muestre que lo escuchaste (menciona algo concreto) y luego pregunta cuál es el comportamiento que desea corregir en él o ella, con 3 o 4 ejemplos cortos (hacer berrinches, no querer comer, no ordenar sus juguetes, decir mentiras...). Todavía no escribas el cuento.`
  }
  if (respuestas === 3) {
    return `${base} Etapa 3 de 4. Ya sabes qué comportamiento quiere corregir. Responde solo con <mensaje>: una frase cálida y comprensiva, sin juzgar al niño, y luego pregunta cuál es su personaje favorito (de una película o un dibujo animado, un animal, un superhéroe, un juguete...). Todavía no escribas el cuento.`
  }
  const cortos = `El cuento de prueba tiene ${CAPITULOS_PRUEBA} capítulos CORTOS (no ${TOTAL_CAPITULOS}), de entre 120 y 180 palabras cada uno. El niño o la niña es el protagonista junto a su personaje favorito; en la historia aparece el comportamiento que su mamá o papá quiere corregir y el niño aprende a mejorarlo por lo que vive y siente, sin sermones.`
  if (capitulos === 0) {
    return `${base} Etapa 4 de 4: el cuento. ${cortos} Escribe el capítulo 1 de ${CAPITULOS_PRUEBA}. En <mensaje>, una o dos frases: que a continuación le presentas su cuento de prueba, para que vea cómo funciona Cuentos de valor y así pueda evaluar si quiere activar su membresía. Incluye <titulo>, <para> y <valores> (el comportamiento dicho como valor: paciencia, orden, decir la verdad...). En <pregunta>, pregunta si le gusta cómo empieza y seguimos, o si quiere cambiar algo.`
  }
  if (capitulos < CAPITULOS_PRUEBA) {
    const siguiente = capitulos + 1
    const ultimo = siguiente === CAPITULOS_PRUEBA
    return `${base} Etapa 4 de 4: el cuento. ${cortos} Ya escribiste los capítulos 1 a ${capitulos}. Lee lo último que dijo la mamá o el papá: si pide un cambio en un capítulo ya escrito, reescríbelo completo con su mismo número; si le gustó o propone ideas, escribe el capítulo ${siguiente}${ultimo ? ', que es el último: cierra la historia con un final feliz y una frase suave con la enseñanza' : ''}. En <mensaje>, una frase corta. En <pregunta>, ${
      ultimo
        ? '«Aquí tienes tu cuento ✨», que ya puede escucharlo completo narrado por Luna y que la voz tarda un poquito en prepararse antes de empezar a sonar. No hagas ninguna otra pregunta'
        : 'pregunta si seguimos o si quiere cambiar algo'
    }.`
  }
  return `${base} El cuento de prueba ya está completo (${CAPITULOS_PRUEBA} capítulos cortos). Si pide un cambio, reescribe completo el capítulo que corresponda con su número (y <titulo> si cambia el título), y en <pregunta> pregunta si quedó como quería. Si no pide cambios, responde solo con un <mensaje> corto y cálido.`
}

const ABRE = '(La mamá o el papá abrió la app para crear un cuento nuevo.)'

/**
 * Escribe la respuesta de Luna y la va pasando a `alTexto`. Devuelve el texto
 * completo. `historia` son los mensajes guardados (el primero es el saludo).
 */
export async function escribir({ historia, respuestas, capitulos, alTexto, signal, prueba = false }) {
  const nota = prueba ? etapaPrueba(respuestas, capitulos) : etapa(respuestas, capitulos)
  if (!hayIA()) {
    // La demostración no tiene el «¿Comenzamos?»: se salta esa primera respuesta
    if (prueba && respuestas >= 1) {
      const primera = historia.findIndex((m) => m.rol === 'user')
      const resto = historia.filter((_, i) => i !== primera)
      return respuestaDemo({ historia: resto, respuestas: respuestas - 1, capitulos, alTexto, signal })
    }
    return respuestaDemo({ historia, respuestas, capitulos, alTexto, signal })
  }

  const escribeCapitulo = respuestas >= (prueba ? 4 : 3)
  let res
  try {
    res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse', {
      method: 'POST',
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY,
        'Content-Type': 'application/json',
        'Api-Revision': '2026-05-20',
      },
      body: JSON.stringify({
        model: MODELO(),
        stream: true,
        // La conversación la guarda la app; Google no se queda con nada
        store: false,
        // La nota de la etapa va con las instrucciones fijas
        system_instruction: `${SISTEMA}\n\nNota del sistema para este turno: ${nota}`,
        // Las preguntas son cortas; los capítulos piensan un poco más.
        generation_config: { thinking_level: escribeCapitulo ? 'medium' : 'low' },
        input: [
          { type: 'user_input', content: ABRE },
          ...historia.map((m) =>
            m.rol === 'user'
              ? { type: 'user_input', content: m.texto }
              : { type: 'model_output', content: [{ type: 'text', text: m.texto }] },
          ),
        ],
      }),
      signal,
    })
  } catch (err) {
    if (signal?.aborted) throw err
    throw Object.assign(new Error('conexion'), { cause: err })
  }
  if (!res.ok) throw Object.assign(new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: res.status })

  // Eventos SSE: el texto llega en step.delta con delta.type «text»
  let texto = ''
  let pendiente = ''
  const decoder = new TextDecoder()
  for await (const parte of res.body) {
    pendiente += decoder.decode(parte, { stream: true })
    const lineas = pendiente.split('\n')
    pendiente = lineas.pop()
    for (const linea of lineas) {
      if (!linea.startsWith('data: ') || linea === 'data: [DONE]') continue
      const ev = JSON.parse(linea.slice(6))
      if (ev.event_type === 'step.delta' && ev.delta?.type === 'text') {
        texto += ev.delta.text
        alTexto(ev.delta.text)
      } else if (ev.event_type === 'error' || ev.error) {
        throw new Error(`gemini: ${JSON.stringify(ev.error ?? ev).slice(0, 300)}`)
      }
    }
  }
  if (!texto.trim()) throw new Error('rechazo')
  return texto
}

/** Lo que el usuario ve si algo falla, sin detalles técnicos. */
export function errorAmable(err) {
  if (err?.status === 401 || err?.status === 403) return 'La clave de Gemini no es válida. Revisa GEMINI_API_KEY.'
  if (err?.status === 429) return 'Luna está atendiendo muchos cuentos a la vez. Prueba de nuevo en un minuto.'
  if (err?.message === 'conexion') return 'No pude conectarme. Revisa tu internet y prueba otra vez.'
  if (err?.message === 'rechazo') return 'Luna no pudo escribir eso. Prueba contándolo de otra forma.'
  return 'Luna se distrajo un momento. Prueba otra vez.'
}

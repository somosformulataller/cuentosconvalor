// Modo demostración: sin GEMINI_API_KEY, Luna responde con un cuento de
// ejemplo armado con lo que escribió la mamá o el papá. Sirve para ver y
// probar la app; el cuento de verdad lo escribe Gemini.
import { TOTAL_CAPITULOS } from '../shared/formato.js'

const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

function nombreDe(texto) {
  const m =
    texto.match(/(?:se llama|llamad[oa]|nombre es)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)/i) ??
    texto.match(/\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\b/)
  return m ? m[1][0].toUpperCase() + m[1].slice(1) : 'Sol'
}

const corto = (t) => t.replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '').slice(0, 80)

function capituloDemo(n, nombre, valores, personajes) {
  const textos = {
    1: [
      `Había una vez alguien muy especial llamado ${nombre}, que vivía en una casita con ventanas redondas y un jardín lleno de girasoles.`,
      `Una mañana, mientras desayunaba, ${nombre} escuchó un ruidito en la puerta. Al abrirla encontró algo que no esperaba: ${personajes.charAt(0).toLowerCase() + personajes.slice(1)}. Todos lo miraban con ojos curiosos, como si llevaran mucho tiempo buscándolo.`,
      `"Necesitamos tu ayuda", dijeron a la vez. "Al otro lado del bosque de los colores, el arcoíris se ha quedado gris, y solo alguien con un corazón valiente puede devolverle su brillo."`,
      `${nombre} tragó saliva, se puso sus zapatos favoritos y dijo: "¡Vamos!". Y así empezó la aventura más bonita de su vida.`,
    ],
    2: [
      `El bosque de los colores era enorme. Los árboles susurraban canciones y las flores cambiaban de tono cada vez que alguien reía.`,
      `En el camino encontraron a un pequeño conejo que lloraba porque no alcanzaba las fresas más altas. ${nombre} se detuvo. Tenían prisa, pero recordó algo importante: ${valores}.`,
      `Así que se subió a una piedra, estiró los brazos y bajó las fresas una por una. El conejo sonrió tanto que sus orejas se pusieron rosadas, y en ese mismo instante, una franja roja apareció en el cielo gris.`,
      `"¿Lo vieron?", gritó ${nombre}. Sus amigos asintieron, asombrados. Cada buena acción devolvía un color al arcoíris.`,
    ],
    3: [
      `Más adelante llegaron a un río de agua brillante, pero el puente estaba roto. Nadie sabía cómo cruzar, y por un momento todos se sintieron tristes.`,
      `${nombre} respiró hondo. "Si trabajamos juntos, podemos lograrlo", dijo. Cada uno buscó ramas, hojas grandes y piedras planas, y poco a poco construyeron un puente nuevo.`,
      `Cuando por fin cruzaron, se abrazaron muy fuerte. Y allá arriba, el arcoíris ganó tres colores más: el naranja, el amarillo y el verde.`,
      `Ya solo faltaban dos colores, y la cima de la montaña estaba cerca.`,
    ],
    4: [
      `En la cima de la montaña vivía una nube pequeñita que estaba muy sola. Era ella quien, sin querer, había guardado los últimos colores del arcoíris, porque pensaba que nadie quería jugar con ella.`,
      `${nombre} se sentó a su lado y le habló con dulzura. Le contó del conejo, del río y del puente, y la invitó a jugar con todos. La nube sonrió por primera vez, y de ella salieron el azul y el violeta.`,
      `El arcoíris brilló completo sobre el bosque, y todos los animales salieron a celebrar. Esa noche, ya en su cama, ${nombre} cerró los ojos feliz.`,
      `Había aprendido que los gestos pequeños, hechos con cariño, son capaces de llenar el mundo de colores.`,
    ],
  }
  const titulos = { 1: 'Una visita inesperada', 2: 'El bosque de los colores', 3: 'El puente de todos', 4: 'La nube que guardaba colores' }
  return { titulo: titulos[n], texto: textos[n].join('\n\n') }
}

function armar({ historia, respuestas, capitulos }) {
  const delPapa = historia.filter((m) => m.rol === 'user').map((m) => m.texto)
  const nombre = nombreDe(delPapa[0] ?? '')
  if (respuestas === 1) {
    return `<mensaje>¡Qué lindo conocer a ${nombre}! 💛 Ya me lo imagino como protagonista.\n\nAhora dime, ¿qué valores quieres reforzar con este cuento? Por ejemplo: compartir, la valentía, decir la verdad o la paciencia.</mensaje>`
  }
  if (respuestas === 2) {
    return `<mensaje>Me encanta: ${corto(delPapa[1] ?? 'esos valores')}. Vamos a sembrarlos con mucho cariño. 🌱\n\n¿Qué personajes te gustaría en la historia? Puede ser un dragón que no sabe volar, su perrito o una abuela astronauta.</mensaje>`
  }
  const valores = corto(delPapa[1] ?? 'compartir')
  const personajes = corto(delPapa[2] ?? 'un dragón amable')
  const n = Math.min(capitulos + 1, TOTAL_CAPITULOS)
  const { titulo, texto } = capituloDemo(n, nombre, valores, personajes)
  const cabeza =
    n === 1
      ? `<mensaje>¡Aquí empieza el cuento de ${nombre}! ✨</mensaje>\n<titulo>${nombre} y el arcoíris perdido</titulo>\n<para>${nombre}</para>\n<valores>${valores}</valores>\n`
      : `<mensaje>${capitulos >= TOTAL_CAPITULOS ? 'Lo reescribí con lo que me dijiste.' : '¡Seguimos!'}</mensaje>\n`
  const pregunta =
    n === TOTAL_CAPITULOS
      ? '¡El cuento está listo! Ya puedes leerlo completo y escucharlo. Si quieres cambiar algo, dime.'
      : '¿Te gusta cómo va? ¿Seguimos o quieres cambiar algo?'
  return `${cabeza}<capitulo numero="${n}" titulo="${titulo}">\n${texto}\n</capitulo>\n<pregunta>${pregunta}</pregunta>`
}

export async function respuestaDemo({ historia, respuestas, capitulos, alTexto, signal }) {
  const texto = armar({ historia, respuestas, capitulos })
  await pausa(500)
  // Llega de a pedacitos, como si se estuviera escribiendo.
  for (let i = 0; i < texto.length; i += 14) {
    if (signal?.aborted) break
    alTexto(texto.slice(i, i + 14))
    await pausa(18)
  }
  return texto
}

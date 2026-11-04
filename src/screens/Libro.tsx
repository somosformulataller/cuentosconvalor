import { useEffect, useState } from 'preact/hooks'
import { api, type Capitulo, type Cuento } from '../lib/api'
import { detener, narrar, pausarOSeguir, voz } from '../lib/narrar'
import { Cargando } from '../ui/Cargando'
import { Luna } from '../ui/Luna'

/* El cuento terminado: la portada, el botón grande para escucharlo entero
   con la voz de Luna y los capítulos para leer, cada uno con su botón. */

export function Libro({ id }: { id: number }) {
  const [datos, setDatos] = useState<{ cuento: Cuento; capitulos: Capitulo[] } | null>(null)
  const [error, setError] = useState('')
  const estado = voz.use()

  useEffect(() => {
    api.cuento(id, 'libro').then(setDatos).catch((e) => setError((e as Error).message))
    return () => detener()
  }, [id])

  if (error) {
    return (
      <main class="vacio">
        <p>{error}</p>
        <a class="boton boton--principal" href="/cuentos">Ver mis cuentos</a>
      </main>
    )
  }
  if (!datos) return <Cargando texto="Abriendo el libro…" />
  const { cuento, capitulos } = datos
  const sonandoAqui = estado.cuentoId === id && estado.fase !== 'quieto'
  const valores = (cuento.valores ?? '').split(',').map((v) => v.trim()).filter(Boolean)

  return (
    <>
      <header class="barra barra--libro">
        <a href={`/cuento/${id}`} class="boton boton--suave boton--chico">← Conversación</a>
        <a href="/cuentos" class="boton boton--suave boton--chico">📚 Mis cuentos</a>
      </header>
      <main class="libro">
        <section class="portada">
          <span class="portada__estrellas" aria-hidden="true">✦ ✧ ✦</span>
          <Luna size={72} />
          <h1>{cuento.titulo ?? 'Tu cuento'}</h1>
          {cuento.para && <p class="portada__para">Un cuento para {cuento.para}</p>}
          {valores.length > 0 && (
            <ul class="portada__valores" aria-label="Valores">
              {valores.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          )}
          {capitulos.length > 0 && (
            <div class="portada__voz">
              {sonandoAqui ? (
                <>
                  <button type="button" class="boton boton--principal boton--grande" onClick={pausarOSeguir}>
                    {estado.fase === 'pausa' ? '▶ Seguir escuchando' : estado.fase === 'cargando' ? '⏳ Preparando la voz…' : '⏸ Pausar'}
                  </button>
                  <button type="button" class="boton boton--suave boton--chico" onClick={detener}>⏹ Parar</button>
                  <p class="portada__ahora">Sonando: capítulo {estado.numero}</p>
                </>
              ) : (
                <button type="button" class="boton boton--principal boton--grande" onClick={() => narrar(id, capitulos, capitulos[0]!.numero)}>
                  🔊 Escuchar el cuento
                </button>
              )}
            </div>
          )}
        </section>

        {capitulos.map((c) => {
          const este = estado.cuentoId === id && estado.numero === c.numero && estado.fase !== 'quieto'
          return (
            <article key={c.numero} class={`pagina pagina--${((c.numero - 1) % 4) + 1}${este ? ' pagina--sonando' : ''}`}>
              <p class="pagina__numero">Capítulo {c.numero}</p>
              <h2 class="pagina__titulo">{c.titulo}</h2>
              <div class="pagina__texto">
                {c.texto.split(/\n\s*\n/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              <button
                type="button"
                class="boton boton--suave boton--chico pagina__oir"
                onClick={() => (este ? pausarOSeguir() : narrar(id, capitulos, c.numero, true))}
              >
                {este ? (estado.fase === 'pausa' ? '▶ Seguir' : estado.fase === 'cargando' ? '⏳ Preparando la voz…' : '⏸ Pausar') : '🔊 Escuchar este capítulo'}
              </button>
            </article>
          )
        })}

        <p class="libro__fin">Fin 🌙</p>
      </main>
    </>
  )
}

import { Fragment } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { leerRespuesta, TOTAL_CAPITULOS } from '../../shared/formato.js'
import { api, responder, type Capitulo, type Cuento, type Mensaje } from '../lib/api'
import { ir } from '../lib/router'
import { narrar, pausarOSeguir, voz } from '../lib/narrar'
import { Cargando } from '../ui/Cargando'
import { Luna } from '../ui/Luna'
import { Menu } from '../ui/Menu'

/* ───────────────────────────────────────────────────────────────────────────
   El chat con Luna. Ella pregunta, en orden: cuéntame de tu hijo, qué valores
   quieres reforzar y qué personajes te gustaría. Con eso escribe el cuento
   capítulo por capítulo: después de cada uno, la mamá o el papá dice si
   sigue o si quiere cambiar algo. Al terminar, el cuento completo se lee y
   se escucha en "el libro" (Libro.tsx).
   ─────────────────────────────────────────────────────────────────────────── */

const PASOS = ['Tu hijo', 'Valores', 'Personajes', 'El cuento']

const SUGERENCIAS: Record<number, string[]> = {
  1: ['Compartir', 'Valentía', 'Decir la verdad', 'Paciencia', 'Amabilidad', 'Ordenar sus cosas'],
  2: ['Un dragón amable', 'Su mascota', 'Un hada', 'Un robot', 'Sus abuelos', 'Un unicornio'],
}

const alFinal = (suave = true) =>
  requestAnimationFrame(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: suave ? 'smooth' : 'instant' }))

export function Chat({ id }: { id: number }) {
  const [cuento, setCuento] = useState<Cuento | null>(null)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [capitulos, setCapitulos] = useState<Capitulo[]>([])
  const [error, setError] = useState('')
  const [escribiendo, setEscribiendo] = useState<string | null>(null) // lo que va llegando de Luna
  const [borrador, setBorrador] = useState('')
  const entrada = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    api
      .cuento(id)
      .then((d) => {
        setCuento(d.cuento)
        setMensajes(d.mensajes)
        setCapitulos(d.capitulos)
        alFinal(false)
      })
      .catch((e) => setError((e as Error).message))
  }, [id])

  const respuestas = mensajes.filter((m) => m.rol === 'user').length
  const ocupado = escribiendo !== null
  const paso = Math.min(respuestas, 3)

  async function enviar(texto: string) {
    texto = texto.trim()
    if (!texto || ocupado) return
    setError('')
    setBorrador('')
    if (entrada.current) entrada.current.style.height = ''
    const mio: Mensaje = { id: -Date.now(), rol: 'user', texto }
    setMensajes((l) => [...l, mio])
    setEscribiendo('')
    alFinal()
    let raw = ''
    let fallo = ''
    await responder(id, texto, (ev) => {
      if (ev.type === 'text') {
        raw += ev.text
        setEscribiendo(raw)
        if (innerHeight + scrollY >= document.documentElement.scrollHeight - 220) alFinal(false)
      } else if (ev.type === 'done') {
        setCuento(ev.cuento)
        setCapitulos(ev.capitulos)
      } else {
        fallo = ev.reason
      }
    })
    if (fallo) {
      // Lo que escribió vuelve a la caja para reintentar.
      setMensajes((l) => l.filter((m) => m.id !== mio.id))
      setBorrador(texto)
      setError(fallo)
    } else {
      setMensajes((l) => [...l, { id: -Date.now() - 1, rol: 'assistant', texto: raw }])
    }
    setEscribiendo(null)
    alFinal()
  }

  async function nuevo() {
    const { id } = await api.nuevo()
    ir(`/cuento/${id}`)
  }

  if (!cuento && !error) return <Cargando texto="Abriendo tu cuento…" />
  if (!cuento) {
    return (
      <main class="vacio">
        <p>{error}</p>
        <a class="boton boton--principal" href="/cuentos">Ver mis cuentos</a>
      </main>
    )
  }

  const ultimo = mensajes[mensajes.length - 1]
  const ultimoLeido = ultimo?.rol === 'assistant' ? leerRespuesta(ultimo.texto) : null
  const trasCapitulo = !ocupado && !!ultimoLeido?.capitulo
  const listo = cuento.estado === 'listo'

  return (
    <>
      <header class="barra">
        <a href="/cuentos" class="barra__titulo" aria-label="Mis cuentos">
          <Luna size={38} />
          <span>
            <strong>Luna</strong>
            <small>{ocupado ? 'escribiendo…' : 'tu cuentacuentos'}</small>
          </span>
        </a>
        <Menu alNuevo={nuevo} />
      </header>

      <nav class="pasos" aria-label="Cómo va tu cuento">
        {PASOS.map((p, i) => (
          <span key={p} class={`pasos__paso${i < paso || listo ? ' hecho' : ''}${i === paso && !listo ? ' ahora' : ''}`}>
            <i>{i < paso || listo ? '✓' : i + 1}</i>
            {i === 3 && capitulos.length > 0 ? `${p} ${capitulos.length}/${TOTAL_CAPITULOS}` : p}
          </span>
        ))}
      </nav>

      <main class="chat">
        <ol class="chat__lista">
          {mensajes.map((m) => (
            <Fragment key={m.id}>{m.rol === 'user' ? <DelPapa texto={m.texto} /> : <DeLuna raw={m.texto} cuentoId={id} capitulos={capitulos} />}</Fragment>
          ))}
          {escribiendo !== null &&
            (escribiendo ? <DeLuna raw={escribiendo} cuentoId={id} capitulos={capitulos} enVivo /> : <Pensando />)}
        </ol>

        {listo && !ocupado && (
          <section class="listo">
            <span class="listo__brillo" aria-hidden="true">🌟</span>
            <h2>¡Tu cuento está listo!</h2>
            <p>{cuento.titulo ? `«${cuento.titulo}»` : 'Ya puedes leerlo'}, con sus {TOTAL_CAPITULOS} capítulos y la voz de Luna.</p>
            <a href={`/cuento/${id}/libro`} class="boton boton--principal boton--grande">📖 Leer y escuchar el cuento</a>
            <button type="button" class="boton boton--suave" onClick={nuevo}>✨ Crear otro cuento</button>
          </section>
        )}

        {error && <p class="aviso chat__aviso" role="alert">{error}</p>}

        <div class="chat__abajo">
          {!ocupado && SUGERENCIAS[respuestas] && (
            <div class="chips" aria-label="Ideas">
              {SUGERENCIAS[respuestas].map((s) => (
                <button
                  type="button"
                  key={s}
                  class="chip"
                  onClick={() => {
                    setBorrador((b) => (b.trim() ? `${b.trim().replace(/[.,]$/, '')}, ${s.toLowerCase()}` : s))
                    entrada.current?.focus()
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {trasCapitulo && !listo && (
            <div class="chips">
              <button type="button" class="chip chip--fuerte" onClick={() => enviar('¡Me encanta! Sigue con el próximo capítulo.')}>
                ¡Me encanta, sigue! ✨
              </button>
              <button
                type="button"
                class="chip"
                onClick={() => {
                  setBorrador('Quiero cambiar ')
                  entrada.current?.focus()
                }}
              >
                Quiero cambiar algo ✏️
              </button>
            </div>
          )}
          <Caja
            entrada={entrada}
            valor={borrador}
            setValor={setBorrador}
            ocupado={ocupado}
            placeholder={
              respuestas === 0
                ? 'Ej.: Se llama Sofía, tiene 5 años y ama los dinosaurios'
                : respuestas === 1
                  ? '¿Qué valores quieres reforzar?'
                  : respuestas === 2
                    ? '¿Qué personajes te gustaría?'
                    : listo
                      ? '¿Quieres cambiar algo del cuento?'
                      : 'Escribe a Luna…'
            }
            alEnviar={() => enviar(borrador)}
          />
        </div>
      </main>
    </>
  )
}

function DelPapa({ texto }: { texto: string }) {
  return (
    <li class="msg msg--papa">
      <p class="burbuja">{texto}</p>
    </li>
  )
}

function DeLuna({ raw, cuentoId, capitulos, enVivo = false }: { raw: string; cuentoId: number; capitulos: Capitulo[]; enVivo?: boolean }) {
  const r = leerRespuesta(raw)
  return (
    <>
      {r.mensaje && (
        <li class="msg msg--luna">
          <Luna size={34} />
          <p class="burbuja">{r.mensaje}</p>
        </li>
      )}
      {r.capitulo && <Pagina cap={r.capitulo} titulo={r.capitulo.numero === 1 ? r.titulo : ''} cuentoId={cuentoId} capitulos={capitulos} enVivo={enVivo && !r.capitulo.completo} />}
      {r.pregunta && (
        <li class="msg msg--luna">
          <Luna size={34} />
          <p class="burbuja">{r.pregunta}</p>
        </li>
      )}
      {enVivo && !r.mensaje && !r.capitulo && <Pensando />}
    </>
  )
}

/** Un capítulo dentro del chat, como una página del libro. */
function Pagina({
  cap,
  titulo,
  cuentoId,
  capitulos,
  enVivo,
}: {
  cap: { numero: number; titulo: string; texto: string }
  titulo: string
  cuentoId: number
  capitulos: Capitulo[]
  enVivo: boolean
}) {
  const estado = voz.use()
  // Se escucha la versión guardada (la última) del capítulo.
  const guardado = capitulos.find((c) => c.numero === cap.numero && c.texto === cap.texto)
  const suena = estado.cuentoId === cuentoId && estado.numero === cap.numero && estado.fase !== 'quieto'
  return (
    <li class={`pagina pagina--${((cap.numero - 1) % 4) + 1}`}>
      {titulo && <p class="pagina__cuento">{titulo}</p>}
      <p class="pagina__numero">Capítulo {cap.numero}</p>
      <h3 class="pagina__titulo">{cap.titulo || '…'}</h3>
      <div class="pagina__texto">
        {cap.texto.split(/\n\s*\n/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {enVivo && <span class="cursor" aria-hidden="true" />}
      </div>
      {guardado && !enVivo && (
        <button
          type="button"
          class="boton boton--suave boton--chico pagina__oir"
          onClick={() => (suena ? pausarOSeguir() : narrar(cuentoId, capitulos, cap.numero, true))}
        >
          {suena ? (estado.fase === 'pausa' ? '▶ Seguir' : estado.fase === 'cargando' ? '⏳ Preparando la voz…' : '⏸ Pausar') : '🔊 Escuchar este capítulo'}
        </button>
      )}
    </li>
  )
}

function Pensando() {
  return (
    <li class="msg msg--luna">
      <Luna size={34} />
      <p class="burbuja burbuja--pensando" role="status" aria-label="Luna está escribiendo">
        <span />
        <span />
        <span />
      </p>
    </li>
  )
}

function Caja({
  entrada,
  valor,
  setValor,
  ocupado,
  placeholder,
  alEnviar,
}: {
  entrada: { current: HTMLTextAreaElement | null }
  valor: string
  setValor: (v: string) => void
  ocupado: boolean
  placeholder: string
  alEnviar: () => void
}) {
  const [dictando, setDictando] = useState(false)
  const reconocer = useRef<any>(null)
  const Reconocimiento = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition

  useEffect(() => {
    const el = entrada.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`
  }, [valor])

  function dictar() {
    if (dictando) return reconocer.current?.stop()
    const r = new Reconocimiento()
    r.lang = 'es-419'
    r.interimResults = true
    r.continuous = false
    const antes = valor.trim()
    r.onresult = (e: any) => {
      const dicho = Array.from(e.results as ArrayLike<any>).map((x: any) => x[0].transcript).join('')
      setValor(antes ? `${antes} ${dicho}` : dicho)
    }
    r.onend = () => setDictando(false)
    r.onerror = () => setDictando(false)
    reconocer.current = r
    setDictando(true)
    r.start()
  }

  return (
    <form
      class="caja"
      onSubmit={(e) => {
        e.preventDefault()
        alEnviar()
      }}
    >
      <textarea
        ref={entrada}
        rows={1}
        value={valor}
        placeholder={dictando ? 'Te escucho…' : placeholder}
        aria-label="Tu respuesta"
        onInput={(e) => setValor(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault()
            alEnviar()
          }
        }}
      />
      {Reconocimiento && !valor.trim() && !ocupado ? (
        <button type="button" class={`caja__boton${dictando ? ' caja__boton--escucha' : ''}`} onClick={dictar} aria-label={dictando ? 'Dejar de dictar' : 'Dictar con tu voz'}>
          🎙️
        </button>
      ) : (
        <button class="caja__boton" disabled={ocupado || !valor.trim()} aria-label="Enviar">
          {ocupado ? <span class="giro" /> : '➤'}
        </button>
      )}
    </form>
  )
}

// Leer el cuento en voz alta. Con la voz del servidor (Gemini u OpenAI TTS)
// suena un audio por capítulo; sin ella, la voz del propio teléfono (speechSynthesis).
// Los capítulos suenan uno detrás de otro, como un audiolibro.
import type { Capitulo } from './api'
import { crearStore } from './store'

export interface EstadoVoz {
  cuentoId: number | null
  numero: number | null
  fase: 'quieto' | 'cargando' | 'sonando' | 'pausa'
}

export const voz = crearStore<EstadoVoz>({ cuentoId: null, numero: null, fase: 'quieto' })

let conServidor = false
export function usarVozDelServidor(si: boolean) {
  conServidor = si
}

const audio = typeof Audio !== 'undefined' ? new Audio() : null
let cola: Capitulo[] = []
let cuentoActual = 0
let turno = 0 // invalida lo que estaba sonando al empezar otra cosa

function poner(e: Partial<EstadoVoz>) {
  voz.set({ ...voz.get(), ...e })
}

/** Lee desde el capítulo `numero` hasta el final (o solo ese, con `solo`). */
export function narrar(cuentoId: number, capitulos: Capitulo[], numero: number, solo = false) {
  detener()
  const desde = capitulos.findIndex((c) => c.numero === numero)
  cola = solo ? capitulos.slice(desde, desde + 1) : capitulos.slice(Math.max(desde, 0))
  cuentoActual = cuentoId
  siguiente(++turno)
}

function siguiente(mio: number) {
  const cap = cola.shift()
  if (!cap || mio !== turno) return poner({ cuentoId: null, numero: null, fase: 'quieto' })
  poner({ cuentoId: cuentoActual, numero: cap.numero, fase: 'cargando' })
  if (conServidor && audio) {
    audio.src = `/api/cuentos/${cuentoActual}/audio/${cap.numero}?v=${cap.version}`
    audio.onplaying = () => mio === turno && poner({ fase: 'sonando' })
    audio.onended = () => siguiente(mio)
    // Si la voz del servidor falla, sigue con la del teléfono.
    audio.onerror = () => mio === turno && hablar(cap, mio)
    audio.play().catch(() => mio === turno && hablar(cap, mio))
  } else {
    hablar(cap, mio)
  }
}

function vozEnEspanol(): SpeechSynthesisVoice | undefined {
  const voces = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'))
  const preferida = (v: SpeechSynthesisVoice) =>
    (/natural|online|neural|google/i.test(v.name) ? 2 : 0) + (/419|mx|us|co|ve|ar/i.test(v.lang) ? 1 : 0)
  return voces.sort((a, b) => preferida(b) - preferida(a))[0]
}

function hablar(cap: Capitulo, mio: number) {
  if (typeof speechSynthesis === 'undefined') return poner({ fase: 'quieto' })
  const partes = cap.texto.split(/\n\s*\n/).filter((p) => p.trim())
  const v = vozEnEspanol()
  partes.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p)
    u.lang = v?.lang ?? 'es-ES'
    if (v) u.voice = v
    u.rate = 0.92
    u.pitch = 1.05
    if (i === 0) u.onstart = () => mio === turno && poner({ fase: 'sonando' })
    if (i === partes.length - 1) u.onend = () => mio === turno && siguiente(mio)
    speechSynthesis.speak(u)
  })
}

export function pausarOSeguir() {
  const { fase } = voz.get()
  if (conServidor && audio && audio.src && !audio.ended) {
    if (fase === 'pausa') void audio.play()
    else audio.pause()
  } else if (typeof speechSynthesis !== 'undefined') {
    if (fase === 'pausa') speechSynthesis.resume()
    else speechSynthesis.pause()
  }
  poner({ fase: fase === 'pausa' ? 'sonando' : 'pausa' })
}

export function detener() {
  turno++
  cola = []
  if (audio) {
    audio.pause()
    audio.onended = audio.onerror = audio.onplaying = null
    audio.removeAttribute('src')
  }
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  poner({ cuentoId: null, numero: null, fase: 'quieto' })
}

// Algunos navegadores cargan las voces tarde.
if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices()

// La voz que narra el cuento: un audio por capítulo guardado en data/audio.
// - Con GEMINI_API_KEY narra Gemini TTS (WAV, 24 kHz).
// - Si no, con OPENAI_API_KEY narra OpenAI TTS (MP3).
// - Sin ninguna, la app usa la voz del propio teléfono.
import { existsSync } from 'node:fs'
import { writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR } from './db.mjs'

const proveedor = () => (process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : null)
export const hayVoz = () => !!proveedor()

const INSTRUCCIONES =
  'Eres una cuentacuentos que lee un cuento infantil en español latinoamericano. Voz cálida, dulce y tranquila, ' +
  'ritmo pausado, con pequeñas pausas entre párrafos y un tono expresivo en los diálogos, como al leer antes de dormir.'

// Gemini: el estilo va aparte del texto, que se lee tal cual
const ESTILO_GEMINI =
  'Cuentacuentos en español latinoamericano leyendo antes de dormir: cálida, dulce y tranquila, ritmo pausado, expresiva en los diálogos'

const enCurso = new Map()

export function rutaAudio(cuentoId, cap) {
  const ext = proveedor() === 'gemini' ? 'wav' : 'mp3'
  return path.join(DATA_DIR, 'audio', `${cuentoId}-${cap.numero}-v${cap.version}.${ext}`)
}

export const tipoAudio = (ruta) => (ruta.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg')

/** El audio del capítulo; lo genera una sola vez por versión del texto. */
export function audioDe(cuentoId, cap) {
  const ruta = rutaAudio(cuentoId, cap)
  if (existsSync(ruta)) return Promise.resolve(ruta)
  if (!enCurso.has(ruta)) {
    const texto = `Capítulo ${cap.numero}. ${cap.titulo}.\n\n${cap.texto}`
    const p = (proveedor() === 'gemini' ? conGemini(texto) : conOpenAI(texto))
      .then((audio) => guardar(audio, ruta))
      .finally(() => enCurso.delete(ruta))
    enCurso.set(ruta, p)
  }
  return enCurso.get(ruta)
}

async function guardar(audio, ruta) {
  const tmp = `${ruta}.tmp`
  await writeFile(tmp, audio)
  await rename(tmp, ruta)
  return ruta
}

async function conGemini(texto) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
      input: [
        {
          type: 'user_input',
          content: [
            {
              type: 'text',
              text: texto.slice(0, 4000),
              annotations: [{ type: 'speech_metadata', style: ESTILO_GEMINI }],
            },
          ],
        },
      ],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: process.env.GEMINI_TTS_VOICE || 'Sulafat' }] },
    }),
  })
  if (!res.ok) throw new Error(`gemini tts ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const json = await res.json()
  const datos = (json.steps ?? []).flatMap((s) => s.content ?? []).find((c) => c?.data)?.data
  if (!datos) throw new Error(`gemini tts sin audio: ${JSON.stringify(json).slice(0, 300)}`)
  const audio = Buffer.from(datos, 'base64')
  // Lo normal es un WAV completo; si llega PCM crudo se le pone la cabecera
  return audio.subarray(0, 4).toString('ascii') === 'RIFF' ? audio : wav(audio)
}

/** Cabecera WAV para PCM de 16 bits, mono, 24 kHz */
function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

async function conOpenAI(texto) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: process.env.OPENAI_TTS_VOICE || 'coral',
      input: texto.slice(0, 4000),
      instructions: INSTRUCCIONES,
      response_format: 'mp3',
    }),
  })
  if (!res.ok) throw new Error(`openai tts ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return Buffer.from(await res.arrayBuffer())
}

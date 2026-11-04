// La voz que narra el cuento: un MP3 por capítulo, guardado en el bucket
// privado «audios» de Supabase Storage.
// - Con GEMINI_API_KEY narra Gemini TTS (llega en WAV y se pasa a MP3).
// - Si no, con OPENAI_API_KEY narra OpenAI TTS (MP3).
// - Sin ninguna, la app usa la voz del propio teléfono.
import { Mp3Encoder } from '@breezystack/lamejs'
import { db, q } from './db.mjs'

const proveedor = () => (process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : null)
export const hayVoz = () => !!proveedor() && !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SECRET_KEY

const INSTRUCCIONES =
  'Eres una cuentacuentos que lee un cuento infantil en español latinoamericano. Voz cálida, dulce y tranquila, ' +
  'ritmo pausado, con pequeñas pausas entre párrafos y un tono expresivo en los diálogos, como al leer antes de dormir.'

// Gemini: el estilo va aparte del texto, que se lee tal cual
const ESTILO_GEMINI =
  'Cuentacuentos en español latinoamericano leyendo antes de dormir: cálida, dulce y tranquila, ritmo pausado, expresiva en los diálogos'

const BUCKET = 'audios'
const enCurso = new Map()

/**
 * Enlace firmado (vence en un día) al MP3 del capítulo. Lo genera una sola vez
 * por versión del texto. `cap` es la fila de capitulos.
 */
export async function audioDe(cuentoId, cap) {
  if (cap.audio && cap.audio_version === cap.version) return firmar(cap.audio)
  const ruta = `${cuentoId}/${cap.numero}-v${cap.version}.mp3`
  if (!enCurso.has(ruta)) {
    const p = preparar(cuentoId, cap, ruta).finally(() => enCurso.delete(ruta))
    enCurso.set(ruta, p)
  }
  await enCurso.get(ruta)
  return firmar(ruta)
}

async function preparar(cuentoId, cap, ruta) {
  const texto = `Capítulo ${cap.numero}. ${cap.titulo}.\n\n${cap.texto}`
  const mp3 = proveedor() === 'gemini' ? aMp3(await conGemini(texto)) : await conOpenAI(texto)
  await q(db().storage.from(BUCKET).upload(ruta, mp3, { contentType: 'audio/mpeg', upsert: true, cacheControl: '31536000' }))
  // Solo si el texto no cambió mientras se narraba
  await q(
    db()
      .from('capitulos')
      .update({ audio: ruta, audio_version: cap.version })
      .match({ cuento_id: cuentoId, numero: cap.numero, version: cap.version }),
  )
}

async function firmar(ruta) {
  const { signedUrl } = await q(db().storage.from(BUCKET).createSignedUrl(ruta, 86400))
  return signedUrl
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
  return Buffer.from(datos, 'base64')
}

/** WAV (o PCM crudo) de 16 bits mono → MP3 de 64 kbps, ~10 veces más liviano */
export function aMp3(audio) {
  let pcm = audio
  let rate = 24000
  if (audio.subarray(0, 4).toString('ascii') === 'RIFF') {
    rate = audio.readUInt32LE(24)
    // Busca el bloque «data» (puede haber otros antes)
    let i = 12
    while (i + 8 <= audio.length) {
      const id = audio.subarray(i, i + 4).toString('ascii')
      const largo = audio.readUInt32LE(i + 4)
      if (id === 'data') {
        pcm = audio.subarray(i + 8, Math.min(i + 8 + largo, audio.length))
        break
      }
      i += 8 + largo + (largo % 2)
    }
  }
  const muestras = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2))
  const enc = new Mp3Encoder(1, rate, 64)
  const partes = []
  for (let i = 0; i < muestras.length; i += 1152 * 20) {
    partes.push(Buffer.from(enc.encodeBuffer(muestras.subarray(i, i + 1152 * 20))))
  }
  partes.push(Buffer.from(enc.flush()))
  return Buffer.concat(partes)
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

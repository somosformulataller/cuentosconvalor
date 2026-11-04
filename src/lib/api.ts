// Las llamadas a /api. La sesión viaja en una cookie HttpOnly.

export interface Usuario { id: number; nombre: string; email: string }
export interface Cuento {
  id: number
  titulo: string | null
  para: string | null
  valores: string | null
  estado: 'creando' | 'listo'
  actualizado: string
  capitulos?: number
}
export interface Mensaje { id: number; rol: 'user' | 'assistant'; texto: string; creado?: string }
export interface Capitulo { numero: number; titulo: string; texto: string; version: number }
export interface Config { ia: boolean; voz: boolean; capitulos: number }

async function pedir<T>(metodo: string, ruta: string, datos?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: datos ? { 'Content-Type': 'application/json' } : undefined,
      body: datos ? JSON.stringify(datos) : undefined,
    })
  } catch {
    throw new Error('No hay conexión. Revisa tu internet.')
  }
  const cuerpo = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(cuerpo.error ?? 'Algo falló. Prueba otra vez.')
  return cuerpo as T
}

export const api = {
  config: () => pedir<Config>('GET', '/config'),
  yo: () => pedir<{ usuario: Usuario | null }>('GET', '/yo'),
  entrar: (email: string, clave: string) => pedir<{ usuario: Usuario }>('POST', '/entrar', { email, clave }),
  registro: (nombre: string, email: string, clave: string) =>
    pedir<{ usuario: Usuario }>('POST', '/registro', { nombre, email, clave }),
  salir: () => pedir('POST', '/salir'),
  cuentos: () => pedir<{ cuentos: Cuento[] }>('GET', '/cuentos'),
  nuevo: () => pedir<{ id: number }>('POST', '/cuentos'),
  cuento: (id: number) => pedir<{ cuento: Cuento; mensajes: Mensaje[]; capitulos: Capitulo[] }>('GET', `/cuentos/${id}`),
  borrar: (id: number) => pedir('DELETE', `/cuentos/${id}`),
}

export type Evento =
  | { type: 'text'; text: string }
  | { type: 'done'; cuento: Cuento; capitulos: Capitulo[] }
  | { type: 'error'; reason: string }

/** Manda la respuesta y va recibiendo lo que escribe Luna (NDJSON). */
export async function responder(id: number, texto: string, alEvento: (ev: Evento) => void) {
  let res: Response
  try {
    res = await fetch(`/api/cuentos/${id}/mensaje`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    })
  } catch {
    return alEvento({ type: 'error', reason: 'No hay conexión. Revisa tu internet.' })
  }
  if (!res.ok || !res.body) {
    const cuerpo = await res.json().catch(() => ({}))
    return alEvento({ type: 'error', reason: cuerpo.error ?? 'Algo falló. Prueba otra vez.' })
  }
  const lector = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let resto = ''
  for (;;) {
    const { value, done } = await lector.read()
    if (done) break
    resto += value
    const lineas = resto.split('\n')
    resto = lineas.pop() ?? ''
    for (const l of lineas) if (l.trim()) alEvento(JSON.parse(l))
  }
}

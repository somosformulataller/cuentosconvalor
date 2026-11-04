// La base: Supabase con la clave secreta (SUPABASE_URL + SUPABASE_SECRET_KEY).
// Las tablas están en supabase/migrations/, que Supabase aplica solo al subir
// a main. Tienen RLS sin políticas: solo entra esta clave.
import { createClient } from '@supabase/supabase-js'

let cliente = null

/** El cliente de Supabase, creado la primera vez (el .env ya se leyó). */
export function db() {
  if (!cliente) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY')
    cliente = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return cliente
}

/** Espera la consulta y devuelve `data`; si Supabase da error, lo lanza. */
export async function q(consulta) {
  const { data, error } = await consulta
  if (error) throw Object.assign(new Error(`supabase: ${error.message}`), { code: error.code })
  return data
}

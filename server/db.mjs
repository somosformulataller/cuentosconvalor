// La base: Postgres de Supabase por conexión directa (DATABASE_URL, el pooler
// en modo transacción, puerto 6543). Las tablas están en
// supabase/migrations/, que Supabase aplica solo al subir a main.
import postgres from 'postgres'

let conexion = null

/** sql`...` con la conexión creada la primera vez (el .env ya se leyó). */
export const sql = (...args) => {
  if (!conexion) {
    if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL')
    conexion = postgres(process.env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20 })
  }
  return conexion(...args)
}

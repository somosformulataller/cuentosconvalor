// Registro de actividad: qué hace cada mamá o papá y cuándo, para ver en el
// superadmin si usan la app. Nunca lanza ni frena la petición.
import { db } from './db.mjs'

export async function evento(usuarioId, tipo, detalle = null) {
  if (!usuarioId) return
  try {
    await db().from('eventos').insert({ usuario_id: usuarioId, tipo, detalle })
  } catch (err) {
    console.error('[eventos]', err)
  }
}

/** «Abrió la app»: como mucho uno cada 30 min por usuario (si no, serían cientos). */
export async function visita(usuarioId) {
  try {
    const desde = new Date(Date.now() - 30 * 60_000).toISOString()
    const { count } = await db()
      .from('eventos')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', usuarioId)
      .gte('creado', desde)
    if (!count) await evento(usuarioId, 'abrio_app')
  } catch {}
}

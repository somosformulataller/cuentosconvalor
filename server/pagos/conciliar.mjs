// Conciliación de los pagos contra el estado de cuenta del banco. Adaptada de
// Formula Taller (src/lib/pagos/conciliar.ts). Una pasada:
//   1. LEER      el estado de cuenta guardado (gratis).
//   2. LATIDO    solo si falta algún pago reciente y nos toca el turno: una
//                entrada al banco para traer lo nuevo.
//   3. EMPAREJAR cada pago «verificando» con su movimiento.
//   4. RECLAMAR  el movimiento en el banco (usado) y APROBAR el pago.
// El sistema NUNCA rechaza solo: lo que no cuadra queda «verificando», con el
// motivo, para que lo decida una persona en el superadmin.
import { db, q } from '../db.mjs'
import { evento } from '../eventos.mjs'
import {
  bancoConfigurado, buscarPorReferencia, diaCaracas, leerEstadoDeCuenta, reclamarMovimiento,
  refrescarEstadoDeCuenta, referenciaImposible,
} from './banco.mjs'
import {
  MINUTOS_ANTES_DE_REVISION, VENTANA_ANTES_MS, VENTANA_DESPUES_MS, bs, cola6, emparejar, sigueAutomatica, tolerancia,
  validacionActiva,
} from './reglas.mjs'

/** Solo los pagos de la última media hora justifican entrar al banco. */
const LATIDO_SI_MENOS_DE_MS = 30 * 60 * 1000

/** Movimientos que ya pagaron un pago nuestro (registro propio, sin depender del banco). */
async function movimientosTomados() {
  const filas = await q(
    db().from('pagos').select('bank_tx_id').eq('estado', 'aprobado').not('bank_tx_id', 'is', null)
      .gte('creado', new Date(Date.now() - 4 * 864e5).toISOString()).limit(1000),
  )
  return new Set(filas.map((f) => Number(f.bank_tx_id)))
}

/**
 * Una pasada. `op.origen`: 'cron' | 'usuario' | 'superadmin'. `op.pago`: solo
 * ese pago, aunque esté marcado para revisión (botón «Revalidar»). Nunca lanza.
 */
export async function conciliar(op = { origen: 'cron' }) {
  try {
    return await pasada(op)
  } catch (err) {
    console.error('[pagos]', err)
    return { ok: false, motivo: err?.message ?? 'error', pendientes: 0, aprobados: 0 }
  }
}

async function pasada(op) {
  if (!validacionActiva()) return { ok: false, motivo: 'validación automática apagada', pendientes: 0, aprobados: 0 }
  if (!bancoConfigurado()) return { ok: false, motivo: 'Bank API no configurada', pendientes: 0, aprobados: 0 }

  let consulta = db().from('pagos').select('*').eq('estado', 'verificando')
  if (op.pago) consulta = consulta.eq('id', op.pago)
  else consulta = consulta.gte('creado', new Date(Date.now() - VENTANA_ANTES_MS).toISOString())
  const filas = await q(consulta.order('creado').limit(60))
  const pendientes = filas.filter((p) => op.pago || sigueAutomatica(p.revision))
  if (!pendientes.length) return { ok: true, latido: 'no_hizo_falta', pendientes: 0, aprobados: 0 }

  let movs = await leerEstadoDeCuenta(200)

  // Latido: solo si algún pago reciente todavía no está en el estado de cuenta
  // y nadie de esta app entró al banco hace poco (lo comparten tres apps).
  const falta = pendientes.some(
    (p) =>
      (op.pago || Date.now() - Date.parse(p.creado) < LATIDO_SI_MENOS_DE_MS) &&
      !movs.some((m) => String(m.referencia).endsWith(cola6(p.referencia))),
  )
  let latido = 'no_hizo_falta'
  if (falta) {
    const { data: turno } = await db().rpc('tomar_turno_banco', { p_segundos: op.origen === 'usuario' ? 120 : 60 })
    if (turno === true) {
      latido = await refrescarEstadoDeCuenta(referenciaImposible(movs))
      movs = await leerEstadoDeCuenta(200)
    } else {
      latido = 'turno_ocupado'
    }
  }

  const tomados = await movimientosTomados()
  let aprobados = 0

  for (const p of pendientes) {
    await db().from('pagos').update({ intentos: p.intentos + 1, ultimo_intento: new Date().toISOString() }).eq('id', p.id)
    const r = emparejar(p, movs, tomados)

    if (r.estado === 'no_encontrado') {
      const esperandoDeMas = Date.now() - Date.parse(p.creado) > MINUTOS_ANTES_DE_REVISION * 60_000
      if (esperandoDeMas && p.revision !== 'no_aparece' && p.revision !== 'fuera_de_ventana') {
        // ¿Existe el pago pero con una fecha lejana? (pagó hace días y avisó hoy)
        const viejo = (await buscarPorReferencia(cola6(p.referencia))).find(
          (m) => m.tipo === 'CREDITO' && String(m.referencia).endsWith(cola6(p.referencia)),
        )
        await marcar(p, viejo ? 'fuera_de_ventana' : 'no_aparece',
          viejo
            ? `Hay un pago con esa referencia (${bs(viejo.monto)}, del ${diaCaracas(viejo.fecha)}${viejo.used ? ', ya usado' : ''}) fuera de la ventana de 24 h. Verificar la captura antes de aprobar.`
            : `Sin rastro en el banco tras ${MINUTOS_ANTES_DE_REVISION} min. Se sigue buscando solo durante 24 h.`,
          viejo)
      }
      continue
    }

    if (r.estado === 'revision') {
      await marcar(p, r.revision, r.detalle, r.movimiento)
      continue
    }

    tomados.add(r.movimiento.id)
    // Reclamar primero: si falla, no se aprueba nada y se reintenta luego
    if (!(await reclamarMovimiento(r.movimiento))) {
      await db().from('pagos').update({ nota: 'Pago encontrado; el banco no respondió al marcarlo como usado. Se reintenta solo.' })
        .eq('id', p.id).eq('estado', 'verificando')
      continue
    }
    const { data: ok, error } = await db().rpc('decidir_pago', {
      p_pago: p.id, p_estado: 'aprobado', p_origen: 'auto', p_admin: null, p_nota: r.nota ?? null, p_banco: r.movimiento,
    })
    if (error || !ok) {
      await marcar(p, 'reclamo',
        `Pago verificado y marcado como usado en el banco (ref ${r.movimiento.referencia}, ${bs(r.movimiento.monto)}), pero falló la aprobación${error ? `: ${error.message}` : ''}.`,
        r.movimiento)
      continue
    }
    aprobados++
    await evento(p.usuario_id, 'pago_aprobado', { pago: p.id, origen: 'auto', monto: r.movimiento.monto })
  }

  return { ok: true, latido, pendientes: pendientes.length, aprobados }
}

/** Deja el pago en «Por revisar» con su motivo, solo si sigue verificando. */
async function marcar(p, revision, nota, mov) {
  if (p.revision === revision && p.nota === nota) return
  await db().from('pagos').update({ revision, nota, ...(mov ? { banco: mov } : {}) }).eq('id', p.id).eq('estado', 'verificando')
}

/**
 * Al aprobar A MANO también se marca el pago como usado en el banco, para que
 * ninguna de las tres apps lo vuelva a tomar. Nunca bloquea: si no se puede,
 * se aprueba igual y se deja constancia.
 */
export async function reclamarPagoManual(p) {
  if (!validacionActiva() || !bancoConfigurado()) return { estado: 'apagado' }
  const cola = cola6(p.referencia)
  if (cola.length < 6) return { estado: 'ninguno' }
  const [movs, tomados] = await Promise.all([leerEstadoDeCuenta(200), movimientosTomados()])
  const t = Date.parse(p.creado)
  let cand = movs.filter((m) => {
    if (m.used || tomados.has(m.id) || m.tipo !== 'CREDITO' || !String(m.referencia).endsWith(cola)) return false
    const tm = Date.parse(m.fecha)
    return Number.isFinite(tm) && tm >= t - VENTANA_ANTES_MS && tm <= t + VENTANA_DESPUES_MS
  })
  if (cand.length > 1 && p.monto_bs !== null) {
    const e = Number(p.monto_bs)
    const ex = cand.filter((m) => Math.abs(m.monto - e) <= tolerancia(e))
    if (ex.length === 1) cand = ex
  }
  if (!cand.length) return { estado: 'ninguno' }
  if (cand.length > 1) return { estado: 'varios' }
  return (await reclamarMovimiento(cand[0])) ? { estado: 'reclamado', movimiento: cand[0] } : { estado: 'fallo' }
}

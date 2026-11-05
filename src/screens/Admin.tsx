import { useEffect, useState } from 'preact/hooks'
import { api, type Actividad, type AdminDetalle, type AdminEmbudo, type AdminPago, type AdminResumen, type AdminUsuario, type Movimiento } from '../lib/api'
import { formatoBs } from '../lib/suscripcion'
import { Logo } from '../ui/Logo'
import { Menu } from '../ui/Menu'

/* ───────────────────────────────────────────────────────────────────────────
   Superadmin: cómo va la app, los pagos (con lo que dijo el banco) y cada
   usuario con su actividad paso a paso. Los pagos se aprueban solos cuando
   el banco los confirma; aquí llegan los que necesitan a una persona.
   ─────────────────────────────────────────────────────────────────────────── */

type Pestana = 'resumen' | 'embudo' | 'pagos' | 'banco' | 'usuarios'

const PESTANAS: [Pestana, string][] = [
  ['resumen', '📊 Resumen'],
  ['embudo', '📉 Embudo'],
  ['pagos', '💳 Pagos'],
  ['banco', '🏦 Banco'],
  ['usuarios', '👥 Usuarios'],
]

const fecha = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

const ACTIVIDAD: Record<string, string> = {
  registro: '🆕 Se registró',
  entrar: '🔑 Inició sesión',
  salir: '👋 Cerró sesión',
  abrio_app: '📱 Abrió la app',
  cuento_nuevo: '✨ Empezó un cuento',
  abrio_chat: '💬 Abrió el chat de un cuento',
  abrio_libro: '📖 Abrió el libro de un cuento',
  mensaje: '✍️ Le escribió a Luna',
  capitulo: '📄 Luna escribió un capítulo',
  capitulo_reescrito: '✏️ Pidió cambiar un capítulo',
  escucho: '🎧 Escuchó un capítulo',
  borro_cuento: '🗑️ Borró un cuento',
  pago_enviado: '💳 Subió la captura de un pago',
  pago_ilegible: '⚠️ Subió una captura que no se pudo leer',
  pago_repetido: '⚠️ Subió una captura ya usada',
  pago_aprobado: '✅ Pago aprobado',
  pago_rechazado: '❌ Pago rechazado',
}

function detalleActividad(e: Actividad) {
  const d = e.detalle ?? {}
  const partes: string[] = []
  if (d.cuento) partes.push(`cuento #${d.cuento}`)
  if (d.capitulo) partes.push(`capítulo ${d.capitulo}`)
  if (typeof d.respuesta === 'number') partes.push(`respuesta ${d.respuesta}`)
  if (d.origen) partes.push(d.origen === 'auto' ? 'automático' : 'a mano')
  if (d.nota) partes.push(String(d.nota))
  return partes.join(' · ')
}

export function Admin() {
  const [pestana, setPestana] = useState<Pestana>('pagos')
  return (
    <>
      <header class="barra">
        <span class="barra__titulo">
          <Logo size={38} />
          <span>
            <strong>Superadmin</strong>
            <small>Cuentos de valor</small>
          </span>
        </span>
        <Menu />
      </header>
      <nav class="admin__pestanas">
        {PESTANAS.map(([p, t]) => (
          <button key={p} type="button" class={pestana === p ? 'activa' : ''} onClick={() => setPestana(p)}>
            {t}
          </button>
        ))}
      </nav>
      <main class="admin">
        {pestana === 'resumen' && <Resumen />}
        {pestana === 'embudo' && <Embudo />}
        {pestana === 'pagos' && <Pagos />}
        {pestana === 'banco' && <Banco />}
        {pestana === 'usuarios' && <Usuarios />}
      </main>
    </>
  )
}

function Resumen() {
  const [r, setR] = useState<AdminResumen | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.admin.resumen().then(setR).catch((e) => setError((e as Error).message))
  }, [])
  if (error) return <p class="aviso">{error}</p>
  if (!r) return <p>Cargando…</p>
  const v = r.validacion
  return (
    <>
      <div class="admin__cifras">
        <Cifra n={r.usuarios} t="Usuarios registrados" />
        <Cifra n={r.activos} t="Con el mes pagado" />
        <Cifra n={r.usaron_7_dias} t="Usaron la app (7 días)" />
        <Cifra n={r.cuentos} t="Cuentos creados" />
        <Cifra n={r.pagos_por_revisar} t="Pagos por revisar" alerta={r.pagos_por_revisar > 0} />
        <Cifra n={`$${r.ingresos_30_dias_usd.toFixed(0)}`} t={`Cobrado en 30 días (${r.aprobados_30_dias} pagos)`} />
      </div>
      <section class="tarjeta admin__salud">
        <h3>Validación automática de pagos</h3>
        <p>{v.activa ? '🟢 Activa: los pagos se buscan solos en el banco.' : '🔴 Apagada: los pagos esperan a que los apruebes a mano.'}</p>
        <ul>
          <li>{v.banco ? '✅' : '❌'} Conexión con el banco (Bank API)</li>
          <li>{v.ocr ? '✅' : '❌'} Lectura de capturas (OCR)</li>
          <li>{v.cron ? '✅' : '❌'} Clave del cron (CRON_SECRET)</li>
          <li>Última búsqueda en el banco: {fecha(v.ultima_busqueda)}</li>
        </ul>
      </section>
    </>
  )
}

const PERIODOS: [number, string][] = [
  [7, '7 días'],
  [30, '30 días'],
  [0, 'Todo'],
]

/** Embudo: de la landing al pago, y cuántos días usan la app los que pagaron. */
function Embudo() {
  const [dias, setDias] = useState(30)
  const [e, setE] = useState<AdminEmbudo | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setE(null)
    setError('')
    api.admin.embudo(dias).then(setE).catch((x) => setError((x as Error).message))
  }, [dias])

  const pasos: [string, number][] = e
    ? [
        ['Visitaron la landing', e.landing],
        ['Visitaron la página de registro', e.pagina_registro],
        ['Se registraron', e.registrados],
        ['Enviaron captura', e.capturas],
        ['Pagaron con éxito', e.pagaron],
        ['Usaron 1 día o más', e.dias_1],
        ['Usaron 2 días o más', e.dias_2],
        ['Usaron 3 días o más', e.dias_3],
        ['Usaron 10 días o más', e.dias_10],
      ]
    : []
  const maximo = Math.max(1, ...pasos.map(([, n]) => n))

  return (
    <>
      <div class="admin__filtros">
        {PERIODOS.map(([d, t]) => (
          <button key={d} type="button" class={`chip${dias === d ? ' chip--fuerte' : ''}`} onClick={() => setDias(d)}>
            {t}
          </button>
        ))}
      </div>
      {error && <p class="aviso">{error}</p>}
      {!e && !error && <p>Cargando…</p>}
      {e && (
        <>
          <div class="admin__cifras">
            <Cifra n={`${Number(e.ventas_usd).toFixed(0)}`} t={`Ventas (${e.ventas} ${e.ventas === 1 ? 'pago' : 'pagos'})`} />
            <Cifra n={e.registrados ? `${Math.round((e.pagaron / e.registrados) * 100)}%` : '—'} t="De registrados a pagados" />
          </div>
          <section class="tarjeta admin__embudo">
            <h3>Embudo</h3>
            {pasos.map(([t, n], i) => {
              const antes = i > 0 ? pasos[i - 1][1] : 0
              return (
                <div key={t} class="admin__embudo-fila">
                  <span>{t}</span>
                  <span class="admin__embudo-barra">
                    <span style={{ width: `${(n / maximo) * 100}%` }} />
                  </span>
                  <span>
                    <b>{n}</b>
                    {i > 0 && <small> ({antes ? Math.round((n / antes) * 100) : 0}%)</small>}
                  </span>
                </div>
              )
            })}
            <p class="admin__nota">
              El % es sobre el paso anterior. Los usuarios son los que se registraron en el periodo; los días de uso
              cuentan desde su primer pago aprobado.{' '}
              {e.visitas_desde ? `Las visitas se cuentan desde el ${fecha(e.visitas_desde)}, una vez por navegador.` : 'Las visitas a la landing y al registro empiezan a contarse desde ahora.'}
            </p>
          </section>
        </>
      )}
    </>
  )
}

function Cifra({ n, t, alerta = false }: { n: number | string; t: string; alerta?: boolean }) {
  return (
    <div class={`admin__cifra${alerta ? ' alerta' : ''}`}>
      <strong>{n}</strong>
      <span>{t}</span>
    </div>
  )
}

const FILTROS = [
  ['revisar', '⚠️ Por revisar'],
  ['verificando', '⏳ Verificando'],
  ['aprobado', '✅ Aprobados'],
  ['rechazado', '❌ Rechazados'],
] as const

function Pagos() {
  const [filtro, setFiltro] = useState<string>('revisar')
  const [pagos, setPagos] = useState<AdminPago[] | null>(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState('')

  const cargar = () => {
    setPagos(null)
    api.admin.pagos(filtro).then((d) => setPagos(d.pagos)).catch((e) => setError((e as Error).message))
  }
  useEffect(cargar, [filtro])

  async function decidir(p: AdminPago, accion: 'aprobar' | 'rechazar' | 'revalidar') {
    let nota = ''
    if (accion === 'rechazar') {
      nota = prompt('¿Por qué se rechaza? (se le quitarán los 30 días que dio este pago)') ?? ''
      if (!nota.trim()) return
    }
    if (accion === 'aprobar' && !confirm(`¿Aprobar el pago de ${p.usuarios?.nombre ?? 'este usuario'}?`)) return
    setOcupado(p.id)
    setError('')
    try {
      await api.admin.decidir(p.id, accion, nota)
      cargar()
    } catch (e) {
      setError((e as Error).message)
    }
    setOcupado('')
  }

  return (
    <>
      <div class="admin__filtros">
        {FILTROS.map(([k, t]) => (
          <button key={k} type="button" class={`chip${filtro === k ? ' chip--fuerte' : ''}`} onClick={() => setFiltro(k)}>
            {t}
          </button>
        ))}
      </div>
      {error && <p class="aviso">{error}</p>}
      {!pagos ? (
        <p>Cargando…</p>
      ) : !pagos.length ? (
        <p class="admin__vacio">No hay pagos aquí.</p>
      ) : (
        <ul class="admin__lista">
          {pagos.map((p) => (
            <li key={p.id} class="tarjeta admin__pago">
              {p.captura && (
                <a href={p.captura} target="_blank" rel="noreferrer" class="admin__captura">
                  <img src={p.captura} alt="Captura del pago" loading="lazy" />
                </a>
              )}
              <div class="admin__pago-datos">
                <span class="etiqueta-app etiqueta-app--cuentos">🌙 Cuentos de valor</span>
                <strong>{p.usuarios?.nombre ?? '—'}</strong> <small>{p.usuarios?.email}</small>
                <p>
                  {fecha(p.creado)} · ref <b>{p.referencia_completa ?? p.referencia}</b>
                  {p.ocr_banco ? ` · desde ${p.ocr_banco}` : ''}
                </p>
                <p>
                  Pedido: {p.monto_bs !== null ? formatoBs(p.monto_bs) : '—'} (${p.monto_usd})
                  {p.ocr_monto !== null && <> · La captura dice: {formatoBs(p.ocr_monto)}</>}
                  {p.banco && <> · En el banco: {formatoBs(p.banco.monto)}</>}
                </p>
                {p.revision_texto && <p class="admin__motivo">⚠️ {p.revision_texto}</p>}
                {p.nota && <p class="admin__nota">{p.nota}</p>}
                <p class="admin__estado">
                  {p.estado === 'verificando'
                    ? `Buscado ${p.intentos} ${p.intentos === 1 ? 'vez' : 'veces'} en el banco`
                    : `${p.estado === 'aprobado' ? 'Aprobado' : 'Rechazado'} ${p.origen === 'auto' ? 'automáticamente' : 'a mano'} · ${fecha(p.revisado_en)}`}
                </p>
                {p.estado === 'verificando' && (
                  <div class="admin__acciones">
                    <button type="button" class="boton boton--principal boton--chico" disabled={!!ocupado} onClick={() => decidir(p, 'aprobar')}>
                      Aprobar
                    </button>
                    <button type="button" class="boton boton--suave boton--chico" disabled={!!ocupado} onClick={() => decidir(p, 'revalidar')}>
                      {ocupado === p.id ? 'Buscando…' : 'Buscar en el banco'}
                    </button>
                    <button type="button" class="boton boton--peligro boton--chico" disabled={!!ocupado} onClick={() => decidir(p, 'rechazar')}>
                      Rechazar
                    </button>
                  </div>
                )}
                {p.estado === 'rechazado' && (
                  <div class="admin__acciones">
                    <button type="button" class="boton boton--principal boton--chico" disabled={!!ocupado} onClick={() => decidir(p, 'aprobar')}>
                      Aprobar
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

const FILTROS_BANCO = [
  ['cuentos', '🌙 Solo Cuentos de valor'],
  ['todos', 'Todos'],
  ['otra_app', '🔑 La Mejor Llave / Formula Taller'],
  ['libre', '⚪ Libres'],
] as const

const APP_TEXTO: Record<Movimiento['app'], string> = {
  cuentos: '🌙 Cuentos de valor',
  otra_app: '🔑 Otra app (La Mejor Llave o Formula Taller)',
  libre: '⚪ Libre: nadie lo ha reclamado',
}

/**
 * El estado de cuenta del banco, que comparten las tres apps. Cada abono dice
 * de quién es; los de Cuentos de valor que esperan aprobación se deciden aquí.
 */
function Banco() {
  const [filtro, setFiltro] = useState<string>('cuentos')
  const [movs, setMovs] = useState<Movimiento[] | null>(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState('')

  const cargar = () => {
    setMovs(null)
    api.admin.banco().then((d) => setMovs(d.movimientos)).catch((e) => setError((e as Error).message))
  }
  useEffect(cargar, [])

  async function decidir(id: string, accion: 'aprobar' | 'rechazar') {
    let nota = ''
    if (accion === 'rechazar') {
      nota = prompt('¿Por qué se rechaza? (se le quitarán los 30 días que dio este pago)') ?? ''
      if (!nota.trim()) return
    } else if (!confirm('¿Aprobar este pago de Cuentos de valor?')) return
    setOcupado(id)
    setError('')
    try {
      await api.admin.decidir(id, accion, nota)
      cargar()
    } catch (e) {
      setError((e as Error).message)
    }
    setOcupado('')
  }

  const lista = movs?.filter((m) => filtro === 'todos' || m.app === filtro) ?? []
  return (
    <>
      <p class="admin__vacio">
        Los últimos abonos de la cuenta del Banco de Venezuela (0102***7113), que comparten Cuentos de valor, La Mejor Llave y Formula Taller.
      </p>
      <div class="admin__filtros">
        {FILTROS_BANCO.map(([k, t]) => (
          <button key={k} type="button" class={`chip${filtro === k ? ' chip--fuerte' : ''}`} onClick={() => setFiltro(k)}>
            {t}
            {movs && ` (${k === 'todos' ? movs.length : movs.filter((m) => m.app === k).length})`}
          </button>
        ))}
        <button type="button" class="chip" onClick={cargar}>🔄 Actualizar</button>
      </div>
      {error && <p class="aviso">{error}</p>}
      {!movs ? (
        <p>Cargando…</p>
      ) : !lista.length ? (
        <p class="admin__vacio">No hay movimientos aquí.</p>
      ) : (
        <ul class="admin__lista">
          {lista.map((m) => (
            <li key={m.id} class="tarjeta admin__movimiento">
              <span class={`etiqueta-app etiqueta-app--${m.app}`}>{APP_TEXTO[m.app]}</span>
              <p>
                <strong>{formatoBs(m.monto)}</strong> · ref <b>{m.referencia}</b> · {fecha(m.fecha)}
              </p>
              {m.descripcion && <small>{m.descripcion}</small>}
              {m.pago && (
                <p>
                  {m.pago.nombre ?? 'Usuario'} · {m.pago.estado === 'aprobado' ? '✅ pago aprobado' : '⏳ pago por aprobar'}
                </p>
              )}
              {m.pago?.estado === 'verificando' && (
                <div class="admin__acciones">
                  <button type="button" class="boton boton--principal boton--chico" disabled={!!ocupado} onClick={() => decidir(m.pago!.id, 'aprobar')}>
                    Aprobar
                  </button>
                  <button type="button" class="boton boton--peligro boton--chico" disabled={!!ocupado} onClick={() => decidir(m.pago!.id, 'rechazar')}>
                    Rechazar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Usuarios() {
  const [usuarios, setUsuarios] = useState<AdminUsuario[] | null>(null)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [buscar, setBuscar] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    api.admin.usuarios().then((d) => setUsuarios(d.usuarios)).catch((e) => setError((e as Error).message))
  }, [])

  if (abierto !== null) return <DetalleUsuario id={abierto} alVolver={() => setAbierto(null)} />
  if (error) return <p class="aviso">{error}</p>
  if (!usuarios) return <p>Cargando…</p>
  const t = buscar.trim().toLowerCase()
  const lista = usuarios.filter((u) => !t || u.nombre.toLowerCase().includes(t) || u.email.includes(t))
  return (
    <>
      <label class="campo">
        <input placeholder="Buscar por nombre o correo" value={buscar} onInput={(e) => setBuscar((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <ul class="admin__lista">
        {lista.map((u) => (
          <li key={u.id}>
            <button type="button" class="tarjeta admin__usuario" onClick={() => setAbierto(u.id)}>
              <span>
                <strong>{u.nombre}</strong> {u.es_admin && <em>superadmin</em>}
                <small>{u.email}</small>
              </span>
              <span class="admin__usuario-datos">
                <span class={u.activo ? 'ok' : 'no'}>
                  {u.es_admin ? '—' : u.activo ? `Pagado hasta ${fecha(u.pagado_hasta)}` : u.pagado_hasta ? 'Vencido' : 'Sin pagar'}
                </span>
                <small>
                  {u.cuentos} {u.cuentos === 1 ? 'cuento' : 'cuentos'} · último uso: {u.ultima_actividad ? fecha(u.ultima_actividad.creado) : 'nunca'}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function DetalleUsuario({ id, alVolver }: { id: number; alVolver: () => void }) {
  const [d, setD] = useState<AdminDetalle | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.admin.usuario(id).then(setD).catch((e) => setError((e as Error).message))
  }, [id])
  return (
    <>
      <button type="button" class="boton boton--suave boton--chico" onClick={alVolver}>← Todos los usuarios</button>
      {error && <p class="aviso">{error}</p>}
      {!d ? (
        <p>Cargando…</p>
      ) : (
        <>
          <section class="tarjeta">
            <h3>{d.usuario.nombre}</h3>
            <p>{d.usuario.email} · registrado el {fecha(d.usuario.creado)}</p>
            <p>
              {d.usuario.activo
                ? `✅ Mes pagado hasta ${fecha(d.usuario.pagado_hasta)} (${d.usuario.dias_restantes} días)`
                : d.usuario.pagado_hasta
                  ? `🔒 Venció el ${fecha(d.usuario.pagado_hasta)}`
                  : '🔒 Nunca ha pagado'}
            </p>
          </section>

          <h3>Cuentos ({d.cuentos.length})</h3>
          {d.cuentos.length ? (
            <ul class="admin__simple">
              {d.cuentos.map((c) => (
                <li key={c.id}>
                  #{c.id} {c.titulo ?? 'En preparación'} · {c.estado === 'listo' ? 'listo' : `capítulo ${c.capitulos}`} · {fecha(c.creado)}
                </li>
              ))}
            </ul>
          ) : (
            <p class="admin__vacio">Todavía no ha hecho cuentos.</p>
          )}

          <h3>Pagos ({d.pagos.length})</h3>
          {d.pagos.length ? (
            <ul class="admin__simple">
              {d.pagos.map((p) => (
                <li key={p.id}>
                  {fecha(p.creado)} · ref {p.referencia} · {p.monto_bs !== null ? formatoBs(p.monto_bs) : `$${p.monto_usd}`} ·{' '}
                  {p.estado === 'verificando' ? '⏳ verificando' : p.estado === 'aprobado' ? `✅ aprobado (${p.origen === 'auto' ? 'auto' : 'a mano'})` : '❌ rechazado'}
                </li>
              ))}
            </ul>
          ) : (
            <p class="admin__vacio">Sin pagos.</p>
          )}

          <h3>Actividad paso a paso</h3>
          <ol class="admin__actividad">
            {d.eventos.map((e) => (
              <li key={e.id}>
                <time>{fecha(e.creado)}</time>
                <span>{ACTIVIDAD[e.tipo] ?? e.tipo}</span>
                {detalleActividad(e) && <small>{detalleActividad(e)}</small>}
              </li>
            ))}
            {!d.eventos.length && <li class="admin__vacio">Sin actividad registrada.</li>}
          </ol>
        </>
      )}
    </>
  )
}

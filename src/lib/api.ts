// Las llamadas a /api. La sesión viaja en una cookie HttpOnly.

export interface Usuario { id: number; nombre: string; email: string; es_admin?: boolean; pagado_hasta?: string | null }
export interface Suscripcion {
  activo: boolean
  /** Su último pago fue rechazado: solo ve el aviso de soporte hasta que se apruebe */
  rechazado?: boolean
  es_admin: boolean
  pagado_hasta: string | null
  /** 0 = vence hoy; negativo = vencida; null = nunca pagó */
  dias_restantes: number | null
  precio_usd: number
  monto_bs: number | null
  tasa: number | null
  fecha_tasa: string | null
  datos: { banco: string; telefono: string; cedula: string }
  verificando: boolean
  /** Un pago que el banco no confirmó solo y revisa una persona */
  en_revision?: boolean
}
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

/** Para el embudo: cuenta la visita a la landing o al registro (una vez por navegador). */
export function contarVisita(pagina: 'inicio' | 'registro') {
  try {
    const clave = `visita-${pagina}`
    if (localStorage.getItem(clave)) return
    let id = localStorage.getItem('visitante')
    if (!id) {
      id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem('visitante', id)
    }
    pedir('POST', '/visita', { pagina, visitante: id })
      .then(() => localStorage.setItem(clave, '1'))
      .catch(() => {})
  } catch {
    // Sin localStorage (modo privado estricto): no se cuenta
  }
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
  cuento: (id: number, vista: 'chat' | 'libro' = 'chat') =>
    pedir<{ cuento: Cuento; mensajes: Mensaje[]; capitulos: Capitulo[] }>('GET', `/cuentos/${id}?vista=${vista}`),
  borrar: (id: number) => pedir('DELETE', `/cuentos/${id}`),
  suscripcion: () => pedir<Suscripcion>('GET', '/suscripcion'),
  /** `imagen`: la captura como data URL (ya reducida en el navegador) */
  pagar: (imagen: string, nombre: string) => pedir<{ ok: true; suscripcion: Suscripcion }>('POST', '/pagos', { imagen, nombre }),
  admin: {
    resumen: () => pedir<AdminResumen>('GET', '/admin/resumen'),
    embudo: (dias: number) => pedir<AdminEmbudo>('GET', `/admin/embudo?dias=${dias}`),
    pagos: (filtro: string) => pedir<{ pagos: AdminPago[] }>('GET', `/admin/pagos?filtro=${filtro}`),
    decidir: (id: string, accion: 'aprobar' | 'rechazar' | 'revalidar', nota = '') =>
      pedir<{ ok: true }>('POST', `/admin/pagos/${id}`, { accion, nota }),
    banco: () => pedir<{ movimientos: Movimiento[] }>('GET', '/admin/banco'),
    usuarios: () => pedir<{ usuarios: AdminUsuario[] }>('GET', '/admin/usuarios'),
    usuario: (id: number) => pedir<AdminDetalle>('GET', `/admin/usuarios/${id}`),
  },
}

export interface AdminEmbudo {
  landing: number
  pagina_registro: number
  registrados: number
  capturas: number
  pagaron: number
  dias_1: number
  dias_2: number
  dias_3: number
  dias_10: number
  ventas: number
  ventas_usd: number
  /** Desde cuándo se cuentan las visitas (null = aún ninguna) */
  visitas_desde: string | null
}

export interface AdminResumen {
  usuarios: number
  activos: number
  usaron_7_dias: number
  cuentos: number
  pagos_por_revisar: number
  pagos_verificando: number
  aprobados_30_dias: number
  ingresos_30_dias_usd: number
  validacion: { activa: boolean; banco: boolean; ocr: boolean; cron: boolean; ultima_busqueda: string | null }
}
export interface AdminPago {
  id: string
  estado: 'verificando' | 'aprobado' | 'rechazado'
  monto_usd: number
  monto_bs: number | null
  tasa: number | null
  referencia: string
  referencia_completa: string | null
  ocr_monto: number | null
  ocr_banco: string | null
  revision: string | null
  revision_texto: string | null
  nota: string | null
  origen: 'auto' | 'manual' | null
  banco: { monto: number; referencia: string; fecha: string; descripcion?: string } | null
  intentos: number
  creado: string
  revisado_en: string | null
  captura: string | null
  usuarios: { nombre: string; email: string } | null
}
/** Un abono del estado de cuenta compartido, con la app a la que pertenece. */
export interface Movimiento {
  id: number
  fecha: string
  referencia: string
  descripcion: string
  monto: number
  used: boolean
  app: 'cuentos' | 'otra_app' | 'libre'
  pago: { id: string; estado: 'aprobado' | 'verificando'; nombre: string | null } | null
}
export interface Actividad { usuario_id?: number; tipo: string; creado: string; detalle?: Record<string, unknown> | null; id?: number }
export interface AdminUsuario {
  id: number
  nombre: string
  email: string
  creado: string
  pagado_hasta: string | null
  es_admin: boolean
  cuentos: number
  activo: boolean
  dias_restantes: number | null
  ultima_actividad: Actividad | null
}
export interface AdminDetalle {
  usuario: Omit<AdminUsuario, 'cuentos' | 'ultima_actividad'>
  eventos: Actividad[]
  pagos: Pick<AdminPago, 'id' | 'estado' | 'monto_usd' | 'monto_bs' | 'referencia' | 'revision' | 'nota' | 'origen' | 'creado'>[]
  cuentos: (Cuento & { creado: string })[]
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

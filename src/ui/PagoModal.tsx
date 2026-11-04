import { useState } from 'preact/hooks'
import { api, type Suscripcion } from '../lib/api'
import { eventoFbCada24h } from '../lib/fbpixel'
import { formatoBs, reducirImagen, suscripcion } from '../lib/suscripcion'

/**
 * «Confirma tu pago»: Pago Móvil de la mensualidad. La mamá o el papá sube la
 * captura y la cuenta se activa en el momento; el pago se verifica en el banco
 * por detrás. `alCerrar` solo existe al renovar antes de vencer (si ya venció,
 * no se puede cerrar).
 */
export function PagoModal({ s, alCerrar }: { s: Suscripcion; alCerrar?: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vista, setVista] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  async function confirmar() {
    if (!archivo || enviando) return
    eventoFbCada24h('pagoUnCuento', { value: s.precio_usd, currency: 'USD' })
    setEnviando(true)
    setError('')
    try {
      const imagen = await reducirImagen(archivo)
      const r = await api.pagar(imagen, archivo.name)
      suscripcion.set(r.suscripcion)
      alCerrar?.()
    } catch (e) {
      setError((e as Error).message || 'No se pudo enviar la captura. Prueba otra vez.')
    }
    setEnviando(false)
  }

  const renovar = s.activo
  return (
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="pago-titulo">
      <div class="modal__caja pago">
        {alCerrar && (
          <button type="button" class="modal__cerrar" aria-label="Cerrar" onClick={alCerrar}>
            ✕
          </button>
        )}
        <span class="pago__icono" aria-hidden="true">💳</span>
        <h2 id="pago-titulo">Confirma tu pago</h2>
        <p class="pago__monto">
          Realiza un Pago Móvil de{' '}
          <strong>{s.monto_bs !== null ? formatoBs(s.monto_bs) : `$${s.precio_usd}`}</strong>
          {s.monto_bs !== null && <>, que son <strong>{s.precio_usd} dólares</strong> a tasa BCV de hoy</>}
          {renovar ? ', para renovar tu mes.' : '.'}
        </p>

        <dl class="pago__datos">
          <Dato nombre="Banco" valor={s.datos.banco} copiar={s.datos.banco} />
          <Dato nombre="Teléfono" valor={s.datos.telefono} copiar={soloDigitos(s.datos.telefono)} />
          <Dato nombre="Cédula" valor={s.datos.cedula} copiar={soloDigitos(s.datos.cedula)} />
          {s.monto_bs !== null && (
            <Dato nombre="Monto" valor={formatoBs(s.monto_bs)} copiar={s.monto_bs.toFixed(2).replace('.', ',')} />
          )}
        </dl>

        <p class="pago__ayuda">Sube aquí la captura y tu cuenta se activará automáticamente.</p>

        <label class={`pago__archivo${vista ? ' con-imagen' : ''}`}>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = (e.currentTarget as HTMLInputElement).files?.[0] ?? null
              setArchivo(f)
              setError('')
              if (vista) URL.revokeObjectURL(vista)
              setVista(f ? URL.createObjectURL(f) : '')
            }}
          />
          {vista ? <img src={vista} alt="Tu captura" /> : <span>📷 Elegir la captura del pago</span>}
        </label>

        {error && <p class="aviso" role="alert">{error}</p>}

        <button type="button" class="boton boton--principal boton--grande" disabled={!archivo || enviando} onClick={confirmar}>
          {enviando ? 'Revisando la captura…' : 'Confirmar pago y activar mi cuenta'}
        </button>
        {/* Con el mes vencido se pueden seguir leyendo y escuchando los cuentos hechos */}
        {!alCerrar && s.dias_restantes !== null && (
          <a href="/cuentos" class="pago__salir">Ver mis cuentos</a>
        )}
      </div>
    </div>
  )
}

const soloDigitos = (t: string) => t.replace(/D/g, '')

/** Un dato del Pago Móvil con su botón para copiarlo (el teléfono y la cédula
 *  sin guiones ni letras; el monto sin «Bs.» ni puntos de miles: 8038,96). */
function Dato({ nombre, valor, copiar }: { nombre: string; valor: string; copiar: string }) {
  const [copiado, setCopiado] = useState(false)
  async function alCopiar() {
    try {
      await navigator.clipboard.writeText(copiar)
    } catch {
      // Navegadores sin permiso de portapapeles
      const t = document.createElement('textarea')
      t.value = copiar
      document.body.appendChild(t)
      t.select()
      document.execCommand('copy')
      t.remove()
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }
  return (
    <div>
      <dt>{nombre}</dt>
      <dd>
        {valor}
        <button type="button" class={`pago__copiar${copiado ? ' copiado' : ''}`} onClick={alCopiar} aria-label={`Copiar ${nombre.toLowerCase()}`}>
          {copiado ? '✓' : (
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </dd>
    </div>
  )
}

const DIAS_AVISO = [7, 3, 0]

/**
 * Aviso de vencimiento: 7 días antes, 3 días antes y el mismo día sale la
 * ventana de pago (una vez al día); el resto de la última semana, una franja.
 */
export function AvisoPago({ s }: { s: Suscripcion }) {
  const d = s.dias_restantes
  const hoy = new Date().toISOString().slice(0, 10)
  const clave = `aviso-pago-${hoy}`
  const toca = s.activo && !s.es_admin && d !== null && DIAS_AVISO.includes(d) && !localStorage.getItem(clave)
  const [abierto, setAbierto] = useState(toca)
  if (s.es_admin) return null
  // Sin mes activo (fuera del chat, donde la ventana no se puede cerrar)
  if (!s.activo) {
    return (
      <>
        <div class="franja-pago" role="status">
          <span>🔒 {d !== null ? 'Tu mensualidad venció.' : 'Activa tu cuenta para crear cuentos.'}</span>
          <button type="button" class="boton boton--suave boton--chico" onClick={() => setAbierto(true)}>
            {d !== null ? 'Renovar' : 'Activar'}
          </button>
        </div>
        {abierto && <PagoModal s={s} alCerrar={() => setAbierto(false)} />}
      </>
    )
  }
  if (d === null || d > 7) return null

  const cuando = d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`
  const cerrar = () => {
    localStorage.setItem(clave, '1')
    setAbierto(false)
  }
  return (
    <>
      <div class="franja-pago" role="status">
        <span>⏰ Tu mensualidad vence <strong>{cuando}</strong>.</span>
        <button type="button" class="boton boton--suave boton--chico" onClick={() => setAbierto(true)}>
          Renovar
        </button>
      </div>
      {abierto &&
        (s.verificando ? (
          <div class="modal" role="dialog" aria-modal="true">
            <div class="modal__caja pago">
              <span class="pago__icono" aria-hidden="true">⏳</span>
              <h2>Estamos verificando tu pago</h2>
              <p>Ya recibimos tu captura. Tu mes se renueva en cuanto el banco lo confirme.</p>
              <button type="button" class="boton boton--principal" onClick={cerrar}>Entendido</button>
            </div>
          </div>
        ) : (
          <PagoModal s={s} alCerrar={cerrar} />
        ))}
    </>
  )
}

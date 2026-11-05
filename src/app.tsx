import { useEffect, useState } from 'preact/hooks'
import { api, type Usuario } from './lib/api'
import { usarVozDelServidor } from './lib/narrar'
import { abrirCuento, cuentoActual, ir, useRuta } from './lib/router'
import { sesion } from './lib/sesion'
import { cargarSuscripcion, suscripcion } from './lib/suscripcion'
import { PagoRechazado } from './ui/PagoModal'
import { Cargando } from './ui/Cargando'
import { Entrar } from './screens/Entrar'
import { Registro } from './screens/Registro'
import { Chat } from './screens/Chat'
import { Libro } from './screens/Libro'
import { Cuentos } from './screens/Cuentos'
import { Admin } from './screens/Admin'
import { Landing } from './screens/Landing'

export function App() {
  const ruta = useRuta()
  const usuario = sesion.use()
  const [listo, setListo] = useState(false)

  useEffect(() => {
    Promise.all([api.yo(), api.config()])
      .then(([{ usuario }, config]) => {
        sesion.set(usuario)
        usarVozDelServidor(config.voz)
      })
      .catch(() => sesion.set(null))
      .finally(() => setListo(true))
  }, [])

  // El estado del pago se revisa al entrar; si fue rechazado, cada 30 s y al
  // volver a la app, para quitar el aviso en cuanto soporte lo apruebe
  const s = suscripcion.use()
  const [revisado, setRevisado] = useState<number | null>(null)
  const uid = usuario && !usuario.es_admin ? usuario.id : null
  useEffect(() => {
    if (!uid) return
    cargarSuscripcion().finally(() => setRevisado(uid))
  }, [uid])
  useEffect(() => {
    if (!uid || !s?.rechazado) return
    const revisar = () => document.visibilityState === 'visible' && cargarSuscripcion()
    const reloj = setInterval(revisar, 30_000)
    document.addEventListener('visibilitychange', revisar)
    return () => {
      clearInterval(reloj)
      document.removeEventListener('visibilitychange', revisar)
    }
  }, [uid, s?.rechazado])

  // La página de la publicidad se ve sin esperar la sesión
  if (ruta === '/inicio') return <Landing />
  if (!listo) return <Cargando />

  if (!usuario) {
    if (ruta === '/registro') return <Registro />
    return <Entrar />
  }

  // El superadmin solo ve la gestión de la app: no crea cuentos
  if (usuario.es_admin) {
    if (ruta !== '/admin') setTimeout(() => ir('/admin', true))
    return <Admin />
  }

  // Pago rechazado: solo el aviso de soporte, hasta que se apruebe
  if (revisado !== usuario.id) return <Cargando />
  if (s?.rechazado)
    return (
      <PagoRechazado email={usuario.email} />
    )

  // Direcciones viejas con el número (/cuento/13, /cuento/13/libro): se limpian
  const vieja = ruta.match(/^\/cuento\/(\d+)(\/libro)?$/)
  if (vieja) {
    // Fuera del render: cambia la dirección y vuelve a pintar
    setTimeout(() => abrirCuento(Number(vieja[1]), vieja[2] ? 'libro' : 'chat', true))
    return <Cargando texto="Abriendo tu cuento…" />
  }
  const id = cuentoActual()
  if (ruta === '/libro' && id) return <Libro key={id} id={id} />
  if (ruta === '/cuento' && id) return <Chat key={id} id={id} />
  if (ruta === '/cuentos') return <Cuentos />
  return <Inicio usuario={usuario} />
}

/** Al entrar se abre el chat: el cuento a medias, o uno nuevo. */
function Inicio({ usuario }: { usuario: Usuario }) {
  useEffect(() => {
    api
      .cuentos()
      .then(({ cuentos }) => {
        const aMedias = cuentos.find((c) => c.estado === 'creando')
        if (aMedias) return abrirCuento(aMedias.id, 'chat', true)
        return api.nuevo().then(({ id }) => abrirCuento(id, 'chat', true))
      })
      .catch(() => ir('/cuentos', true))
  }, [usuario.id])
  return <Cargando texto="Abriendo tu cuento…" />
}

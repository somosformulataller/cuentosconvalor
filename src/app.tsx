import { useEffect, useState } from 'preact/hooks'
import { api, type Usuario } from './lib/api'
import { usarVozDelServidor } from './lib/narrar'
import { ir, useRuta } from './lib/router'
import { sesion } from './lib/sesion'
import { Cargando } from './ui/Cargando'
import { Entrar } from './screens/Entrar'
import { Registro } from './screens/Registro'
import { Chat } from './screens/Chat'
import { Libro } from './screens/Libro'
import { Cuentos } from './screens/Cuentos'
import { Admin } from './screens/Admin'

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

  if (!listo) return <Cargando />

  if (!usuario) {
    if (ruta === '/registro') return <Registro />
    return <Entrar />
  }

  const libro = ruta.match(/^\/cuento\/(\d+)\/libro$/)
  if (libro) return <Libro id={Number(libro[1])} />
  const chat = ruta.match(/^\/cuento\/(\d+)$/)
  if (chat) return <Chat key={chat[1]} id={Number(chat[1])} />
  if (ruta === '/cuentos') return <Cuentos />
  if (ruta === '/admin' && usuario.es_admin) return <Admin />
  return <Inicio usuario={usuario} />
}

/** Al entrar se abre el chat: el cuento a medias, o uno nuevo. */
function Inicio({ usuario }: { usuario: Usuario }) {
  useEffect(() => {
    api
      .cuentos()
      .then(({ cuentos }) => {
        const aMedias = cuentos.find((c) => c.estado === 'creando')
        if (aMedias) return ir(`/cuento/${aMedias.id}`, true)
        return api.nuevo().then(({ id }) => ir(`/cuento/${id}`, true))
      })
      .catch(() => ir('/cuentos', true))
  }, [usuario.id])
  return <Cargando texto="Abriendo tu cuento…" />
}

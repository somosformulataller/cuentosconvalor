import { useEffect, useState } from 'preact/hooks'
import { TOTAL_CAPITULOS } from '../../shared/formato.js'
import { api, type Cuento } from '../lib/api'
import { ir } from '../lib/router'
import { sesion } from '../lib/sesion'
import { Cargando } from '../ui/Cargando'
import { Logo } from '../ui/Logo'
import { Menu } from '../ui/Menu'

const COLORES = ['lavanda', 'durazno', 'menta', 'celeste']

export function Cuentos() {
  const usuario = sesion.use()
  const [cuentos, setCuentos] = useState<Cuento[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.cuentos().then((d) => setCuentos(d.cuentos)).catch((e) => setError((e as Error).message))
  }, [])

  async function nuevo() {
    const { id } = await api.nuevo()
    ir(`/cuento/${id}`)
  }

  if (!cuentos && !error) return <Cargando />

  return (
    <>
      <header class="barra">
        <span class="barra__titulo">
          <Logo size={38} />
          <span>
            <strong>Mis cuentos</strong>
            <small>de {usuario?.nombre.split(' ')[0]}</small>
          </span>
        </span>
        <Menu />
      </header>
      <main class="estante">
        <button type="button" class="estante__nuevo" onClick={nuevo}>
          <span aria-hidden="true">✨</span>
          <strong>Crear un cuento nuevo</strong>
          <small>Luna te hará tres preguntas</small>
        </button>
        {error && <p class="aviso">{error}</p>}
        <ul class="estante__lista">
          {cuentos?.map((c, i) => (
              <li key={c.id}>
                <a href={c.estado === 'listo' ? `/cuento/${c.id}/libro` : `/cuento/${c.id}`} class={`lomo lomo--${COLORES[i % 4]}`}>
                  <span class="lomo__icono" aria-hidden="true">{c.estado === 'listo' ? '📖' : '✏️'}</span>
                  <span class="lomo__texto">
                    <strong>{c.titulo ?? 'Cuento en preparación'}</strong>
                    <small>
                      {c.para ? `Para ${c.para} · ` : ''}
                      {c.estado === 'listo' ? 'Listo para leer y escuchar' : `Capítulo ${c.capitulos ?? 0} de ${TOTAL_CAPITULOS}`}
                    </small>
                  </span>
                </a>
                {c.estado === 'listo' && (
                  <a href={`/cuento/${c.id}`} class="lomo__chat">Ver la conversación</a>
                )}
              </li>
            ))}
        </ul>
      </main>
    </>
  )
}

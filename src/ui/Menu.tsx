import { useEffect, useRef, useState } from 'preact/hooks'
import { api } from '../lib/api'
import { detener } from '../lib/narrar'
import { ir } from '../lib/router'
import { sesion } from '../lib/sesion'
import { DescargarApp } from './DescargarApp'

export function Menu({ alNuevo }: { alNuevo?: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false)
    document.addEventListener('click', fuera)
    return () => document.removeEventListener('click', fuera)
  }, [abierto])

  return (
    <div class="menu" ref={caja}>
      {alNuevo && (
        <button type="button" class="boton boton--suave boton--chico" onClick={alNuevo}>
          ✨ Nuevo
        </button>
      )}
      <button type="button" class="menu__boton" aria-label="Menú" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        ☰
      </button>
      {abierto && (
        <div class="menu__lista" role="menu">
          <a href="/cuentos" role="menuitem" onClick={() => setAbierto(false)}>📚 Mis cuentos</a>
          <DescargarApp compacto />
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              detener()
              await api.salir().catch(() => {})
              ir('/', true)
              sesion.set(null)
            }}
          >
            👋 Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}

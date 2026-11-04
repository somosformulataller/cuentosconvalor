import { useEffect, useState } from 'preact/hooks'

export function ir(ruta: string, reemplazar = false, estado: { cuento: number } | null = null) {
  if (reemplazar) history.replaceState(estado, '', ruta)
  else history.pushState(estado, '', ruta)
  dispatchEvent(new PopStateEvent('popstate'))
  scrollTo(0, 0)
}

// El cuento abierto no va en la dirección (sin «/cuento/13»): se guarda aquí.
const CLAVE_CUENTO = 'cuento-actual'

export function cuentoActual(): number | null {
  // Primero el del historial (al ir atrás vuelve al cuento de esa página)
  const delHistorial = Number(history.state?.cuento) || null
  if (delHistorial) {
    recordarCuento(delHistorial)
    return delHistorial
  }
  try {
    return Number(localStorage.getItem(CLAVE_CUENTO)) || null
  } catch {
    return null
  }
}

export function olvidarCuento() {
  try {
    localStorage.removeItem(CLAVE_CUENTO)
  } catch {
    /* sin almacenamiento */
  }
}

function recordarCuento(id: number) {
  try {
    localStorage.setItem(CLAVE_CUENTO, String(id))
  } catch {
    /* sin almacenamiento */
  }
}

/** Abre el chat (o el libro) de un cuento: la dirección queda en /cuento o /libro. */
export function abrirCuento(id: number, vista: 'chat' | 'libro' = 'chat', reemplazar = false) {
  recordarCuento(id)
  ir(vista === 'libro' ? '/libro' : '/cuento', reemplazar, { cuento: id })
}

export function useRuta() {
  const [ruta, setRuta] = useState(location.pathname)
  // Cambiar de cuento deja la misma dirección: esto fuerza a pintar otra vez
  const [, setVuelta] = useState(0)
  useEffect(() => {
    const cambio = () => {
      setRuta(location.pathname)
      setVuelta((n) => n + 1)
    }
    addEventListener('popstate', cambio)
    // Los <a href="/..."> internos navegan sin recargar.
    const clic = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a')
      if (!a || a.target || a.origin !== location.origin || e.metaKey || e.ctrlKey || e.button !== 0) return
      e.preventDefault()
      // <a href="/cuento" data-cuento="13">: guarda qué cuento abrir
      if (a.dataset.cuento) return abrirCuento(Number(a.dataset.cuento), a.pathname === '/libro' ? 'libro' : 'chat')
      ir(a.pathname)
    }
    document.addEventListener('click', clic)
    return () => {
      removeEventListener('popstate', cambio)
      document.removeEventListener('click', clic)
    }
  }, [])
  return ruta
}

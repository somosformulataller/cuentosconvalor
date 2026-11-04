import { useEffect, useState } from 'preact/hooks'

export function ir(ruta: string, reemplazar = false) {
  if (reemplazar) history.replaceState(null, '', ruta)
  else history.pushState(null, '', ruta)
  dispatchEvent(new PopStateEvent('popstate'))
  scrollTo(0, 0)
}

export function useRuta() {
  const [ruta, setRuta] = useState(location.pathname)
  useEffect(() => {
    const cambio = () => setRuta(location.pathname)
    addEventListener('popstate', cambio)
    // Los <a href="/..."> internos navegan sin recargar.
    const clic = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a')
      if (!a || a.target || a.origin !== location.origin || e.metaKey || e.ctrlKey || e.button !== 0) return
      e.preventDefault()
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

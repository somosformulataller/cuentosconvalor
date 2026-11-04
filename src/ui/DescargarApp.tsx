import { useEffect, useState } from 'preact/hooks'

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

// El navegador avisa una sola vez que la app se puede descargar: se guarda.
let guardado: EventoInstalar | null = null
const avisar = new Set<() => void>()
if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    guardado = e as EventoInstalar
    avisar.forEach((f) => f())
  })
  addEventListener('appinstalled', () => {
    guardado = null
    avisar.forEach((f) => f())
  })
}

/** "Descargar la app": de un toque, solo donde el navegador lo permite. */
export function DescargarApp({ compacto = false }: { compacto?: boolean }) {
  const [, refrescar] = useState(0)
  useEffect(() => {
    const f = () => refrescar((n) => n + 1)
    avisar.add(f)
    return () => void avisar.delete(f)
  }, [])
  if (!guardado) return null
  return (
    <button
      type="button"
      class={compacto ? 'boton boton--suave boton--chico' : 'boton boton--suave descargar'}
      onClick={async () => {
        const e = guardado
        if (!e) return
        await e.prompt()
        await e.userChoice
        guardado = null
        refrescar((n) => n + 1)
      }}
    >
      📲 Descargar la app
    </button>
  )
}

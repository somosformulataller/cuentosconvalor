import { useEffect, useState } from 'preact/hooks'

/** Un valor compartido entre pantallas, con suscripción. */
export function crearStore<T>(inicial: T) {
  let valor = inicial
  const subs = new Set<(v: T) => void>()
  return {
    get: () => valor,
    set(v: T) {
      valor = v
      subs.forEach((f) => f(v))
    },
    use(): T {
      const [v, setV] = useState(valor)
      useEffect(() => {
        subs.add(setV)
        setV(valor)
        return () => void subs.delete(setV)
      }, [])
      return v
    },
  }
}

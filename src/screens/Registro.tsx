import { useState } from 'preact/hooks'
import { api } from '../lib/api'
import { ir } from '../lib/router'
import { sesion } from '../lib/sesion'
import { Portada } from './Entrar'

export function Registro() {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [clave2, setClave2] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e: Event) {
    e.preventDefault()
    if (clave !== clave2) return setError('Las dos contraseñas no son iguales.')
    setError('')
    setOcupado(true)
    try {
      const { usuario } = await api.registro(nombre, email, clave)
      ir('/', true)
      sesion.set(usuario)
    } catch (err) {
      setError((err as Error).message)
      setOcupado(false)
    }
  }

  return (
    <Portada>
      <form class="tarjeta formulario" onSubmit={enviar}>
        <h2>Crea tu cuenta</h2>
        <label class="campo">
          <span>Tu nombre</span>
          <input autoComplete="given-name" required value={nombre} onInput={(e) => setNombre(e.currentTarget.value)} placeholder="Mamá o papá" />
        </label>
        <label class="campo">
          <span>Correo</span>
          <input type="email" autoComplete="email" required value={email} onInput={(e) => setEmail(e.currentTarget.value)} placeholder="tucorreo@ejemplo.com" />
        </label>
        <label class="campo">
          <span>Contraseña</span>
          <input type="password" autoComplete="new-password" minLength={6} required value={clave} onInput={(e) => setClave(e.currentTarget.value)} placeholder="Al menos 6 caracteres" />
        </label>
        <label class="campo">
          <span>Repite la contraseña</span>
          <input type="password" autoComplete="new-password" minLength={6} required value={clave2} onInput={(e) => setClave2(e.currentTarget.value)} />
        </label>
        {error && <p class="aviso" role="alert">{error}</p>}
        <button class="boton boton--principal" disabled={ocupado}>
          {ocupado ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
        </button>
        <p class="formulario__pie">
          ¿Ya tienes cuenta? <a href="/">Inicia sesión</a>
        </p>
      </form>
    </Portada>
  )
}

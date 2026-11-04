import { useState } from 'preact/hooks'
import { api } from '../lib/api'
import { ir } from '../lib/router'
import { sesion } from '../lib/sesion'
import { Logo } from '../ui/Logo'
import { DescargarApp } from '../ui/DescargarApp'

export function Portada({ children }: { children: preact.ComponentChildren }) {
  return (
    <main class="acceso">
      <div class="acceso__cielo" aria-hidden="true">
        <span class="estrella e1">✦</span>
        <span class="estrella e2">✦</span>
        <span class="estrella e3">✧</span>
        <span class="nube n1" />
        <span class="nube n2" />
      </div>
      <header class="acceso__marca">
        <Logo size={84} />
        <h1>Cuentos de valor</h1>
        <p>Crea con Luna un cuento para tu hijo, con los valores que quieres sembrar, por capítulos y con voz.</p>
      </header>
      {children}
      <DescargarApp />
    </main>
  )
}

export function Entrar() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e: Event) {
    e.preventDefault()
    setError('')
    setOcupado(true)
    try {
      const { usuario } = await api.entrar(email, clave)
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
        <h2>Iniciar sesión</h2>
        <label class="campo">
          <span>Correo</span>
          <input type="email" autoComplete="email" required value={email} onInput={(e) => setEmail(e.currentTarget.value)} placeholder="tucorreo@ejemplo.com" />
        </label>
        <label class="campo">
          <span>Contraseña</span>
          <input type="password" autoComplete="current-password" required value={clave} onInput={(e) => setClave(e.currentTarget.value)} />
        </label>
        {error && <p class="aviso" role="alert">{error}</p>}
        <button class="boton boton--principal" disabled={ocupado}>
          {ocupado ? 'Entrando…' : 'Entrar'}
        </button>
        <p class="formulario__pie">
          ¿Primera vez aquí? <a href="/registro">Crea tu cuenta</a>
        </p>
      </form>
    </Portada>
  )
}

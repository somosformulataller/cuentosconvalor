import { Luna } from '../ui/Luna'

/**
 * /inicio: página de bienvenida para la publicidad. Un video vertical de
 * 3 minutos y el botón que lleva al registro. Se ve sin sesión.
 */
export function Landing() {
  return (
    <main class="landing">
      <header class="landing__marca">
        <Luna size={34} />
        <strong>Cuentos de valor</strong>
      </header>

      <h1 class="landing__titulo">
        Mira este video de solo 3 minutos para que aprendas a crear el primer cuento personalizado para tu hijo,{' '}
        <span>ahora mismo</span>
      </h1>

      <div class="landing__video">
        <video src="/video/inicio.mp4" poster="/video/inicio.jpg" controls playsInline preload="metadata" />
      </div>

      <p class="landing__texto">
        Regístrate y activa tu cuenta por solo <strong>9 dólares</strong> a tasa BCV, pagando por <strong>Pago Móvil</strong>.
      </p>

      <a href="/registro" class="boton boton--principal boton--grande landing__boton">
        Sí, deseo activar mi cuenta ahora mismo
      </a>
    </main>
  )
}

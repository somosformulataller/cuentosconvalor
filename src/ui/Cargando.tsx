export function Cargando({ texto = 'Un momento…' }: { texto?: string }) {
  return (
    <div class="cargando" role="status">
      <span class="cargando__luna" aria-hidden="true">🌙</span>
      <p>{texto}</p>
    </div>
  )
}

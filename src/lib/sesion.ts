import type { Usuario } from './api'
import { crearStore } from './store'

export const sesion = crearStore<Usuario | null>(null)

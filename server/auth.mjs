// Registro, entrada y sesión por cookie (HttpOnly, 30 días).
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { sql } from './db.mjs'

const COOKIE = 'cv_sesion'
const DIAS = 30
// En producción (Vercel, con HTTPS) la cookie solo viaja cifrada
const SEGURA = process.env.VERCEL ? '; Secure' : ''

export function hashClave(clave) {
  const sal = randomBytes(16)
  return `${sal.toString('hex')}:${scryptSync(clave, sal, 64).toString('hex')}`
}

export function claveCorrecta(clave, guardada) {
  const [sal, hash] = guardada.split(':')
  const a = scryptSync(clave, Buffer.from(sal, 'hex'), 64)
  return timingSafeEqual(a, Buffer.from(hash, 'hex'))
}

export async function abrirSesion(res, usuarioId) {
  const token = randomBytes(32).toString('base64url')
  const vence = new Date(Date.now() + DIAS * 864e5)
  await sql`insert into sesiones (token, usuario_id, vence) values (${token}, ${usuarioId}, ${vence})`
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DIAS * 86400}${SEGURA}`)
}

export async function cerrarSesion(req, res) {
  const token = leerCookie(req)
  if (token) await sql`delete from sesiones where token = ${token}`
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SEGURA}`)
}

export async function usuarioDe(req) {
  const token = leerCookie(req)
  if (!token) return null
  const [fila] = await sql`
    select u.id, u.nombre, u.email from sesiones s join usuarios u on u.id = s.usuario_id
    where s.token = ${token} and s.vence > now()`
  return fila ?? null
}

function leerCookie(req) {
  const m = (req.headers.cookie ?? '').match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`))
  return m ? m[1] : null
}

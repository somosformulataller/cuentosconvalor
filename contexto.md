# Contexto de Cuentos de valor

Todo lo que hace falta para retomar la PWA. Actualizado el 04-11-2026 (noche).
Para arrancarla y ver cómo está armado el código, ver `README.md`.

## Qué es

PWA para mamás y papás. Al iniciar sesión, **Luna** (la cuentacuentos) conversa
en un chat y pregunta:

1. Cuéntame de tu hijo.
2. ¿Qué valores quieres reforzar?
3. ¿Qué personajes te gustaría en la historia?

Con eso escribe un cuento de **4 capítulos**, uno por uno (220–350 palabras cada
uno). Después de cada capítulo se puede seguir («¡Me encanta, sigue!») o pedir un
cambio, y Luna lo reescribe. Al final el cuento se lee en «el libro» y se
**escucha narrado**, capítulo tras capítulo, como un audiolibro.

## Decisiones tomadas

- **Diseño:** colores pastel y amigables (crema, lavanda, durazno, menta,
  celeste, rosa), en `src/styles.css`.
- **Chat:** inspirado en el chat de SARA del proyecto unaobra.
- **Todo con Gemini (04-11-2026), una sola clave `GEMINI_API_KEY`:**
  - **Escribir:** `gemini-3.8-flash` (se cambia con `GEMINI_MODEL`), con la
    Interactions API y `store: false` (Google no guarda la conversación). Se
    eligió por costo: antes era Claude Opus 5.5.
  - **Narrar:** `gemini-3.8-flash-tts`, voz `Sulafat` (cálida). Otras voces
    suaves: `Vindemiatrix`, `Achernar`, `Achird`. Cada capítulo se narra una vez
    por versión, se pasa a MP3 (64 kbps, ~10 veces más liviano que el WAV) y se
    guarda en el bucket privado `audios` de Supabase. La app lo reproduce con un
    enlace firmado que vence en un día.
  - Sin la clave: modo demostración (cuento de ejemplo) y voz del teléfono.
  - OpenAI TTS queda como respaldo de la voz si no hay clave de Gemini.
- **Costo estimado por cuento (precios del 04-11-2026):** ~US$0,06 escribirlo y
  ~US$0,14 narrarlo (10 min), unos **US$0,20** en total, ~50 cuentos por US$10.
  **El 1-ene-2027 Gemini duplica sus precios** (~US$0,40 por cuento).
- **No usar el nivel gratis de Gemini en producción:** Google usa ese contenido
  para mejorar sus productos, y la app manda datos de niños.
- **Hosting:** Vercel (`formula-taller/cuentosconvalor`) para la PWA y la API
  (una función, hasta 300 s por respuesta); Supabase (`guluzhoumokowgepgarm`)
  para la base Postgres y los audios. Vercel despliega solo con cada push a `main`;
  las migraciones se corren a mano en el SQL Editor de Supabase.
- **Datos:** tablas usuarios, sesiones, cuentos, mensajes y capitulos, con RLS
  activado y sin políticas (solo entra el servidor). Contraseñas con scrypt y
  sesión propia por cookie HttpOnly (no Supabase Auth).

## Mensualidad y superadmin (en producción desde el 04-11-2026)

- **$9 al mes** (`PRECIO_USD`), 30 días por pago, convertido a Bs con la tasa BCV
  del día (dolarapi, como La Mejor Llave; fin de semana, la del lunes).
- **Pago Móvil** a la misma cuenta de La Mejor Llave y Formula Taller: Banco de
  Venezuela, 0422-0166113, C.I. 18033691 (cuenta `0102***7113`, `llave-bdv-4`).
- **Al subir la captura:** el OCR lee la referencia (si no la lee, pide otra
  captura; si ya se usó, la rechaza), se dan los 30 días **en el momento** y el
  pago queda «verificando». Luego `server/pagos/conciliar.mjs` lo busca en el
  banco (misma Bank API), lo marca como usado y lo aprueba. Lo que no cuadra
  (no aparece en 10 min, pagó de menos, ya usado, varios iguales) pasa a «Por
  revisar» en el superadmin; nunca se rechaza solo. Rechazar quita los 30 días.
- **Avisos:** ventana para renovar 7 días antes, 3 días antes y el día del
  vencimiento (una vez al día) y franja toda la última semana. Vencido: no crea
  ni escribe cuentos, pero sí lee y escucha los que tiene.
- **Superadmin** (`/admin`, menú ☰ → Superadmin, cuenta `admin@cuentosdevalor.app`
  con `es_admin`): Resumen, Pagos (con captura, OCR y banco; aprobar, buscar en el
  banco, rechazar), **Banco** (cada abono de la cuenta compartida marcado como
  Cuentos de valor, otra app o libre; filtro «Solo Cuentos de valor») y Usuarios
  con su actividad paso a paso (tabla `eventos`).
- Variables en Vercel (las copié de La Mejor Llave con la CLI de Vercel, ya
  enlazada en esta carpeta): `BANK_API_URL`, `BANK_API_TOKEN`,
  `BANK_API_ACCOUNT_NAME`, `PAYMENT_OCR_URL`, `PAYMENT_OCR_API_KEY` y
  `CRON_SECRET` (propia de Cuentos, está en el `.env`).
- Apagado de emergencia de la validación: `PAGOS_VALIDACION_AUTOMATICA=false`.
- **Riesgo aceptado:** como el acceso es inmediato, una captura falsa pero
  legible da acceso hasta que se rechace en «Por revisar».

## Cambios del 04-11-2026 (tarde), todos en producción

- **Pixel de Meta `1352260146826294`** en `index.html` (PageView en todas las
  páginas). Evento personalizado **`pagoUnCuento`** (value 9, USD) al tocar
  «Confirmar pago y activar mi cuenta» (`src/lib/fbpixel.ts`, mismo esquema que
  La Mejor Llave): una vez cada 24 h por navegador (`localStorage`
  `fb-evento:pagoUnCuento`). Desde el 06-11 se envía **solo cuando el servidor
  guardó el pago** (ya sale en el superadmin); si la captura no se lee, está
  repetida o falla la conexión, no se envía. Mide pagos enviados, no aprobados
  por el banco. Sin CAPI.
  - En Meta hubo que agregar `cuentosdevalor.com` en **Permisos de tráfico** del
    pixel; sin eso Meta bloqueaba todo («unavailable on this website due to
    it's traffic permission settings»). Probado con Chrome automático: llegan
    PageView y pagoUnCuento (un Chrome *headless* sin user agent normal no envía
    nada: Meta lo toma como bot).
  - Para repetir la prueba el mismo día: incógnito, o
    `localStorage.removeItem('fb-evento:pagoUnCuento')`.
- **Narración sin títulos:** la voz (Gemini y la del teléfono) lee solo el texto
  del capítulo, sin «Capítulo N» ni el título. Los capítulos ya narrados antes
  conservan su audio con título (para rehacerlos habría que borrar
  `audio_version`, ~US$0,14 por cuento; no se hizo).
- **Pasos fijos arriba en el chat** (Tu hijo, Valores, Personajes, El cuento):
  `.cabecera` sticky en `Chat.tsx`. Ojo: tiene `backdrop-filter`, así que nada
  con `position: fixed` (modales) puede ir dentro; por eso la ventana de pago
  se veía recortada y se sacó de ahí.
- **Modal de pago:** botón para copiar cada dato (banco, teléfono `04220166113`,
  cédula `18033691` y monto en Bs como `8038,96`).
- **Soporte por WhatsApp 0424-2349786** (`Soporte` en `PagoModal.tsx`, enlace
  `wa.me/584242349786` con mensaje escrito):
  - en el modal de pago, debajo del error, si el OCR no lee la captura (también
    si ya se usó o el OCR no responde);
  - si un pago queda «Por revisar» (`en_revision` en `/api/suscripcion`), una
    ventana una vez al día: «No encontramos tu pago en el banco».
- **Landing `/inicio`** (`src/screens/Landing.tsx`): título, video vertical, texto
  de los $9 por Pago Móvil y botón «Sí, deseo activar mi cuenta ahora mismo» →
  `/registro`. Se ve sin sesión. Video en `public/video/inicio.mp4` (comprimido
  de 136 MB a 9 MB, 720p) con portada `inicio.jpg`; el service worker no toca
  `/video/` (iPhone falla con video por el SW). El título dice «3 minutos» y el
  video dura 3:57 (lo dejó así la usuaria).
- **Direcciones sin número:** el chat es `/cuento` y el libro `/libro`; el id va
  en `history.state` y en `localStorage` (`cuento-actual`), ver
  `abrirCuento()` en `src/lib/router.ts`. Los enlaces usan
  `<a href="/cuento" data-cuento={id}>`. Las direcciones viejas
  (`/cuento/13`, `/cuento/13/libro`) se limpian solas. Al cerrar sesión se olvida
  el cuento. Ya no hay enlace para compartir un cuento concreto.

## Estado actual

- Código en github.com/somosformulataller/cuentosconvalor (rama `main`). El
  04-11 se subió el paso a Supabase + Vercel y a Gemini Flash; Supabase aplica
  las migraciones al subir.
- Probado el 04-11: Luna con Gemini Flash hace las preguntas (3–4 s) y escribe el
  capítulo 1 (23 s, 286 palabras, formato correcto). La voz de Gemini narró una
  prueba corta y la conversión a MP3 funciona (1,1 MB → 184 KB).
- La app usa solo la clave secreta de Supabase (sin contraseña de la base).
- **En producción desde el 04-11:** https://cuentosconvalor.vercel.app, con las
  variables cargadas en Vercel (las claves como Sensitive). Probado ahí: entrar,
  chat en vivo, capítulo 1 en 17 s y su audio MP3.
- **Migraciones:** la integración de Supabase con GitHub no quedó conectada; las
  migraciones las corre la usuaria en el SQL Editor (las 4 del 04-11 ya corridas).
- Usuario de prueba: `prueba@cuentosdevalor.app` (la clave la tiene la usuaria).
- El `.env` local usa por ahora la clave de Gemini de Formula Taller (el gasto se
  carga a ese proyecto de Google).

## Pendientes y decisiones abiertas

0. **Pagos:** probar con un pago real (el OCR no se ha probado con una captura
   real en Cuentos). El cron ya está en cron-job.org (04-11, cada minuto, 200 OK)
   a `https://www.cuentosdevalor.com/api/cron/pagos?key=<CRON_SECRET>`.

1. El audio de un capítulo tarda ~40 s en narrarse. Se prepara solo al terminar
   de escribirse (probado: 50 s después ya está, sale en 1,7 s); si se pide antes,
   espera esa misma narración (reserva en la base, sin pagar dos veces).
3. Crear una clave de Gemini propia para Cuentos de valor, de pago.
4. Confirmar el nombre **Luna**: lo elegí yo y la usuaria no lo ha confirmado.
5. ~~Dominio propio~~: listo, **https://www.cuentosdevalor.com** (sin www
   redirige con 308).
6. Antes de abrirla al público: límite de cuentos por cuenta (cada uno cuesta),
   copias de seguridad de la base, política de privacidad (son datos de niños)
   y recuperar contraseña (hoy no existe).

## Notas de trabajo

- Al cambiar algo en `server/` o `shared/` hay que reiniciar `npm run dev`.
- Luna sabe en qué etapa va por una nota del sistema que arma `etapa()` en
  `server/luna.mjs`; va pegada a las instrucciones fijas (`system_instruction`).
- En local se usa la misma base de Supabase que en producción.

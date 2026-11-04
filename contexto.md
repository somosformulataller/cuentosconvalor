# Contexto de Cuentos de valor

Todo lo que hace falta para retomar la PWA. Actualizado el 04-11-2026.
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
  migraciones las corre la usuaria en el SQL Editor (las 2 de hoy ya corridas).
- Usuario de prueba: `prueba@cuentosdevalor.app` (la clave la tiene la usuaria).
- El `.env` local usa por ahora la clave de Gemini de Formula Taller (el gasto se
  carga a ese proyecto de Google).

## Pendientes y decisiones abiertas

1. Al borrar un cuento, sus audios quedan en el bucket: falta borrarlos.
2. El primer audio de un capítulo puede tardar ~40 s si se pide justo al
   terminar de escribirlo (la narración en segundo plano aún no acabó).
3. Crear una clave de Gemini propia para Cuentos de valor, de pago.
4. Confirmar el nombre **Luna**: lo elegí yo y la usuaria no lo ha confirmado.
5. Dominio propio.
6. Antes de abrirla al público: límite de cuentos por cuenta (cada uno cuesta),
   copias de seguridad de la base, política de privacidad (son datos de niños)
   y recuperar contraseña (hoy no existe).

## Notas de trabajo

- Al cambiar algo en `server/` o `shared/` hay que reiniciar `npm run dev`.
- Luna sabe en qué etapa va por una nota del sistema que arma `etapa()` en
  `server/luna.mjs`; va pegada a las instrucciones fijas (`system_instruction`).
- En local se usa la misma base de Supabase que en producción.

# Contexto de Cuentos de valor

Todo lo que hace falta para retomar la PWA. Actualizado el 04-11-2026.
Para arrancarla y ver cómo está armado el código, ver `README.md`.

## Qué es

PWA para mamás y papás. Al iniciar sesión, **Luna** (la cuentacuentos, Claude
por dentro) conversa en un chat y pregunta:

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
- **Texto del cuento:** Claude, modelo `claude-opus-5-5` (se cambia con
  `CLAUDE_MODEL`). Sin `ANTHROPIC_API_KEY` corre en *modo demostración* con un
  cuento de ejemplo.
- **Voz (cambio del 04-11-2026):** ahora narra **Gemini TTS**.
  - Modelo `gemini-3.8-flash-tts`, voz `Sulafat` (cálida). Se cambian con
    `GEMINI_TTS_MODEL` y `GEMINI_TTS_VOICE`. Otras voces suaves: `Vindemiatrix`
    (gentil), `Achernar` (suave), `Achird` (amigable).
  - El estilo de lectura («cuentacuentos antes de dormir, cálida, pausada») va
    aparte del texto, en `speech_metadata.style`; el texto se lee tal cual.
  - Cada capítulo se genera una sola vez por versión y se guarda como WAV en
    `data/audio/`. Se empieza a preparar apenas Luna escribe el capítulo.
  - Si no hay `GEMINI_API_KEY`, usa OpenAI TTS (`gpt-4o-mini-tts`, voz `coral`,
    MP3) si hay `OPENAI_API_KEY`; si no hay ninguna, la voz del teléfono.
  - Si el audio del servidor falla al sonar, la app sigue con la voz del teléfono.
- **Datos:** SQLite local (`node:sqlite`) en `data/cuentos.db`, con las tablas
  usuarios, sesiones, cuentos, mensajes y capitulos. Contraseñas con scrypt y
  sesión por cookie HttpOnly.

## Estado actual

- Solo corre en local (`npm run dev` → http://127.0.0.1:5230). Sin git y sin
  hosting.
- **No hay `.env`:** sin claves, la app está en modo demostración y con la voz
  del teléfono. La base tiene 1 usuario de prueba, 1 cuento empezado y ningún
  capítulo.
- La voz de Gemini está programada pero **no se ha probado con una clave real**.

## Pendientes y decisiones abiertas

1. Crear `.env` (copiar `.env.example`) con `ANTHROPIC_API_KEY` y
   `GEMINI_API_KEY` (se saca en Google AI Studio), y probar un cuento completo
   con voz.
2. Confirmar el nombre **Luna**: lo elegí yo y la usuaria no lo ha confirmado.
3. Decidir hosting y base de datos para producción (¿Supabase?, ¿Vercel?). Hoy
   todo es local.
4. Poner git al proyecto.
5. Peso de los audios: el WAV pesa unos 2,9 MB por minuto (un capítulo de
   2–3 min ≈ 6–9 MB). Para producción conviene convertirlos a MP3 u OGG, o pedir
   un formato más liviano.

## Notas de trabajo

- Al cambiar algo en `server/` o `shared/` hay que reiniciar `npm run dev`.
- Luna sabe en qué etapa va por una nota del sistema que arma `etapa()` en
  `server/luna.mjs`.
- `data/` (base y audios) no va al repo.
- Necesita Node 22.13 o más nuevo.

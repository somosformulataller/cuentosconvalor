# Cuentos de valor

PWA para mamás y papás: al iniciar sesión, **Luna** (la cuentacuentos, Claude
por dentro) pregunta en un chat:

1. Cuéntame de tu hijo
2. ¿Qué valores quieres reforzar?
3. ¿Qué personajes te gustaría en la historia?

Con eso escribe el cuento **capítulo por capítulo** (4). Después de cada uno se
puede decir "¡Me encanta, sigue!" o pedir un cambio, y Luna lo reescribe. Al
final, el cuento completo se lee en "el libro" y se **escucha con voz**.

## Arrancar

```bash
npm install
cp .env.example .env    # y pega las claves
npm run dev             # http://127.0.0.1:5230
```

- **Sin `ANTHROPIC_API_KEY`** corre en *modo demostración*: un cuento de
  ejemplo con el nombre y los personajes que escribas, para ver la app.
- **Voz:** con `GEMINI_API_KEY` cada capítulo lo narra Gemini TTS
  (`gemini-3.8-flash-tts`, voz `Sulafat`, WAV) y queda guardado en `data/audio/`.
  Si no hay, usa `OPENAI_API_KEY` (OpenAI TTS, MP3); sin ninguna, la voz del
  propio teléfono o computador (gratis).

Producción: `npm run build` y `npm start` (sirve `dist/` y la API en el
puerto `PORT`, 5230 por defecto). Necesita Node 22.13 o más nuevo.

## Cómo está armado

```
shared/formato.js   lee las etiquetas de Luna (<mensaje>, <capitulo>…); lo usan app y servidor
server/
  api.mjs           la API (/api/...): registro, sesión, cuentos, chat en vivo (NDJSON), audio
  luna.mjs          el prompt de Luna y la llamada a Claude (claude-opus-5-5, con fallbacks)
  demo.mjs          el modo demostración
  voz.mjs           la narración con Gemini TTS (u OpenAI)
  db.mjs            SQLite en data/cuentos.db (node:sqlite, sin instalar nada)
  auth.mjs          contraseñas con scrypt y sesión por cookie HttpOnly
  prod.mjs          servidor de producción
src/
  screens/          Entrar, Registro, Chat (con Luna), Libro (leer y escuchar), Cuentos
  lib/narrar.ts     reproduce los capítulos uno detrás de otro
  styles.css        paleta pastel (crema, lavanda, durazno, menta, celeste, rosa)
public/             manifest, service worker (sw.js) e íconos
```

- En desarrollo la API corre dentro de Vite (`vite.config.ts`): un solo
  proceso. **Al cambiar algo en `server/` o `shared/` hay que reiniciar
  `npm run dev`.**
- Luna sabe en qué etapa va por una nota del sistema que arma
  `etapa()` en `luna.mjs` según cuántas respuestas y capítulos hay.
- `data/` (la base y los audios) no va al repo.

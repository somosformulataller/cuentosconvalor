# Cuentos de valor

PWA para mamás y papás: al iniciar sesión, **Luna** (la cuentacuentos, Gemini
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

- **La base y los audios** están en Supabase (proyecto `guluzhoumokowgepgarm`):
  hacen falta `SUPABASE_URL` y `SUPABASE_SECRET_KEY`. En local
  se usa la misma base que en producción.
- **Sin `GEMINI_API_KEY`** corre en *modo demostración*: un cuento de ejemplo
  con el nombre y los personajes que escribas, y la voz del propio teléfono.
- **Con `GEMINI_API_KEY`**, Gemini 3.8 Flash escribe el cuento y Gemini TTS
  (`gemini-3.8-flash-tts`, voz `Sulafat`) narra cada capítulo. El audio se pasa
  a MP3 y se guarda en el bucket privado `audios` de Supabase Storage.

## Producción

- **Vercel** (proyecto `formula-taller/cuentosconvalor`) despliega solo con cada
  push a `main`: construye la PWA (`dist/`) y la API corre como una función
  (`api/index.mjs`, ver `vercel.json`). Las variables del `.env` van en
  Settings → Environment Variables.
- **Supabase** aplica solo las migraciones de `supabase/migrations/` al subir
  a `main`.
- También se puede correr en un servidor propio: `npm run build` y `npm start`
  (puerto `PORT`, 5230 por defecto).

## Cómo está armado

```
shared/formato.js   lee las etiquetas de Luna (<mensaje>, <capitulo>…); lo usan app y servidor
server/
  api.mjs           la API (/api/...): registro, sesión, cuentos, chat en vivo (NDJSON), audio
  luna.mjs          el prompt de Luna y la llamada a Gemini (Interactions API, store false)
  demo.mjs          el modo demostración
  voz.mjs           la narración con Gemini TTS (u OpenAI), MP3 en Supabase Storage
  db.mjs            el cliente de Supabase con la clave secreta (supabase-js)
  auth.mjs          contraseñas con scrypt y sesión por cookie HttpOnly
  prod.mjs          servidor propio de producción (fuera de Vercel)
api/index.mjs       la API como función de Vercel
supabase/migrations/ tablas (RLS sin políticas: solo entra el servidor) y bucket de audios
src/
  screens/          Entrar, Registro, Chat (con Luna), Libro (leer y escuchar), Cuentos
  lib/narrar.ts     reproduce los capítulos uno detrás de otro
  styles.css        paleta pastel (crema, lavanda, durazno, menta, celeste, rosa)
public/             manifest, service worker (sw.js) e íconos
```

- En desarrollo la API corre dentro de Vite (`vite.config.ts`): un solo
  proceso. **Al cambiar algo en `server/` o `shared/` hay que reiniciar
  `npm run dev`.**
- Luna sabe en qué etapa va por una nota del sistema que arma `etapa()` en
  `luna.mjs` según cuántas respuestas y capítulos hay.

-- Cuentos de valor: la base en Supabase (antes SQLite local).
-- Solo la usa el servidor (la API en Vercel) por conexión directa, así que
-- todas las tablas tienen RLS activado y ninguna política: desde el navegador
-- (anon/authenticated) no se lee ni se escribe nada.

create table if not exists public.usuarios (
  id integer generated always as identity primary key,
  nombre text not null,
  email text not null unique,          -- siempre en minúsculas
  clave text not null,                 -- scrypt: sal:hash
  creado timestamptz not null default now()
);

create table if not exists public.sesiones (
  token text primary key,
  usuario_id integer not null references public.usuarios(id) on delete cascade,
  vence timestamptz not null
);
create index if not exists sesiones_usuario_idx on public.sesiones (usuario_id);

create table if not exists public.cuentos (
  id integer generated always as identity primary key,
  usuario_id integer not null references public.usuarios(id) on delete cascade,
  titulo text,
  para text,
  valores text,
  estado text not null default 'creando' check (estado in ('creando', 'listo')),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists cuentos_usuario_idx on public.cuentos (usuario_id, actualizado desc);

create table if not exists public.mensajes (
  id integer generated always as identity primary key,
  cuento_id integer not null references public.cuentos(id) on delete cascade,
  rol text not null check (rol in ('user', 'assistant')),
  texto text not null,
  creado timestamptz not null default now()
);
create index if not exists mensajes_cuento_idx on public.mensajes (cuento_id, id);

create table if not exists public.capitulos (
  cuento_id integer not null references public.cuentos(id) on delete cascade,
  numero integer not null,
  titulo text not null,
  texto text not null,
  version integer not null default 1,  -- cambia el audio al reescribirlo
  audio text,                          -- ruta en el bucket «audios» del audio de `audio_version`
  audio_version integer,
  primary key (cuento_id, numero)
);

alter table public.usuarios enable row level security;
alter table public.sesiones enable row level security;
alter table public.cuentos enable row level security;
alter table public.mensajes enable row level security;
alter table public.capitulos enable row level security;
revoke all on public.usuarios, public.sesiones, public.cuentos, public.mensajes, public.capitulos from anon, authenticated;

-- Audios narrados: bucket privado. El servidor sube con la clave secreta y
-- entrega enlaces firmados que vencen.
insert into storage.buckets (id, name, public)
values ('audios', 'audios', false)
on conflict (id) do nothing;

-- Mensualidad por Pago Móvil, validada contra el banco (la misma Bank API y la
-- misma cuenta que La Mejor Llave y Formula Taller), superadmin y registro de
-- actividad de cada usuario.

-- 1. Usuarios: superadmin y hasta cuándo tiene pagado ------------------------
alter table public.usuarios add column if not exists es_admin boolean not null default false;
alter table public.usuarios add column if not exists pagado_hasta timestamptz;

-- 2. Pagos ------------------------------------------------------------------
-- Al subir la captura el acceso se activa enseguida (30 días) y el pago queda
-- «verificando». El sistema lo busca en el banco: si lo encuentra, «aprobado».
-- Si no cuadra o no aparece, sigue «verificando» con un motivo de revisión para
-- el superadmin. Nunca se rechaza solo; si una persona lo rechaza, se le quitan
-- los días que dio.
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  usuario_id integer not null references public.usuarios(id) on delete cascade,
  estado text not null default 'verificando' check (estado in ('verificando', 'aprobado', 'rechazado')),
  monto_usd numeric(10, 2) not null,
  monto_bs numeric(14, 2),
  tasa numeric(14, 4),
  referencia text not null,             -- los 6 últimos dígitos que leyó el OCR
  referencia_completa text,
  ocr_monto numeric(14, 2),
  ocr_banco text,
  ocr jsonb,
  comprobante text,                     -- ruta en el bucket «comprobantes»
  dias integer not null default 30,     -- los días que dio este pago
  revision text,                        -- por qué lo tiene que mirar una persona (null = automático)
  nota text,
  banco jsonb,                          -- el movimiento del banco que lo pagó
  bank_tx_id bigint,
  origen text check (origen in ('auto', 'manual')),
  revisado_por integer references public.usuarios(id) on delete set null,
  revisado_en timestamptz,
  intentos integer not null default 0,
  ultimo_intento timestamptz,
  creado timestamptz not null default now()
);
create index if not exists pagos_usuario_idx on public.pagos (usuario_id, creado desc);
create index if not exists pagos_estado_idx on public.pagos (estado, creado);
create index if not exists pagos_referencia_idx on public.pagos (referencia);

-- 3. Turno para entrar al banco (lo comparten tres apps: no entrar seguido) --
create table if not exists public.banco_turno (
  id integer primary key default 1 check (id = 1),
  ultimo_latido timestamptz not null default 'epoch'
);
insert into public.banco_turno (id) values (1) on conflict do nothing;

create or replace function public.tomar_turno_banco(p_segundos integer)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  update banco_turno set ultimo_latido = now()
   where id = 1 and ultimo_latido < now() - make_interval(secs => p_segundos);
  return found;
end;
$$;

-- 4. Registrar un pago y dar el acceso en un solo paso ------------------------
-- Si todavía tiene días, se suman a partir de su vencimiento (renovar antes no
-- hace perder días).
create or replace function public.registrar_pago(
  p_usuario integer, p_monto_usd numeric, p_monto_bs numeric, p_tasa numeric,
  p_referencia text, p_referencia_completa text, p_ocr_monto numeric, p_ocr_banco text,
  p_ocr jsonb, p_comprobante text, p_dias integer
) returns public.pagos
language plpgsql
set search_path = public
as $$
declare
  v public.pagos;
begin
  insert into pagos (usuario_id, monto_usd, monto_bs, tasa, referencia, referencia_completa,
                     ocr_monto, ocr_banco, ocr, comprobante, dias)
  values (p_usuario, p_monto_usd, p_monto_bs, p_tasa, p_referencia, p_referencia_completa,
          p_ocr_monto, p_ocr_banco, p_ocr, p_comprobante, p_dias)
  returning * into v;
  update usuarios
     set pagado_hasta = greatest(coalesce(pagado_hasta, now()), now()) + make_interval(days => p_dias)
   where id = p_usuario;
  return v;
end;
$$;

-- 5. Aprobar o rechazar (rechazar quita los días que dio el pago) -------------
create or replace function public.decidir_pago(
  p_pago uuid, p_estado text, p_origen text, p_admin integer, p_nota text, p_banco jsonb
) returns boolean
language plpgsql
set search_path = public
as $$
declare
  v public.pagos;
begin
  if p_estado not in ('aprobado', 'rechazado') then raise exception 'estado inválido'; end if;
  update pagos
     set estado = p_estado, origen = p_origen, revisado_por = p_admin, revisado_en = now(),
         nota = coalesce(p_nota, nota), revision = null,
         banco = coalesce(p_banco, banco),
         bank_tx_id = coalesce((p_banco ->> 'id')::bigint, bank_tx_id)
   where id = p_pago and estado = 'verificando'
  returning * into v;
  if not found then return false; end if;
  if p_estado = 'rechazado' then
    update usuarios set pagado_hasta = pagado_hasta - make_interval(days => v.dias)
     where id = v.usuario_id and pagado_hasta is not null;
  end if;
  return true;
end;
$$;

-- 6. Actividad de cada usuario (qué hace y cuándo) ---------------------------
create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  usuario_id integer not null references public.usuarios(id) on delete cascade,
  tipo text not null,
  detalle jsonb,
  creado timestamptz not null default now()
);
create index if not exists eventos_usuario_idx on public.eventos (usuario_id, creado desc);
create index if not exists eventos_creado_idx on public.eventos (creado desc);

-- 7. Seguridad: igual que el resto, solo entra el servidor con la clave secreta
alter table public.pagos enable row level security;
alter table public.banco_turno enable row level security;
alter table public.eventos enable row level security;
revoke all on public.pagos, public.banco_turno, public.eventos from anon, authenticated;

revoke execute on function public.tomar_turno_banco(integer) from public, anon, authenticated;
revoke execute on function public.registrar_pago(integer, numeric, numeric, numeric, text, text, numeric, text, jsonb, text, integer) from public, anon, authenticated;
revoke execute on function public.decidir_pago(uuid, text, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.tomar_turno_banco(integer) to service_role;
grant execute on function public.registrar_pago(integer, numeric, numeric, numeric, text, text, numeric, text, jsonb, text, integer) to service_role;
grant execute on function public.decidir_pago(uuid, text, text, integer, text, jsonb) to service_role;

-- 8. Capturas de los pagos: bucket privado (solo el superadmin las ve, con enlace firmado)
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

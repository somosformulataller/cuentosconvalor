-- Embudo del superadmin: visitas a la landing (/inicio) y al registro, y una
-- función que cuenta cada paso (registro → captura → pago → días de uso).
-- Se corre a mano en el SQL Editor de Supabase.

-- 1. Visitas sin sesión: cada navegador cuenta una vez por página -------------
create table if not exists public.visitas (
  pagina text not null check (pagina in ('inicio', 'registro')),
  visitante text not null,             -- id al azar guardado en el navegador
  creado timestamptz not null default now(),
  primary key (pagina, visitante)
);
create index if not exists visitas_creado_idx on public.visitas (pagina, creado);

alter table public.visitas enable row level security;
revoke all on public.visitas from anon, authenticated;

-- 2. Los números del embudo. p_desde = null: desde siempre --------------------
-- Usuarios: los registrados desde p_desde (sin el superadmin). De ellos, quién
-- envió captura, quién tiene un pago aprobado y cuántos días distintos (hora de
-- Venezuela) usó la app desde que pagó.
create or replace function public.embudo(p_desde timestamptz default null)
returns json
language sql
stable
set search_path = public
as $$
  with
  u as (
    select id from usuarios where not es_admin and (p_desde is null or creado >= p_desde)
  ),
  pg as (
    select p.usuario_id, p.estado, p.creado from pagos p join u on u.id = p.usuario_id
  ),
  pagados as (
    select usuario_id, min(creado) as desde from pg where estado = 'aprobado' group by usuario_id
  ),
  dias as (
    select pa.usuario_id, count(distinct (e.creado at time zone 'America/Caracas')::date) as n
      from pagados pa
      join eventos e on e.usuario_id = pa.usuario_id and e.creado >= pa.desde
     where e.tipo not in ('registro', 'salir', 'pago_enviado', 'pago_ilegible', 'pago_repetido', 'pago_aprobado', 'pago_rechazado')
     group by pa.usuario_id
  ),
  ventas as (
    select count(*) as n, coalesce(sum(monto_usd), 0) as usd
      from pagos where estado = 'aprobado' and (p_desde is null or creado >= p_desde)
  )
  select json_build_object(
    'landing',       (select count(*) from visitas where pagina = 'inicio' and (p_desde is null or creado >= p_desde)),
    'pagina_registro', (select count(*) from visitas where pagina = 'registro' and (p_desde is null or creado >= p_desde)),
    'registrados',   (select count(*) from u),
    'capturas',      (select count(distinct usuario_id) from pg),
    'pagaron',       (select count(*) from pagados),
    'dias_1',        (select count(*) from dias where n >= 1),
    'dias_2',        (select count(*) from dias where n >= 2),
    'dias_3',        (select count(*) from dias where n >= 3),
    'dias_10',       (select count(*) from dias where n >= 10),
    'ventas',        (select n from ventas),
    'ventas_usd',    (select usd from ventas),
    'visitas_desde', (select min(creado) from visitas)
  );
$$;

revoke execute on function public.embudo(timestamptz) from public, anon, authenticated;
grant execute on function public.embudo(timestamptz) to service_role;

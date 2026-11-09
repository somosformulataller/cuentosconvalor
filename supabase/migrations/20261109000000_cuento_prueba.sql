-- Cuento de prueba gratis: quien se registra y nunca ha pagado crea un cuento
-- corto con Luna (3 capítulos cortos) antes de que se le pida la mensualidad.
-- Se corre a mano en el SQL Editor de Supabase, ANTES de subir el código.

alter table public.cuentos add column if not exists prueba boolean not null default false;

-- Un solo cuento de prueba por usuario
create unique index if not exists cuentos_una_prueba_idx on public.cuentos (usuario_id) where prueba;

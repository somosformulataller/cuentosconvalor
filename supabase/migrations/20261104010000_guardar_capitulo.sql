-- Guardar un capítulo nuevo o reescribirlo (sube la versión, que cambia su
-- audio) en un solo paso. La llama la API con la clave secreta; nadie más.
create or replace function public.guardar_capitulo(
  p_cuento integer, p_numero integer, p_titulo text, p_texto text
) returns public.capitulos
language sql
set search_path = public
as $$
  insert into capitulos (cuento_id, numero, titulo, texto)
  values (p_cuento, p_numero, p_titulo, p_texto)
  on conflict (cuento_id, numero) do update
    set titulo = excluded.titulo, texto = excluded.texto, version = capitulos.version + 1
  returning *;
$$;

revoke execute on function public.guardar_capitulo(integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.guardar_capitulo(integer, integer, text, text) to service_role;

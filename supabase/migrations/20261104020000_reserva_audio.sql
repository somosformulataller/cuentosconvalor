-- Narrar cada capítulo una sola vez, aunque el audio se pida desde varios
-- servidores a la vez (Vercel reparte las peticiones). El primero que llega
-- reserva el capítulo y lo narra; los demás esperan a que aparezca el audio.
-- Una reserva de más de 3 minutos se da por perdida (el servidor se cayó).

alter table public.capitulos add column if not exists audio_reserva_version integer;
alter table public.capitulos add column if not exists audio_reserva timestamptz;

create or replace function public.reservar_audio(p_cuento integer, p_numero integer, p_version integer)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  update capitulos
     set audio_reserva_version = p_version, audio_reserva = now()
   where cuento_id = p_cuento and numero = p_numero and version = p_version
     and audio_version is distinct from p_version
     and (audio_reserva_version is distinct from p_version or audio_reserva < now() - interval '3 minutes');
  return found;
end;
$$;

revoke execute on function public.reservar_audio(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.reservar_audio(integer, integer, integer) to service_role;

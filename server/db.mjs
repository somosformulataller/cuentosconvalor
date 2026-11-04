// La base local: un archivo SQLite en data/ (node:sqlite, sin instalar nada).
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

export const DATA_DIR = path.resolve('data')
mkdirSync(path.join(DATA_DIR, 'audio'), { recursive: true })

export const db = new DatabaseSync(path.join(DATA_DIR, 'cuentos.db'))
db.exec(`
  pragma journal_mode = wal;
  pragma foreign_keys = on;

  create table if not exists usuarios (
    id integer primary key,
    nombre text not null,
    email text not null unique collate nocase,
    clave text not null,
    creado text not null default (datetime('now'))
  );

  create table if not exists sesiones (
    token text primary key,
    usuario_id integer not null references usuarios(id) on delete cascade,
    vence integer not null
  );

  create table if not exists cuentos (
    id integer primary key,
    usuario_id integer not null references usuarios(id) on delete cascade,
    titulo text,
    para text,
    valores text,
    estado text not null default 'creando',  -- creando | listo
    creado text not null default (datetime('now')),
    actualizado text not null default (datetime('now'))
  );

  create table if not exists mensajes (
    id integer primary key,
    cuento_id integer not null references cuentos(id) on delete cascade,
    rol text not null,                       -- user | assistant
    texto text not null,
    creado text not null default (datetime('now'))
  );

  create table if not exists capitulos (
    cuento_id integer not null references cuentos(id) on delete cascade,
    numero integer not null,
    titulo text not null,
    texto text not null,
    version integer not null default 1,      -- cambia el audio al reescribirlo
    primary key (cuento_id, numero)
  );
`)

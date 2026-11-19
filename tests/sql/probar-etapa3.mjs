// Prueba de supabase/etapa3.sql con PGlite (auth y storage simulados) sobre una copia mínima de la Reseñalería real.
// Dependencia de entorno: PGlite instalado en la carpeta temporal indicada abajo.
// Uso: node tests/sql/probar-etapa3.mjs supabase/etapa3.sql
import { PGlite } from "file:///C:/Users/kevyn/AppData/Local/Temp/claude/pgt/node_modules/@electric-sql/pglite/dist/index.js";
import fs from "node:fs";
import path from "node:path";

const archivo = process.argv[2];
let fallas = 0;
const ok = (c, m) => { if (c) console.log("ok   -", m); else { fallas++; console.log("FALLA -", m); } };
const lanza = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };

if (!archivo || !fs.existsSync(archivo)) { console.log("FALLA - no existe el archivo SQL:", archivo); process.exit(1); }
const dir = path.dirname(archivo);
const db = new PGlite();
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
const como = async (rol, uid) => { await db.exec(`reset role; set role ${rol};`); await db.query(`select set_config('request.uid',$1,false)`, [uid || ""]); };
const cuenta = async (sql) => (await db.query(sql)).rows[0].c;

await db.exec(`
create schema auth;
create table auth.users(id uuid primary key, email text);
create role anon; create role authenticated;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true),'')::uuid $$;
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets(id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
`);
await db.exec(fs.readFileSync(path.join(dir, "etapa1.sql"), "utf8"));

// Copia mínima de la Reseñalería tal como existe hoy en Supabase
await db.exec(`
create table public.resenas(
  id bigint generated always as identity primary key,
  nombre text, calificacion integer, comentario text, foto_url text,
  foto_aprobada boolean default false, visible boolean default true, creado timestamptz default now());
alter table public.resenas enable row level security;
create policy "publicar resenas" on public.resenas for insert to anon, authenticated with check ((foto_aprobada = false) and (visible = true));
create view public.resenas_publicas as select id, nombre, calificacion, comentario,
  case when foto_aprobada then foto_url else null::text end as foto_url, creado from public.resenas where visible;
grant select on public.resenas_publicas to anon, authenticated;
grant select, insert, update, delete on public.resenas to anon, authenticated;
create function public.filtrar_resena() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger t_filtrar_resena before insert on public.resenas for each row execute function public.filtrar_resena();
create policy "subir fotos de resenas" on storage.objects for insert to anon, authenticated with check (bucket_id = 'fotos');
`);
await db.exec(fs.readFileSync(path.join(dir, "etapa2.sql"), "utf8"));
// reseña que ya estaba publicada antes de esta etapa (con foto aprobada)
await db.exec(`insert into public.resenas(nombre,calificacion,comentario,foto_url,foto_aprobada,visible) values ('Vieja con foto',5,'ya publicada','http://x/fotos/vieja.jpg',true,true);`);
const sql = fs.readFileSync(archivo, "utf8");
await db.exec(sql); await db.exec(sql);
ok(true, "etapa3.sql se ejecuta 2 veces sin error");
await db.exec(`insert into auth.users values ('${A}','dueno@x.com'),('${B}','otro@x.com'); insert into public.admins(user_id) values ('${A}');
insert into storage.objects(bucket_id,name) values ('fotos','a.jpg');`);
await db.exec(`grant select, insert, update, delete on public.visitas to anon, authenticated;`);

// Reseñas como cliente
await como("anon");
const e1 = await lanza(() => db.query(`insert into public.resenas(nombre,calificacion,comentario) values ('Texto',5,'muy bonito')`));
ok(e1 === null, "anon publica reseña sin foto" + (e1 ? ": " + e1 : ""));
const e2 = await lanza(() => db.query(`insert into public.resenas(nombre,calificacion,comentario,foto_url) values ('Con foto',4,'mi obra','http://x/fotos/nueva.jpg')`));
ok(e2 === null, "anon envía reseña con foto (no se rechaza)" + (e2 ? ": " + e2 : ""));
await lanza(() => db.query(`insert into public.resenas(nombre,calificacion,comentario,foto_url,visible,foto_aprobada) values ('Truco',5,'x','http://x/fotos/t.jpg',true,true)`));
const pub = (await db.query(`select nombre, foto_url from public.resenas_publicas order by id`)).rows;
ok(pub.some(r => r.nombre === "Texto"), "la reseña sin foto sale al instante en la vista");
ok(!pub.some(r => r.nombre === "Con foto"), "la reseña con foto no sale en la vista");
ok(!pub.some(r => r.nombre === "Truco"), "una foto enviada como 'ya aprobada' tampoco sale (queda en espera)");
ok(pub.some(r => r.nombre === "Vieja con foto" && r.foto_url), "la reseña vieja ya publicada sigue publicada con su foto");
ok(await cuenta(`select count(*)::int c from public.resenas`) === 0, "anon no lee la tabla resenas (ni las ocultas)");
await db.query(`delete from public.resenas`);
await db.query(`update public.resenas set visible = true`);
await db.exec("reset role");
ok(await cuenta(`select count(*)::int c from public.resenas`) === 4, "anon no pudo borrar reseñas");
const oculta = (await db.query(`select visible, foto_aprobada from public.resenas where nombre='Con foto'`)).rows[0];
ok(oculta && oculta.visible === false && oculta.foto_aprobada === false, "la reseña con foto quedó guardada oculta y sin aprobar");

// Otro usuario autenticado que no es admin
await como("authenticated", B);
ok(await cuenta(`select count(*)::int c from public.resenas`) === 0, "otro usuario no lee la tabla resenas");
await db.query(`delete from public.resenas`);
await db.query(`delete from storage.objects where bucket_id='fotos'`);
await db.exec("reset role");
ok(await cuenta(`select count(*)::int c from public.resenas`) === 4, "otro usuario no pudo borrar reseñas");
ok(await cuenta(`select count(*)::int c from storage.objects where bucket_id='fotos'`) === 1, "otro usuario no pudo borrar fotos de reseñas");

// Dueño
await como("authenticated", A);
ok(await cuenta(`select count(*)::int c from public.resenas`) === 4, "el dueño ve todas las reseñas, también las ocultas");
await db.query(`update public.resenas set visible = true, foto_aprobada = true where nombre='Con foto'`);
await db.query(`delete from public.resenas where nombre='Texto'`);
await db.query(`delete from storage.objects where bucket_id='fotos' and name='a.jpg'`);
await db.exec("reset role");
ok((await db.query(`select foto_url from public.resenas_publicas where nombre='Con foto'`)).rows[0]?.foto_url === "http://x/fotos/nueva.jpg", "al aprobar, la reseña sale con su foto");
ok(await cuenta(`select count(*)::int c from public.resenas where nombre='Texto'`) === 0, "el dueño borra una reseña");
ok(await cuenta(`select count(*)::int c from storage.objects where bucket_id='fotos'`) === 0, "el dueño borra la foto de una reseña");

// Visitas
await como("anon");
const lv = await lanza(() => db.query(`select * from public.visitas`));
const nv = lv ? 0 : (await db.query(`select count(*)::int c from public.visitas`)).rows[0].c;
await db.query(`select public.registrar_visita('ig','visita')`);
await db.query(`select public.registrar_visita('ig','visita')`);
await db.query(`select public.registrar_visita('otros','tienda')`);
const inv = await lanza(() => db.query(`select public.registrar_visita('tiktok','visita')`));
const inv2 = await lanza(() => db.query(`select public.registrar_visita('fb','comprar')`));
const inv3 = await lanza(() => db.query(`select public.registrar_visita(null,null)`));
ok(inv === null && inv2 === null && inv3 === null, "valores inválidos se ignoran sin error");
ok(nv === 0 && (await db.query(`select count(*)::int c from public.visitas`)).rows[0].c === 0, "anon no puede leer las visitas");
await como("authenticated", B);
ok(await cuenta(`select count(*)::int c from public.visitas`) === 0, "otro usuario no puede leer las visitas");
await como("authenticated", A);
const filas = (await db.query(`select origen, evento, n from public.visitas order by origen, evento`)).rows;
ok(JSON.stringify(filas) === JSON.stringify([{ origen: "ig", evento: "visita", n: 2 }, { origen: "otros", evento: "tienda", n: 1 }]), "registrar_visita suma por origen y evento: " + JSON.stringify(filas));
const hoyCR = (await db.query(`select (now() at time zone 'America/Costa_Rica')::date::text d`)).rows[0].d;
ok((await db.query(`select dia::text d from public.visitas limit 1`)).rows[0].d === hoyCR, "el día se guarda en hora de Costa Rica");
await db.exec("reset role");
await db.query(`update public.visitas set n = 19999 where origen='ig' and evento='visita'`);
await como("anon");
await db.query(`select public.registrar_visita('ig','visita')`);
await db.query(`select public.registrar_visita('ig','visita')`);
await db.exec("reset role");
ok((await db.query(`select n from public.visitas where origen='ig' and evento='visita'`)).rows[0].n === 20000, "tope de 20 000 por día respetado");

console.log(fallas ? `${fallas} FALLA(S)` : "todo ok");
process.exit(fallas ? 1 : 0);

// Prueba de supabase/etapa7-contabilidad.sql con PGlite (auth y storage simulados).
// Dependencia de entorno: PGlite instalado en la carpeta temporal indicada abajo.
// Uso: node tests/sql/probar-etapa7.mjs
import { PGlite } from "file:///C:/Users/kevyn/AppData/Local/Temp/claude/pgt/node_modules/@electric-sql/pglite/dist/index.js";
import fs from "node:fs";

let fallas = 0;
const ok = (c, m) => { if (c) console.log("ok   -", m); else { fallas++; console.log("FALLA -", m); } };
const db = new PGlite();
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", L = "33333333-3333-3333-3333-333333333333";
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
`);
for (const f of ["etapa1", "etapa2", "etapa5-panel"]) await db.exec(fs.readFileSync(`supabase/${f}.sql`, "utf8"));
await db.exec(`
insert into auth.users values ('${A}','dueno@x.com'),('${B}','otro@x.com'),('${L}','lector@x.com');
insert into public.admins(user_id) values ('${A}');
insert into public.gastos(fecha,descripcion,categoria,monto) values ('2026-10-01','a','Yeso',100),('2026-10-02','b','Envíos',200),('2026-10-03','c','Otros',300);
insert into public.panel_ajustes(clave,valor) values ('fijos','[{"n":"Luz","monto":18000},{"n":"Internet","monto":25000}]');
create table public.lectores(user_id uuid primary key); insert into public.lectores values ('${L}');
create policy "lector lee gastos" on public.gastos for select to authenticated using (exists(select 1 from public.lectores where user_id = auth.uid()));
`);
const sql = fs.readFileSync("supabase/etapa7-contabilidad.sql", "utf8");
await db.exec(sql); await db.exec(sql);
ok(true, "se ejecuta 2 veces sin error");
const q = async (s, p) => (await db.query(s, p)).rows;
const como = async (rol, uid) => { await db.exec(`reset role; set role ${rol};`); await db.query(`select set_config('request.uid',$1,false)`, [uid || ""]); };
const lanza = async (f) => { try { await f(); return ""; } catch (e) { return e.message; } finally { await db.exec("reset role;"); } };

const cats = await q("select nombre,tipo,en_costo from public.categorias_gasto order by orden");
ok(cats.length === 16, "16 categorías iniciales, sin duplicar: " + cats.length);
const c = Object.fromEntries(cats.map(x => [x.nombre, x]));
ok(["Yeso","Pinturas","Pinceles","Moldes","Empaque","Máscaras","Filtros","Guantes","Stickers","Aguinaldo pagado"].every(n => c[n].en_costo), "las que van en el costo");
ok(["Envíos","Otros","Servicios","Salarios","Cargas sociales","Vacaciones pagadas"].every(n => !c[n].en_costo), "las que se restan");
ok(c["Servicios"].tipo === "fijo" && c["Salarios"].tipo === "salario" && c["Otros"].tipo === "otro" && c["Stickers"].tipo === "variable", "tipos de cada categoría");

const g = await q("select categoria,monto,tipo from public.gastos order by id");
ok(JSON.stringify(g.map(x => x.tipo)) === '["variable","variable","otro"]', "gastos existentes clasificados");
ok(g.map(x => x.monto).join() === "100,200,300" && g[0].categoria === "Yeso", "conservan monto y categoría");
await db.exec(`insert into public.gastos(fecha,descripcion,categoria,monto,tipo) values ('2026-10-04','d','Máscaras',50,'variable')`);
ok(true, "acepta categorías nuevas");
ok(/gastos_tipo_check/.test(await lanza(() => db.exec(`insert into public.gastos(fecha,descripcion,categoria,monto,tipo) values ('2026-10-04','d','X',50,'raro')`))), "tipo inválido rechazado");

const comp = await q("select nombre,monto,tipo,frecuencia,categoria,desde from public.compromisos order by id");
ok(comp.length === 2 && comp[0].nombre === "Luz" && comp[0].monto === 18000 && comp[0].frecuencia === "mensual" && comp[0].categoria === "Servicios" && /^\d{4}-\d{2}$/.test(comp[0].desde), "costos fijos migrados una sola vez: " + comp.length);

const id = (await q("select id from public.compromisos limit 1"))[0].id;
await db.exec(`insert into public.gastos(fecha,descripcion,categoria,monto,tipo,compromiso_id,periodo) values ('2026-11-01','Luz','Servicios',18000,'fijo',${id},'2026-11')`);
ok(/unique|duplicate/i.test(await lanza(() => db.exec(`insert into public.gastos(fecha,descripcion,categoria,monto,tipo,compromiso_id,periodo) values ('2026-11-02','Luz','Servicios',18000,'fijo',${id},'2026-11')`))), "un compromiso no se paga dos veces en el período");
await db.exec(`insert into public.gastos(fecha,descripcion,categoria,monto,tipo,linea,periodo) values ('2026-11-01','CCSS','Cargas sociales',1,'salario','ccss','2026-11')`);
ok(/unique|duplicate/i.test(await lanza(() => db.exec(`insert into public.gastos(fecha,descripcion,categoria,monto,tipo,linea,periodo) values ('2026-11-02','CCSS','Cargas sociales',1,'salario','ccss','2026-11')`))), "una línea de CCSS no se paga dos veces");
ok(/check/.test(await lanza(() => db.exec(`insert into public.compromisos(nombre,tipo,monto,frecuencia,categoria,desde) values ('x','fijo',1,'mensual','Servicios','noviembre')`))), "período desde inválido rechazado");

// permisos (como en Supabase, anon tiene grant: lo protege la regla de fila)
await db.exec(`grant select on public.categorias_gasto, public.compromisos, public.omisiones to anon; grant select on public.gastos, public.lectores to authenticated;`);
for (const t of ["categorias_gasto", "compromisos", "omisiones"]) {
  await como("anon"); const a = await q(`select * from public.${t}`); await como("authenticated", B); const b = await q(`select * from public.${t}`); await db.exec("reset role;");
  ok(a.length === 0 && b.length === 0, `${t}: sin sesión o sin ser administrador no ve nada`);
}
await como("authenticated", A); const adm = await q("select * from public.compromisos"); await db.exec("reset role;");
ok(adm.length === 2, "el administrador sí ve compromisos");
await como("authenticated", L); const lec = await q("select * from public.gastos"); await db.exec("reset role;");
ok(lec.length >= 3, "el lector de la oficina sigue leyendo gastos");
// renombrar categoría en una sola operación
await db.exec(`grant select, update on public.gastos, public.compromisos, public.categorias_gasto to authenticated;`);
await como("authenticated", B);
const sinPermiso = await lanza(() => db.exec(`select public.renombrar_categoria('Servicios','Hack')`));
ok(/sin_permiso/.test(sinPermiso), "renombrar categoría: solo el administrador");
await como("authenticated", A); await db.exec(`select public.renombrar_categoria('Servicios','Servicios básicos')`); await db.exec("reset role;");
ok((await q("select count(*)::int c from public.categorias_gasto where nombre='Servicios básicos'"))[0].c === 1, "renombra la categoría");
ok((await q("select count(*)::int c from public.gastos where categoria='Servicios'"))[0].c === 0 && (await q("select count(*)::int c from public.gastos where categoria='Servicios básicos'"))[0].c === 1, "renombra sus gastos");
ok((await q("select count(*)::int c from public.compromisos where categoria='Servicios básicos'"))[0].c === 2, "renombra sus compromisos");
console.log(fallas ? fallas + " FALLA(S)" : "todo ok");
process.exit(fallas ? 1 : 0);

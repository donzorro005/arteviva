// Prueba de supabase/etapa2.sql con PGlite (auth y storage simulados).
// Dependencia de entorno: PGlite instalado en la carpeta temporal indicada abajo.
// Uso: node tests/sql/probar-etapa2.mjs supabase/etapa2.sql
import { PGlite } from "file:///C:/Users/kevyn/AppData/Local/Temp/claude/pgt/node_modules/@electric-sql/pglite/dist/index.js";
import fs from "node:fs";
import path from "node:path";

const archivo = process.argv[2];
let fallas = 0;
const ok = (c, m) => { if (c) console.log("ok   -", m); else { fallas++; console.log("FALLA -", m); } };
const canon = (x) => Array.isArray(x) ? x.map(canon) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canon(x[k])])) : x;
const J = (x) => JSON.stringify(canon(x));
const lanza = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };

if (!archivo || !fs.existsSync(archivo)) { console.log("FALLA - no existe el archivo SQL:", archivo); process.exit(1); }
const dir = path.dirname(archivo);
const db = new PGlite();
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
const como = async (rol, uid) => { await db.exec(`reset role; set role ${rol};`); await db.query(`select set_config('request.uid',$1,false)`, [uid || ""]); };

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
// versión anterior instalada (sin parámetro): el SQL nuevo debe reemplazarla limpiamente
await db.exec(`create function public.catalogo_publico() returns jsonb language sql as $$ select '{"viejo":true}'::jsonb $$;`);
const sql = fs.readFileSync(archivo, "utf8");
await db.exec(sql); await db.exec(sql);
ok(true, "etapa2.sql se ejecuta 2 veces sin error");
const firmas = (await db.query(`select pg_get_function_identity_arguments(p.oid) a from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='catalogo_publico'`)).rows.map(r => r.a);
ok(JSON.stringify(firmas) === '["demo boolean"]', "una sola versión de catalogo_publico(demo boolean) (la vieja sin parámetro se borra): " + JSON.stringify(firmas));
await db.exec(`grant select, insert, update, delete on public.pedidos to anon, authenticated;`);

// bucket
const bk = (await db.query(`select * from storage.buckets where id='productos'`)).rows[0];
ok(bk && bk.public === true && Number(bk.file_size_limit) === 2097152 && bk.allowed_mime_types.join() === "image/jpeg,image/png,image/webp", "bucket productos configurado");

// datos de ejemplo (como superusuario)
await db.exec(`
insert into auth.users values ('${A}','dueno@x.com'),('${B}','otro@x.com');
insert into public.admins(user_id) values ('${A}');
insert into public.categorias(nombre,descripcion,color,orden) values ('Figuras','Yeso','#fff',1),('Pinturas','Colores','#000',2);
insert into public.grupos(categoria_id,nombre,prefijo,con_foto,con_tamanos,orden) values
 (1,'Figuras sueltas','Figura: ',true,false,1),(2,'Acrílicas','Pintura: ',false,true,1),(1,'Temporal','Tmp: ',false,false,2);
insert into public.productos(grupo_id,nombre,precio,color,foto_url,agotado,nuevo,orden) values
 (1,'Sol',500,null,'http://x/sol.jpg',false,true,1),
 (1,'Luna',600,null,null,true,false,2),
 (2,'Rojo',null,'#f00',null,false,false,1),
 (3,'Algo',100,null,null,false,false,1);
insert into public.variantes(producto_id,nombre,precio,agotado,orden) values (3,'30 ml',800,false,1),(3,'60 ml',1400,true,2);
insert into public.banners("on",sup,titulo,descripcion,boton,categoria_id,enlace,foto_url,color1,color2,letra_oscura,hasta,orden) values
 (true,'sup','Hola','desc','Ver',1,'#x','http://x/b.jpg','#111','#222',true,null,1),
 (true,'v','Vencido','d','b',1,'#y',null,'#1','#2',false,(now() at time zone 'America/Costa_Rica')::date - 1,2),
 (false,'a','Apagado','d','b',null,null,null,'#1','#2',false,null,3);
insert into public.tarjetas("on",sup,titulo,descripcion,boton,categoria_id,enlace,color1,color2,letra_oscura,hasta,orden) values
 (true,'s','Tarj','d','b',2,'#t','#a','#b',false,(now() at time zone 'America/Costa_Rica')::date,1);
insert into public.descuentos("on",tipo,valor,categoria_id,grupo_id,producto_ids,etiqueta,hasta,orden) values
 (true,'%',10,null,1,'{}','10% figuras',null,1),
 (true,'2x1',null,null,3,'{}','2x1 temporal',null,2),
 (true,'%',20,null,null,'{1,3}','sel',null,3);
insert into public.ajustes(clave,valor) values ('franja','{"on":true,"t":"Envío gratis","envioMin":20000,"prov":"Cartago","hasta":"2026-12-31"}'),
 ('mas_vendidos','{"modo":"auto","lista":[2,1,3]}');
`);

// RLS
await como("anon");
for (const t of ["categorias", "grupos", "productos", "variantes", "banners", "tarjetas", "descuentos", "ajustes"])
  ok((await db.query(`select count(*)::int c from public.${t}`)).rows[0].c > 0, `anon lee ${t}`);
ok(await lanza(() => db.query(`insert into public.categorias(nombre) values ('Hack')`)), "anon no inserta");
await lanza(() => db.query(`update public.productos set precio=1`)); await lanza(() => db.query(`delete from public.productos`));
await como("postgres");
ok((await db.query(`select count(*)::int c from public.productos where precio<>1 or precio is null`)).rows[0].c === 4, "anon no edita ni borra productos");
await como("authenticated", B);
ok(await lanza(() => db.query(`insert into public.categorias(nombre) values ('Hack')`)), "otro usuario no inserta");
await db.query(`update public.productos set precio=1`); await db.query(`delete from public.productos`);
await como("postgres");
ok((await db.query(`select count(*)::int c from public.productos where precio<>1 or precio is null`)).rows[0].c === 4, "otro usuario no edita ni borra");
await como("authenticated", B);
ok(await lanza(() => db.query(`insert into storage.objects(bucket_id,name) values ('productos','a.jpg')`)), "otro usuario no sube fotos");
await como("anon");
ok(await lanza(() => db.query(`insert into storage.objects(bucket_id,name) values ('productos','a.jpg')`)), "anon no sube fotos");
await como("authenticated", A);
await db.query(`insert into public.categorias(nombre,orden) values ('Nueva',9)`);
await db.query(`update public.categorias set descripcion='x' where nombre='Nueva'`);
ok((await db.query(`select descripcion from public.categorias where nombre='Nueva'`)).rows[0].descripcion === "x", "dueño inserta y edita");
await db.query(`delete from public.categorias where nombre='Nueva'`);
ok((await db.query(`select count(*)::int c from public.categorias where nombre='Nueva'`)).rows[0].c === 0, "dueño borra");
await db.query(`insert into storage.objects(bucket_id,name) values ('productos','a.jpg')`);
ok(true, "dueño sube foto a productos");
ok(await lanza(() => db.query(`insert into storage.objects(bucket_id,name) values ('fotos','a.jpg')`)), "dueño sin política en bucket fotos (no se toca)");
ok(await lanza(() => db.query(`insert into public.productos(grupo_id,nombre,precio) values (1,'Neg',-5)`)), "precio negativo rechazado");
ok(await lanza(() => db.query(`insert into public.descuentos(tipo,valor) values ('%',95)`)), "descuento 95% rechazado");
await como("postgres");

// pedidos para mas_vendidos
const ped = (estado, prueba, dias, items) => db.query(
  `insert into public.pedidos(estado,prueba,fecha,items,total) values ($1,$2,(now() at time zone 'America/Costa_Rica')::date - $3::int,$4::jsonb,0)`,
  [estado, prueba, dias, JSON.stringify(items)]);
await ped("completado", false, 1, [{ n: "Figura: Luna", q: 5, p: 1, t: 1 }, { n: "Figura: Sol", q: 2, p: 1, t: 1 }]);
await ped("pendiente", false, 1, [{ n: "Pintura: Rojo", q: 50, p: 1, t: 1 }]);
await ped("completado", true, 1, [{ n: "Pintura: Rojo", q: 50, p: 1, t: 1 }]);
await ped("completado", false, 40, [{ n: "Pintura: Rojo", q: 50, p: 1, t: 1 }]);
await ped("completado", false, 2, [{ n: "Producto borrado", q: 99, p: 1, t: 1 }]);

// catálogo
const get = async () => { await como("anon"); const r = (await db.query(`select public.catalogo_publico() j`)).rows[0].j; await como("postgres"); return r; };
let j = await get();
ok(j.v === 1 && typeof j.generado === "string", "v y generado");
ok(JSON.stringify(j.categorias.map(c => c.n)) === '["Figuras","Pinturas"]', "categorías en orden");
const c1 = j.categorias[0];
ok(c1.id === 1 && c1.d === "Yeso" && c1.c === "#fff" && c1.g.length === 2, "categoría {id,n,d,c,g}");
const g1 = c1.g[0];
ok(g1.id === 1 && g1.t === "Figuras sueltas" && g1.k === "Figura: " && g1.im === true && g1.sz === false && g1.l.length === 2, "grupo {id,t,k,im,sz,l}");
ok(J(g1.l[0]) === J({ id: 1, d: "Sol", c: null, p: 500, foto: "http://x/sol.jpg", agotado: false, nuevo: true, v: [] }), "producto con la forma exacta");
ok(g1.l[1].agotado === true && g1.l[1].foto === null, "producto agotado sin foto");
const rojo = j.categorias[1].g[0].l[0];
ok(rojo.c === "#f00" && rojo.p === null && J(rojo.v) === J([{ id: 1, d: "30 ml", p: 800, agotado: false }, { id: 2, d: "60 ml", p: 1400, agotado: true }]), "pintura con variantes y sin precio propio");
ok(j.categorias[1].g[0].sz === true, "grupo con tamaños");
ok(J(j.franja) === J(JSON.parse('{"on":true,"t":"Envío gratis","envioMin":20000,"prov":"Cartago","hasta":"2026-12-31"}')), "franja");
ok(j.banners.length === 1 && j.banners[0].t === "Hola", "banner vencido y apagado omitidos");
const hoyCR = (await db.query(`select (now() at time zone 'America/Costa_Rica')::date::text d`)).rows[0].d;
ok(J(j.banners[0]) === J({ on: true, sup: "sup", t: "Hola", d: "desc", boton: "Ver", cat: "Figuras", ir: "#x", foto: "http://x/b.jpg", col: ["#111", "#222"], osc: true, hasta: null }), "banner con la forma exacta");
ok(j.tarjetas.length === 1 && j.tarjetas[0].hasta === hoyCR && j.tarjetas[0].cat === "Pinturas" && JSON.stringify(j.tarjetas[0].col) === '["#a","#b"]' && !("foto" in j.tarjetas[0]), "tarjeta que vence hoy sigue vigente");
ok(j.descuentos.length === 3, "descuentos presentes antes de borrar");
ok(J(j.descuentos[0]) === J({ on: true, tipo: "%", v: 10, cat: null, grupo: "Figuras sueltas", prod: [], etiqueta: "10% figuras", hasta: null }), "descuento con la forma exacta");
ok(JSON.stringify(j.descuentos[2].prod) === '["Figura: Sol","Pintura: Rojo"]', "descuento traduce ids de producto a nombres completos");
ok(JSON.stringify(j.mas_vendidos) === '["Figura: Luna","Figura: Sol","Pintura: Rojo"]', "mas_vendidos auto: solo completado, no prueba, 30 días, existentes; completa con lista manual");
// pedidos de tamaños ("Pintura: Rojo – 30 ml") cuentan para su producto (2 + 2 = 4: queda antes de Sol, que tiene 2)
await ped("completado", false, 1, [{ n: "Pintura: Rojo – 30 ml", q: 2, p: 1, t: 1 }, { n: "Pintura: Rojo – 60 ml", q: 2, p: 1, t: 1 }]);
j = await get();
ok(JSON.stringify(j.mas_vendidos) === '["Figura: Luna","Pintura: Rojo","Figura: Sol"]', "mas_vendidos auto: los tamaños vendidos suman para su pintura: " + JSON.stringify(j.mas_vendidos));
await db.exec(`delete from public.pedidos where items @> '[{"n":"Pintura: Rojo – 30 ml"}]'`);

// borrar grupo 3 -> su descuento se omite
await db.exec(`delete from public.grupos where id=3`);
j = await get();
ok(j.descuentos.length === 2 && !j.descuentos.some(d => d.etiqueta === "2x1 temporal"), "descuento cuyo grupo se borró se omite");
// borrar productos -> el descuento por productos sin objetivos se omite
await db.exec(`delete from public.productos where id in (1,3)`);
j = await get();
ok(JSON.stringify(j.descuentos.map(d => d.etiqueta)) === '["10% figuras"]', "descuento sin productos existentes se omite");

// modo manual y ajuste ausente
await db.exec(`update public.ajustes set valor='{"modo":"manual","lista":[2]}' where clave='mas_vendidos'`);
j = await get();
ok(JSON.stringify(j.mas_vendidos) === '["Figura: Luna"]', "mas_vendidos manual");
await db.exec(`delete from public.ajustes`);
j = await get();
ok(JSON.stringify(j.mas_vendidos) === "[]" && JSON.stringify(j.franja) === '{"on":false}', "sin ajustes: lista vacía y franja apagada");

// ids que no son números (o demasiado grandes) en la lista manual no rompen el catálogo
await db.exec(`insert into public.ajustes(clave,valor) values ('mas_vendidos','{"modo":"manual","lista":["abc",2,"99999999999999999999","-1",""]}')`);
let err = await lanza(async () => { j = await get(); }); await como("postgres");
ok(!err && JSON.stringify(j.mas_vendidos) === '["Figura: Luna"]', "mas_vendidos con ids inválidos: se ignoran (" + (err || JSON.stringify(j.mas_vendidos)) + ")");
await db.exec(`update public.ajustes set valor='{"modo":"auto","lista":["x",2]}' where clave='mas_vendidos'`);
err = await lanza(async () => { j = await get(); }); await como("postgres");
ok(!err, "mas_vendidos auto con id inválido no rompe el catálogo (" + (err || "ok") + ")");

// vista de prueba (?demo): demo=true incluye promociones apagadas y vencidas; sin demo se omiten
await db.exec(`insert into public.tarjetas("on",titulo,hasta) values (false,'Tarjeta apagada',null);
insert into public.descuentos("on",tipo,valor,grupo_id,etiqueta,hasta) values (false,'%',5,1,'desc apagado',null),(true,'%',5,1,'desc vencido',(now() at time zone 'America/Costa_Rica')::date - 3);
insert into public.ajustes(clave,valor) values ('franja','{"on":false,"t":"Franja apagada"}');`);
const getDemo = async (q) => { await como("anon"); const r = (await db.query(q)).rows[0].j; await como("postgres"); return r; };
const normal = await getDemo(`select public.catalogo_publico() j`);
const conFalse = await getDemo(`select public.catalogo_publico(demo => false) j`);
const demo = await getDemo(`select public.catalogo_publico(demo => true) j`);
const tit = (x) => JSON.stringify(x.banners.map(b => b.t));
ok(tit(normal) === '["Hola"]' && tit(conFalse) === '["Hola"]', "sin demo (o demo=false): banner apagado y vencido omitidos");
ok(tit(demo) === '["Hola","Vencido","Apagado"]', "demo=true: incluye el banner vencido y el apagado: " + tit(demo));
ok(demo.banners[2].on === false && demo.banners[1].on === true, "demo=true: el banner apagado llega con on=false (la tienda decide mostrarlo)");
ok(!normal.tarjetas.some(t => t.t === "Tarjeta apagada") && demo.tarjetas.some(t => t.t === "Tarjeta apagada" && t.on === false), "demo=true: incluye tarjetas apagadas");
const et = (x) => x.descuentos.map(d => d.etiqueta);
ok(!et(normal).includes("desc apagado") && !et(normal).includes("desc vencido") && et(demo).includes("desc apagado") && et(demo).includes("desc vencido"), "demo=true: incluye descuentos apagados y vencidos: " + JSON.stringify(et(demo)));
ok(normal.franja.on === false && demo.franja.t === "Franja apagada", "la franja apagada llega en ambos casos (con on=false)");

console.log(fallas ? `\n${fallas} FALLAS` : "\ntodo ok");
process.exit(fallas ? 1 : 0);

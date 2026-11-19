// Prueba de supabase/etapa6-seguridad.sql con PGlite (auth y storage simulados).
// Dependencia de entorno: PGlite instalado en la carpeta temporal indicada abajo.
// Uso: node tests/sql/probar-etapa6.mjs
import { PGlite } from "file:///C:/Users/kevyn/AppData/Local/Temp/claude/pgt/node_modules/@electric-sql/pglite/dist/index.js";
import fs from "node:fs";

let fallas = 0;
const ok = (c, m) => { if (c) console.log("ok   -", m); else { fallas++; console.log("FALLA -", m); } };
const db = new PGlite();
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
for (const f of ["etapa1", "etapa2"]) await db.exec(fs.readFileSync(`supabase/${f}.sql`, "utf8"));
const sql = fs.readFileSync("supabase/etapa6-seguridad.sql", "utf8");
await db.exec(sql); await db.exec(sql);
ok(true, "etapa6 se ejecuta 2 veces sin error");
// Con «node tests/sql/probar-etapa6.mjs etapa8» se repiten las pruebas sobre la versión con teléfono.
const con8 = process.argv[2] === "etapa8";
if (con8) { const s8 = fs.readFileSync("supabase/etapa8-telefono.sql", "utf8"); await db.exec(s8); await db.exec(s8); ok(true, "etapa8 se ejecuta 2 veces sin error"); }
await db.exec(`
insert into public.categorias(id,nombre) overriding system value values (1,'Figuras'),(2,'Pinturas'),(3,'Paquetes');
insert into public.grupos(id,categoria_id,nombre,prefijo,con_tamanos) overriding system value values (1,1,'Sueltas','Figura: ',false),(2,2,'Colores','Pintura: ',true),(3,3,'Paquetes','Paquete: ',false);
insert into public.productos(id,grupo_id,nombre,precio) overriding system value values (1,1,'Sol',500),(2,1,'Luna',800),(3,2,'Rojo',null),(4,3,'Flores',3500),(5,1,'Consulta',null);
insert into public.variantes(producto_id,nombre,precio) values (3,'Frasco de 120 ml',1900);
`);
let n = 0;
const manda = async (items, ip, extra) => {
  n++;
  await db.exec("reset role; set role anon;");
  await db.query("select set_config('request.headers',$1,false)", [ip === undefined ? JSON.stringify({ "cf-connecting-ip": "10.0.0." + n }) : ip === null ? "" : JSON.stringify({ "cf-connecting-ip": ip })]);
  const r = await db.query("select public.crear_pedido($1::jsonb) id", [JSON.stringify(Object.assign({ nombre: "Cliente " + n, items }, extra))]);
  await db.exec("reset role;");
  const id = r.rows[0].id; if (id == null) return null;
  return (await db.query("select * from public.pedidos where id=$1", [id])).rows[0];
};
const it = (n_, q, p = 1, t = 1) => ({ n: n_, q, p, t });

let p = await manda([it("Figura: Sol", 2)]);
ok(p.total === 1000 && p.subtotal === 1000 && p.descuento === 0 && p.items[0].p === 500 && p.items[0].t === 1000, "un precio falso de ₡1 se reemplaza por el real");
p = await manda([{ n: "Figura: Sol", q: 1, p: 500, t: 500 }]);
ok(p.total === 500, "un pedido normal da lo mismo que antes");
p = await manda([it("Pintura: Rojo – Frasco de 120 ml", 1)]);
ok(p.total === 1900, "los tamaños usan su propio precio");
p = await manda([it("Paquete: Flores · Figuras: Sol, Luna", 1)]);
ok(p.total === 3500 && p.items[0].n === "Paquete: Flores · Figuras: Sol, Luna", "paquete con figuras: precio del paquete y conserva las figuras");
p = await manda([it("Figura: Consulta", 2)]);
ok(p.total === 0 && !/Revisar/.test(p.notas || ""), "producto sin precio: ₡0 sin aviso, igual que la tienda");
p = await manda([it("Cosa inventada", 1)], undefined, { notas: "hola" });
ok(p.total === 0 && /^\[Revisar/.test(p.notas) && /hola$/.test(p.notas), "producto inexistente: ₡0 con aviso y conserva la nota");

await db.exec(`insert into public.descuentos(id,tipo,valor,categoria_id) overriding system value values (1,'%',20,1);`);
p = await manda([it("Figura: Sol", 2)]);
ok(p.subtotal === 1000 && p.total === 800 && p.descuento === 200, "descuento por categoría");
await db.exec(`update public.descuentos set "on"=false where id=1;`);
p = await manda([it("Figura: Sol", 2)]);
ok(p.total === 1000, "descuento apagado no aplica");
await db.exec(`update public.descuentos set "on"=true, hasta='2020-01-01' where id=1;`);
p = await manda([it("Figura: Sol", 2)]);
ok(p.total === 1000, "descuento vencido no aplica");
await db.exec(`delete from public.descuentos; insert into public.descuentos(id,tipo,grupo_id) overriding system value values (2,'2x1',1);`);
p = await manda([it("Figura: Sol", 1), it("Figura: Luna", 1)]);
ok(p.subtotal === 1300 && p.total === 800 && p.items[0].t === 0 && p.items[1].t === 800, "2x1: la más barata gratis, entre productos distintos");
p = await manda([it("Figura: Sol", 3)]);
ok(p.total === 1000, "2x1: tres unidades pagan dos");
await db.exec(`insert into public.descuentos(id,tipo,valor,producto_ids) overriding system value values (3,'%',60,'{1}');`);
p = await manda([it("Figura: Sol", 2)]);
ok(p.total === 400, "gana el descuento que más conviene: 60 % sobre 2x1");
await db.exec(`delete from public.descuentos;`);

// spam
let guardados = 0; for (let k = 0; k < 8; k++) { if (await manda([it("Figura: Sol", k + 1)], "9.9.9.9")) guardados++; }
ok(guardados === 5, "un mismo visitante: máximo 5 cada 10 minutos: " + guardados);
ok(!!(await manda([it("Figura: Luna", 1)], "8.8.8.8")), "otro visitante sigue pudiendo pedir");
ok(!!(await manda([it("Figura: Luna", 2)], null)), "sin datos de conexión también se guarda");
const h = (await db.query("select huella from public.limite_pedidos limit 1")).rows[0].huella;
ok(/^[0-9a-f]{32}$/.test(h) && !/9\.9\.9/.test(h), "guarda una huella, no la dirección");
await db.exec(`update public.limite_pedidos set creado = now() - interval '2 days' where huella = md5('9.9.9.9' || 'arteviva-limite');`);
ok(!!(await manda([it("Figura: Sol", 50)], "9.9.9.9")), "pasadas 24 horas se limpia y vuelve a poder");
ok((await db.query("select count(*)::int c from public.limite_pedidos where creado < now() - interval '1 day'")).rows[0].c === 0, "los registros viejos se borran");

// duplicado y validaciones
const fijo = { nombre: "Repetido" };
const a1 = await manda([it("Figura: Sol", 7)], undefined, fijo), a2 = await manda([it("Figura: Sol", 7)], undefined, fijo);
ok(!!a1 && a2 === null, "el mismo pedido en el mismo minuto no se duplica");
const lanza = async (items) => { try { await manda(items); return ""; } catch (e) { await db.exec("reset role;"); return e.message; } };
ok(/pedido_invalido/.test(await lanza([])), "sin productos: rechazado");
ok(/pedido_invalido/.test(await lanza([it("Figura: Sol", 0)])), "cantidad 0: rechazado");
await db.exec("set role anon;");
let negado = ""; try { await db.query("select * from public.limite_pedidos"); } catch (e) { negado = e.message; }
await db.exec("reset role;");
ok(/permission denied/.test(negado), "el público no puede leer la tabla de límites");
if (con8) {
  p = await manda([it("Figura: Sol", 1)], undefined, { telefono: "8888-1234" });
  ok(p.telefono === "88881234", "guarda el teléfono solo con dígitos");
  p = await manda([it("Figura: Sol", 2)], undefined, { telefono: "+506 8888 1234<script>" });
  ok(p.telefono === "+50688881234", "limpia lo que no es número");
  p = await manda([it("Figura: Sol", 3)], undefined, { telefono: "1".repeat(40) });
  ok(p.telefono.length === 20, "máximo 20 caracteres");
  p = await manda([it("Figura: Sol", 4)]);
  ok(p.telefono === null, "sin teléfono también se guarda");
}
console.log(fallas ? fallas + " FALLA(S)" : "todo ok");
process.exit(fallas ? 1 : 0);

import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, utimesSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { prepararOficina } from "../tools/agentes/preparar-oficina.mjs";
import { leerCredenciales, leerTablas } from "../tools/agentes/supa.mjs";
import { resumirVentas, leerCostos } from "../tools/agentes/ventas.mjs";
import { actualizarEstado, marcar, contarBuzon } from "../tools/agentes/estado.mjs";
import { codigoDeToma, detectarNuevo } from "../tools/agentes/hay-algo-nuevo.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "av-of-"));
const P = (o) => Object.assign({ estado: "completado", prueba: false, total: 0, fecha: "2026-10-05", items: [] }, o);

test("prepararOficina crea el árbol y no pisa archivos", () => {
  const r = join(tmp(), "oficina");
  prepararOficina(r);
  assert.ok(existsSync(join(r, "buzon", "leido")) && existsSync(join(r, "bitacora", "redes.md")));
  writeFileSync(join(r, "costos.md"), "mío");
  assert.deepEqual(prepararOficina(r).filter((p) => !p.endsWith("index.html")), []);
  assert.equal(readFileSync(join(r, "costos.md"), "utf8"), "mío");
});

test("resumirVentas ignora pruebas y cancelados", () => {
  const r = resumirVentas({ pedidos: [P({ total: 10000 }), P({ total: 3000, estado: "pendiente" }), P({ total: 9000, prueba: true }), P({ total: 2000, estado: "cancelado" })] });
  assert.deepEqual([r.ventas, r.nVentas, r.nPendientes], [10000, 1, 1]);
});

test("producto sin costo da ganancia null y con costo la calcula", () => {
  const r = resumirVentas({ pedidos: [P({ total: 5000, items: [{ n: "Abejita", q: 2, t: 3000 }, { n: "Pintura 5 ml (El Rey)", q: 5, t: 2500 }] })] }, { "pintura 5 ml (el rey)": 400 });
  const a = r.porProducto.find((x) => x.nombre === "Abejita"), b = r.porProducto.find((x) => x.nombre.startsWith("Pintura"));
  assert.equal(a.ganancia, null); assert.equal(a.costo, null);
  assert.deepEqual([b.costo, b.ganancia], [2000, 500]);
});

test("leerCostos toma números y salta 'falta dato'", () => {
  const f = join(tmp(), "c.md");
  writeFileSync(f, "| Producto | Costo (₡) |\n|---|---|\n| Pintura 120 ml (El Rey) | 1.900 |\n| Pincel | falta dato |\n");
  assert.deepEqual(leerCostos(f), { "pintura 120 ml (el rey)": 1900 });
});

test("leerCredenciales reporta lo que falta", () => {
  const f = join(tmp(), "c.env");
  writeFileSync(f, "SUPA_URL=https://x.supabase.co/\nSUPA_KEY=k\nLECTOR_CORREO=a@b.c\nLECTOR_CLAVE=\n");
  assert.deepEqual(leerCredenciales(f), { ok: false, falta: ["LECTOR_CLAVE"] });
  assert.deepEqual(leerCredenciales(join(tmp(), "no.env")).falta.length, 4);
});

test("leerTablas usa el token y solo lee", async () => {
  const llamadas = [];
  const f = async (url, op = {}) => { llamadas.push({ url, op }); return { ok: true, status: 200, json: async () => (url.includes("/auth/") ? { access_token: "TK" } : []) }; };
  await leerTablas({ SUPA_URL: "https://x.supabase.co", SUPA_KEY: "k", LECTOR_CORREO: "a", LECTOR_CLAVE: "b" }, "2026-11-01", "2026-11-03", f);
  assert.equal(llamadas[1].op.headers.Authorization, "Bearer TK");
  assert.ok(llamadas.slice(1).every((l) => !l.op.method));
  assert.ok(llamadas[1].url.includes("fecha=gte.2026-11-01&fecha=lte.2026-11-03"));
});

test("codigoDeToma tolera nombres raros", () => {
  assert.equal(codigoDeToma("t-001.JPG"), "T-001");
  assert.equal(codigoDeToma("T-001 (2).mp4"), "T-001");
  assert.equal(codigoDeToma("T12-2.mov"), "T-012");
  assert.equal(codigoDeToma("foto.jpg"), null);
});

test("estado.js sobrevive comillas y saltos de línea", () => {
  const r = tmp(), tarea = 'Pidió "3 tomas"\ny un afiche';
  actualizarEstado(r, "publicidad", { estado: "listo", tarea });
  const c = { window: {} }; vm.runInNewContext(readFileSync(join(r, "estado.js"), "utf8"), c);
  assert.equal(c.window.OFICINA_ESTADO.puestos.publicidad.tarea, tarea);
  assert.throws(() => actualizarEstado(r, "redes", { estado: "dormido", tarea: "x" }));
});

test("detectarNuevo usa la última marca, no 'hace 2 horas'", () => {
  const r = join(tmp(), "oficina"); prepararOficina(r);
  const f = join(r, "tomas", "T-001.jpg"); writeFileSync(f, "x");
  const hace3 = Date.now() / 1000 - 3 * 86400; utimesSync(f, hace3, hace3);
  marcar(r, "contenido", new Date(Date.now() - 4 * 86400e3).toISOString());
  let d = detectarNuevo(r);
  assert.equal(d.nuevo, true); assert.deepEqual(d.tomas, [{ codigo: "T-001", archivos: ["T-001.jpg"] }]);
  marcar(r, "contenido");
  assert.equal(detectarNuevo(r).nuevo, false);
});

test("buzonNuevos no cuenta leido/", () => {
  const r = join(tmp(), "oficina"); prepararOficina(r);
  writeFileSync(join(r, "buzon", "nota.md"), "hola");
  mkdirSync(join(r, "buzon", "leido", "2026-11-01"), { recursive: true });
  writeFileSync(join(r, "buzon", "leido", "2026-11-01", "vieja.md"), "x");
  assert.equal(contarBuzon(r), 1);
});

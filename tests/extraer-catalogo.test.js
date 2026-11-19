const test = require("node:test"), assert = require("node:assert");
const path = require("node:path");
const { extraerCatalogo } = require("../tools/extraer_catalogo.js");
// Desde la etapa 2 index.html ya no trae las declaraciones: se prueba contra la página anterior (commit 3623f79).
const fs = require("node:fs"), os = require("node:os"), { execFileSync } = require("node:child_process");
const raiz = path.join(__dirname, "..");
const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), "av-extraer-")), htmlAntes = path.join(dirTmp, "index.html");
fs.writeFileSync(htmlAntes, execFileSync("git", ["show", "3623f79:index.html"], { cwd: raiz, maxBuffer: 20e6 }));
const cat = extraerCatalogo(htmlAntes);
fs.rmSync(dirTmp, { recursive: true, force: true });
const porNombre = (n) => cat.categorias.find((c) => c.n === n);
const grupo = (cn, gt) => porNombre(cn).g.find((g) => g.t === gt);

test("4 categorías en orden", () =>
  assert.deepEqual(cat.categorias.map((c) => c.n), ["Figuras de yeso", "Paquetes de relajación", "Pinceles", "Pinturas"]));

test("forma general", () => {
  assert.equal(cat.v, 1);
  assert.equal(typeof cat.generado, "string");
  assert.ok(!isNaN(Date.parse(cat.generado)));
});

test("Figuras sueltas: 22 productos a ₡500", () => {
  const g = grupo("Figuras de yeso", "Figuras sueltas");
  assert.equal(g.k, "Figura: ");
  assert.equal(g.im, true);
  assert.equal(g.l.length, 22);
  assert.ok(g.l.every((p) => p.p === 500 && p.v.length === 0));
});

test("Paquetes de relajación: Mickey y Muñecos de nieve a 4500, resto 3500", () => {
  const g = grupo("Paquetes de relajación", "Paquetes");
  assert.equal(g.l.length, 6);
  for (const p of g.l) assert.equal(p.p, ["Mickey", "Muñecos de nieve"].includes(p.d) ? 4500 : 3500, p.d);
});

test("Colores: 9 colores, 3 variantes", () => {
  const g = grupo("Pinturas", "Colores");
  assert.equal(g.sz, true);
  assert.equal(g.l.length, 9);
  for (const p of g.l) {
    assert.equal(p.p, null);
    assert.match(p.c, /^#[0-9a-f]{6}$/i);
    assert.deepEqual(p.v.map((v) => v.p), [500, 1200, 2700]);
    assert.ok(p.v.every((v) => v.agotado === false && v.id < 0));
  }
});

test("ids negativos únicos", () => {
  const ids = [];
  cat.categorias.forEach((c) => { ids.push(c.id); c.g.forEach((g) => { ids.push(g.id); g.l.forEach((p) => { ids.push(p.id); p.v.forEach((v) => ids.push(v.id)); }); }); });
  assert.ok(ids.every((i) => Number.isInteger(i) && i < 0));
  assert.equal(new Set(ids).size, ids.length);
});

test("las 4 fotos de paquetes presentes", () => {
  const g = grupo("Paquetes de relajación", "Paquetes");
  for (const n of ["Flores", "Muñecos de nieve", "Mickey", "Rosas"])
    assert.match(g.l.find((p) => p.d === n).foto, /^data:image\//);
});

test("franja, banners, tarjetas, descuentos, más vendidos", () => {
  assert.equal(cat.franja.prov, "Cartago");
  assert.equal(cat.franja.envioMin, 15000);
  assert.equal(cat.franja.hasta, null);
  assert.equal(cat.banners.length, 4);
  assert.match(cat.banners[2].foto, /^data:image\//);
  assert.equal(cat.banners[0].foto, null);
  assert.deepEqual(cat.banners[0].col, ["#6f8a3a", "#4f6a26"]);
  assert.equal(cat.banners[3].osc, true);
  assert.equal(cat.banners[0].osc, false);
  assert.equal(cat.tarjetas.length, 2);
  assert.equal(cat.descuentos.length, 2);
  assert.ok(cat.descuentos.every((d) => d.on === false));
  assert.deepEqual(cat.descuentos[0].prod, []);
  assert.equal(cat.descuentos[1].v, 20);
  assert.equal(cat.mas_vendidos.length, 4);
  assert.ok(cat.mas_vendidos.includes("Paquete de relajación: Mickey"));
});

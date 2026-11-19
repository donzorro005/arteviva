// Las instrucciones de la etapa 2 dicen lo que la dueña necesita para no equivocarse.
// Uso: node --test tests/leeme-etapa2.test.js   (LEEME=otro.md para probar otra copia)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const txt = fs.readFileSync(process.env.LEEME || path.join(__dirname, "..", "LEEME-etapa2.md"), "utf8");

test("explica cómo abrir y copiar el .sql (clic derecho → Abrir con → Bloc de notas)", () => {
  assert.match(txt, /clic derecho[^\n]*etapa2\.sql[^\n]*Abrir con[^\n]*Bloc de notas/i);
  assert.match(txt, /Ctrl \+ A/);
});

test("el respaldo se baja a Descargas y luego se sube a GitHub", () => {
  assert.match(txt, /carpeta \*\*Descargas\*\*/);
  assert.match(txt, /Descargas\*\* y toca \*\*Commit changes/);
});

test("insiste en hacer el respaldo enseguida después de importar (carritos vaciados)", () => {
  assert.match(txt, /Paso 5[^\n]*enseguida/);
  assert.match(txt, /se les puede vaciar el carrito/);
});

test("?demo muestra promociones apagadas o vencidas", () => {
  assert.match(txt, /\?demo[^\n]*apagadas o vencidas/);
});

// Prueba del panel (tablero de Inicio) en Edge sin ventana, con Supabase simulado.
// Uso: node tests/probar-panel-dash.mjs [base=http://127.0.0.1:8765]
// Requiere un servidor local sirviendo la carpeta del proyecto (python -m http.server 8765 --bind 127.0.0.1).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:8765";
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!EDGE) { console.log("No encontré Edge"); process.exit(1); }
const TMP = "_panel_prueba.html";
writeFileSync(TMP, readFileSync("admin.html", "utf8").replace('<script src="supabase-config.js"></script>', '<script src="tests/simular-supabase.js"></script>'));

const PUERTO = 9338, perfil = mkdtempSync(join(tmpdir(), "av-edge-"));
const nav = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=" + PUERTO, "--user-data-dir=" + perfil, "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "about:blank"], { stdio: "ignore" });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ver;
for (let i = 0; i < 50 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PUERTO}/json/version`)).json(); } catch { await espera(200); } }
let fallos = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALLA") + " " + m); if (!c) fallos++; };

async function pagina(url, antes = "") {
  const t = await (await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = {}, errores = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await cmd("Runtime.enable"); await cmd("Page.enable");
  await cmd("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });
  await cmd("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('av-ses',JSON.stringify({access_token:'tok',refresh_token:'ref',expires_at:Math.floor(Date.now()/1000)+3000,email:'d@x.com'}));" + antes });
  await cmd("Page.navigate", { url });
  const ev = async (expr) => { const r = await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
  const hasta = async (expr, ms = 6000) => { const f = Date.now() + ms; while (Date.now() < f) { try { if (await ev(expr)) return true; } catch {} await espera(60); } return false; };
  return { ev, hasta, errores, cerrar: async () => { ws.close(); await fetch(`http://127.0.0.1:${PUERTO}/json/close/${t.id}`); } };
}
const $ = (i) => `document.getElementById('${i}')`;
const CATALOGO = "window.__catalogoPublico={categorias:[{n:'Figuras',g:[{k:'Figura: ',sz:false,l:[{d:'Sol',p:500,v:[]},{d:'Abeja',p:500,v:[]}]}]},{n:'Pinturas',g:[{k:'Pintura: ',sz:true,l:[{d:'Amarillo',p:null,v:[{d:'Unidad (5 ml)',p:500}]}]}]}]};";
const sinNaN = (i) => `!/NaN|undefined/.test(${$(i)}.textContent)`;
try {
  const p = await pagina(BASE + "/" + TMP + "#inicio", CATALOGO);
  const ev = p.ev;
  ok(await p.hasta(`!${$("app")}.hidden && !/Cargando/.test(${$("dsp")}.textContent) && ${$("dsp")}.textContent.length>0`), "el tablero carga");
  const k = await ev(`[].map.call(${$("kpis")}.querySelectorAll('.k small'),function(b){return b.textContent})`);
  ok(JSON.stringify(k) === JSON.stringify(["Por cobrar", "Ingresos del mes", "Gastos del mes", "Ganancia real"]), "las cuatro tarjetas: " + JSON.stringify(k));
  ok(await ev(`/Ana Mora/.test(${$("dsp")}.textContent) && /Sin fecha/.test(${$("dsp")}.textContent) && !/Prueba demo/.test(${$("dsp")}.textContent)`), "por despachar: pendiente sin fecha, sin los de prueba");
  ok(await ev(`/de ₡50[.,\\s]?000/.test(${$("meta")}.textContent) && /Te faltan/.test(${$("meta")}.textContent)`), "meta con avance y lo que falta: " + await ev(`${$("meta")}.textContent`));
  ok(await ev(`/Pintura: Amarillo – Unidad \\(5 ml\\)/.test(${$("bajos")}.textContent) && /10 %/.test(${$("bajos")}.textContent) && !/Figura: Sol/.test(${$("bajos")}.textContent)`), "precio bajo: 10 % de margen aparece; 97 % no");
  ok(await ev(`/1 producto sin costo/.test(${$("bajos")}.textContent)`), "avisa los productos sin costo en el catálogo");
  ok(await ev(`/Visitas/.test(${$("emb")}.textContent) && /Completados/.test(${$("emb")}.textContent)`), "embudo con sus etapas");
  ok(await ev(`/Clics a WhatsApp/.test(${$("catm")}.textContent)`), "métricas de la tienda");
  ok(await ev(`/Más vendidos/.test(${$("top")}.textContent) && /Mejores clientes/.test(${$("top")}.textContent)`), "lo que más se vende");
  await ev(`document.querySelector('#top-rango [data-r=anio]').click()`);
  ok(await ev(`document.querySelector('#top-rango [data-r=anio]').getAttribute('aria-pressed')==='true'`), "filtro de período");
  for (const i of ["kpis", "dsp", "meta", "emb", "catm", "top", "bajos"]) ok(await ev(sinNaN(i)), "sin NaN ni undefined en " + i);
  // Fecha de entrega
  await ev(`[].filter.call(${$("dsp")}.querySelectorAll('button'),function(b){return /Fecha de entrega de Ana/.test(b.getAttribute('aria-label')||'')})[0].click()`);
  ok(await p.hasta(`${$("d-entrega")}.open`), "abre la fecha de entrega");
  await ev(`document.querySelector('#f-entrega [value=si]').click()`);
  ok(await p.hasta(`!${$("d-entrega")}.open && /Hoy/.test(${$("dsp")}.textContent)`), "al guardar hoy, pasa a «Hoy»");
  ok(await ev(`window.__db.pedidos.filter(function(x){return x.id===1})[0].fecha_entrega===new Intl.DateTimeFormat("en-CA",{timeZone:"America/Costa_Rica"}).format(new Date())`), "la fecha se guardó en el pedido");
  // Meta
  await ev(`[].filter.call(${$("meta")}.querySelectorAll('button'),function(b){return b.textContent==='Cambiar meta'})[0].click()`);
  await ev(`${$("dm-meta")}.value=90000; document.querySelector('#f-meta [value=si]').click()`);
  ok(await p.hasta(`/de ₡90[.,\\s]?000/.test(${$("meta")}.textContent)`), "cambiar la meta se ve al instante");
  ok(await ev(`window.__db.panel_ajustes[0].valor.meta===90000`), "la meta se guardó en la tabla privada");
  ok(await ev(`!window.__db.ajustes.some(function(a){return /meta|panel/.test(a.clave)})`), "la meta no quedó en la tabla pública");
  // Costos
  await ev(`[].filter.call(${$("bajos")}.querySelectorAll('button'),function(b){return b.textContent==='Editar costos'})[0].click()`);
  ok(await p.hasta(`${$("d-costos")}.open && ${$("dco-lista")}.querySelectorAll('input').length===3`), "lista de costos con todo el catálogo");
  await ev(`(function(){var i=document.querySelector('[aria-label="Costo de Figura: Abeja"]');i.value='20';i.onchange();})()`);
  ok(await p.hasta(`window.__db.costos.some(function(c){return c.clave==='Figura: Abeja'&&c.costo===20})`), "guardar un costo nuevo");
  await ev(`(function(){var i=document.querySelector('[aria-label="Costo de Figura: Abeja"]');i.value='';i.onchange();})()`);
  ok(await p.hasta(`!window.__db.costos.some(function(c){return c.clave==='Figura: Abeja'})`), "borrar el costo lo deja sin costo");
  await ev(`document.querySelector('#d-costos [value=no]').click()`);
  // Calculadora de costeo
  await ev(`[].filter.call(${$("bajos")}.querySelectorAll('button'),function(b){return b.textContent==='Calcular un precio'})[0].click()`);
  ok(await p.hasta(`${$("d-costeo")}.open && ${$("dk-prod")}.options.length===3`), "abre la calculadora con el catálogo");
  ok(await ev(`${$("dk-fijos")}.querySelectorAll('input:checked').length===2`), "los costos fijos vienen marcados");
  await ev(`(function(){var s=${$("dk-prod")};s.value='Figura: Sol';s.onchange();var m=${$("dk-mat")};m.value='300';m.oninput();var t=${$("dk-min")};t.value='60';t.oninput();var h=${$("dk-horas")};h.value='150';h.oninput();document.querySelector('#dk-modo [data-m=pct]').click();var v=${$("dk-valor")};v.value='50';v.oninput();})()`);
  ok(await ev(`/₡10/.test(${$("dk-fijo")}.textContent) && /₡310/.test(${$("dk-base")}.textContent) && /₡620/.test(${$("dk-precio")}.textContent)`), "reparte los fijos por tiempo y calcula el precio: " + await ev(`${$("dk-base")}.textContent+" → "+${$("dk-precio")}.textContent`));
  ok(await ev(`${$("dk-estado")}.textContent==='Margen saludable'`), "margen saludable");
  await ev(`(function(){${$("dk-fijos")}.querySelector('input').click();})()`);
  ok(await ev(`!/₡10$/.test(${$("dk-fijo")}.textContent)`), "desmarcar un costo fijo cambia el cálculo");
  await ev(`(function(){document.querySelector('#dk-modo [data-m=precio]').click();var v=${$("dk-valor")};v.value='100';v.oninput();})()`);
  ok(await ev(`/Pierdes/.test(${$("dk-estado")}.textContent)`), "avisa si el precio no cubre el costo");
  await ev(`document.querySelector('#f-costeo [value=si]').click()`);
  ok(await p.hasta(`!${$("d-costeo")}.open`), "guardar cierra la calculadora");
  ok(await ev(`window.__db.costos.filter(function(c){return c.clave==='Figura: Sol'})[0].costo===300`), "guarda solo materiales y extras, sin los fijos");
  ok(await ev(`window.__db.panel_ajustes.filter(function(a){return a.clave==='panel'})[0].valor.horas===150 && window.__db.panel_ajustes.filter(function(a){return a.clave==='panel'})[0].valor.meta===90000`), "guarda las horas sin borrar la meta");
  // Teléfono del cliente en el pedido
  await ev(`location.hash='#pedidos'`); await p.hasta(`!${$("s-pedidos")}.hidden`);
  ok(await p.hasta(`/Tel: 88881234/.test(${$("ped-lista")}.textContent)`), "el pedido muestra el teléfono");
  ok(await ev(`!!document.querySelector('a[href="https://wa.me/50688881234"]') && !!document.querySelector('a[href="tel:88881234"]')`), "con enlaces para escribirle y llamarle");
  await ev(`location.hash='#inicio'`); await p.hasta(`!${$("s-inicio")}.hidden`);
  // Botón +
  ok(await ev(`!!${$("b-mas")}.closest("#app")`), "el botón + solo existe dentro del panel, no en la pantalla de entrada");
  await ev(`${$("b-mas")}.click()`);
  ok(await p.hasta(`${$("d-mas")}.open`), "el botón + abre el menú");
  await ev(`${$("dmas-gasto")}.click()`);
  ok(await p.hasta(`!${$("d-mas")}.open && ${$("d-gasto")}.open`), "desde el menú se abre Agregar gasto");
  await ev(`document.querySelector('#d-gasto [value=no]').click()`);
  // Tarjeta Por cobrar
  await ev(`${$("kpis")}.querySelector('button.k').click()`);
  ok(await p.hasta(`!${$("s-pedidos")}.hidden`), "Por cobrar lleva a los pedidos");
  await ev(`location.hash='#inicio'`); await p.hasta(`!${$("s-inicio")}.hidden`);
  ok(await ev(`document.documentElement.scrollWidth-document.documentElement.clientWidth`) <= 0, "375 px sin scroll horizontal");
  ok(p.errores.length === 0, "sin errores de JavaScript: " + p.errores.join(" | "));
  await p.cerrar();
  // Antes de correr el SQL: el panel sigue funcionando y lo avisa
  const q = await pagina(BASE + "/" + TMP + "#inicio", CATALOGO + "window.__sinEtapa5=true;");
  ok(await q.hasta(`!${$("app")}.hidden && !${$("dash-av")}.hidden`), "sin el SQL: aviso visible");
  ok(await q.ev(`/etapa5-panel/.test(${$("dash-av")}.textContent) && /etapa5-panel/.test(${$("meta")}.textContent)`), "el aviso dice qué falta");
  const k2 = await q.ev(`[].map.call(${$("kpis")}.querySelectorAll('.k small'),function(b){return b.textContent})`);
  ok(k2[3] === "Ganancia", "sin el SQL vuelve a la ganancia de siempre");
  ok(await q.ev(`/Ana Mora/.test(${$("dsp")}.textContent) && !/Fecha de entrega de/.test(${$("dsp")}.innerHTML)`), "sin el SQL: lista sin botón de fecha");
  ok(q.errores.length === 0, "sin el SQL: sin errores de JavaScript: " + q.errores.join(" | "));
  await q.cerrar();
} finally {
  nav.kill(); await espera(500); try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  try { unlinkSync(TMP); } catch {}
}
console.log(fallos ? `${fallos} FALLA(S)` : "todo ok");
process.exit(fallos ? 1 : 0);


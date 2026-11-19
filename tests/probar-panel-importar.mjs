// Prueba del panel (Tienda · Importar catálogo y respaldo) en Edge sin ventana, con Supabase simulado (tests/simular-supabase.js).
// Uso: node tests/probar-panel-importar.mjs [base=http://127.0.0.1:8765]
// Requiere un servidor local sirviendo la carpeta del proyecto (python -m http.server 8765 --bind 127.0.0.1).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

const BASE = process.argv[2] || "http://127.0.0.1:8765";
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!EDGE) { console.log("No encontré Edge"); process.exit(1); }
const TMP = "_panel_prueba.html";
writeFileSync(TMP, readFileSync("admin.html", "utf8").replace('<script src="supabase-config.js"></script>', '<script src="tests/simular-supabase.js"></script>'));

const PUERTO = 9336, perfil = mkdtempSync(join(tmpdir(), "av-edge-"));
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
// Lo esperado se calcula leyendo catalogo.js tal cual (en Node).
const ctx = { window: {} }; vm.runInNewContext(readFileSync("catalogo.js", "utf8"), ctx);
const CAT = ctx.window.CATALOGO_RESPALDO;
let nProd = 0, nVar = 0, nFotoProd = 0;
CAT.categorias.forEach((c) => c.g.forEach((g) => g.l.forEach((l) => { nProd++; nVar += l.v.length; if (l.foto) nFotoProd++; })));
const nFotoBan = CAT.banners.filter((b) => b.foto).length, nFotos = nFotoProd + nFotoBan;
const ESP = { categorias: CAT.categorias.length, grupos: CAT.categorias.reduce((n, c) => n + c.g.length, 0), productos: nProd, variantes: nVar, banners: CAT.banners.length, tarjetas: CAT.tarjetas.length, descuentos: CAT.descuentos.length, ajustes: 2 };
console.log("esperado:", JSON.stringify(ESP), "fotos:", nFotos);
const ANTES = "localStorage.removeItem('av-import-pendiente'); window.__vacio=true;";
const cuentas = (p) => p.ev(`(function(){var o={};['categorias','grupos','productos','variantes','banners','tarjetas','descuentos','ajustes'].forEach(function(k){o[k]=window.__db[k].length});return o})()`);
const listo = async (p) => { const r = await p.hasta(`${$("im-ok")}.textContent.indexOf('Listo')===0`, 20000); if (!r) console.log("DBG", await p.ev(`JSON.stringify([${$("im-msg")}.textContent, ${$("im-prog")}.textContent, window.__llamadas.slice(-4), window.__importarError])`), p.errores); return r; };
const nombres = (p) => p.ev(`JSON.stringify(window.__db.productos.map(function(x){return x.grupo_id+'|'+x.nombre}).sort())`);

try {
  // 0) Con datos: el botón no aparece. Respaldo siempre disponible.
  const a = await pagina(BASE + "/" + TMP + "#tienda", "localStorage.removeItem('av-import-pendiente');");
  ok(await a.hasta(`document.querySelectorAll('#t-lista details.c').length===2`), "con datos: la lista carga");
  await espera(400);
  ok(await a.ev(`${$("im-card")}.hidden`), "con datos: «Importar mi catálogo actual» NO aparece");
  ok(await a.ev(`!${$("rs-ir")}.hidden && ${$("rs-ir")}.textContent==='Descargar respaldo para la tienda'`), "el botón de respaldo está visible");
  await a.cerrar();

  // 1) Base vacía: aparece; importar; conteos
  const p = await pagina(BASE + "/" + TMP + "#tienda", ANTES);
  ok(await p.hasta(`!${$("im-card")}.hidden`), "base vacía: aparece «Importar mi catálogo actual»");
  ok(await p.ev(`${$("im-ir")}.textContent==='Importar mi catálogo actual'`), "…con ese texto");
  ok(await p.ev(`document.documentElement.scrollWidth-document.documentElement.clientWidth`) <= 0, "375 px: sin scroll horizontal");
  await p.ev(`window.__prog=[]; new MutationObserver(function(){var t=${$("im-prog")}.textContent; if(t&&window.__prog[window.__prog.length-1]!==t)window.__prog.push(t)}).observe(${$("im-prog")},{childList:true,characterData:true,subtree:true}); ${$("im-ir")}.click()`);
  ok(await p.hasta(`localStorage.getItem('av-import-pendiente')==='1' || ${$("im-ok")}.textContent`), "al empezar queda la marca av-import-pendiente");
  ok(await listo(p), "la importación termina con mensaje «Listo»");
  ok(await p.ev(`localStorage.getItem('av-import-pendiente')===null`), "…y la marca se borra al terminar");
  const prog = await p.ev(`window.__prog`);
  ok(prog.some((t) => t === "Subiendo fotos 1 de " + nFotos + "…") && prog.some((t) => t === "Subiendo fotos " + nFotos + " de " + nFotos + "…") && prog.some((t) => t === "Creando productos…"), "muestra progreso: " + prog.join(" > "));
  const c1 = await cuentas(p);
  ok(JSON.stringify(c1) === JSON.stringify(ESP), "conteos tras importar = catálogo: " + JSON.stringify(c1));
  const subidas1 = await p.ev(`window.__subidas.length`);
  ok(subidas1 === nFotos, `fotos subidas: ${subidas1} (${nFotoProd} de productos + ${nFotoBan} de banners)`);
  ok(await p.ev(`window.__db.productos.filter(function(x){return x.foto_url}).length`) === nFotoProd && await p.ev(`window.__db.banners.filter(function(x){return x.foto_url}).length`) === nFotoBan, "foto_url asignado a los productos y banners con foto");
  ok(await p.ev(`window.__subidas.every(function(s){return s.ctype==='image/jpeg'&&s.w>0&&s.w<=1000&&s.h<=1000&&s.size<=2097152})`), "las fotos suben como JPEG ≤ 1000 px y ≤ 2 MB");
  ok(await p.ev(`(function(){var d=window.__db,pin=d.categorias.filter(function(c){return c.nombre==='Pinturas'})[0],g=d.grupos.filter(function(x){return x.categoria_id===pin.id})[0],am=d.productos.filter(function(x){return x.grupo_id===g.id&&x.nombre==='Amarillo'})[0],vs=d.variantes.filter(function(v){return v.producto_id===am.id});return g.con_tamanos&&g.prefijo&&am.color&&am.precio===null&&vs.length===3&&vs[0].orden===0&&vs[2].orden===2})()`), "Pinturas: 9 colores con 3 tamaños cada uno (Amarillo: 3, sin precio propio, con color)");
  ok(await p.ev(`(function(){var d=window.__db,fig=d.categorias.filter(function(c){return c.nombre==='Figuras de yeso'})[0],b=d.banners;return b[1].categoria_id===fig.id&&b[0].categoria_id===null&&b[1].enlace===null&&b[0].enlace==='#tienda'&&b[0].color1==='#6f8a3a'&&b[0].letra_oscura===false&&b[1].on===false&&b[2].foto_url&&!b[0].foto_url&&b[3].letra_oscura===true})()`), "banners: categoría por nombre, enlace, colores, apagado y letra oscura");
  ok(await p.ev(`(function(){var d=window.__db,g=d.grupos.filter(function(x){return x.nombre==='Figuras sueltas'})[0],g2=d.grupos.filter(function(x){return x.nombre==='Paquetes de pinceles'})[0];return d.descuentos[0].grupo_id===g.id&&d.descuentos[0].tipo==='2x1'&&d.descuentos[0].on===false&&d.descuentos[1].grupo_id===g2.id&&d.descuentos[1].valor===20&&d.descuentos[0].categoria_id===null})()`), "descuentos: grupo por nombre, tipo, valor, apagado");
  ok(await p.ev(`(function(){var a=window.__db.ajustes,f=a.filter(function(x){return x.clave==='franja'})[0].valor,m=a.filter(function(x){return x.clave==='mas_vendidos'})[0].valor,ids=window.__db.productos.map(function(x){return x.id});return f.envioMin===15000&&f.prov==='Cartago'&&m.modo==='manual'&&m.lista.length===4&&m.lista.every(function(i){return ids.indexOf(i)>=0})})()`), "ajustes: franja y «Lo más vendido» manual con 4 productos reales");
  ok(await p.ev(`(function(){var g=window.__db.grupos.filter(function(x){return x.nombre==='Figuras sueltas'})[0];return window.__db.productos.filter(function(x){return x.grupo_id===g.id}).map(function(x){return x.nombre}).slice(0,2).join()})()`) === "Abeja,Arcoíris", "el orden de los productos se conserva");
  ok(await p.hasta(`document.querySelectorAll('#t-lista details.c').length===4`), "la lista de Tienda muestra las 4 categorías importadas");
  ok(await p.ev(`${$("im-ir")}.hidden && /Listo/.test(${$("im-ok")}.textContent)`), "se queda el mensaje de éxito y se oculta el botón");
  const nom1 = await nombres(p);

  // 2) Importar otra vez (marca forzada): mismos conteos, sin subir fotos ni crear nada
  const p2 = await pagina(BASE + "/" + TMP + "#tienda", "localStorage.removeItem('av-import-pendiente');"); // base con datos de ejemplo
  await p2.hasta(`document.querySelectorAll('#t-lista details.c').length===2`); await espera(300);
  ok(await p2.ev(`${$("im-card")}.hidden`), "sin marca y con datos: no aparece");
  await p2.ev(`localStorage.setItem('av-import-pendiente','1'); AV.importar.refrescar()`);
  ok(await p2.hasta(`!${$("im-card")}.hidden`), "con la marca av-import-pendiente aparece aunque ya haya datos");
  await p2.ev(`localStorage.removeItem('av-import-pendiente')`);
  await p2.cerrar();
  await p.ev(`window.__llamadas.length=0; localStorage.setItem('av-import-pendiente','1'); ${$("im-ir")}.hidden=false; ${$("im-ok")}.textContent=''; ${$("im-ir")}.click()`);
  ok(await listo(p), "segunda importación termina");
  const c2 = await cuentas(p);
  ok(JSON.stringify(c2) === JSON.stringify(ESP), "segunda importación: mismos conteos " + JSON.stringify(c2));
  ok(await p.ev(`window.__subidas.length`) === subidas1, "segunda importación: no sube fotos nuevas (" + subidas1 + ")");
  ok(await nombres(p) === nom1, "segunda importación: mismos productos (sin duplicados)");
  const posts = (await p.ev(`window.__llamadas.filter(function(l){return l.indexOf('POST')===0})`));
  ok(posts.every((l) => /on_conflict|ajustes/.test(l)) && await p.ev(`window.__db.variantes.length`) === nVar, "…solo POST con on_conflict (y ajustes); no repite variantes ni promociones: " + posts.length + " POST");

  // 3) Respaldo
  await p.ev(`window.__catalogoPublico = JSON.parse(JSON.stringify(window.CATALOGO_RESPALDO)); window.__desc=[]; var oc=URL.createObjectURL; URL.createObjectURL=function(b){window.__desc.push(b); return oc.call(URL,b)}; window.__clics=[]; HTMLAnchorElement.prototype.click=function(){window.__clics.push(this.download)}; ${$("rs-ir")}.click()`);
  ok(await p.hasta(`window.__desc.length===1`), "«Descargar respaldo» genera un archivo");
  ok(await p.ev(`window.__clics.join()`) === "catalogo.js", "…llamado catalogo.js");
  const txt = await p.ev(`window.__desc[0].text()`);
  const l1 = txt.split("\n")[0];
  ok(l1.startsWith("// Catálogo de respaldo de la tienda ARTE VIVA") && l1 === readFileSync("catalogo.js", "utf8").split("\n")[0], "empieza con el mismo comentario de una línea que el catalogo.js actual");
  ok(txt.split("\n")[1].startsWith("window.CATALOGO_RESPALDO = {") && txt.trimEnd().endsWith("};"), "…seguido de window.CATALOGO_RESPALDO = {…};");
  const c3 = { window: {} }; vm.runInNewContext(txt, c3);
  ok(JSON.stringify(c3.window.CATALOGO_RESPALDO) === JSON.stringify(CAT), "cargado como la tienda lo carga, queda idéntico al catálogo");
  ok(await p.ev(`${$("rs-msg")}.textContent===''`) && /reemplazando catalogo\.js/.test(await p.ev(`${$("rs-ir")}.parentNode.previousElementSibling.textContent`)), "la tarjeta explica subirlo a GitHub reemplazando catalogo.js");
  await p.ev(`window.__catalogoPublico = null; ${$("rs-ir")}.click()`);
  ok(await p.hasta(`/No se pudo preparar/.test(${$("rs-msg")}.textContent)`), "si el respaldo viene vacío: avisa y no descarga");
  ok(p.errores.length === 0, "sin errores de JavaScript (" + p.errores.join(" | ") + ")");
  await p.cerrar();

  // 3b) Importar desde un respaldo descargado: las fotos son direcciones https, no data:
  {
    const URLS = []; let n = 0;
    const http = JSON.parse(JSON.stringify(CAT, (k, v) => (k === "foto" && typeof v === "string" && v.startsWith("data:") ? (URLS.push("https://ejemplo.supabase.co/storage/v1/object/public/productos/2026/10/f" + ++n + ".jpg"), URLS[URLS.length - 1]) : v)));
    writeFileSync("_catalogo_http.js", "window.CATALOGO_RESPALDO = " + JSON.stringify(http) + ";\n");
    const h = await pagina(BASE + "/" + TMP + "#tienda", ANTES + "var _ap=Node.prototype.appendChild;Node.prototype.appendChild=function(e){if(e.tagName==='SCRIPT'&&/catalogo\.js/.test(e.src))e.src='_catalogo_http.js?x='+Date.now();return _ap.call(this,e)};");
    await h.hasta(`!${$("im-card")}.hidden`);
    await h.ev(`${$("im-ir")}.click()`);
    ok(await listo(h), "importar desde un respaldo con fotos https: termina");
    const ch = await cuentas(h);
    ok(JSON.stringify(ch) === JSON.stringify(ESP), "…mismos conteos: " + JSON.stringify(ch));
    ok(await h.ev(`window.__subidas.length`) === 0, "…0 archivos subidos");
    const guardadas = await h.ev(`window.__db.productos.map(function(x){return x.foto_url}).concat(window.__db.banners.map(function(x){return x.foto_url})).filter(Boolean).sort()`);
    ok(JSON.stringify(guardadas) === JSON.stringify(URLS.slice().sort()) && guardadas.length === nFotos, "…guarda esas " + nFotos + " direcciones tal cual");
    ok(h.errores.length === 0, "…sin errores de JavaScript");
    await h.cerrar();
  }

  // 4) Interrupciones en distintos puntos, luego reintento
  for (const [nombre, regla] of [
    ["fotos (falla el 3.er PATCH de productos)", `window.__n=0; window.__fallarSi=function(k){ return k==='PATCH /rest/v1/productos' && ++window.__n===3 }`],
    ["tamaños (falla el 1.er POST de variantes)", `window.__n=0; window.__fallarSi=function(k){ return k==='POST /rest/v1/variantes' && ++window.__n===1 }`],
    ["productos (falla el 2.º POST de productos)", `window.__n=0; window.__fallarSi=function(k){ return k==='POST /rest/v1/productos' && ++window.__n===2 }`],
    ["promociones (falla el POST de descuentos)", `window.__n=0; window.__fallarSi=function(k){ return k==='POST /rest/v1/descuentos' && ++window.__n===1 }`],
  ]) {
    const q = await pagina(BASE + "/" + TMP + "#tienda", ANTES);
    await q.hasta(`!${$("im-card")}.hidden`);
    await q.ev(regla + `; ${$("im-ir")}.click()`);
    ok(await q.hasta(`/No se pudo terminar/.test(${$("im-msg")}.textContent) && !${$("im-ir")}.disabled`, 20000), `interrupción en ${nombre}: avisa con claridad`);
    ok(await q.ev(`localStorage.getItem('av-import-pendiente')==='1' && !${$("im-card")}.hidden && ${$("im-ir")}.textContent==='Reintentar importación'`), "…la marca sigue puesta y el botón de reintento visible");
    await q.ev(`window.__fallarSi=null; ${$("im-ir")}.click()`);
    ok(await listo(q), "…al reintentar termina");
    const cq = await cuentas(q);
    ok(JSON.stringify(cq) === JSON.stringify(ESP), "…conteos finales = importación limpia: " + JSON.stringify(cq));
    ok(await nombres(q) === nom1 && await q.ev(`window.__db.productos.filter(function(x){return x.foto_url}).length`) === nFotoProd && await q.ev(`window.__db.banners.filter(function(x){return x.foto_url}).length`) === nFotoBan, "…mismos productos y todas las fotos asignadas");
    ok(await q.ev(`(function(){var c={};window.__db.variantes.forEach(function(v){c[v.producto_id]=(c[v.producto_id]||0)+1});return Object.keys(c).length===9&&Object.keys(c).every(function(k){return c[k]===3})})()`), "…cada color con exactamente 3 tamaños");
    ok(await q.ev(`localStorage.getItem('av-import-pendiente')===null`), "…y la marca se borra");
    ok(q.errores.length === 0, "…sin errores de JavaScript (" + q.errores.join(" | ") + ")");
    await q.cerrar();
  }
} finally {
  nav.kill(); await espera(500); try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  try { unlinkSync(TMP); } catch {}
  try { unlinkSync("_catalogo_http.js"); } catch {}
}
console.log(fallos ? `${fallos} FALLA(S)` : "todo ok");
process.exit(fallos ? 1 : 0);

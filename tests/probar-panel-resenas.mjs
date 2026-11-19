// Prueba del panel (Tienda → Reseñas) en Edge sin ventana, con Supabase simulado (tests/simular-supabase.js).
// Uso: node tests/probar-panel-resenas.mjs [base=http://127.0.0.1:8765]
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
try {
  const p = await pagina(BASE + "/" + TMP + "#inicio");
  const ev = p.ev;
  ok(await p.hasta(`/2 reseñas con foto por revisar/.test(${$("pend")}.textContent)`), "Inicio → Pendientes avisa de 2 reseñas con foto por revisar");
  await ev(`[].filter.call(${$("pend")}.querySelectorAll('button'),function(b){return /reseñas con foto/.test(b.parentNode.textContent)})[0].click()`);
  ok(await p.hasta(`!${$("s-tienda")}.hidden && !${$("t-v-res")}.hidden && ${$("t-v-prod")}.hidden && ${$("t-v-promo")}.hidden`), "el botón lleva a Tienda → Reseñas");
  ok(await p.hasta(`${$("rv-espera")}.querySelectorAll('article').length===2 && ${$("rv-publicadas")}.querySelectorAll('article').length===1`), "2 en espera y 1 publicada");
  ok(await ev(`document.querySelector('#t-vistas [data-v=res]').getAttribute('aria-pressed')==='true' && document.querySelector('#t-vistas [data-v=prod]').getAttribute('aria-pressed')==='false'`), "el chip «Reseñas» queda marcado");
  ok(await ev(`!${$("rv-espera")}.querySelector('b b') && ${$("rv-espera")}.textContent.indexOf("Luis <b>x</b>")>=0`), "un nombre con HTML se muestra como texto");
  ok(await ev(`!!${$("rv-espera")}.querySelector('img[src*="fotos/123-abc.jpg"]')`), "la reseña en espera muestra su foto");
  // Aprobar
  await ev(`[].filter.call(${$("rv-espera")}.querySelectorAll('article'),function(a){return /Miren mi obra/.test(a.textContent)})[0].querySelector('.btn.gr').click()`);
  ok(await p.hasta(`(function(){var r=window.__db.resenas.filter(function(x){return x.id===502})[0];return r.visible===true&&r.foto_aprobada===true})()`), "Aprobar deja la reseña visible y su foto aprobada");
  ok(await p.hasta(`${$("rv-espera")}.querySelectorAll('article').length===1 && ${$("rv-publicadas")}.querySelectorAll('article').length===2`), "la aprobada pasa a Publicadas");
  // Rechazar una cuya foto ya no existe en el bucket
  await ev(`window.__fotosBorradas=[];[].filter.call(${$("rv-espera")}.querySelectorAll('article'),function(a){return /Sofía/.test(a.textContent)})[0].querySelectorAll('.btn')[1].click()`);
  ok(await p.hasta(`${$("d-confirma")}.open && /se borra también su foto/.test(${$("dq-txt")}.textContent)`), "Rechazar pide confirmación y avisa que se borra la foto");
  await ev(`${$("d-confirma")}.close('si')`);
  ok(await p.hasta(`!window.__db.resenas.some(function(x){return x.id===503})`), "Rechazar borra la reseña aunque su foto ya no exista");
  ok(await ev(`JSON.stringify(window.__fotosBorradas)`) === '["no-existe.jpg"]', "Rechazar intentó borrar su foto del bucket «fotos»");
  ok(await p.hasta(`/No hay reseñas con foto/.test(${$("rv-espera")}.textContent)`), "la lista En espera queda vacía con un mensaje");
  // Borrar una publicada con foto, con la red caída al borrar la foto: no se borra la fila y se avisa
  await ev(`window.__fotosFalla=true;[].filter.call(${$("rv-publicadas")}.querySelectorAll('article'),function(a){return /Miren mi obra/.test(a.textContent)})[0].querySelector('.btn').click()`);
  await p.hasta(`${$("d-confirma")}.open`); await ev(`${$("d-confirma")}.close('si')`);
  ok(await p.hasta(`/No se pudo conectar/.test(${$("toast")}.textContent)`) && await ev(`window.__db.resenas.some(function(x){return x.id===502})`), "si la foto no se puede borrar por red, la reseña no se borra y se avisa");
  await ev(`window.__fotosFalla=false;window.__fotosBorradas=[];[].filter.call(${$("rv-publicadas")}.querySelectorAll('article'),function(a){return /Miren mi obra/.test(a.textContent)})[0].querySelector('.btn').click()`);
  await p.hasta(`${$("d-confirma")}.open`); await ev(`${$("d-confirma")}.close('si')`);
  ok(await p.hasta(`!window.__db.resenas.some(function(x){return x.id===502})`) && await ev(`JSON.stringify(window.__fotosBorradas)`) === '["123-abc.jpg"]', "Borrar una publicada borra la reseña y su foto");
  // Borrar una sin foto
  await ev(`window.__fotosBorradas=[];[].filter.call(${$("rv-publicadas")}.querySelectorAll('article'),function(a){return /mariposa/.test(a.textContent)})[0].querySelector('.btn').click()`);
  await p.hasta(`${$("d-confirma")}.open`); await ev(`${$("d-confirma")}.close('si')`);
  ok(await p.hasta(`window.__db.resenas.length===0`) && await ev(`window.__fotosBorradas.length`) === 0, "Borrar una sin foto no toca el bucket");
  ok(await ev(`document.documentElement.scrollWidth-document.documentElement.clientWidth`) <= 0, "375 px sin scroll horizontal");
  // Volver a Productos y Promociones sigue funcionando
  await ev(`document.querySelector('#t-vistas [data-v=promo]').click()`);
  ok(await p.hasta(`!${$("t-v-promo")}.hidden && ${$("t-v-res")}.hidden && ${$("t-v-prod")}.hidden`), "el chip Promociones oculta Reseñas");
  await ev(`document.querySelector('#t-vistas [data-v=prod]').click()`);
  ok(await p.hasta(`!${$("t-v-prod")}.hidden && ${$("t-v-res")}.hidden`), "el chip Productos oculta Reseñas");
  ok(p.errores.length === 0, "sin errores de JavaScript: " + p.errores.join(" | "));
  await p.cerrar();
  // Casos de la revisión final: enlaces de foto malos o ajenos, foto compartida, reseñas viejas con foto sin aprobar
  const U = "https://simulado.supabase.co/storage/v1/object/public/fotos/";
  const EXTRA = "window.__resenasExtra=" + JSON.stringify([
    { id: 601, nombre: "Vieja", calificacion: 5, comentario: "Foto pendiente de antes", foto_url: U + "vieja.jpg", foto_aprobada: false, visible: true, creado: "2026-10-01T10:00:00Z" },
    { id: 602, nombre: "Aprobada", calificacion: 5, comentario: "Foto real", foto_url: U + "real.jpg", foto_aprobada: true, visible: true, creado: "2026-10-02T10:00:00Z" },
    { id: 603, nombre: "Spam copia", calificacion: 1, comentario: "copia la foto real", foto_url: U + "real.jpg", foto_aprobada: false, visible: false, creado: "2026-10-26T10:00:00Z" },
    { id: 604, nombre: "Roto", calificacion: 1, comentario: "enlace roto", foto_url: U + "%", foto_aprobada: false, visible: false, creado: "2026-10-26T11:00:00Z" },
    { id: 605, nombre: "Ajeno", calificacion: 1, comentario: "otro sitio", foto_url: "https://otro.example/storage/v1/object/public/fotos/x.jpg", foto_aprobada: false, visible: false, creado: "2026-10-26T12:00:00Z" },
    { id: 606, nombre: "Escapa", calificacion: 1, comentario: "sube de carpeta", foto_url: U + "../productos/2026/10/sol.jpg", foto_aprobada: false, visible: false, creado: "2026-10-26T13:00:00Z" }]) + ";";
  const s = await pagina(BASE + "/" + TMP + "#tienda", EXTRA);
  await s.hasta(`!document.getElementById('app').hidden`);
  await s.ev(`document.querySelector('#t-vistas [data-v=res]').click()`);
  ok(await s.hasta(`${$("rv-espera")}.querySelectorAll('article').length===4`), "4 en espera con enlaces raros");
  ok(await s.ev(`!${$("rv-espera")}.querySelector('img[src*="otro.example"]')`), "no se carga una foto de otro sitio");
  const rechaza = async (nombre) => { await s.ev(`window.__fotosBorradas=[];[].filter.call(${$("rv-espera")}.querySelectorAll('article'),function(a){return a.querySelector('b').textContent===${JSON.stringify(nombre)}})[0].querySelectorAll('.btn')[1].click()`);
    await s.hasta(`${$("d-confirma")}.open`); await s.ev(`${$("d-confirma")}.close('si')`); };
  for (const [n, id] of [["Roto", 604], ["Ajeno", 605], ["Escapa", 606]]) {
    await rechaza(n);
    ok(await s.hasta(`!window.__db.resenas.some(function(x){return x.id===${id}})`) && await s.ev(`(window.__fotosBorradas||[]).length`) === 0, `rechazar «${n}» borra la reseña sin tocar el bucket`);
  }
  await rechaza("Spam copia");
  ok(await s.hasta(`!window.__db.resenas.some(function(x){return x.id===603})`) && await s.ev(`(window.__fotosBorradas||[]).length`) === 0, "rechazar un spam que copia una foto aprobada no borra la foto real");
  ok(await s.hasta(`/Aprobar foto/.test(${$("rv-publicadas")}.textContent)`), "una reseña vieja con foto sin aprobar tiene «Aprobar foto»");
  await s.ev(`[].filter.call(${$("rv-publicadas")}.querySelectorAll('button'),function(b){return b.textContent==='Aprobar foto'})[0].click()`);
  ok(await s.hasta(`window.__db.resenas.filter(function(x){return x.id===601})[0].foto_aprobada===true`), "«Aprobar foto» aprueba la foto sin borrar la reseña");
  ok(s.errores.length === 0, "sin errores de JavaScript (casos raros): " + s.errores.join(" | "));
  await s.cerrar();
} finally {
  nav.kill(); await espera(500); try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  try { unlinkSync(TMP); } catch {}
}
console.log(fallos ? `${fallos} FALLA(S)` : "todo ok");
process.exit(fallos ? 1 : 0);

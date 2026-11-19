// Prueba de la tienda (etapa 3): conteo de visitas por sesión y aviso de reseñas con foto. Edge sin ventana, Supabase simulado.
// Uso: node tests/probar-tienda-visitas.mjs [base=http://127.0.0.1:8765]
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const BASE = process.argv[2] || "http://127.0.0.1:8765";
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!EDGE) { console.log("No encontré Edge"); process.exit(1); }

const PUERTO = 9338, perfil = mkdtempSync(join(tmpdir(), "av-edge-"));
const nav = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=" + PUERTO, "--user-data-dir=" + perfil, "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "about:blank"], { stdio: "ignore" });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ver;
for (let i = 0; i < 50 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PUERTO}/json/version`)).json(); } catch { await espera(200); } }

let fallos = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALLA") + " " + m); if (!c) fallos++; };

// Abre una pestaña nueva con un script inyectado antes de que cargue la página.
async function pagina(url, antesDeCargar = "") {
  const t = await (await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = {}, errores = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await cmd("Runtime.enable"); await cmd("Page.enable");
  await cmd("Page.addScriptToEvaluateOnNewDocument", { source: "window.__t0=performance.now();new MutationObserver(function(){var s=document.getElementById('shop');if(s&&s.querySelector('details')&&!window.__tShop)window.__tShop=performance.now()}).observe(document,{childList:true,subtree:true});" + antesDeCargar });
  await cmd("Page.navigate", { url });
  const ev = async (expr) => { const r = await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
  const hasta = async (expr, ms = 8000) => { const f = Date.now() + ms; while (Date.now() < f) { try { if (await ev(expr)) return true; } catch {} await espera(100); } return false; };
  return { ev, hasta, errores, cerrar: async () => { ws.close(); await fetch(`http://127.0.0.1:${PUERTO}/json/close/${t.id}`); } };
}

// Supabase simulado: anota llamadas; catálogo y reseñas responden vacío (la tienda usa catalogo.js). colgar=true: registrar_visita nunca responde.
const SIM = (colgar) => `window.SUPA_CFG={url:'https://simulado.supabase.co',key:'sb_publishable_simulado_123456789'};window.__llamadas=[];
window.fetch=function(u,o){o=o||{};var s=String(u);window.__llamadas.push({u:s,b:o.body||null,ka:!!o.keepalive});
if(s.indexOf('registrar_visita')>=0&&${colgar ? "true" : "false"})return new Promise(function(){});
if(s.indexOf('storage/v1/object/fotos')>=0)return Promise.resolve(new Response('{}',{status:200}));
if(s.indexOf('/rest/v1/resenas')>=0&&o.method==='POST')return Promise.resolve(new Response(null,{status:201}));
return Promise.resolve(new Response('[]',{status:200,headers:{'Content-Type':'application/json'}}))};`;
const visitas = `window.__llamadas.filter(function(x){return x.u.indexOf('registrar_visita')>=0}).map(function(x){return JSON.parse(x.b)})`;
try {
  const p = await pagina(BASE + "/index.html?de=ig", SIM(false));
  ok(await p.hasta(`!!document.querySelector("#shop details")`), "la tienda carga");
  ok(JSON.stringify(await p.ev(visitas)) === '[{"origen":"ig","evento":"visita"}]', "una visita con origen ig al entrar: " + JSON.stringify(await p.ev(visitas)));
  ok(await p.ev(`window.__llamadas.filter(function(x){return x.u.indexOf('registrar_visita')>=0})[0].ka`), "la visita se envía con keepalive");
  await p.ev(`location.hash='#tienda'`); await p.hasta(`!document.getElementById('vista-tienda').hidden`);
  await p.ev(`location.hash='#inicio'`); await espera(150); await p.ev(`location.hash='#tienda'`); await espera(200);
  const v2 = await p.ev(visitas);
  ok(v2.length === 2 && v2[1].evento === "tienda" && v2[1].origen === "ig", "abrir la tienda dos veces cuenta una sola vez «tienda»: " + JSON.stringify(v2));
  await p.ev(`(function(){var id=PRODUCTS.filter(function(x){return x.p!=null&&!agotado(x)})[0].id;setQty(id,1);document.getElementById('f-nombre').value='Ana';document.getElementById('f-tel').value='88881234';document.getElementById('f-prov').value='Cartago';
document.querySelector('input[name="f-entrega"][value="Retiro en persona"]').checked=true;document.querySelector('input[name="f-pago"][value="Efectivo"]').checked=true;onForm();
document.addEventListener('click',function(e){if(e.target.id==='wa')e.preventDefault()},true);document.getElementById('wa').click();document.getElementById('wa').click()})()`);
  await espera(200);
  const v3 = await p.ev(visitas);
  ok(v3.length === 3 && v3[2].evento === "whatsapp", "tocar WhatsApp cuenta «whatsapp» una sola vez: " + JSON.stringify(v3));
  ok(await p.ev(`window.__llamadas.some(function(x){return x.u.indexOf('crear_pedido')>=0})`), "el pedido se sigue guardando (etapa 1)");
  // reseña con foto: mensaje de espera
  await p.ev(`location.hash='#inicio'`);
  await p.ev(`(function(){var g=function(i){return document.getElementById(i)};g('rv-nombre').value='Ana';g('rv-texto').value='Me encantó';rvR=5;drawPins();g('rv-ok').checked=true;
var dt=new DataTransfer(),c=document.createElement('canvas');c.width=20;c.height=20;return new Promise(function(r){c.toBlob(function(b){dt.items.add(new File([b],'obra.png',{type:'image/png'}));g('rv-file').files=dt.files;updRv();g('rv-wa').click();r(1)},'image/png')})})()`);
  ok(await p.hasta(`/con foto se publicará cuando la revisemos/.test(document.getElementById('rv-estado').textContent)`), "reseña con foto: «se publicará cuando la revisemos» → " + await p.ev(`document.getElementById('rv-estado').textContent`));
  ok(/sin foto se publican al instante/.test(await p.ev(`document.getElementById('rv-nota').textContent`)), "la nota del formulario explica la espera de las fotos");
  await p.ev(`(function(){var g=function(i){return document.getElementById(i)};g('rv-nombre').value='Luis';g('rv-texto').value='Muy bonito';rvR=4;drawPins();g('rv-ok').checked=true;updRv();g('rv-wa').click()})()`);
  ok(await p.hasta(`/^¡Gracias! Tu reseña ya está publicada\.$/.test(document.getElementById('rv-estado').textContent)`), "reseña sin foto: «ya está publicada» como antes");
  ok(p.errores.length === 0, "sin errores de JavaScript: " + p.errores.join(" | "));
  await p.cerrar();
  // Nueva sesión sin ?de: origen «otros»
  const q = await pagina(BASE + "/index.html", SIM(false));
  await q.hasta(`!!document.querySelector('#shop details')`);
  ok(JSON.stringify(await q.ev(visitas)) === '[{"origen":"otros","evento":"visita"}]', "sin ?de el origen es «otros»");
  await q.cerrar();
  // ?demo no cuenta
  const d = await pagina(BASE + "/index.html?demo", SIM(false));
  await d.hasta(`!!document.querySelector('#shop details')`);
  ok((await d.ev(visitas)).length === 0, "la vista ?demo no cuenta visitas");
  await d.cerrar();
  // Supabase colgado: la página carga igual
  const c = await pagina(BASE + "/index.html?de=qr#tienda", SIM(true));
  ok(await c.hasta(`!!document.querySelector('#shop details') && !document.getElementById('vista-tienda').hidden`, 6000), "con la visita colgada la tienda carga igual");
  ok(c.errores.length === 0, "sin errores de JavaScript con Supabase colgado");
  await c.cerrar();
} finally {
  nav.kill(); await espera(500); try { rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(fallos ? `${fallos} FALLA(S)` : "todo ok");
process.exit(fallos ? 1 : 0);

// Prueba del panel (Cuentas → Visitas) en Edge sin ventana, con Supabase simulado. Sin internet: el generador de QR se simula.
// Uso: node tests/probar-panel-visitas.mjs [base=http://127.0.0.1:8765]
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

const PUERTO = 9337, perfil = mkdtempSync(join(tmpdir(), "av-edge-"));
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
const QR_FALSO = "window.qrcode=function(){var d='';return{addData:function(x){d=x;window.__qrDato=x},make:function(){},getModuleCount:function(){return 21},isDark:function(r,c){return (r*c+r)%3===0}}};";
try {
  const p = await pagina(BASE + "/" + TMP + "#tienda", QR_FALSO);
  const ev = p.ev;
  ok(await p.hasta(`!${$("s-tienda")}.hidden && !${$("t-v-prod")}.hidden && ${$("t-v-vis")}.hidden`), "Tienda abre en Productos");
  await ev(`document.querySelector('#t-vistas [data-v=vis]').click()`);
  ok(await p.hasta(`!${$("t-v-vis")}.hidden && ${$("t-v-prod")}.hidden`), "el chip Visitas muestra la vista de visitas");
  ok(await p.hasta(`!!${$("vi-graf")}.querySelector('svg')`), "gráfica de visitas por mes");
  ok(await ev(`/Instagram: 12/.test(${$("vi-tot")}.textContent) && /QR: 3/.test(${$("vi-tot")}.textContent) && /Facebook: [05]/.test(${$("vi-tot")}.textContent)`), "totales por origen en el mes");
  const k = await ev(`[].map.call(${$("vi-kpis")}.querySelectorAll('.k b'),function(b){return b.textContent})`);
  ok(Array.isArray(k) && k.length === 4 && +k[1] === 6 && +k[2] === 2, "resumen del mes: abrieron la tienda 6, tocaron WhatsApp 2 → " + JSON.stringify(k));
  await ev(`document.querySelector('#vi-modo [data-m=dia]').click()`);
  ok(await p.hasta(`/últimos 14 días/.test(${$("vi-tit")}.textContent) && ${$("vi-graf")}.querySelectorAll('rect').length>=3`), "por día: últimos 14 días con barras apiladas");
  await ev(`document.querySelector('#vi-modo [data-m=semana]').click()`);
  ok(await p.hasta(`/últimas 8/.test(${$("vi-tit")}.textContent)`), "por semana: últimas 8");
  const links = await ev(`[].map.call(${$("vi-links")}.querySelectorAll('code'),function(c){return c.textContent})`);
  ok(links.length === 3 && /\?de=ig$/.test(links[0]) && /\?de=fb$/.test(links[1]) && /\?de=qr$/.test(links[2]) && links.every(l => /^http:\/\/127\.0\.0\.1:8765\/\?de=/.test(l)), "enlaces con ?de= apuntan a la página (no a admin.html): " + links[0]);
  ok(await p.hasta(`!!document.querySelector("#vi-qr canvas") && document.getElementById("vi-qr-baja").href.indexOf("data:image/png")===0`), "QR dibujado y botón de descarga en PNG: " + await ev(`document.getElementById("vi-qr").textContent+"|"+typeof window.qrcode`));
  ok(await ev(`String(window.__qrDato).slice(-6)==="?de=qr"`), "el QR lleva a ?de=qr");
  ok(await ev(`document.documentElement.scrollWidth-document.documentElement.clientWidth`) <= 0, "375 px sin scroll horizontal");
  await ev(`document.querySelector('#t-vistas [data-v=prod]').click()`);
  ok(await p.hasta(`!${$("t-v-prod")}.hidden && ${$("t-v-vis")}.hidden`), "volver a Productos");
  ok(p.errores.length === 0, "sin errores de JavaScript: " + p.errores.join(" | "));
  await p.cerrar();
  // Sin visitas: mensaje amable y sin NaN
  const q = await pagina(BASE + "/" + TMP + "#tienda", QR_FALSO + "window.__sinVisitas=true;");
  await q.hasta(`!document.getElementById('app').hidden && !document.getElementById('s-tienda').hidden`);
  await q.ev(`document.querySelector('#t-vistas [data-v=vis]').click()`);
  ok(await q.hasta(`/Todavía no hay visitas/.test(${$("vi-graf")}.textContent)`), "sin visitas: mensaje amable en la gráfica");
  ok(await q.ev(`!/NaN|undefined/.test(${$("t-v-vis")}.textContent)`), "sin visitas: ningún NaN ni undefined");
  await q.cerrar();
  // Sin internet para el generador de QR: aviso en vez de «Cargando» para siempre, y sin botón de descarga vacío
  const z = await pagina(BASE + "/" + TMP + "#tienda", "");
  await z.hasta(`!document.getElementById('app').hidden && !document.getElementById('s-tienda').hidden`);
  await z.ev(`document.querySelector('#t-vistas [data-v=vis]').click()`);
  ok(await z.hasta(`document.getElementById('vi-qr-baja').hidden && /Cargando QR/.test(document.getElementById('vi-qr').textContent)`, 3000), "sin generador de QR: «Cargando QR…» y botón oculto");
  ok(await z.hasta(`/No se pudo cargar el QR/.test(document.getElementById('vi-qr').textContent)`, 12000), "a los pocos segundos avisa que no se pudo cargar el QR");
  await z.cerrar();
} finally {
  nav.kill(); await espera(500); try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  try { unlinkSync(TMP); } catch {}
}
console.log(fallos ? `${fallos} FALLA(S)` : "todo ok");
process.exit(fallos ? 1 : 0);

// Prueba de la tienda en un navegador real (Edge sin ventana, vía DevTools Protocol).
// Uso: node tests/probar-tienda.mjs [base=http://127.0.0.1:8765] [antes=tests/_antes/index.html]
// Las páginas externas (Google Fonts) se bloquean para que la prueba no dependa de internet.
// Requiere un servidor local sirviendo la carpeta del proyecto (python -m http.server 8765 --bind 127.0.0.1).
// "antes" (opcional) es una copia (p. ej. git show 3623f79:index.html > tests/_antes/index.html) de la página anterior para comparar que la tienda se vea igual.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:8765";
const ANTES = process.argv[3] || "tests/_antes/index.html";
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!EDGE) { console.log("No encontré Edge"); process.exit(1); }

const PUERTO = 9333, perfil = mkdtempSync(join(tmpdir(), "av-edge-"));
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

// Foto de la tienda: lo que el cliente ve, sin ids internos.
const FOTO = `(function(){var h=function(s){var x=0;for(var i=0;i<s.length;i++)x=(x*31+s.charCodeAt(i))|0;return x};
var bn=document.querySelector(".bnr-slot");var bh=bn.innerHTML.replace(/ alt="[^"]*"/g,"");
return {shop:h(document.getElementById("shop").innerHTML),shopLen:document.getElementById("shop").innerHTML.length,
productos:PRODUCTS.map(function(p){return p.n+"|"+p.p+"|"+p.c+"|"+p.cat+"|"+p.grp+"|"+p.base+"|"+(IMGS[p.n]?h(IMGS[p.n]):"")}),
fotos:Object.keys(IMGS).sort().map(function(k){return k+"|"+h(IMGS[k])}),
franja:document.getElementById("franja").hidden?"(oculta)":document.getElementById("franja").textContent.slice(0,80),
banners:h(bh),bannersTxt:bn.textContent,mv:document.querySelector(".mv-slot").textContent,imgs:document.querySelectorAll("#shop img").length,svgs:document.querySelectorAll("#shop svg").length}})()`;
// Arma el mismo carrito por nombre y devuelve el enlace de WhatsApp.
const PEDIDO = `(function(){var by=function(n){return PRODUCTS.filter(function(p){return p.n===n})[0].id};
setQty(by("Paquete de relajación: Flores"),2);setQty(by("Figura: Mariposa"),3);setQty(by("Pintura: Rojo – Frasco de 27 ml"),1);setQty(by("Paquete de pinceles: Básico"),1);
document.getElementById("f-nombre").value="Ana Mora";document.getElementById("f-tel").value="8888 1234";document.getElementById("f-prov").value="Cartago";
document.querySelector('input[name="f-entrega"][value^="Envío"]').checked=true;onForm();document.getElementById("f-dir").value="La Unión";
document.querySelector('input[name="f-pago"][value="SINPE Móvil"]').checked=true;onForm();
return {wa:document.getElementById("wa").getAttribute("href"),total:document.getElementById("total").textContent,envg:document.getElementById("envg").textContent,guardado:localStorage.getItem("av-carrito")}})()`;
const LISTA = "!!document.querySelector('#shop details')";

const CFG = "window.SUPA_CFG={url:'https://simulado.supabase.co',key:'sb_publishable_simulado_123456789'};";
const llamadas = "window.__llamadas=[];";
const fetchCon = (cuerpoCatalogo) => CFG + llamadas + `window.fetch=function(u,o){o=o||{};window.__llamadas.push({u:String(u),m:o.method,b:o.body,h:o.headers,sig:!!o.signal});
if(String(u).indexOf('/rpc/catalogo_publico')>-1){${cuerpoCatalogo}}return new Promise(function(){})};`;

try {
  // 1. Respaldo (sin supabase-config.js): igual que la página anterior
  const n = await pagina(BASE + "/index.html#tienda");
  ok(await n.hasta(LISTA, 20000), "tienda nueva carga desde catalogo.js sin Supabase");
  if (process.env.DEPURA) console.log(await n.ev("location.href+\" \"+document.readyState+\" \"+document.title"), n.errores);
  const fn = await n.ev(FOTO), pn = await n.ev(PEDIDO);
  ok(await n.ev("document.querySelector('meta[name=page-version]').content") === "catalogo-supabase-2026-10-24", "versión catalogo-supabase-2026-10-24");
  ok(await n.ev("PRODUCTS.every(function(p){return /^p-?\\d+(v-?\\d+)?$/.test(p.id)})"), "ids de producto con forma p<id> / p<id>v<id>");
  ok(n.errores.length === 0, "sin errores de JavaScript (" + n.errores.join(" | ") + ")");
  if (existsSync(ANTES)) {
    const a = await pagina(BASE + "/" + ANTES.replace(/\\/g, "/") + "#tienda");
    await a.hasta(LISTA); const fa = await a.ev(FOTO), pa = await a.ev(PEDIDO);
    ok(fn.shop === fa.shop && fn.shopLen === fa.shopLen, `acordeón de la tienda idéntico (${fn.shopLen} caracteres de HTML, ${fn.imgs} fotos, ${fn.svgs} dibujos)`);
    ok(JSON.stringify(fn.productos) === JSON.stringify(fa.productos), `mismos ${fn.productos.length} productos/variantes con nombre, precio, color, categoría, grupo y foto`);
    ok(JSON.stringify(fn.fotos) === JSON.stringify(fa.fotos), `mismas ${fn.fotos.length} fotos`);
    ok(fn.franja === fa.franja && fn.franja !== "(oculta)", "franja igual: " + fn.franja.slice(0, 50));
    ok(fn.banners === fa.banners && fn.bannersTxt === fa.bannersTxt, "banners y tarjetas iguales (salvo el texto alt de la foto)");
    ok(fn.mv === fa.mv && /Lo más vendido/.test(fn.mv), "Lo más vendido igual: " + fn.mv.slice(0, 70));
    ok(pn.wa && pn.wa === pa.wa, "mensaje de WhatsApp idéntico para el mismo carrito");
    ok(pn.total === pa.total && pn.envg === pa.envg, "totales y aviso de envío gratis iguales: " + pn.total + " / " + pn.envg);
    console.log("     mensaje: " + decodeURIComponent(pn.wa.split("text=")[1]).replace(/\n/g, " ⏎ ").slice(0, 300));
    await a.cerrar();
  } else console.log("(sin copia anterior en " + ANTES + ": se omite la comparación)");
  await n.cerrar();

  // 2. Carrito guardado con ids viejos o borrados: se descartan
  const c = await pagina(BASE + "/index.html#tienda", `localStorage.setItem("av-carrito",JSON.stringify({t:Date.now(),c:{"c0g0i0":2,"p-999999":1,"p-46":2,"p-69v-71":1}}));`);
  await c.hasta(LISTA);
  ok(await c.ev("JSON.stringify(cart)") === '{"p-46":2,"p-69v-71":1}', "carrito guardado descarta ids inexistentes y conserva los válidos: " + await c.ev("JSON.stringify(cart)"));
  ok(await c.ev("document.getElementById('cartbar').textContent") === "Carrito (3)", "barra del carrito: " + await c.ev("document.getElementById('cartbar').textContent"));
  ok(c.errores.length === 0, "sin errores de JavaScript con carrito viejo");
  await c.cerrar();

  // 3. Supabase colgado (fetch que nunca responde): respaldo en ≤3,2 s
  const t = await pagina(BASE + "/index.html#tienda", fetchCon("return new Promise(function(){})"));
  ok(await t.hasta("document.getElementById('shop').textContent==='Cargando tienda…'", 2000), "mientras espera muestra «Cargando tienda…»");
  ok(await t.hasta(LISTA, 6000), "con Supabase colgado la tienda aparece igual");
  const ms = await t.ev("window.__tShop-window.__t0");
  ok(ms >= 2900 && ms <= 3200, `aparece a los ${Math.round(ms)} ms (≤ 3200)`);
  const ll = await t.ev("window.__llamadas.filter(function(x){return x.u.indexOf('catalogo_publico')>-1})");
  ok(ll.length === 1 && ll[0].m === "POST" && ll[0].b === "{}" && ll[0].h.apikey && ll[0].h["Content-Type"] === "application/json" && ll[0].sig, "llamada POST /rest/v1/rpc/catalogo_publico con body {} , apikey y AbortSignal");
  ok(await t.ev("PRODUCTS.length") === fn.productos.length, "usa el respaldo completo");
  ok(await t.ev("localStorage.getItem('av-catalogo')") === null, "no guarda copia cuando Supabase falla");
  await t.cerrar();

  // 4. Supabase responde: usa sus datos y guarda la copia; 5. Supabase cae después: usa la copia
  const datos = `var j=JSON.parse(JSON.stringify(window.CATALOGO_RESPALDO));j.categorias[0].g[0].l[0].p=777;j.categorias[0].g[0].l[0].id=5001;j.categorias[0].g[0].l[0].nuevo=true;j.franja.on=false;
return Promise.resolve(new Response(JSON.stringify(j),{status:200,headers:{'Content-Type':'application/json'}}))`;
  const s = await pagina(BASE + "/index.html#tienda", fetchCon(datos));
  ok(await s.hasta(LISTA, 2000), "con Supabase respondiendo la tienda aparece");
  ok(await s.ev("window.__tShop-window.__t0") < 1500, "aparece sin esperar el tiempo límite (" + Math.round(await s.ev("window.__tShop-window.__t0")) + " ms)");
  ok(await s.ev("find('p5001').p===777&&NUEVOS.indexOf('Figura: Abeja')>-1&&document.getElementById('franja').hidden"), "usa los datos de Supabase (precio 777, NUEVO, franja apagada)");
  ok(await s.ev("JSON.parse(localStorage.getItem('av-catalogo')).categorias[0].g[0].l[0].p") === 777, "guarda la copia en localStorage av-catalogo");
  await s.cerrar();
  const k = await pagina(BASE + "/index.html#tienda", fetchCon("return Promise.resolve(new Response('error',{status:500}))"));
  ok(await k.hasta(LISTA, 2000), "Supabase con error 500: la tienda aparece");
  ok(await k.ev("!!find('p5001')&&find('p5001').p===777"), "y usa la copia del navegador (guardada en la carga anterior)");
  await k.cerrar();

  // 6. Supabase devuelve basura y no hay copia: respaldo
  const b = await pagina(BASE + "/index.html#tienda", "localStorage.removeItem('av-catalogo');" + fetchCon("return Promise.resolve(new Response('{\"hola\":1}',{status:200}))"));
  ok(await b.hasta(LISTA, 2000) && await b.ev("!find('p5001')&&PRODUCTS.length") === fn.productos.length, "respuesta con forma inválida: usa catalogo.js");
  await b.cerrar();

  // 7. Sin ninguna fuente: mensaje, no pantalla en blanco
  const z = await pagina(BASE + "/index.html#tienda", "localStorage.clear();Object.defineProperty(window,'CATALOGO_RESPALDO',{get:function(){return undefined},set:function(){}});");
  ok(await z.hasta("document.getElementById('shop').textContent==='No pudimos cargar la tienda. Recarga la página.'", 3000), "sin ninguna fuente muestra «No pudimos cargar la tienda. Recarga la página.»");
  ok(await z.ev("!document.getElementById('inicio').hidden||!document.getElementById('vista-tienda').hidden") && await z.ev("document.getElementById('rv-sum').textContent.length>0"), "el resto de la página (rutas, reseñas) sigue funcionando");
  await z.cerrar();

  const resp = (expr) => `var j=JSON.parse(JSON.stringify(window.CATALOGO_RESPALDO));${expr};return Promise.resolve(new Response(JSON.stringify(j),{status:200,headers:{'Content-Type':'application/json'}}))`;

  // 8. (C1) Supabase responde rápido pero con el catálogo vacío (tablas sin importar): no se usa ni se guarda
  for (const [nombre, vacio] of [["{categorias:[]}", "{v:1,categorias:[],banners:[],tarjetas:[],descuentos:[],mas_vendidos:[]}"],
    ["categoría y grupo sin productos", "{v:1,categorias:[{id:1,n:'A',g:[{id:1,t:'G',l:[]}]}],banners:[],tarjetas:[],descuentos:[],mas_vendidos:[]}"]]) {
    const e = await pagina(BASE + "/index.html#tienda", "localStorage.clear();" + fetchCon(`return Promise.resolve(new Response(JSON.stringify(${vacio}),{status:200,headers:{'Content-Type':'application/json'}}))`));
    ok(await e.hasta(LISTA, 10000) && await e.ev("PRODUCTS.length") === fn.productos.length, `catálogo vacío de Supabase (${nombre}): la tienda muestra los productos de catalogo.js`);
    ok(await e.ev("localStorage.getItem('av-catalogo')") === null, `catálogo vacío (${nombre}): no se guarda en av-catalogo`);
    await e.cerrar();
  }
  const COPIA = JSON.stringify({ v: 1, categorias: [{ id: 1, n: "Copia", d: "", c: "#123456", g: [{ id: 1, t: "Guardados", k: "Copia: ", im: false, sz: false, l: [{ id: 9001, d: "Guardado", p: 111 }] }] }], banners: [], tarjetas: [], descuentos: [], mas_vendidos: [] });
  const e2 = await pagina(BASE + "/index.html#tienda", `localStorage.setItem("av-catalogo",${JSON.stringify(COPIA)});` + fetchCon("return Promise.resolve(new Response(JSON.stringify({categorias:[]}),{status:200}))"));
  ok(await e2.hasta(LISTA, 10000) && await e2.ev("!!find('p9001')&&PRODUCTS.length===1"), "catálogo vacío de Supabase con copia en el navegador: usa la copia");
  ok(await e2.ev("localStorage.getItem('av-catalogo')") === COPIA, "y la copia av-catalogo no se sobrescribe");
  await e2.cerrar();

  // 9. (I1) ?demo pide {"demo":true} (promociones apagadas o vencidas) y no guarda esa respuesta
  const dem = resp(`var b=JSON.parse(o.body||'{}');if(b.demo)j.banners.push({on:false,sup:'s',t:'Promo apagada de prueba',d:'',boton:'',cat:null,ir:'#tienda',foto:null,col:['#111','#222'],osc:false,hasta:null})`);
  const d9 = await pagina(BASE + "/index.html?demo#tienda", "localStorage.clear();" + fetchCon(dem));
  ok(await d9.hasta(LISTA, 10000), "?demo: la tienda aparece");
  const ld = await d9.ev("window.__llamadas.filter(function(x){return x.u.indexOf('catalogo_publico')>-1})");
  ok(ld.length === 1 && ld[0].b === '{"demo":true}', "?demo: llamada a catalogo_publico con body {\"demo\":true} (" + (ld[0] && ld[0].b) + ")");
  ok(await d9.ev("document.querySelector('.bnr-slot').textContent.indexOf('Promo apagada de prueba')>-1"), "?demo: muestra la promoción apagada que devuelve Supabase");
  ok(await d9.ev("localStorage.getItem('av-catalogo')") === null, "?demo: no guarda la respuesta en av-catalogo");
  await d9.cerrar();

  // 10. (I2) nombres con comillas o etiquetas no rompen el dibujo ni inyectan HTML
  const RARO = 'Pincel 1/2" <b>x</b>', MALO = 'y"><img src=x onerror="window.__xss=1">';
  const x10 = await pagina(BASE + "/index.html#tienda", fetchCon(resp(`var l=j.categorias[2].g[1].l;l[0].d=${JSON.stringify(RARO)};l[1].d=${JSON.stringify(MALO)};j.mas_vendidos=['Pincel: '+l[0].d]`)));
  ok(await x10.hasta(LISTA, 10000), "nombres raros: la tienda aparece");
  const sv = await x10.ev(`(function(){var r=[].filter.call(document.querySelectorAll('#shop svg'),function(s){return s.getAttribute('aria-label')===${JSON.stringify(RARO)}});
return {n:r.length,txt:r.map(function(s){return s.textContent}).join(''),g:r.length&&r[0].querySelectorAll('g').length,b:document.querySelectorAll('#shop b, .mv-slot b').length,
img:document.querySelectorAll('#shop .ph.art img, .mv-slot .ph.art img').length,malo:[].some.call(document.querySelectorAll('#shop svg'),function(s){return s.getAttribute('aria-label')===${JSON.stringify(MALO)}})}})()`);
  ok(sv.n === 1 && sv.g > 0 && sv.txt === "", `producto «${RARO}» muestra su dibujo con el nombre completo como etiqueta (${JSON.stringify(sv)})`);
  ok(sv.b === 0 && sv.img === 0 && sv.malo, "no aparece ningún <b> ni <img> inyectado");
  ok(await x10.ev("window.__xss===undefined") && await x10.ev("document.querySelector('.mv-slot svg')&&document.querySelector('.mv-slot svg').getAttribute('aria-label')") === RARO, "no se ejecuta código del nombre (también en Lo más vendido)");
  await x10.cerrar();

  // 11. (I3) un producto con tamaños en Lo más vendido muestra su tarjeta con los tamaños
  const x11 = await pagina(BASE + "/index.html#tienda", "localStorage.clear();" + fetchCon(resp(`j.mas_vendidos=['Pintura: Amarillo','Paquete de relajación: Flores']`)));
  ok(await x11.hasta(LISTA, 10000), "Lo más vendido con pintura: la tienda aparece");
  const mv = await x11.ev(`(function(){var s=document.querySelector('.mv-slot');var pc=s.querySelector('details.pc');return {txt:s.textContent,pc:!!pc,nm:pc&&pc.querySelector('.nm').textContent,
bt:pc?pc.querySelectorAll('.szs button').length:0}})()`);
  ok(mv.pc && mv.nm === "Amarillo" && mv.bt === 3 && /Amarillo[\s\S]*Flores/.test(mv.txt), "«Pintura: Amarillo» aparece en Lo más vendido con sus 3 tamaños: " + mv.txt.slice(0, 90));
  ok(await x11.ev("(function(){var b=document.querySelector('.mv-slot details.pc .szs button');if(!b)return 'sin botón';b.click();return JSON.stringify(cart)})()") === '{"p-69v-70":1}', "agregar un tamaño desde Lo más vendido lo pone en el carrito");
  ok(x11.errores.length === 0, "sin errores de JavaScript (" + x11.errores.join(" | ") + ")");
  await x11.cerrar();
} finally {
  nav.kill(); await espera(500); try { rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(fallos ? `${fallos} FALLA(S)` : "todo ok");
process.exit(fallos ? 1 : 0);

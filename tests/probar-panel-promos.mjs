// Prueba del panel (Tienda · Promociones) en Edge sin ventana, con Supabase simulado (tests/simular-supabase.js).
// Uso: node tests/probar-panel-promos.mjs [base=http://127.0.0.1:8765]
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

const PUERTO = 9334, perfil = mkdtempSync(join(tmpdir(), "av-edge-"));
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
  const p = await pagina(BASE + "/" + TMP + "#tienda");
  const ev = p.ev;
  ok(await p.hasta(`${$("t-lista")}.querySelectorAll('details.c').length===2`), "la pestaña Tienda carga (vista Productos por omisión)");
  ok(await ev(`!${$("t-v-prod")}.hidden && ${$("t-v-promo")}.hidden`), "vista Productos visible, Promociones oculta");
  await ev(`document.querySelector('#t-vistas button[data-v=promo]').click()`);
  ok(await p.hasta(`document.querySelectorAll('#pr-ban .pr-fila').length===2`), "chip «Promociones»: carga 2 banners");
  const filas = (id) => ev(`[].map.call(document.querySelectorAll('#${id} .pr-fila'),function(f){return f.querySelector('.nm').textContent})`);
  ok(JSON.stringify(await filas("pr-tar")) === '["Pinturas nuevas"]' && (await filas("pr-des")).length === 2, "1 tarjeta y 2 descuentos");
  ok(await ev(`${$("fr-on")}.checked && ${$("fr-t")}.value.indexOf('Cartago')>0 && ${$("fr-min")}.value==='15000' && ${$("fr-prov")}.value==='Cartago' && ${$("fr-hasta")}.value===''`), "la franja se rellena con lo guardado");
  ok(await ev(`${$("fr-prov")}.options.length`) === 8, "provincias: Todo el país + 7");
  const ancho = () => ev(`document.documentElement.scrollWidth-document.documentElement.clientWidth`);
  ok(await ancho() <= 0, "375 px: sin scroll horizontal en Promociones (" + await ancho() + ")");
  ok(await ev(`(function(){var a=${$("pr-demo")};return a.getAttribute('href')==='./?demo'&&a.target==='_blank'&&/noopener/.test(a.rel)})()`), "«Ver con ?demo» abre ./?demo en pestaña nueva");

  // vencidas / sin destino
  ok(await ev(`(function(){var f=document.querySelectorAll('#pr-ban .pr-fila');return /Vencida/.test(f[1].textContent)&&!/Vencida/.test(f[0].textContent)})()`), "banner con fecha pasada muestra «Vencida»; el otro no");
  ok(await ev(`/Apagado/.test(document.querySelector('#pr-tar .pr-fila').textContent)`), "tarjeta apagada muestra «Apagado»");
  ok(await ev(`/Sin destino/.test(document.querySelectorAll('#pr-des .pr-fila')[1].textContent) && /(borrada)/.test(document.querySelectorAll('#pr-des .pr-fila')[1].textContent)`), "descuento a categoría borrada muestra «Sin destino»");
  const hoy = await ev(`AV.hoy()`), man = new Date(Date.now() + 864e5 * 2).toISOString().slice(0, 10);
  ok(await ev(`AV.promos.vencida('2020-01-01')===true && AV.promos.vencida('${hoy}')===false && AV.promos.vencida('${man}')===false && AV.promos.vencida(null)===false && AV.promos.vencida('')===false && AV.promos.vencida('${hoy}','2099-01-01')===true`), "función vencida(): pasada sí; hoy, futura, nula y vacía no");

  // Franja
  const llam = () => ev(`window.__llamadas.slice()`);
  await ev(`window.__llamadas.length=0; ${$("fr-t")}.value='  '; ${$("fr-ok")}.click()`);
  ok(/texto/i.test(await ev(`${$("fr-msg")}.textContent`)) && !(await llam()).some((l) => l.indexOf("POST") === 0), "franja encendida sin texto: avisa y no guarda");
  for (const mal of ["abc", "-5", "12.5", "0", "5000000000"]) {
    await ev(`${$("fr-t")}.value='Hola'; ${$("fr-min")}.value=${JSON.stringify(mal)}; ${$("fr-ok")}.click()`);
    ok(/Envío gratis desde|mayor a 0/.test(await ev(`${$("fr-msg")}.textContent`)) && !(await llam()).some((l) => l.indexOf("POST") === 0), `monto «${mal}» no se guarda y avisa`);
  }
  await ev(`${$("fr-min")}.value='20000'; ${$("fr-hasta")}.value='2099-12-31'; ${$("fr-prov")}.value=''; ${$("fr-t")}.value='  Envío gratis en todo el país  '; ${$("fr-ok")}.click()`);
  ok(await p.hasta(`window.__db.ajustes.filter(function(a){return a.clave==='franja'})[0].valor.envioMin===20000`), "franja guardada (POST a ajustes con merge-duplicates)");
  ok(JSON.stringify(await ev(`window.__db.ajustes.filter(function(a){return a.clave==='franja'})[0].valor`)) === JSON.stringify({ on: true, t: "Envío gratis en todo el país", envioMin: 20000, prov: null, hasta: "2099-12-31" }), "…valor {on,t,envioMin,prov:null,hasta} exacto");
  ok(await ev(`window.__db.ajustes.length`) === 2 && (await llam()).some((l) => l === "POST /rest/v1/ajustes"), "…y no duplica la fila (upsert); llamada POST /rest/v1/ajustes");
  await ev(`${$("fr-min")}.value=''; ${$("fr-on")}.checked=false; ${$("fr-t")}.value=''; ${$("fr-ok")}.click()`);
  ok(await p.hasta(`window.__db.ajustes[0].valor.on===false`) && await ev(`window.__db.ajustes[0].valor.envioMin===null && window.__db.ajustes[0].valor.t===''`), "franja apagada y sin monto: envioMin null, se guarda");

  // Banners
  await ev(`window.__llamadas.length=0; document.querySelector('input[aria-label="Mostrar: Envío gratis desde ₡15.000"]').click()`);
  ok(await p.hasta(`window.__db.banners[0].on===false`) && (await llam()).some((l) => l.indexOf("PATCH /rest/v1/banners?id=eq.1") === 0), "interruptor del banner: PATCH on=false");
  ok(await p.hasta(`/Apagado/.test(document.querySelector('#pr-ban .pr-fila').textContent)`), "…y aparece «Apagado»");
  await ev(`document.querySelector('button[aria-label="Bajar Envío gratis desde ₡15.000"]').click()`);
  ok(await p.hasta(`window.__db.banners[0].orden===1 && window.__db.banners[1].orden===0`), "▼ cambia el orden de los banners");
  ok(await p.hasta(`document.querySelector('#pr-ban .pr-fila .nm').textContent==='Oferta vieja'`), "…y la lista se reordena");
  await ev(`${$("pr-nban")}.click()`);
  ok(await ev(`${$("d-promo")}.open && !${$("dpr-fotobox")}.hidden && ${$("dpr-tit")}.textContent==='Nuevo banner'`), "«+ Banner» abre el diálogo con campo de foto");
  await ev(`${$("dpr-ok")}.click()`);
  ok(/título/i.test(await ev(`${$("dpr-msg")}.textContent`)) && await ev(`window.__db.banners.length`) === 2, "banner sin título: no se guarda");
  ok(await ancho() <= 0 && await ev(`(function(){var d=${$("d-promo")}.getBoundingClientRect();return d.left>=0&&d.right<=window.innerWidth})()`), "375 px: el diálogo de banner cabe sin scroll horizontal");
  await ev(`${$("dpr-titulo")}.value='<img src=x onerror=window.__xss=1>Navidad'; ${$("dpr-sup")}.value='Pronto'; ${$("dpr-desc")}.value='Regalos'; ${$("dpr-boton")}.value='Ver'; ${$("dpr-cat")}.value='2'; ${$("dpr-c1")}.value='#112233'; ${$("dpr-c2")}.value='#445566'; ${$("dpr-osc")}.checked=true; ${$("dpr-hasta")}.value='2099-01-05'`);
  await ev(`(async function(){var c=document.createElement('canvas');c.width=2400;c.height=1200;var x=c.getContext('2d');x.fillStyle='#39c';x.fillRect(0,0,2400,1200);var b=await new Promise(function(r){c.toBlob(r,'image/png')});var dt=new DataTransfer();dt.items.add(new File([b],'g.png',{type:'image/png'}));var i=${$("dpr-foto")};i.files=dt.files;i.dispatchEvent(new Event('change'))})()`);
  ok(await p.hasta(`!!${$("dpr-prev")}.querySelector('img') && !${$("dpr-quitar")}.hidden`), "foto del banner: vista previa y «Quitar foto»");
  await ev(`${$("dpr-ok")}.click()`);
  ok(await p.hasta(`window.__db.banners.length===3 && !${$("d-promo")}.open`), "banner creado");
  const nb = await ev(`window.__db.banners[2]`), sub = await ev(`window.__subidas`);
  ok(nb.titulo.indexOf("<img") === 0 && nb.sup === "Pronto" && nb.descripcion === "Regalos" && nb.boton === "Ver" && nb.categoria_id === 2 && nb.color1 === "#112233" && nb.color2 === "#445566" && nb.letra_oscura === true && nb.hasta === "2099-01-05" && nb.on === true && nb.orden === 2 && nb.enlace === "#tienda", "banner nuevo con todos los campos (orden 2, enlace #tienda)");
  ok(sub.length === 1 && sub[0].type === "image/jpeg" && Math.max(sub[0].w, sub[0].h) === 1000 && nb.foto_url === "https://simulado.supabase.co/storage/v1/object/public/productos/" + sub[0].path, `foto subida como JPEG ${sub[0]?.w}x${sub[0]?.h} y foto_url = URL pública`);
  ok(await ev(`window.__xss===undefined && [].some.call(document.querySelectorAll('#pr-ban .nm'),function(n){return n.textContent.indexOf('<img')===0&&!n.querySelector('img')})`), "HTML en el título se muestra como texto (sin ejecutarse)");
  // editar: quitar foto, archivo no imagen, fecha vacía
  await ev(`document.querySelector('#pr-ban button[aria-label^="Editar <img"]').click()`);
  ok(await ev(`${$("dpr-hasta")}.value==='2099-01-05' && ${$("dpr-cat")}.value==='2' && ${$("dpr-c1")}.value==='#112233' && ${$("dpr-osc")}.checked && !!${$("dpr-prev")}.querySelector('img')`), "editar: rellena campos y muestra la foto actual");
  await ev(`(function(){var dt=new DataTransfer();dt.items.add(new File(['x'],'x.txt',{type:'text/plain'}));var i=${$("dpr-foto")};i.files=dt.files;i.dispatchEvent(new Event('change'))})()`);
  ok(/no es una foto/.test(await ev(`${$("dpr-msg")}.textContent`)), "archivo que no es imagen: aviso");
  await ev(`${$("dpr-quitar")}.click(); ${$("dpr-hasta")}.value=''; ${$("dpr-cat")}.value=''; ${$("dpr-on")}.checked=false; ${$("dpr-ok")}.click()`);
  ok(await p.hasta(`window.__db.banners[2].foto_url===null && window.__db.banners[2].hasta===null && window.__db.banners[2].categoria_id===null && window.__db.banners[2].on===false`), "editar: quita foto, fecha y categoría; lo apaga (null)");
  ok(await ev(`window.__subidas.length`) === 1, "editar sin foto nueva no sube nada");
  // fallo de Storage
  await ev(`window.__storageFalla=true; document.querySelector('#pr-ban button[aria-label^="Editar <img"]').click()`);
  await ev(`(async function(){var c=document.createElement('canvas');c.width=60;c.height=60;var b=await new Promise(function(r){c.toBlob(r,'image/png')});var dt=new DataTransfer();dt.items.add(new File([b],'a.png',{type:'image/png'}));var i=${$("dpr-foto")};i.files=dt.files;i.dispatchEvent(new Event('change'))})()`);
  await p.hasta(`!!${$("dpr-prev")}.querySelector('img')`); await ev(`${$("dpr-titulo")}.value='CambioFallido'; ${$("dpr-ok")}.click()`);
  ok(await p.hasta(`/No se pudo subir la foto/.test(${$("dpr-msg")}.textContent)`) && await ev(`window.__db.banners[2].titulo.indexOf('<img')===0 && ${$("d-promo")}.open`), "si Storage falla: aviso y no cambia el banner");
  await ev(`window.__storageFalla=false; ${$("d-promo")}.querySelector('button[value=no]').click()`);
  // borrar con confirmación
  await ev(`document.querySelector('#pr-ban button[aria-label^="Editar <img"]').click(); ${$("dpr-borrar")}.click()`);
  ok(await p.hasta(`${$("d-confirma")}.open`), "«Borrar» pide confirmación");
  await ev(`${$("d-confirma")}.querySelector('button[value=no]').click()`); await espera(200);
  ok(await ev(`window.__db.banners.length`) === 3, "«Volver» no borra");
  await ev(`${$("dpr-borrar")}.click()`); await p.hasta(`${$("d-confirma")}.open`); await ev(`${$("d-confirma")}.querySelector('button[value=si]').click()`);
  ok(await p.hasta(`window.__db.banners.length===2 && !${$("d-promo")}.open`), "confirmando se borra el banner");

  // Tarjetas (sin foto)
  await ev(`${$("pr-ntar")}.click()`);
  ok(await ev(`!${$("dpr-fotobox")}.hidden && ${$("dpr-tit")}.textContent==='Nueva tarjeta'`), "tarjeta: también tiene campo de foto");
  await ev(`${$("dpr-titulo")}.value='Kits'; ${$("dpr-ok")}.click()`);
  ok(await p.hasta(`window.__db.tarjetas.length===2`), "tarjeta creada");
  const nt = await ev(`window.__db.tarjetas[1]`);
  ok(!("foto_url" in nt) && nt.titulo === "Kits" && nt.orden === 1 && nt.on === true && nt.hasta === null && nt.categoria_id === null && /^#[0-9a-f]{6}$/.test(nt.color1), "tarjeta nueva: sin foto_url, orden 1, activa, colores válidos");
  await ev(`document.querySelector('button[aria-label="Subir Kits"]').click()`);
  ok(await p.hasta(`window.__db.tarjetas[1].orden===0 && window.__db.tarjetas[0].orden===1`), "tarjetas también se reordenan");

  // Descuentos
  await ev(`window.__llamadas.length=0; ${$("pr-ndes")}.click()`);
  ok(await ev(`${$("dd-tit")}.textContent==='Nuevo descuento' && ${$("dd-aplica")}.value==='cat' && !${$("dd-valbox")}.hidden`), "«+ Descuento»: % por omisión, aplica a categoría");
  const ddMal = async (campo, msg) => { await ev(`${$("dd-ok")}.click()`); const t = await ev(`${$("dd-msg")}.textContent`); ok(new RegExp(msg, "i").test(t) && await ev(`window.__db.descuentos.length`) === 2, `${campo}: «${t}»`); };
  for (const mal of ["", "0", "91", "abc", "5.5", "-3"]) { await ev(`${$("dd-valor")}.value=${JSON.stringify(mal)}`); await ddMal(`porcentaje «${mal}» no se guarda`, "1 a 90"); }
  await ev(`${$("dd-valor")}.value='15'; ${$("dd-aplica")}.value='prod'; ${$("dd-aplica")}.dispatchEvent(new Event('change'))`);
  ok(await ev(`!${$("dd-prodbox")}.hidden && ${$("dd-catbox")}.hidden`), "«Productos que yo elija» muestra el buscador");
  await ddMal("sin productos elegidos no se guarda (no queda global)", "al menos un producto");
  await ev(`${$("dd-buscar")}.value='ABEJ'; ${$("dd-buscar")}.dispatchEvent(new Event('input'))`);
  ok(JSON.stringify(await ev(`[].map.call(${$("dd-res")}.querySelectorAll('button'),function(b){return b.textContent})`)) === '["Figura: Abeja"]', "el buscador (sin mayúsculas) lista «Figura: Abeja» con nombre completo");
  await ev(`${$("dd-res")}.querySelector('button').click()`);
  ok(await ev(`${$("dd-elegidos")}.textContent.indexOf('Figura: Abeja')>=0 && ${$("dd-res")}.children.length===0`), "se elige y pasa a la lista de elegidos");
  await ev(`${$("dd-buscar")}.value='pint'; ${$("dd-buscar")}.dispatchEvent(new Event('input'))`);
  ok(JSON.stringify(await ev(`[].map.call(${$("dd-res")}.querySelectorAll('button'),function(b){return b.textContent})`)) === '["Pintura: Amarillo"]', "buscar «pint» → «Pintura: Amarillo»");
  await ev(`${$("dd-res")}.querySelector('button').click(); ${$("dd-buscar")}.value='zzz'; ${$("dd-buscar")}.dispatchEvent(new Event('input'))`);
  ok(/Ningún producto/.test(await ev(`${$("dd-res")}.textContent`)), "sin coincidencias: «Ningún producto coincide.»");
  await ev(`${$("dd-etiqueta")}.value='Ofertón'; ${$("dd-hasta")}.value='2099-02-02'; ${$("dd-ok")}.click()`);
  ok(await p.hasta(`window.__db.descuentos.length===3 && !${$("d-desc")}.open`), "descuento creado");
  const nd = await ev(`window.__db.descuentos[2]`);
  ok(JSON.stringify(nd) === JSON.stringify({ on: true, tipo: "%", valor: 15, categoria_id: null, grupo_id: null, producto_ids: [1, 3], etiqueta: "Ofertón", hasta: "2099-02-02", orden: 2, id: nd.id }), "cuerpo: % 15, productos [1,3], sin categoría ni grupo, etiqueta, fecha, orden 2");
  // editar → 2x1 en un grupo
  await ev(`document.querySelector('button[aria-label="Editar Ofertón"]').click()`);
  ok(await ev(`${$("dd-aplica")}.value==='prod' && ${$("dd-valor")}.value==='15' && ${$("dd-elegidos")}.children.length===2`), "editar: rellena tipo, valor y productos");
  await ev(`${$("dd-tipo")}.value='2x1'; ${$("dd-tipo")}.dispatchEvent(new Event('change')); ${$("dd-aplica")}.value='grupo'; ${$("dd-aplica")}.dispatchEvent(new Event('change'))`);
  ok(await ev(`${$("dd-valbox")}.hidden && !${$("dd-grupobox")}.hidden`), "2x1 oculta el porcentaje; «grupo» muestra la lista de grupos");
  ok(await ancho() <= 0 && await ev(`(function(){var d=${$("d-desc")}.getBoundingClientRect();return d.left>=0&&d.right<=window.innerWidth})()`), "375 px: el diálogo de descuento cabe");
  await ev(`${$("dd-grupo")}.value='2'; ${$("dd-ok")}.click()`);
  ok(await p.hasta(`window.__db.descuentos[2].tipo==='2x1'`), "descuento editado");
  const ed = await ev(`window.__db.descuentos[2]`);
  ok(ed.valor === null && ed.grupo_id === 2 && ed.categoria_id === null && ed.producto_ids.length === 0, "…2x1: valor null, grupo 2, sin categoría ni productos (un solo objetivo)");
  // apagar descuento / borrar
  await ev(`document.querySelector('input[aria-label="Mostrar: Ofertón"]').click()`);
  ok(await p.hasta(`window.__db.descuentos[2].on===false`), "interruptor del descuento: PATCH on=false");
  await ev(`document.querySelector('button[aria-label="Editar Ofertón"]').click(); ${$("dd-borrar")}.click()`);
  await p.hasta(`${$("d-confirma")}.open`); await ev(`${$("d-confirma")}.querySelector('button[value=si]').click()`);
  ok(await p.hasta(`window.__db.descuentos.length===2 && !${$("d-desc")}.open`), "descuento borrado tras confirmar");
  // descuento a categoría válida
  await ev(`${$("pr-ndes")}.click(); ${$("dd-valor")}.value='90'; ${$("dd-cat")}.value='2'; ${$("dd-ok")}.click()`);
  ok(await p.hasta(`window.__db.descuentos.length===3`) && await ev(`window.__db.descuentos[2].categoria_id===2 && window.__db.descuentos[2].valor===90 && window.__db.descuentos[2].etiqueta===null`), "% 90 a una categoría (límite superior válido)");

  // Descuento con destino borrado: abre sin categoría y no se puede guardar hasta elegir una
  await ev(`document.querySelector('button[aria-label="Editar 20% de descuento"]').click()`);
  ok(await ev(`${$("dd-aplica")}.value==='cat' && ${$("dd-cat")}.value==='' && ${$("dd-cat")}.options[0].textContent==='Elige…'`), "descuento a categoría borrada: abre en «Categoría» con «Elige…» (sin categoría preseleccionada)");
  await ev(`${$("dd-ok")}.click()`);
  ok(/categoría/i.test(await ev(`${$("dd-msg")}.textContent`)) && await ev(`window.__db.descuentos[1].categoria_id`) === 99 && await ev(`${$("d-desc")}.open`), "…guardar sin elegir queda bloqueado con mensaje y no cambia el destino (sigue 99)");
  await ev(`${$("dd-cat")}.value='1'; ${$("dd-ok")}.click()`);
  ok(await p.hasta(`window.__db.descuentos[1].categoria_id===1 && !${$("d-desc")}.open`), "…eligiendo una categoría real sí guarda");
  await ev(`${$("pr-ndes")}.click()`);
  ok(await ev(`${$("dd-cat")}.value==='' && ${$("dd-grupo")}.value===''`), "descuento nuevo: categoría y grupo empiezan sin elegir");
  await ev(`${$("dd-valor")}.value='10'; ${$("dd-ok")}.click()`);
  ok(/categoría/i.test(await ev(`${$("dd-msg")}.textContent`)), "descuento nuevo sin elegir categoría: bloqueado");
  await ev(`${$("dd-aplica")}.value='grupo'; ${$("dd-aplica")}.dispatchEvent(new Event('change')); ${$("dd-ok")}.click()`);
  ok(/grupo/i.test(await ev(`${$("dd-msg")}.textContent`)) && await ev(`window.__db.descuentos.length`) === 3, "sin elegir grupo: bloqueado");
  await ev(`${$("d-desc")}.querySelector('button[value=no]').click()`);
  await ev(`window.__db.descuentos.push({id:50,on:true,tipo:'%',valor:5,categoria_id:1,grupo_id:null,producto_ids:[1],etiqueta:'Mixto',hasta:null,orden:9}); AV.promos.cargar()`);
  await p.hasta(`!!document.querySelector('button[aria-label="Editar Mixto"]')`);
  await ev(`document.querySelector('button[aria-label="Editar Mixto"]').click()`);
  ok(await ev(`${$("dd-aplica")}.value==='cat' && ${$("dd-cat")}.value==='1'`), "fila con categoría y productos a la vez: abre en «Categoría» (misma prioridad que la lista)");
  await ev(`${$("d-desc")}.querySelector('button[value=no]').click()`);

  // Lo más vendido
  ok(await ev(`document.querySelector('#mv-modo [aria-pressed=true]').dataset.m`) === "auto" && /Figura: Abeja/.test(await ev(`${$("mv-elegidos")}.textContent`)), "modo Automático con lista [Abeja, Sol] del simulador");
  await ev(`document.querySelector('#mv-modo [data-m=manual]').click()`);
  ok(/Se muestran los productos/.test(await ev(`${$("mv-ayuda")}.textContent`)), "modo Manual cambia la ayuda");
  for (let i = 0; i < 2; i++) await ev(`${$("mv-elegidos")}.querySelector('button').click()`);
  await ev(`${$("mv-ok")}.click()`);
  ok(/al menos un producto/.test(await ev(`${$("mv-msg")}.textContent`)), "manual con lista vacía: no guarda");
  // 9 productos más para probar el máximo de 8
  await ev(`for(var i=0;i<9;i++)window.__db.productos.push({id:200+i,grupo_id:1,nombre:'Extra'+i,precio:100,color:null,foto_url:null,agotado:false,nuevo:false,orden:10+i}); AV.tienda.cargar()`);
  await p.hasta(`window.AV.tienda.datos().prods.length===12`);
  for (let i = 0; i < 9; i++) {
    await ev(`${$("mv-buscar")}.value='extra${i}'; ${$("mv-buscar")}.dispatchEvent(new Event('input')); var b=${$("mv-res")}.querySelector('button'); if(b)b.click()`);
  }
  ok(await ev(`${$("mv-elegidos")}.querySelectorAll('.eleg').length`) === 8, "la lista manual admite máximo 8");
  ok(await ev(`${$("mv-buscar")}.value='extra8'`) !== null && (await ev(`${$("mv-buscar")}.dispatchEvent(new Event('input')); ${$("mv-res")}.querySelectorAll('button').length`)) === 1 && await ev(`${$("mv-res")}.querySelector('button').click(); ${$("mv-elegidos")}.querySelectorAll('.eleg').length`) === 8, "el 9.º no entra");
  await ev(`${$("mv-ok")}.click()`);
  ok(await p.hasta(`window.__db.ajustes.filter(function(a){return a.clave==='mas_vendidos'})[0].valor.modo==='manual'`), "«Lo más vendido» guardado en modo manual");
  const mvv = await ev(`window.__db.ajustes.filter(function(a){return a.clave==='mas_vendidos'})[0].valor`);
  ok(mvv.lista.length === 8 && mvv.lista.every((x) => x >= 200 && x <= 207) && new Set(mvv.lista).size === 8, "…con 8 ids distintos de producto: " + mvv.lista.join(","));
  await ev(`document.querySelector('#mv-modo [data-m=auto]').click(); ${$("mv-ok")}.click()`);
  ok(await p.hasta(`window.__db.ajustes.filter(function(a){return a.clave==='mas_vendidos'})[0].valor.modo==='auto'`) && await ev(`window.__db.ajustes.filter(function(a){return a.clave==='mas_vendidos'})[0].valor.lista.length`) === 8, "modo Automático guarda y conserva la lista (para completar)");

  // ancho final con todo visible
  ok(await ancho() <= 0, "375 px: sin scroll horizontal tras todos los cambios (" + await ancho() + ")");
  // volver a Productos funciona y la etapa 1 sigue
  await ev(`document.querySelector('#t-vistas button[data-v=prod]').click()`);
  ok(await ev(`!${$("t-v-prod")}.hidden && ${$("t-v-promo")}.hidden && document.querySelectorAll('#t-lista details.c').length===2`), "volver a «Productos» muestra la lista");
  ok(await ev(`(document.querySelector('nav.tabs button[data-s=pedidos]').click(), !document.getElementById('s-pedidos').hidden)`), "etapa 1: Pedidos sigue funcionando");
  ok(p.errores.length === 0, "sin errores de JavaScript (" + p.errores.join(" | ") + ")");
  await p.cerrar();

  // Fallo de red al guardar: avisa y no deja basura
  // Fotos de «Lo que trae tu paquete»: subir, cambiar, quitar, errores, y que la tienda las use
  const k = await pagina(BASE + "/" + TMP + "#tienda");
  await k.hasta(`${$("t-lista")}.querySelectorAll('details.c').length===2`);
  await k.ev(`document.querySelector('#t-vistas button[data-v=promo]').click()`);
  ok(await k.hasta(`document.querySelectorAll('#kit-fotos .fotofila').length===3`), "kit: tres filas en el panel");
  const kit = () => k.ev(`(window.__db.ajustes.filter(function(a){return a.clave==='kit_fotos'})[0]||{}).valor||null`);
  const elige = (id, png) => k.ev(`(async function(){var c=document.createElement('canvas');c.width=1500;c.height=900;var b=${png ? "await new Promise(function(r){c.toBlob(r,'image/png')})" : "new Blob(['x'],{type:'text/plain'})"};var dt=new DataTransfer();dt.items.add(new File([b],'a.${png ? "png" : "txt"}',{type:b.type}));var i=document.getElementById('${id}');i.files=dt.files;i.dispatchEvent(new Event('change'))})()`);
  await elige("kit-yeso", false);
  ok(await k.hasta(`/no es una foto/.test(${$("kit-msg")}.textContent)`) && await kit() === null, "kit: un archivo que no es imagen avisa y no guarda");
  await k.hasta(`!${$("kit-fotos")}.querySelector('button').disabled`);
  await elige("kit-yeso", true);
  ok(await k.hasta(`document.querySelector('#kit-fotos img')&&/^https:.*productos/.test(document.querySelector('#kit-fotos img').src)`), "kit: la foto subida se ve en el panel");
  const k1 = await kit();
  ok(k1 && /public\/productos\//.test(k1.yeso) && Object.keys(k1).length === 1, "kit: guardada en el ajuste kit_fotos");
  ok(await k.ev(`window.__subidas[window.__subidas.length-1].w`) === 1000, "kit: la foto se achica a 1000 px");
  await elige("kit-pinturas", true);
  ok(await k.hasta(`document.querySelectorAll('#kit-fotos img').length===2`), "kit: una segunda foto no borra la primera");
  await k.ev(`document.querySelector('button[aria-label="Quitar foto de Pieza de yeso"]').click()`);
  ok(await k.hasta(`document.querySelectorAll('#kit-fotos img').length===1`) && !("yeso" in await kit()) && !!(await kit()).pinturas, "kit: quitar borra solo esa foto");
  await k.ev(`window.__dbFalla=true`);
  await k.ev(`document.querySelector('button[aria-label="Quitar foto de Pinturas"]').click()`);
  ok(await k.hasta(`/No se pudo guardar/.test(${$("kit-msg")}.textContent)`) && !!(await kit()).pinturas && await k.ev(`document.querySelectorAll('#kit-fotos img').length===1`), "kit: si falla al guardar avisa y la foto sigue");
  ok(k.errores.length === 0, "kit: sin errores de JS en el panel " + k.errores.join(" | "));
  await k.cerrar();
  const TK = "_tienda_prueba.html";
  writeFileSync(TK, readFileSync("index.html", "utf8").replace('<script src="supabase-config.js"></script>', '<script src="tests/simular-supabase.js"></script>'));
  try {
    const PNG = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    const ANT = `window.__kitFotos={yeso:"https://simulado.supabase.co/storage/v1/object/public/productos/a.jpg",pinceles:"https://otro.sitio/mala.jpg"};window.__catalogoPublico={};(function(){var d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');window.Image=function(){var i=document.createElement('img');Object.defineProperty(i,'src',{set:function(){d.set.call(i,"${PNG}")}});return i}})();`;
    const t = await pagina(BASE + "/" + TK, ANT);
    ok(await t.hasta(`document.querySelector('[data-kit=yeso] img')`, 20000), "kit: la tienda muestra la foto guardada");
    ok(await t.ev(`document.querySelector('[data-kit=yeso]').classList.contains('foto') && document.querySelector('[data-kit=yeso] img').alt==='Pieza de yeso'`), "kit: la foto lleva su texto alternativo");
    ok(await t.ev(`!!document.querySelector('[data-kit=pinceles] svg') && !!document.querySelector('[data-kit=pinturas] svg')`), "kit: dirección ajena o foto sin subir conservan el dibujo");
    await t.cerrar();
  } finally { try { unlinkSync(TK); } catch {} }

  const q = await pagina(BASE + "/" + TMP + "#tienda");
  await q.hasta(`document.querySelectorAll('#t-lista details.c').length===2`);
  await q.ev(`document.querySelector('#t-vistas button[data-v=promo]').click()`);
  await q.hasta(`document.querySelectorAll('#pr-ban .pr-fila').length===2`);
  await q.ev(`window.__dbFalla=true; document.getElementById('fr-min').value='9000'; document.getElementById('fr-ok').click()`);
  ok(await q.hasta(`/No se pudo guardar/.test(document.getElementById('fr-msg').textContent)`) && await q.ev(`window.__db.ajustes[0].valor.envioMin===15000`), "si falla la red al guardar la franja: aviso y nada cambia");
  await q.ev(`document.querySelector('input[aria-label="Mostrar: Envío gratis desde ₡15.000"]').click()`);
  ok(await q.hasta(`/No se pudo guardar/.test(document.getElementById('toast').textContent)`) && await q.ev(`document.querySelector('input[aria-label="Mostrar: Envío gratis desde ₡15.000"]').checked`) === true, "si falla el interruptor: vuelve atrás y avisa");
  await q.cerrar();
} finally {
  nav.kill(); await espera(500); try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  try { unlinkSync(TMP); } catch {}
}
console.log(fallos ? `${fallos} FALLA(S)` : "todo ok");
process.exit(fallos ? 1 : 0);

// Prueba del panel (Contabilidad) en Edge sin ventana, con Supabase simulado.
// Uso: node tests/probar-panel-conta.mjs [base=http://127.0.0.1:8765]
// Requiere un servidor local sirviendo la carpeta del proyecto (python -m http.server 8765 --bind 127.0.0.1).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:8765";
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!EDGE) { console.log("No encontré Edge"); process.exit(1); }
const TMP = "_panel_conta.html";
writeFileSync(TMP, readFileSync("admin.html", "utf8").replace('<script src="supabase-config.js"></script>', '<script src="tests/simular-supabase.js"></script>'));

const PUERTO = 9339, perfil = mkdtempSync(join(tmpdir(), "av-edge-"));
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
const CATALOGO = "window.__catalogoPublico={categorias:[{n:'Figuras',g:[{k:'Figura: ',sz:false,l:[{d:'Sol',p:500,v:[]}]}]}]};";
const clic = (cont, txt) => `[].filter.call(${$(cont)}.querySelectorAll('button'),function(b){return b.textContent===${JSON.stringify(txt)}})[0].click()`;
const vista = (v) => `document.querySelector('#k-vistas [data-v=${v}]').click()`;
const hoyCR = `new Intl.DateTimeFormat("en-CA",{timeZone:"America/Costa_Rica"}).format(new Date())`;
try {
  const p = await pagina(BASE + "/" + TMP + "#conta", CATALOGO);
  const ev = p.ev;
  ok(await p.hasta(`!${$("s-conta")}.hidden && ${$("k-kpis")}.querySelectorAll('.k').length===4`), "Contabilidad abre con el resumen");
  const tabs = await ev(`[].map.call(document.querySelectorAll('nav.tabs button'),function(b){return b.textContent})`);
  ok(JSON.stringify(tabs) === JSON.stringify(["Inicio", "Pedidos", "Contabilidad", "Tienda"]), "pestañas: " + JSON.stringify(tabs));
  await ev(`location.hash='#gastos'`); ok(await p.hasta(`!${$("s-conta")}.hidden && !${$("k-gastos")}.hidden`), "#gastos abre Contabilidad en Gastos");
  await ev(`location.hash='#cuentas'`); ok(await p.hasta(`!${$("k-reportes")}.hidden && ${$("c-tabla")}.textContent.length>0`), "#cuentas abre Reportes con la tabla por mes");
  await ev(vista("resumen"));
  ok(await ev(`/Ganancia real/.test(${$("k-kpis")}.textContent) && !/NaN|undefined/.test(${$("k-resumen")}.textContent)`), "resumen sin NaN");
  // Ventas
  await ev(vista("ventas"));
  ok(await ev(`/A mano/.test(${$("k-vlista")}.textContent) && /Tienda/.test(${$("k-vlista")}.textContent)`), "ventas de la tienda y a mano");
  ok(await ev(`!!document.querySelector('[aria-label="Editar venta de Feria"]') && !document.querySelector('[aria-label="Editar venta de Luis R."]')`), "solo las ventas a mano se editan");
  await ev(`document.querySelector('[aria-label="Editar venta de Feria"]').click()`);
  ok(await p.hasta(`${$("d-venta")}.open && ${$("dv-tit")}.textContent==='Editar venta'`), "abre la edición");
  await ev(`${$("dv-monto")}.value=7777; ${$("dv-pago")}.value='SINPE'; document.querySelector('#f-venta [value=si]').click()`);
  ok(await p.hasta(`!${$("d-venta")}.open && window.__db.pedidos.filter(function(x){return x.id===3})[0].total===7777`), "guarda el monto editado");
  ok(await ev(`(function(){var x=window.__db.pedidos.filter(function(x){return x.id===3})[0];return x.pago==='SINPE'&&!x.registrado_por})()`), "editar guarda la forma de pago y no cambia quién la anotó");
  await ev(`${$("k-venta")}.click()`); await p.hasta(`${$("d-venta")}.open`);
  ok(await ev(`${$("dv-tit")}.textContent==='Agregar venta' && ${$("dv-monto")}.value===''`), "agregar venta abre vacío");
  await ev(`${$("dv-monto")}.value=1500;${$("dv-nombre")}.value='Nueva';${$("dv-tel")}.value='8888-0000';${$("dv-pago")}.value='Efectivo';document.querySelector('#f-venta [value=si]').click()`);
  ok(await p.hasta(`window.__db.pedidos.some(function(x){return x.nombre==='Nueva'&&x.pago==='Efectivo'&&!!x.registrado_por&&x.telefono==='88880000'})`), "una venta nueva guarda forma de pago, teléfono y quién la anotó");
  await p.hasta(`!${$("d-venta")}.open && !!document.querySelector('[aria-label="Borrar venta de Feria"]')`);
  await ev(`document.querySelector('[aria-label="Borrar venta de Feria"]').click()`); await p.hasta(`${$("d-confirma")}.open`);
  await ev(`document.querySelector('#d-confirma [value=si]').click()`);
  ok(await p.hasta(`!window.__db.pedidos.some(function(x){return x.id===3})`), "borra la venta a mano");
  // Gastos
  await ev(vista("gastos")); await ev(`${$("b-gasto")}.click()`); await p.hasta(`${$("d-gasto")}.open`);
  await ev(`(function(){var t=${$("dg-tipo")};t.value='fijo';t.dispatchEvent(new Event('change'));})()`);
  ok(await ev(`[].map.call(${$("dg-cat")}.options,function(o){return o.value}).join()==='Servicios'`), "las categorías siguen al tipo");
  await ev(`${$("dg-monto")}.value=2260;${$("dg-desc")}.value='Agua';${$("dg-factura")}.value='F-9';${$("dg-iva")}.value=260;document.querySelector('#f-gasto [value=si]').click()`);
  ok(await p.hasta(`window.__db.gastos.some(function(g){return g.descripcion==='Agua'&&g.tipo==='fijo'&&g.factura==='F-9'&&g.iva===260&&!!g.registrado_por})`), "guarda tipo, factura, IVA y quién lo anotó");
  await p.hasta(`/Agua/.test(${$("g-lista")}.textContent)`);
  await ev(`(function(){var t=${$("g-tipo")};t.value='variable';t.dispatchEvent(new Event('change'));})()`);
  ok(await ev(`!/Agua/.test(${$("g-lista")}.textContent)`), "el filtro por tipo funciona");
  await ev(`(function(){var t=${$("g-tipo")};t.value='';t.dispatchEvent(new Event('change'));})()`);
  // Por pagar
  await ev(vista("pagar"));
  ok(await ev(`/Luz/.test(${$("k-plista")}.textContent) && /Internet/.test(${$("k-plista")}.textContent)`), "los fijos aparecen por pagar");
  await ev(`document.querySelector('#k-plista [aria-label^="Pagar Luz"]').click()`); await p.hasta(`${$("d-pagado")}.open`);
  await ev(`${$("dpa-monto")}.value=1234;document.querySelector('#f-pagado [value=si]').click()`);
  ok(await p.hasta(`!/Luz/.test(${$("k-plista")}.textContent)`), "al pagar sale de la lista");
  ok(await ev(`window.__db.gastos.filter(function(g){return g.compromiso_id===1}).length===1 && window.__db.gastos.filter(function(g){return g.compromiso_id===1})[0].monto===1234`), "guarda el monto real");
  const dup = await ev(`(function(){var g=window.__db.gastos.filter(function(g){return g.compromiso_id===1})[0];return window.fetch("https://simulado.supabase.co/rest/v1/gastos",{method:"POST",headers:{},body:JSON.stringify({compromiso_id:1,periodo:g.periodo,monto:1})}).then(function(r){return r.status})})()`);
  ok(dup === 409, "el mismo pago dos veces es rechazado");
  await ev(`document.querySelector('#k-plista [aria-label^="Pagar Internet"]').click()`); await p.hasta(`${$("d-pagado")}.open`);
  await ev(`${$("dpa-omitir")}.click()`);
  ok(await p.hasta(`${$("d-confirma")}.open`), "omitir pide confirmación");
  await ev(`document.querySelector('#d-confirma [value=si]').click()`);
  ok(await p.hasta(`/nada por pagar/.test(${$("k-plista")}.textContent)`), "omitir lo quita");
  ok(await ev(`window.__db.omisiones.length===1 && !window.__db.gastos.some(function(g){return g.compromiso_id===2})`), "omitir no crea gasto");
  ok(await p.hasta(`/Internet/.test(${$("k-omit")}.textContent)`), "lo omitido se puede ver");
  await ev(clic("k-omit", "Restaurar"));
  ok(await p.hasta(`window.__db.omisiones.length===0 && /Internet/.test(${$("k-plista")}.textContent)`), "lo omitido se puede restaurar");
  // Con pagos no se cambia frecuencia ni inicio; reactivar empieza de nuevo
  await ev(`document.querySelector('[aria-label="Editar Luz"]').click()`); await p.hasta(`${$("d-comp")}.open`);
  ok(await ev(`${$("dc2-frec")}.disabled && ${$("dc2-desde")}.disabled && ${$("dc2-tipo")}.disabled`), "con pagos no se cambia frecuencia, tipo ni inicio");
  await ev(`document.querySelector('#f-comp [value=no]').click()`);
  await ev(`document.querySelector('[aria-label="Editar Internet"]').click()`); await p.hasta(`${$("d-comp")}.open`);
  ok(await ev(`!${$("dc2-frec")}.disabled`), "sin pagos sí se puede cambiar");
  await ev(`${$("dc2-off")}.click()`);
  ok(await p.hasta(`(function(){var c=window.__db.compromisos.filter(function(c){return c.id===2})[0];return c.activo===false&&!!c.hasta})()`), "desactivar guarda su fin");
  await p.hasta(`!${$("d-comp")}.open && /Inactivo/.test(${$("k-comps")}.textContent)`);
  await ev(`document.querySelector('[aria-label="Editar Internet"]').click()`); await p.hasta(`${$("d-comp")}.open`);
  await ev(`${$("dc2-off")}.click()`);
  ok(await p.hasta(`window.__db.compromisos.filter(function(c){return c.nombre==='Internet'}).length===2`), "reactivar crea un pago nuevo");
  ok(await ev(`window.__db.compromisos.filter(function(c){return c.id===2})[0].activo===false`), "reactivar no reabre el período inactivo");
  await p.hasta(`!${$("d-comp")}.open`);
  // Planilla
  await ev(vista("planilla")); await ev(`${$("k-gente-add")}.click()`); await p.hasta(`${$("d-comp")}.open`);
  ok(await ev(`${$("dc2-tipo")}.value==='salario' && ${$("dc2-frec")}.value==='quincenal' && !${$("dc2-planbox")}.hidden`), "persona nueva: salario quincenal");
  await ev(`${$("dc2-nombre")}.value='Ana';${$("dc2-monto")}.value=100000;${$("dc2-plan")}.checked=true;document.querySelector('#f-comp [value=si]').click()`);
  ok(await p.hasta(`/Ana/.test(${$("k-gente")}.textContent)`), "agrega a la persona");
  ok(await ev(`/Estimación/.test(${$("k-cargas")}.textContent) && !/CCSS/.test(${$("k-plista")}.textContent)`), "sin fecha de patrono: estimación, sin línea de CCSS");
  const gAntes = await ev(`${$("k-kpis")}.querySelector('.k b').textContent`);
  await ev(`(function(){var d=${$("kp-patrono")};d.value=${hoyCR};d.onchange();})()`);
  ok(await p.hasta(`/Cuenta en la ganancia/.test(${$("k-cargas")}.textContent) && /CCSS/.test(${$("k-plista")}.textContent)`), "con fecha: cuenta y genera CCSS por pagar");
  await ev(vista("pagar"));
  await ev(`document.querySelector('#k-plista [aria-label^="Pagar CCSS"]').click()`); await p.hasta(`${$("d-pagado")}.open`);
  ok(await ev(`/del trabajador/.test(${$("dpa-nota")}.textContent) && ${$("dpa-omitir")}.hidden`), "CCSS explica la parte del trabajador");
  await ev(`document.querySelector('#f-pagado [value=si]').click()`);
  ok(await p.hasta(`window.__db.gastos.some(function(g){return g.linea==='ccss'&&g.monto===AVCalc.cargasDelMes(AV.conta.compromisos(),g.periodo,AV.conta.tasas(),AV.conta.tasas().patrono_desde).ccssPatronal})`), "el gasto de CCSS guarda solo la parte patronal");
  await ev(`document.querySelector('#k-plista [aria-label^="Pagar Ana"]').click()`); await p.hasta(`${$("d-pagado")}.open`);
  ok(await ev(`/Entrégale ₡89/.test(${$("dpa-nota")}.textContent)`), "el salario muestra cuánto entregar: " + await ev(`${$("dpa-nota")}.textContent`));
  ok(await ev(`/bruto/i.test(${$("dpa-monto-l")}.textContent)`), "el campo del salario dice que es bruto");
  await ev(`document.querySelector('#f-pagado [value=no]').click()`);
  // Editar no cambia quién lo anotó
  await ev(`window.__db.gastos.forEach(function(g){g.registrado_por='otra@x.com'})`);
  await ev(vista("gastos")); await ev(`AV.repintar()`); await ev(clic("g-lista", "Editar")); await p.hasta(`${$("d-gasto")}.open`);
  await ev(`document.querySelector('#f-gasto [value=si]').click()`); await p.hasta(`!${$("d-gasto")}.open`);
  ok(await ev(`window.__db.gastos.every(function(g){return g.registrado_por==='otra@x.com'})`), "editar un gasto conserva quién lo anotó");
  // Ajustes
  await ev(vista("ajustes")); await ev(`document.querySelector('[aria-label="Editar categoría Yeso"]').click()`); await p.hasta(`${$("d-cat")}.open`);
  await ev(`${$("dcg-nombre")}.value='Yeso fino';document.querySelector('#f-cat [value=si]').click()`);
  ok(await p.hasta(`window.__llamadas.some(function(x){return /rpc\\/renombrar_categoria/.test(x)})`), "renombrar va en una sola operación");
  ok(await p.hasta(`window.__db.categorias_gasto[0].nombre==='Yeso fino' && window.__db.gastos.some(function(g){return g.categoria==='Yeso fino'}) && !window.__db.gastos.some(function(g){return g.categoria==='Yeso'})`), "renombrar categoría actualiza sus gastos");
  await ev(`document.querySelector('[aria-label="Editar categoría Yeso fino"]').click()`); await p.hasta(`${$("d-cat")}.open`);
  await ev(`document.querySelector('#f-cat [value=borrar]').click()`);
  ok(await p.hasta(`/no se puede borrar/.test(${$("dcg-msg")}.textContent)`), "una categoría con gastos no se borra");
  await ev(`document.querySelector('#f-cat [value=no]').click()`);
  await ev(`${$("kt-ins")}.value=2;${$("kt-guardar")}.click()`);
  ok(await p.hasta(`window.__db.panel_ajustes.filter(function(a){return a.clave==='tasas'})[0].valor.ins===2`), "guarda porcentajes");
  ok(await ev(`!!window.__db.panel_ajustes.filter(function(a){return a.clave==='tasas'})[0].valor.patrono_desde`), "guardar porcentajes no borra la fecha de patrono");
  // Resumen y Excel
  await ev(vista("resumen"));
  ok(await ev(`(function(){var D=AV.datos(),m=${$("k-mes")}.value,G=AVCalc.gananciaReal(D.pedidos,D.gastos,m,AV.dash.costos(),AV.conta.categoriasOk(),AV.conta.provision(m));return ${$("k-kpis")}.querySelector('.k b').textContent===AVCalc.money(G.ganancia)})()`), "el Resumen coincide con la ganancia real");
  ok(await ev(`!${$("k-compras")}.hidden && /la ganancia real sale más alta/.test(${$("k-compras")}.textContent)`), "avisa si se compra mucho más de lo cargado al costo");
  await ev(`window.XLSX={utils:{book_new:function(){return {h:[]}},aoa_to_sheet:function(a){return a},book_append_sheet:function(w,s,n){w.h.push(n);if(n==="Resumen por mes")window.__resumen=s}},writeFile:function(w){window.__hojas=w.h}};`);
  await ev(vista("reportes")); await ev(`${$("b-excel")}.click()`);
  ok(await p.hasta(`(window.__hojas||[]).join()==="Resumen por mes,Ventas,Gastos,Planilla,IVA"`), "Excel con sus cinco hojas: " + await ev(`String(window.__hojas)`));
  ok(await ev(`window.__resumen[0].indexOf("Ventas menos gastos")>-1 && window.__resumen[0].indexOf("Ganancia real")>-1`), "Excel distingue las dos ganancias");
  ok(await ev(`/Ventas menos gastos/.test(${$("c-tabla")}.textContent) && /Ganancia real/.test(${$("c-tabla")}.textContent)`), "Reportes distingue las dos ganancias");
  // Reseñas desde Visitas
  await ev(`AV.mostrar("tienda");AV.visitas.abrir();AV.resenas.abrir()`);
  ok(await ev(`${$("t-v-vis")}.hidden && !${$("t-v-res")}.hidden`), "abrir Reseñas oculta Visitas: " + await ev(`JSON.stringify([${$("t-v-vis")}.hidden,${$("t-v-res")}.hidden,${$("t-v-prod")}.hidden])`));
  await ev(`AV.mostrar("conta")`);
  // Año
  await ev(vista("resumen")); await ev(`document.querySelector('#k-rango [data-r=anio]').click()`);
  ok(await ev(`!${$("k-anio")}.hidden && ${$("k-mes")}.hidden && !/NaN|undefined/.test(${$("k-resumen")}.textContent)`), "vista por año");
  await ev(vista("pagar")); await p.hasta(`!${$("k-pagar")}.hidden`);
  ok(await ev(`document.documentElement.scrollWidth-document.documentElement.clientWidth`) <= 0, "375 px sin scroll horizontal");
  ok(p.errores.length === 0, "sin errores de JavaScript: " + p.errores.join(" | "));
  await p.cerrar();
  // Si fallan las categorías, no se resta todo
  const f = await pagina(BASE + "/" + TMP + "#conta", CATALOGO + "window.__fallaCategorias=true;");
  await f.hasta(`!${$("k-aviso")}.hidden`);
  ok(await f.ev(`AV.conta.categoriasOk()===null`), "sin categorías cargadas no se usa una lista vacía");
  await f.cerrar();
  // Panel subido antes del SQL
  const q = await pagina(BASE + "/" + TMP + "#conta", CATALOGO + "window.__sinEtapa7=true;");
  ok(await q.hasta(`!${$("k-aviso")}.hidden && /etapa7/.test(${$("k-aviso")}.textContent)`), "sin el SQL: aviso visible");
  await q.ev(vista("gastos"));
  ok(await q.hasta(`/Yeso 10 kg/.test(${$("g-lista")}.textContent)`), "sin el SQL: los gastos siguen listados");
  await q.ev(`${$("b-gasto")}.click()`); await q.hasta(`${$("d-gasto")}.open`);
  await q.ev(`${$("dg-monto")}.value=10;${$("dg-desc")}.value='Sin SQL';document.querySelector('#f-gasto [value=si]').click()`);
  ok(await q.hasta(`window.__db.gastos.some(function(g){return g.descripcion==='Sin SQL'&&g.tipo===undefined})`), "sin el SQL: se puede anotar un gasto sin columnas nuevas");
  ok(q.errores.length === 0, "sin el SQL: sin errores de JavaScript: " + q.errores.join(" | "));
  await q.cerrar();
} finally {
  nav.kill(); await espera(500); try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  try { unlinkSync(TMP); } catch {}
}
console.log(fallos ? `${fallos} FALLA(S)` : "todo ok");
process.exit(fallos ? 1 : 0);


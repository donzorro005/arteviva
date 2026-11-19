// Prueba del panel (sección Tienda) en Edge sin ventana, con Supabase simulado (tests/simular-supabase.js).
// Uso: node tests/probar-panel-tienda.mjs [base=http://127.0.0.1:8765]
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
  ok(await p.hasta(`${$("t-lista")}.querySelectorAll('details.c').length===2`), "la pestaña Tienda carga 2 categorías del simulado");
  ok(await ev(`document.querySelectorAll('nav.tabs button').length===4 && !!document.querySelector('nav.tabs button[data-s=tienda][aria-current=page]')`), "4 pestañas y «Tienda» marcada");
  const ancho = () => ev(`document.documentElement.scrollWidth-document.documentElement.clientWidth`);
  const abrirTodo = () => ev(`[].forEach.call(document.querySelectorAll('#t-lista details'),function(d){d.open=true;d.dispatchEvent(new Event('toggle'))})`);
  await abrirTodo();
  ok(await ev(`document.querySelectorAll('.prod').length`) === 3, "se ven los 3 productos del simulado");
  ok(await ev(`document.querySelectorAll('.prod .miniatura i').length`) === 1 && await ev(`document.querySelector('.prod .miniatura').textContent`) === "Sin foto", "color como círculo y «Sin foto» como marcador (la foto de Sol no carga sin internet y cae al marcador)");
  ok(await ancho() <= 0, "375 px: sin scroll horizontal en la lista (" + await ancho() + ")");
  ok(await ev(`document.querySelector('nav.tabs').scrollWidth<=document.querySelector('nav.tabs').clientWidth`), "375 px: la barra inferior de 4 pestañas cabe");
  // stage-1: otras pestañas siguen
  ok(await ev(`(document.querySelector('nav.tabs button[data-s=pedidos]').click(), !document.getElementById('s-pedidos').hidden && document.getElementById('s-tienda').hidden)`), "etapa 1: Pedidos sigue funcionando");
  await ev(`document.querySelector('nav.tabs button[data-s=tienda]').click()`);

  // agotado / nuevo
  await ev(`window.__llamadas.length=0`);
  await ev(`document.querySelector('input[aria-label="Agotado: Abeja"]').click()`);
  ok(await p.hasta(`window.__db.productos[0].agotado===true`), "Agotado guarda al tocar (PATCH)");
  ok(await ev(`window.__llamadas.some(function(l){return l.indexOf('PATCH /rest/v1/productos?id=eq.1')===0})`), "…con PATCH a productos?id=eq.1");
  await ev(`document.querySelector('input[aria-label="Nuevo: Abeja"]').click()`);
  ok(await p.hasta(`window.__db.productos[0].nuevo===true`), "Nuevo guarda al tocar");
  await ev(`document.querySelector('input[aria-label="Nuevo: Sol"]').click()`);
  ok(await p.hasta(`window.__db.productos[1].nuevo===false`), "Nuevo se apaga");
  ok(await ev(`!!document.querySelector('input[aria-label="Agotado: Abeja"]').checked`), "el interruptor queda encendido tras repintar");
  // falla de red: revierte
  await ev(`window.__dbFalla=true; document.querySelector('input[aria-label="Agotado: Sol"]').click()`);
  ok(await p.hasta(`document.getElementById('toast').textContent.indexOf('No se pudo guardar')===0`) && await ev(`!document.querySelector('input[aria-label="Agotado: Sol"]').checked && window.__db.productos[1].agotado===false`), "si falla, el interruptor vuelve atrás y avisa");
  await ev(`window.__dbFalla=false`);

  // crear categoría, grupo, producto
  const guardar = (dlg, btn) => ev(`${$(btn)}.click()`);
  await ev(`${$("t-cat")}.click()`);
  ok(await ev(`${$("d-categoria")}.open`), "«+ Categoría» abre el diálogo");
  await guardar("d-categoria", "dca-ok");
  ok(await ev(`${$("dca-msg")}.textContent`) === "Escribe el nombre." && await ev(`${$("d-categoria")}.open`), "categoría sin nombre: mensaje y no cierra");
  await ev(`${$("dca-nombre")}.value='Pinceles';${$("dca-color")}.value='#e8b93f'`); await guardar("d-categoria", "dca-ok");
  ok(await p.hasta(`window.__db.categorias.length===3 && !${$("d-categoria")}.open`), "categoría creada");
  ok(await ev(`window.__db.categorias[2].orden===2 && window.__db.categorias[2].color==='#e8b93f' && window.__db.categorias[2].descripcion===null`), "…con orden 2, color y descripción nula");
  await ev(`${$("t-cat")}.click();${$("dca-nombre")}.value='Pinceles'`); await guardar("d-categoria", "dca-ok");
  ok(await p.hasta(`${$("dca-msg")}.textContent.indexOf('Ya hay uno')===0`), "categoría repetida (409): mensaje claro");
  await ev(`${$("d-categoria")}.querySelector('button[value=no]').click()`);

  await ev(`${$("t-grupo")}.click()`);
  await ev(`${$("dgr-nombre")}.value='Pinceles sueltos';${$("dgr-cat")}.value=String(window.__db.categorias[2].id);${$("dgr-pref")}.value='Pincel:'`); await guardar("d-grupo", "dgr-ok");
  ok(await p.hasta(`window.__db.grupos.length===3`) && await ev(`window.__db.grupos[2].prefijo==='Pincel: ' && window.__db.grupos[2].con_foto===true && window.__db.grupos[2].con_tamanos===false && window.__db.grupos[2].categoria_id===window.__db.categorias[2].id`), "grupo creado (prefijo normalizado «Pincel: »)");

  // producto: validaciones de precio
  const prodForm = (n, pr) => ev(`${$("dp-nombre")}.value=${JSON.stringify(n)};${$("dp-precio")}.value=${JSON.stringify(pr)}`);
  await ev(`${$("t-prod")}.click()`);
  ok(await ev(`${$("dp-grupo")}.options.length`) === 3, "selector de grupo con los 3 grupos");
  await ev(`${$("dp-grupo")}.value=String(window.__db.grupos[2].id);${$("dp-grupo")}.dispatchEvent(new Event('change'))`);
  const nProd = () => ev(`window.__db.productos.length`);
  for (const mal of ["abc", "-5", "12.5", "1e3", "5000000000", "1 500"]) {
    await prodForm("Abanico", mal); await guardar("d-producto", "dp-ok");
    ok(await nProd() === 3 && /precio/i.test(await ev(`${$("dp-msg")}.textContent`)) && await ev(`${$("d-producto")}.open`), `precio «${mal}» no se guarda y avisa`);
  }
  await prodForm("", "500"); await guardar("d-producto", "dp-ok");
  ok(await nProd() === 3 && /nombre/i.test(await ev(`${$("dp-msg")}.textContent`)), "nombre vacío no se guarda");
  await prodForm("x".repeat(81), "500"); await guardar("d-producto", "dp-ok");
  ok(await nProd() === 3, "nombre de 81 letras no se guarda");
  // foto: no imagen
  await ev(`(function(){var dt=new DataTransfer();dt.items.add(new File(['hola'],'x.txt',{type:'text/plain'}));var i=${$("dp-foto")};i.files=dt.files;i.dispatchEvent(new Event('change'))})()`);
  ok(await p.hasta(`/no es una foto/.test(${$("dp-msg")}.textContent)`), "archivo que no es imagen: «Ese archivo no es una foto…»");
  // foto: PNG enorme 3000x2000
  await ev(`(async function(){var c=document.createElement('canvas');c.width=3000;c.height=2000;var x=c.getContext('2d');x.fillStyle='#c33';x.fillRect(0,0,3000,2000);for(var i=0;i<300;i++){x.fillStyle='hsl('+(i*7)+',70%,50%)';x.fillRect(i*10,(i*13)%2000,40,40)}
    var b=await new Promise(function(r){c.toBlob(r,'image/png')});window.__pngBytes=b.size;var dt=new DataTransfer();dt.items.add(new File([b],'gran.png',{type:'image/png'}));var i=${$("dp-foto")};i.files=dt.files;i.dispatchEvent(new Event('change'))})()`);
  ok(await p.hasta(`!!${$("dp-prev")}.querySelector('img')`), "foto grande: aparece la vista previa (PNG original " + await ev(`window.__pngBytes`) + " bytes)");
  ok(await ev(`${$("dp-msg")}.textContent===''&&!${$("dp-quitar")}.hidden`), "…sin mensaje de error y con botón «Quitar foto»");
  await prodForm("Abanico", "  "); await guardar("d-producto", "dp-ok");
  ok(await p.hasta(`window.__db.productos.length===4 && !${$("d-producto")}.open`), "producto con precio vacío se crea");
  const ab = await ev(`window.__db.productos[3]`);
  ok(ab.precio === null && ab.grupo_id === await ev(`window.__db.grupos[2].id`) && ab.orden === 0, "…precio null, grupo 3, orden 0");
  const sub = await ev(`window.__subidas`);
  ok(sub.length === 1 && sub[0].type === "image/jpeg" && sub[0].ctype === "image/jpeg" && sub[0].w <= 1000 && sub[0].h <= 1000 && Math.max(sub[0].w, sub[0].h) === 1000 && sub[0].size < 2 * 1024 * 1024, `Storage recibe 1 JPEG de ${sub[0]?.w}x${sub[0]?.h}, ${sub[0]?.size} bytes`);
  ok(/^\d{4}\/\d{2}\/[0-9a-f]{16}\.jpg$/.test(sub[0].path) && sub[0].apikey && /^Bearer /.test(sub[0].auth), "ruta AAAA/MM/<aleatorio>.jpg con apikey y Bearer: " + sub[0].path);
  ok(ab.foto_url === "https://simulado.supabase.co/storage/v1/object/public/productos/" + sub[0].path, "foto_url = URL pública");
  // precios válidos: 0 y 700
  await ev(`${$("t-prod")}.click()`); await ev(`${$("dp-grupo")}.value=String(window.__db.grupos[2].id)`); await prodForm("Plano", "0"); await guardar("d-producto", "dp-ok");
  ok(await p.hasta(`window.__db.productos.length===5`) && await ev(`window.__db.productos[4].precio===0 && window.__db.productos[4].orden===1`), "precio 0 es válido; orden siguiente = 1");
  ok(await ev(`window.__subidas.length`) === 1, "sin foto elegida no sube nada");

  // abrir de nuevo: lista actualizada con foto del nuevo producto
  await abrirTodo();
  ok(await p.hasta(`document.querySelectorAll('.prod').length===5`), "la lista muestra los 5 productos");

  // editar producto con tamaños
  await ev(`document.querySelector('button[aria-label="Editar Amarillo"]').click()`);
  ok(await ev(`!${$("dp-tambox")}.hidden && !${$("dp-colorbox")}.hidden && ${$("dp-tams")}.children.length===2 && ${$("dp-color")}.value==='#f2d12e'`), "Amarillo: muestra color y 2 tamaños");
  ok(await ev(`${$("dp-borrar")}.hidden`) === false, "editar muestra «Borrar»");
  await ev(`(function(){var r=${$("dp-tams")}.children;r[0].querySelector('.t-pre').value='600';r[1].querySelector('.t-ago').click()})()`);
  await ev(`${$("dp-addtam")}.click()`);
  await ev(`(function(){var r=${$("dp-tams")}.children[2];r.querySelector('.t-nom').value='Galón';r.querySelector('.t-pre').value='x'})()`);
  await guardar("d-producto", "dp-ok");
  ok(await ev(`/tamaño/i.test(${$("dp-msg")}.textContent)&&window.__db.variantes.length===2&&window.__db.variantes[0].precio===500`), "precio de tamaño inválido: no guarda nada (" + await ev(`${$("dp-msg")}.textContent`) + ")");
  await ev(`${$("dp-tams")}.children[2].querySelector('.t-pre').value='4500'`);
  await ev(`${$("dp-tams")}.children[1].querySelector('button').click()`); // quitar «Frasco»
  await guardar("d-producto", "dp-ok");
  ok(await p.hasta(`!${$("d-producto")}.open`) && await ev(`window.__db.variantes.length===2`), "al guardar: se quitó uno y se agregó uno");
  const vs = await ev(`window.__db.variantes.map(function(v){return v.nombre+'|'+v.precio+'|'+v.agotado+'|'+v.orden})`);
  ok(JSON.stringify(vs) === JSON.stringify(["Unidad (5 ml)|600|false|0", "Galón|4500|false|1"]), "tamaños: " + vs.join(" ; "));

  // mover (flechas)
  await abrirTodo();
  await ev(`document.querySelector('button[aria-label="Bajar Abeja"]').click()`);
  ok(await p.hasta(`window.__db.productos[0].orden===1 && window.__db.productos[1].orden===0`), "flecha ▼ intercambia el orden de Abeja y Sol");
  ok(await p.hasta(`document.querySelector('.prod .nm').textContent==='Sol'`), "…y la lista se reordena");
  ok(await ev(`document.querySelector('button[aria-label="Subir Sol"]').disabled`), "el primero no puede subir");
  await ev(`document.querySelector('button[aria-label="Subir Pinturas"]').click()`);
  ok(await p.hasta(`window.__db.categorias.filter(function(c){return c.nombre==='Pinturas'})[0].orden===0`), "las categorías también se reordenan");

  // XSS
  await ev(`${$("t-prod")}.click()`); await prodForm("<img src=x onerror=window.__xss=1><b>x</b>", "100"); await guardar("d-producto", "dp-ok");
  ok(await p.hasta(`window.__db.productos.length===6`), "producto con HTML en el nombre se guarda");
  await abrirTodo(); await espera(300);
  ok(await ev(`window.__xss===undefined && [].some.call(document.querySelectorAll('.prod .nm'),function(n){return n.textContent.indexOf('<img')===0 && !n.querySelector('img,b')})`), "el HTML del nombre se muestra como texto (sin ejecutarse)");

  // borrar producto con confirmación
  await ev(`document.querySelector('button[aria-label="Editar Plano"]').click()`);
  await ev(`${$("dp-borrar")}.click()`);
  ok(await p.hasta(`${$("d-confirma")}.open`) && /Plano/.test(await ev(`${$("dq-tit")}.textContent`)), "«Borrar» pide confirmación");
  await ev(`${$("d-confirma")}.querySelector('button[value=no]').click()`); await espera(200);
  ok(await ev(`window.__db.productos.length`) === 6 && await ev(`${$("d-producto")}.open`), "«Volver» en la confirmación no borra");
  await ev(`${$("dp-borrar")}.click()`); await p.hasta(`${$("d-confirma")}.open`);
  await ev(`${$("d-confirma")}.querySelector('button[value=si]').click()`);
  ok(await p.hasta(`window.__db.productos.length===5 && !${$("d-producto")}.open`), "confirmando se borra el producto");
  // borrar grupo con cascada
  await ev(`document.querySelector('button[aria-label="Editar Colores"]').click()`);
  ok(await ev(`!${$("dgr-borrar")}.hidden && ${$("dgr-tam")}.checked`), "grupo «Colores» editable con tamaños");
  await ev(`${$("dgr-borrar")}.click()`); await p.hasta(`${$("d-confirma")}.open`);
  ok(/1 producto/.test(await ev(`${$("dq-txt")}.textContent`)), "borrar grupo avisa cuántos productos se van: " + await ev(`${$("dq-txt")}.textContent`));
  await ev(`${$("d-confirma")}.querySelector('button[value=si]').click()`);
  ok(await p.hasta(`window.__db.grupos.length===2 && window.__db.variantes.length===0`), "se borra el grupo y sus productos/tamaños");

  // quitar foto y guardar
  await ev(`document.querySelector('button[aria-label="Editar Abanico"]').click()`);
  ok(await ev(`!!${$("dp-prev")}.querySelector('img')`), "al editar se ve la foto actual");
  await ev(`${$("dp-quitar")}.click()`); await guardar("d-producto", "dp-ok");
  ok(await p.hasta(`window.__db.productos.filter(function(x){return x.nombre==='Abanico'})[0].foto_url===null`), "«Quitar foto» deja foto_url en null");

  // ancho con diálogo abierto
  await ev(`${$("t-prod")}.click()`); await ev(`${$("dp-grupo")}.value='1'`);
  ok(await ancho() <= 0, "375 px: sin scroll horizontal con el diálogo de producto abierto");
  const dw = await ev(`(function(){var d=${$("d-producto")}.getBoundingClientRect();return d.left>=0&&d.right<=window.innerWidth})()`);
  ok(dw, "el diálogo cabe en 375 px");
  await ev(`${$("d-producto")}.querySelector('button[value=no]').click()`);
  // Enter en un campo no borra ni cancela: guarda (primer botón)
  await ev(`document.querySelector('button[aria-label="Editar Sol"]').click()`);
  ok(await ev(`${$("f-producto")}.querySelector('button[type=submit],button:not([type])').value`) === "si", "el primer botón del formulario (el de Enter) es «Guardar»");
  await ev(`${$("d-producto")}.querySelector('button[value=no]').click()`);
  ok(p.errores.length === 0, "sin errores de JavaScript (" + p.errores.join(" | ") + ")");
  await p.cerrar();

  // Foto que falla en Storage: no crea el producto
  const q = await pagina(BASE + "/" + TMP + "#tienda");
  await q.hasta(`document.querySelectorAll('#t-lista details.c').length===2`);
  await q.ev(`window.__storageFalla=true;document.getElementById('t-prod').click();document.getElementById('dp-nombre').value='ConFoto'`);
  await q.ev(`(async function(){var c=document.createElement('canvas');c.width=50;c.height=50;var b=await new Promise(function(r){c.toBlob(r,'image/png')});var dt=new DataTransfer();dt.items.add(new File([b],'a.png',{type:'image/png'}));var i=document.getElementById('dp-foto');i.files=dt.files;i.dispatchEvent(new Event('change'))})()`);
  await q.hasta(`!!document.getElementById('dp-prev').querySelector('img')`);
  await q.ev(`document.getElementById('dp-ok').click()`);
  ok(await q.hasta(`/No se pudo subir la foto/.test(document.getElementById('dp-msg').textContent)`) && await q.ev(`window.__db.productos.length`) === 3, "si Storage falla: mensaje y no se crea el producto");
  await q.cerrar();

  // Fallo parcial al guardar tamaños de un producto nuevo y reintento: no se duplican
  const r = await pagina(BASE + "/" + TMP + "#tienda");
  await r.hasta(`document.querySelectorAll('#t-lista details.c').length===2`);
  await r.ev(`document.getElementById('t-prod').click();document.getElementById('dp-grupo').value=String(window.__db.grupos[1].id);document.getElementById('dp-grupo').dispatchEvent(new Event('change'));document.getElementById('dp-nombre').value='Rosa'`);
  await r.ev(`(function(){var t=document.getElementById('dp-tams');while(t.children.length<3)document.getElementById('dp-addtam').click();[].forEach.call(t.children,function(f,i){f.querySelector('.t-nom').value='T'+i;f.querySelector('.t-pre').value=String(100*(i+1))})})()`);
  await r.ev(`window.__failVar=1;document.getElementById('dp-ok').click()`);
  ok(await r.hasta(`/ya se cre/.test(document.getElementById('dp-msg').textContent)`) && await r.ev(`window.__db.variantes.filter(function(v){return v.nombre[0]==='T'}).length`) === 2, "falla parcial: se guardaron 2 de 3 tamaños y el diálogo avisa");
  await r.ev(`document.getElementById('dp-ok').click()`);
  ok(await r.hasta(`!document.getElementById('d-producto').open`), "el reintento cierra el diálogo");
  const nv = await r.ev(`window.__db.variantes.filter(function(v){return v.nombre[0]==='T'}).map(function(v){return v.nombre}).sort()`);
  ok(JSON.stringify(nv) === '["T0","T1","T2"]' && await r.ev(`window.__db.productos.filter(function(p){return p.nombre==='Rosa'}).length`) === 1, "tras el reintento hay exactamente T0, T1, T2 (sin duplicados) y un solo producto: " + nv.join(","));
  await r.cerrar();
} finally {
  nav.kill(); await espera(500); try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  try { unlinkSync(TMP); } catch {}
}
console.log(fallos ? `${fallos} FALLA(S)` : "todo ok");
process.exit(fallos ? 1 : 0);

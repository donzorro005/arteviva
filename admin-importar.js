/* ARTE VIVA · Panel · Tienda (etapa 2): importar el catálogo actual y descargar el respaldo.
   Se carga después de admin-promos.js. catalogo.js (512 KB) se lee solo al importar, con una etiqueta <script>.
   La importación se puede repetir sin duplicar: lo que ya existe (por nombre) se omite y solo se completa lo que falta. */
(function () {
  "use strict";
  var AV = window.AV;
  if (!AV || !AV.tienda) return;
  var api = AV.api, $ = function (i) { return document.getElementById(i); };
  var FLAG = "av-import-pendiente", LINEA = "// Catálogo de respaldo de la tienda ARTE VIVA: se usa solo si Supabase y la copia del navegador no responden. Generado desde el panel/herramientas; no editar a mano.";
  var corriendo = false, terminado = false;

  function flag(v) { try { if (v) localStorage.setItem(FLAG, "1"); else localStorage.removeItem(FLAG); } catch (e) {} }
  function hayFlag() { try { return !!localStorage.getItem(FLAG); } catch (e) { return false; } }
  async function traer(tabla) {
    var todo = [], tanda = 1000;
    for (var ini = 0; ; ini += tanda) {
      var r = await api("/rest/v1/" + tabla + "?select=*&order=orden.asc,id.asc", { rango: ini + "-" + (ini + tanda - 1) }) || [];
      todo = todo.concat(r);
      if (r.length < tanda) return todo;
    }
  }
  function tandas(lista, n) { var o = []; for (var i = 0; i < lista.length; i += n) o.push(lista.slice(i, i + n)); return o; }
  // Con "conflicto": si ya existe una fila con ese nombre, se omite (no falla ni duplica).
  function unir(ruta, filas, conflicto) {
    return api("/rest/v1/" + ruta + (conflicto ? "?on_conflict=" + conflicto : ""), { method: "POST", body: filas, prefer: conflicto ? "resolution=ignore-duplicates,return=minimal" : "return=minimal" });
  }
  function leerCatalogoUna(n) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.onload = function () { var c = window.CATALOGO_RESPALDO; s.remove(); c && c.categorias ? res(c) : rej(new Error("catalogo vacío")); };
      s.onerror = function () { s.remove(); rej(Object.assign(new Error("no se pudo leer catalogo.js"), { status: 0 })); };
      s.src = "catalogo.js?v=" + Date.now() + "-" + n; document.head.appendChild(s);
    });
  }
  // un reintento por si la conexión se corta justo al bajar el archivo (pesa ~500 KB)
  async function leerCatalogo() { try { return await leerCatalogoUna(1); } catch (e) { return leerCatalogoUna(2); } }
  function aBlob(uri) {
    var m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(uri);
    if (!m) throw new Error("foto no válida");
    var bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: m[1] });
  }

  /* ---------- importar ---------- */
  async function importar() {
    var C = await leerCatalogo(), paso = function (t) { $("im-prog").textContent = t; };
    var cats = C.categorias || [];

    paso("Creando categorías…");
    await unir("categorias", cats.map(function (c, i) { return { nombre: c.n, descripcion: c.d || null, color: c.c || null, orden: i }; }), "nombre");
    var catId = {}; (await traer("categorias")).forEach(function (c) { catId[c.nombre] = c.id; });

    paso("Creando grupos…");
    var gr = [];
    cats.forEach(function (c) { (c.g || []).forEach(function (g, i) { gr.push({ categoria_id: catId[c.n], nombre: g.t, prefijo: g.k || null, con_foto: !!g.im, con_tamanos: !!g.sz, orden: i }); }); });
    await unir("grupos", gr, "categoria_id,nombre");
    var grId = {}, grPorNombre = {};
    (await traer("grupos")).forEach(function (g) { grId[g.categoria_id + "|" + g.nombre] = g.id; if (!(g.nombre in grPorNombre)) grPorNombre[g.nombre] = g.id; });

    paso("Creando productos…");
    var pr = [], gid = function (c, g) { return grId[catId[c.n] + "|" + g.t]; };
    cats.forEach(function (c) { (c.g || []).forEach(function (g) {
      (g.l || []).forEach(function (p, i) { pr.push({ grupo_id: gid(c, g), nombre: p.d, precio: p.p == null ? null : p.p, color: p.c || null, foto_url: null, agotado: !!p.agotado, nuevo: !!p.nuevo, orden: i }); });
    }); });
    for (var t of tandas(pr, 50)) await unir("productos", t, "grupo_id,nombre");
    var prodFila = {}, porNombre = {}; // por grupo|nombre (fotos y tamaños) y por nombre completo (descuentos, lo más vendido)
    (await traer("productos")).forEach(function (p) { prodFila[p.grupo_id + "|" + p.nombre] = p; });
    cats.forEach(function (c) { (c.g || []).forEach(function (g) { (g.l || []).forEach(function (p) {
      var f = prodFila[gid(c, g) + "|" + p.d]; if (f) porNombre[(g.k || "") + p.d] = f.id;
    }); }); });

    paso("Creando tamaños…");
    var conVar = {}; (await traer("variantes")).forEach(function (v) { conVar[v.producto_id] = true; });
    var bloque = [];
    for (var c1 of cats) for (var g1 of (c1.g || [])) for (var p1 of (g1.l || [])) {
      var f1 = prodFila[gid(c1, g1) + "|" + p1.d];
      if (!f1 || conVar[f1.id] || !(p1.v || []).length) continue;
      // se envían productos completos: una interrupción nunca deja un producto con la mitad de sus tamaños
      bloque = bloque.concat(p1.v.map(function (v, i) { return { producto_id: f1.id, nombre: v.d, precio: v.p, agotado: !!v.agotado, orden: i }; }));
      if (bloque.length >= 150) { await unir("variantes", bloque); bloque = []; }
    }
    if (bloque.length) await unir("variantes", bloque);

    paso("Creando promociones…");
    var vacia = async function (tabla) { return !(await api("/rest/v1/" + tabla + "?select=id", { rango: "0-0" }) || []).length; };
    var catDe = function (n) { return n && catId[n] != null ? catId[n] : null; };
    if (await vacia("banners") && (C.banners || []).length) await unir("banners", C.banners.map(function (b, i) {
      return { on: b.on !== false, sup: b.sup || null, titulo: b.t || null, descripcion: b.d || null, boton: b.boton || null, categoria_id: catDe(b.cat), enlace: b.ir || null, foto_url: null,
        color1: b.col && b.col[0] || null, color2: b.col && b.col[1] || null, letra_oscura: !!b.osc, hasta: b.hasta || null, orden: i };
    }));
    if (await vacia("tarjetas") && (C.tarjetas || []).length) await unir("tarjetas", C.tarjetas.map(function (b, i) {
      return { on: b.on !== false, sup: b.sup || null, titulo: b.t || null, descripcion: b.d || null, boton: b.boton || null, categoria_id: catDe(b.cat), enlace: b.ir || null,
        color1: b.col && b.col[0] || null, color2: b.col && b.col[1] || null, letra_oscura: !!b.osc, hasta: b.hasta || null, orden: i };
    }));
    if (await vacia("descuentos")) {
      var ds = [];
      (C.descuentos || []).forEach(function (d, i) {
        var cid = d.cat ? catDe(d.cat) : null, gi = null;
        if (d.grupo) gi = (cid != null && grId[cid + "|" + d.grupo] != null) ? grId[cid + "|" + d.grupo] : (grPorNombre[d.grupo] != null ? grPorNombre[d.grupo] : null);
        if ((d.cat && cid == null) || (d.grupo && gi == null)) return; // destino que ya no existe: no se importa (no se volvería global)
        var ids = (d.prod || []).map(function (n) { return porNombre[n]; }).filter(function (x) { return x != null; });
        if ((d.prod || []).length && !ids.length) return;
        ds.push({ on: d.on !== false, tipo: d.tipo, valor: d.v == null ? null : d.v, categoria_id: cid, grupo_id: gi, producto_ids: ids, etiqueta: d.etiqueta || null, hasta: d.hasta || null, orden: i });
      });
      if (ds.length) await unir("descuentos", ds);
    }

    // fotos: solo las que todavía no tienen foto_url (así un reintento no sube de nuevo)
    var fotos = [];
    cats.forEach(function (c) { (c.g || []).forEach(function (g) { (g.l || []).forEach(function (p) {
      var f = p.foto && prodFila[gid(c, g) + "|" + p.d];
      if (f && !f.foto_url) fotos.push({ tabla: "productos", id: f.id, uri: p.foto });
    }); }); });
    var ban = await traer("banners");
    (C.banners || []).forEach(function (b, i) {
      var f = b.foto && ban.filter(function (r) { return r.orden === i && r.titulo === (b.t || null); })[0];
      if (f && !f.foto_url) fotos.push({ tabla: "banners", id: f.id, uri: b.foto });
    });
    // Un respaldo descargado trae las fotos como direcciones (http…): se guardan tal cual, sin subir nada.
    // Las que son data: se suben a Storage. Cualquier otra cosa se omite sin romper la importación.
    var fijar = function (f, url) { return api("/rest/v1/" + f.tabla + "?id=eq." + f.id, { method: "PATCH", body: { foto_url: url }, prefer: "return=minimal" }); };
    var subir = [];
    for (var f of fotos) {
      if (/^https?:\/\//i.test(f.uri)) await fijar(f, f.uri);
      else if (/^data:/i.test(f.uri)) subir.push(f);
    }
    for (var k = 0; k < subir.length; k++) {
      paso("Subiendo fotos " + (k + 1) + " de " + subir.length + "…");
      await fijar(subir[k], await AV.subirFoto(aBlob(subir[k].uri)));
    }

    paso("Guardando ajustes…");
    var ya = {}; (await api("/rest/v1/ajustes?select=*") || []).forEach(function (a) { ya[a.clave] = true; });
    var aj = function (clave, valor) { return api("/rest/v1/ajustes", { method: "POST", body: { clave: clave, valor: valor }, prefer: "resolution=merge-duplicates,return=minimal" }); };
    if (C.franja && !ya.franja) await aj("franja", C.franja);
    if (!ya.mas_vendidos) await aj("mas_vendidos", { modo: "manual", lista: (C.mas_vendidos || []).map(function (n) { return porNombre[n]; }).filter(function (x) { return x != null; }) });
    return { productos: pr.length };
  }
  async function alImportar() {
    if (corriendo) return;
    corriendo = true; var B = $("im-ir"), M = $("im-msg"); B.disabled = true; M.textContent = ""; $("im-ok").textContent = ""; flag(true);
    try {
      var r = await importar();
      flag(false); terminado = true; $("im-prog").textContent = "";
      B.hidden = true; $("im-ayuda").hidden = true;
      $("im-ok").textContent = "Listo: tu catálogo ya está en el panel (" + r.productos + " productos). Ya puedes editarlo desde aquí.";
      AV.toast("Catálogo importado");
    } catch (e) {
      if (e.status !== 401) { $("im-prog").textContent = ""; M.textContent = (e.status === 0 ? "Se cortó la conexión. " : "No se pudo terminar. ") + "No se perdió nada: toca el botón otra vez para continuar donde se quedó."; B.textContent = "Reintentar importación"; }
    }
    corriendo = false; B.disabled = false;
    try { await AV.tienda.cargar(); } catch (e) {}
  }

  /* ---------- cuándo mostrar el botón ---------- */
  async function refrescar() {
    if (corriendo || terminado) return;
    try {
      var vacia = !((await api("/rest/v1/categorias?select=id", { rango: "0-0" })) || []).length;
      $("im-card").hidden = !(vacia || hayFlag());
    } catch (e) {}
  }
  var cargarTienda = AV.tienda.cargar;
  AV.tienda.cargar = async function () { await cargarTienda(); await refrescar(); };
  $("im-ir").onclick = alImportar;

  /* ---------- respaldo ---------- */
  // OJO: catalogo_publico() omite promociones apagadas o vencidas; el respaldo es para la tienda, no una copia completa del panel.
  async function descargar() {
    var B = $("rs-ir"), M = $("rs-msg"); M.textContent = ""; B.disabled = true;
    try {
      var c = await api("/rest/v1/rpc/catalogo_publico", { method: "POST", body: {} });
      if (!c || !c.categorias) throw new Error("vacío");
      var texto = LINEA + "\nwindow.CATALOGO_RESPALDO = " + JSON.stringify(c) + ";\n";
      var url = URL.createObjectURL(new Blob([texto], { type: "text/javascript;charset=utf-8" })), a = document.createElement("a");
      a.href = url; a.download = "catalogo.js"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      AV.toast("Respaldo descargado: catalogo.js");
    } catch (e) { if (e.status !== 401) M.textContent = e.status === 0 ? "No se pudo conectar. Revisa tu internet." : "No se pudo preparar el respaldo. Inténtalo de nuevo."; }
    B.disabled = false;
  }
  $("rs-ir").onclick = descargar;
  AV.importar = { importar: alImportar, descargar: descargar, refrescar: refrescar };
  if (!$("s-tienda").hidden && !$("app").hidden) refrescar();
})();

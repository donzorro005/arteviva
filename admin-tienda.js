/* ARTE VIVA · Panel · Tienda (etapa 2): categorías, grupos, productos y tamaños.
   Se carga después de admin.js y usa sus herramientas (window.AV). Todo texto de la base se pinta con textContent. */
(function () {
  "use strict";
  var AV = window.AV;
  if (!AV) return;
  var api = AV.api, el = AV.el, toast = AV.toast, confirma = AV.confirma, $ = function (i) { return document.getElementById(i); };
  var money = function (n) { return window.AVCalc ? window.AVCalc.money(n) : "₡" + n; };
  var D = { cats: [], grupos: [], prods: [], vars: [] }, abiertos = {}, huella = "", cargando = false, hayDatos = false;
  var MAX_PRECIO = 2147483647, MAX_BYTES = 2 * 1024 * 1024, HEX = /^#[0-9a-f]{6}$/i;

  /* ---------- datos ---------- */
  async function traer(tabla) {
    var todo = [], tanda = 1000;
    for (var ini = 0; ; ini += tanda) {
      var r = await api("/rest/v1/" + tabla + "?select=*&order=orden.asc,id.asc", { rango: ini + "-" + (ini + tanda - 1) }) || [];
      todo = todo.concat(r);
      if (r.length < tanda) return todo;
    }
  }
  async function cargar() {
    if (cargando) return;
    cargando = true;
    try {
      var r = await Promise.all([traer("categorias"), traer("grupos"), traer("productos"), traer("variantes")]);
      var h = JSON.stringify(r);
      if (h !== huella || !hayDatos) { huella = h; D = { cats: r[0], grupos: r[1], prods: r[2], vars: r[3] }; hayDatos = true; pintar(); }
    } catch (e) {
      if (e.status !== 401) {
        if (hayDatos) toast("No se pudo actualizar la tienda. Revisa tu internet.");
        else { var L = $("t-lista"); L.textContent = ""; L.appendChild(el("p", "vacio c", "No se pudo cargar la tienda. Revisa tu internet y vuelve a entrar a esta sección.")); }
      }
    } finally { cargando = false; }
  }
  function ord(a) { return a.slice().sort(function (x, y) { return ((x.orden || 0) - (y.orden || 0)) || (x.id - y.id); }); }
  function hijos(lista, campo, id) { return ord(lista.filter(function (x) { return x[campo] === id; })); }
  function sigOrden(lista) { return lista.reduce(function (m, x) { return Math.max(m, (x.orden || 0) + 1); }, 0); }
  function porId(lista, id) { for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i]; return null; }
  function errMsg(e) { return e && e.status === 409 ? "Ya hay uno con ese nombre en este lugar." : AV.errorTxt(e); }
  function colorOk(c) { return typeof c === "string" && HEX.test(c) ? c : ""; }

  /* ---------- validaciones ---------- */
  // Devuelve {v: número|null} o {error: texto}. Vacío = sin precio (solo producto); entero ≥ 0.
  function leePrecio(txt, obligatorio) {
    var t = String(txt == null ? "" : txt).trim();
    if (!t) return obligatorio ? { error: "Escribe el precio." } : { v: null };
    if (!/^\d+$/.test(t)) return { error: "El precio debe ser un número entero de colones, sin letras, signos ni decimales." };
    var n = +t;
    if (n > MAX_PRECIO) return { error: "El precio es demasiado grande." };
    return { v: n };
  }

  /* ---------- fotos ---------- */
  // Achica a 1000 px de lado mayor y la pasa a JPEG 0,85. Rechaza lo que no sea imagen.
  function reducir(file) {
    return new Promise(function (res, rej) {
      var mal = function (m) { rej(Object.assign(new Error(m), { amigable: m })); };
      if (!file || !/^image\//.test(file.type)) return mal("Ese archivo no es una foto. Elige una imagen JPG, PNG o WebP.");
      var im = new Image(), u = URL.createObjectURL(file);
      im.onload = function () {
        URL.revokeObjectURL(u);
        if (!im.width || !im.height) return mal("No se pudo leer esa foto. Prueba con otra (JPG, PNG o WebP).");
        var s = Math.min(1, 1000 / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.width * s)); c.height = Math.max(1, Math.round(im.height * s));
        var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        c.toBlob(function (b) {
          if (!b) return mal("No se pudo preparar la foto. Prueba con otra.");
          if (b.size > MAX_BYTES) return mal("La foto sigue siendo muy pesada (más de 2 MB). Prueba con otra más sencilla.");
          res(b);
        }, "image/jpeg", 0.85);
      };
      im.onerror = function () { URL.revokeObjectURL(u); mal("No se pudo leer esa foto. Prueba con otra (JPG, PNG o WebP)."); };
      im.src = u;
    });
  }
  function aleatorio() { var a = new Uint8Array(8); crypto.getRandomValues(a); return [].map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  async function subirBlob(blob) {
    var f = AV.hoy(), ruta = f.slice(0, 4) + "/" + f.slice(5, 7) + "/" + aleatorio() + ".jpg";
    var r;
    try { r = await fetch(AV.URL + "/storage/v1/object/productos/" + ruta, { method: "POST", headers: { apikey: AV.KEY, Authorization: "Bearer " + await AV.token(), "Content-Type": "image/jpeg" }, body: blob }); }
    catch (e) { if (e.status !== undefined) throw e; throw Object.assign(new Error("red"), { status: 0 }); }
    if (!r.ok) throw Object.assign(new Error("foto"), { status: r.status, foto: true });
    return AV.URL + "/storage/v1/object/public/productos/" + ruta;
  }
  AV.subirFoto = async function (file) { return subirBlob(await reducir(file)); };

  /* ---------- lista ---------- */
  function miniatura(p, clase) {
    var m = el("div", "miniatura" + (clase ? " " + clase : ""));
    if (p.foto_url && /^https?:\/\//.test(p.foto_url)) { var i = el("img"); i.src = p.foto_url; i.alt = ""; i.loading = "lazy"; i.onerror = function () { m.textContent = "Sin foto"; }; m.appendChild(i); }
    else if (colorOk(p.color)) { var d = el("i"); d.style.background = p.color; m.appendChild(d); }
    else m.textContent = "Sin foto";
    return m;
  }
  function boton(txt, titulo, fn, dis) {
    var b = el("button", "ico", txt); b.type = "button"; b.title = titulo; b.setAttribute("aria-label", titulo); b.disabled = !!dis;
    b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); fn(); };
    return b;
  }
  function editar(txt, fn) {
    var b = el("button", "btn o sm", "Editar"); b.type = "button"; b.setAttribute("aria-label", "Editar " + txt);
    b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); fn(); };
    return b;
  }
  function resumen(clave, nombre, extra, lista, item, tabla, ed) {
    var s = el("summary"), n = el("span", "nom", nombre); if (extra) n.appendChild(el("small", "", extra));
    s.appendChild(n);
    var a = el("span", "sacc"), i = lista.indexOf(item);
    a.appendChild(boton("▲", "Subir " + nombre, function () { mover(lista, item, -1, tabla); }, i <= 0));
    a.appendChild(boton("▼", "Bajar " + nombre, function () { mover(lista, item, 1, tabla); }, i >= lista.length - 1));
    a.appendChild(ed); s.appendChild(a);
    return s;
  }
  function conAbierto(det, clave) {
    det.open = !!abiertos[clave];
    det.addEventListener("toggle", function () { abiertos[clave] = det.open; });
    return det;
  }
  function textoPrecio(p, g) {
    var vs = hijos(D.vars, "producto_id", p.id);
    if (g && g.con_tamanos) {
      if (!vs.length) return "Sin tamaños";
      var min = Math.min.apply(null, vs.map(function (v) { return v.precio; }));
      return vs.length + (vs.length === 1 ? " tamaño" : " tamaños") + " · desde " + money(min);
    }
    return p.precio == null ? "Sin precio" : money(p.precio);
  }
  function filaProducto(p, g, hermanos) {
    var f = el("div", "prod"), i = hermanos.indexOf(p);
    f.appendChild(miniatura(p));
    var t = el("div"); t.appendChild(el("div", "nm", p.nombre));
    var pr = el("div", "pr", textoPrecio(p, g));
    if (p.agotado) pr.appendChild(el("span", "tag t-ca", "Agotado")).style.marginLeft = "6px";
    if (p.nuevo) pr.appendChild(el("span", "tag t-pe", "Nuevo")).style.marginLeft = "6px";
    t.appendChild(pr); f.appendChild(t);
    var c = el("div", "ctl");
    [["agotado", "Agotado"], ["nuevo", "Nuevo"]].forEach(function (k) {
      var l = el("label", "sw"), ch = el("input"); ch.type = "checkbox"; ch.checked = !!p[k[0]];
      ch.setAttribute("aria-label", k[1] + ": " + p.nombre);
      ch.onchange = function () { alternar(p, k[0], ch); };
      l.appendChild(ch); l.appendChild(document.createTextNode(k[1])); c.appendChild(l);
    });
    c.appendChild(boton("▲", "Subir " + p.nombre, function () { mover(hermanos, p, -1, "productos"); }, i <= 0));
    c.appendChild(boton("▼", "Bajar " + p.nombre, function () { mover(hermanos, p, 1, "productos"); }, i >= hermanos.length - 1));
    var e = editar(p.nombre, function () { abrirProducto(p); }); e.classList.add("ed"); c.appendChild(e);
    f.appendChild(c);
    return f;
  }
  function pintar() {
    var L = $("t-lista"); L.textContent = "";
    var cats = ord(D.cats);
    if (!cats.length) { L.appendChild(el("p", "vacio c", "Aún no hay categorías. Toca «+ Categoría» para empezar.")); return; }
    cats.forEach(function (c) {
      var gs = hijos(D.grupos, "categoria_id", c.id), nProd = gs.reduce(function (n, g) { return n + hijos(D.prods, "grupo_id", g.id).length; }, 0);
      var det = el("details", "c"), cuerpo = el("div");
      det.appendChild(resumen("c" + c.id, c.nombre, nProd + (nProd === 1 ? " producto" : " productos"), cats, c, "categorias", editar(c.nombre, function () { abrirCategoria(c); })));
      if (c.descripcion) cuerpo.appendChild(el("p", "mu", c.descripcion)).style.cssText = "margin:0 0 4px;font-size:.85rem";
      if (!gs.length) cuerpo.appendChild(el("p", "vacio", "Esta categoría no tiene grupos todavía."));
      gs.forEach(function (g) {
        var ps = hijos(D.prods, "grupo_id", g.id), gd = el("details", "grp");
        var extra = ps.length + (ps.length === 1 ? " producto" : " productos");
        gd.appendChild(resumen("g" + g.id, g.nombre, extra, gs, g, "grupos", editar(g.nombre, function () { abrirGrupo(g); })));
        ps.forEach(function (p) { gd.appendChild(filaProducto(p, g, ps)); });
        if (!ps.length) gd.appendChild(el("p", "vacio", "Sin productos."));
        var add = el("button", "btn o sm", "+ Producto en " + g.nombre); add.type = "button"; add.style.margin = "6px 0"; add.onclick = function () { abrirProducto(null, g.id); };
        gd.appendChild(add);
        cuerpo.appendChild(conAbierto(gd, "g" + g.id));
      });
      det.appendChild(cuerpo); L.appendChild(conAbierto(det, "c" + c.id));
    });
  }

  /* ---------- acciones rápidas ---------- */
  async function alternar(p, campo, ch) {
    var v = ch.checked, cuerpo = {}; cuerpo[campo] = v; ch.disabled = true;
    try { await api("/rest/v1/productos?id=eq." + p.id, { method: "PATCH", body: cuerpo, prefer: "return=minimal" }); p[campo] = v; huella = ""; toast((campo === "agotado" ? (v ? "Marcado como agotado: " : "Ya hay de nuevo: ") : (v ? "Marcado como nuevo: " : "Ya no es nuevo: ")) + p.nombre); pintar(); }
    catch (e) { ch.checked = !v; ch.disabled = false; if (e.status !== 401) toast(AV.errorTxt(e)); }
  }
  // Cambia de lugar con el vecino y renumera la lista (0, 1, 2…) para no depender de órdenes repetidos.
  async function mover(lista, item, dir, tabla) {
    var i = lista.indexOf(item), j = i + dir;
    if (i < 0 || j < 0 || j >= lista.length) return;
    var nueva = lista.slice(); nueva.splice(i, 1); nueva.splice(j, 0, item);
    var cambios = nueva.map(function (x, k) { return [x, k]; }).filter(function (p) { return p[0].orden !== p[1]; });
    try {
      await Promise.all(cambios.map(function (p) { return api("/rest/v1/" + tabla + "?id=eq." + p[0].id, { method: "PATCH", body: { orden: p[1] }, prefer: "return=minimal" }); }));
      cambios.forEach(function (p) { p[0].orden = p[1]; }); huella = ""; pintar();
    } catch (e) { if (e.status !== 401) toast(AV.errorTxt(e)); cargar(); }
  }

  /* ---------- diálogos: utilidades ---------- */
  function ligaColor(pid, tid, xid) {
    var P = $(pid), T = $(tid);
    P.oninput = function () { T.value = P.value; };
    T.oninput = function () { if (HEX.test(T.value)) P.value = T.value; };
    $(xid).onclick = function () { T.value = ""; };
  }
  function opcionesGrupos(sel, elegido) {
    sel.textContent = "";
    ord(D.cats).forEach(function (c) {
      var og = el("optgroup"); og.label = c.nombre;
      hijos(D.grupos, "categoria_id", c.id).forEach(function (g) { var o = el("option", "", g.nombre); o.value = g.id; og.appendChild(o); });
      if (og.children.length) sel.appendChild(og);
    });
    sel.value = String(elegido);
  }
  function enviando(boton_, si) { boton_.disabled = si; }

  /* ---------- categoría ---------- */
  var cEdit = null;
  function abrirCategoria(c) {
    cEdit = c || null; $("dca-msg").textContent = "";
    $("dca-tit").textContent = c ? "Editar categoría" : "Nueva categoría";
    $("dca-nombre").value = c ? c.nombre : ""; $("dca-desc").value = c && c.descripcion || ""; $("dca-color").value = c && colorOk(c.color) || "";
    $("dca-colorp").value = colorOk(c && c.color) || "#999999"; ligaColor("dca-colorp", "dca-color", "dca-colorx");
    $("dca-borrar").hidden = !c; $("d-categoria").returnValue = ""; $("d-categoria").showModal();
  }
  $("f-categoria").addEventListener("submit", async function (e) {
    var v = e.submitter && e.submitter.value; if (v === "no") return; e.preventDefault();
    var M = $("dca-msg"), B = $("dca-ok"); M.textContent = "";
    if (v === "borrar") {
      var n = hijos(D.grupos, "categoria_id", cEdit.id).length;
      if (!(await confirma("¿Borrar la categoría «" + cEdit.nombre + "»?", n ? "Se borrarán también sus " + n + (n === 1 ? " grupo" : " grupos") + " y todos sus productos. No se puede deshacer." : "No se puede deshacer."))) return;
      try { await api("/rest/v1/categorias?id=eq." + cEdit.id, { method: "DELETE", prefer: "return=minimal" }); $("d-categoria").close(); toast("Categoría borrada"); await cargar(); }
      catch (er) { if (er.status !== 401) M.textContent = AV.errorTxt(er); }
      return;
    }
    var nombre = $("dca-nombre").value.trim(), color = $("dca-color").value.trim();
    if (!nombre) { M.textContent = "Escribe el nombre."; return; }
    if (nombre.length > 80) { M.textContent = "El nombre es muy largo (máximo 80 letras)."; return; }
    if (color && !HEX.test(color)) { M.textContent = "El color debe verse así: #4f82c4 (o toca el cuadrito para elegirlo)."; return; }
    var cuerpo = { nombre: nombre, descripcion: $("dca-desc").value.trim() || null, color: color || null };
    if (!cEdit) cuerpo.orden = sigOrden(D.cats);
    enviando(B, true);
    try {
      if (cEdit) await api("/rest/v1/categorias?id=eq." + cEdit.id, { method: "PATCH", body: cuerpo, prefer: "return=minimal" });
      else await api("/rest/v1/categorias", { method: "POST", body: cuerpo, prefer: "return=representation" });
      $("d-categoria").close(); toast(cEdit ? "Categoría actualizada" : "Categoría creada"); await cargar();
    } catch (er) { if (er.status !== 401) M.textContent = errMsg(er); }
    enviando(B, false);
  });

  /* ---------- grupo ---------- */
  var gEd = null;
  function abrirGrupo(g, catId) {
    if (!D.cats.length) { toast("Primero crea una categoría."); return; }
    gEd = g || null; $("dgr-msg").textContent = "";
    $("dgr-tit").textContent = g ? "Editar grupo" : "Nuevo grupo";
    var S = $("dgr-cat"); S.textContent = "";
    ord(D.cats).forEach(function (c) { var o = el("option", "", c.nombre); o.value = c.id; S.appendChild(o); });
    S.value = String(g ? g.categoria_id : (catId || ord(D.cats)[0].id));
    $("dgr-nombre").value = g ? g.nombre : ""; $("dgr-pref").value = g && g.prefijo ? g.prefijo.trim() : "";
    $("dgr-foto").checked = g ? !!g.con_foto : true; $("dgr-tam").checked = g ? !!g.con_tamanos : false;
    $("dgr-borrar").hidden = !g; $("d-grupo").returnValue = ""; $("d-grupo").showModal();
  }
  $("f-grupo").addEventListener("submit", async function (e) {
    var v = e.submitter && e.submitter.value; if (v === "no") return; e.preventDefault();
    var M = $("dgr-msg"), B = $("dgr-ok"); M.textContent = "";
    if (v === "borrar") {
      var n = hijos(D.prods, "grupo_id", gEd.id).length;
      if (!(await confirma("¿Borrar el grupo «" + gEd.nombre + "»?", n ? "Se borrarán también sus " + n + (n === 1 ? " producto" : " productos") + ". No se puede deshacer." : "No se puede deshacer."))) return;
      try { await api("/rest/v1/grupos?id=eq." + gEd.id, { method: "DELETE", prefer: "return=minimal" }); $("d-grupo").close(); toast("Grupo borrado"); await cargar(); }
      catch (er) { if (er.status !== 401) M.textContent = AV.errorTxt(er); }
      return;
    }
    var nombre = $("dgr-nombre").value.trim(), pref = $("dgr-pref").value.trim(), cat = +$("dgr-cat").value;
    if (!nombre) { M.textContent = "Escribe el nombre."; return; }
    if (nombre.length > 80) { M.textContent = "El nombre es muy largo (máximo 80 letras)."; return; }
    if (!porId(D.cats, cat)) { M.textContent = "Elige una categoría."; return; }
    var cuerpo = { nombre: nombre, categoria_id: cat, prefijo: pref ? pref + " " : null, con_foto: $("dgr-foto").checked, con_tamanos: $("dgr-tam").checked };
    if (!gEd || gEd.categoria_id !== cat) cuerpo.orden = sigOrden(D.grupos.filter(function (x) { return x.categoria_id === cat; }));
    enviando(B, true);
    try {
      if (gEd) await api("/rest/v1/grupos?id=eq." + gEd.id, { method: "PATCH", body: cuerpo, prefer: "return=minimal" });
      else await api("/rest/v1/grupos", { method: "POST", body: cuerpo, prefer: "return=representation" });
      abiertos["c" + cat] = true; $("d-grupo").close(); toast(gEd ? "Grupo actualizado" : "Grupo creado"); await cargar();
    } catch (er) { if (er.status !== 401) M.textContent = errMsg(er); }
    enviando(B, false);
  });

  /* ---------- producto ---------- */
  var pe = null; // { prod, blob, urlPrev, quitar, filas }
  function grupoActual() { return porId(D.grupos, +$("dp-grupo").value); }
  function fotoPrev() {
    var P = $("dp-prev"); P.textContent = "";
    var url = pe.blob ? pe.urlPrev : (!pe.quitar && pe.prod && pe.prod.foto_url) || "";
    if (url && (pe.blob || /^https?:\/\//.test(url))) { var i = el("img"); i.src = url; i.alt = "Vista previa de la foto"; P.appendChild(i); } else P.textContent = "Sin foto";
    $("dp-quitar").hidden = !url;
  }
  function filaTam(v) {
    var r = el("div", "tam"); if (v && v.id) r.dataset.id = v.id;
    var n = el("input"); n.type = "text"; n.maxLength = 40; n.placeholder = "Tamaño (ej. Frasco 27 ml)"; n.setAttribute("aria-label", "Nombre del tamaño"); n.value = v ? v.nombre : ""; n.className = "t-nom";
    var p = el("input"); p.type = "text"; p.inputMode = "numeric"; p.placeholder = "₡"; p.setAttribute("aria-label", "Precio del tamaño"); p.value = v ? v.precio : ""; p.className = "t-pre";
    var l = el("label", "sw"), a = el("input"); a.type = "checkbox"; a.checked = !!(v && v.agotado); a.className = "t-ago"; l.appendChild(a); l.appendChild(document.createTextNode("Agotado"));
    var x = el("button", "ico", "✕"); x.type = "button"; x.title = "Quitar tamaño"; x.setAttribute("aria-label", "Quitar tamaño"); x.onclick = function () { r.remove(); };
    r.appendChild(n); r.appendChild(p); r.appendChild(l); r.appendChild(x);
    $("dp-tams").appendChild(r);
  }
  function ajustaGrupo() {
    var g = grupoActual(), t = !!(g && g.con_tamanos);
    $("dp-colorbox").hidden = !t; $("dp-tambox").hidden = !t;
  }
  function abrirProducto(p, grupoId) {
    if (!D.grupos.length) { toast("Primero crea un grupo."); return; }
    pe = { prod: p || null, blob: null, urlPrev: "", quitar: false };
    $("dp-msg").textContent = ""; $("dp-tit").textContent = p ? "Editar producto" : "Nuevo producto";
    opcionesGrupos($("dp-grupo"), p ? p.grupo_id : (grupoId || D.grupos[0].id));
    $("dp-nombre").value = p ? p.nombre : ""; $("dp-precio").value = p && p.precio != null ? p.precio : "";
    $("dp-color").value = p && colorOk(p.color) || ""; $("dp-colorp").value = colorOk(p && p.color) || "#999999"; ligaColor("dp-colorp", "dp-color", "dp-colorx");
    $("dp-foto").value = ""; $("dp-tams").textContent = "";
    if (p) hijos(D.vars, "producto_id", p.id).forEach(filaTam);
    ajustaGrupo(); fotoPrev();
    $("dp-borrar").hidden = !p; $("d-producto").returnValue = ""; $("d-producto").showModal();
  }
  $("dp-grupo").onchange = function () { ajustaGrupo(); if (!$("dp-tams").children.length && grupoActual() && grupoActual().con_tamanos) filaTam(null); };
  $("dp-addtam").onclick = function () { filaTam(null); };
  $("dp-elegir").onclick = function () { $("dp-foto").click(); };
  $("dp-quitar").onclick = function () { if (pe.urlPrev) URL.revokeObjectURL(pe.urlPrev); pe.blob = null; pe.urlPrev = ""; pe.quitar = true; $("dp-foto").value = ""; fotoPrev(); };
  $("dp-foto").onchange = async function () {
    var f = this.files && this.files[0], M = $("dp-msg"); if (!f) return; M.textContent = "";
    try {
      var b = await reducir(f);
      if (pe.urlPrev) URL.revokeObjectURL(pe.urlPrev);
      pe.blob = b; pe.urlPrev = URL.createObjectURL(b); pe.quitar = false; fotoPrev();
    } catch (er) { M.textContent = er.amigable || "No se pudo leer esa foto."; this.value = ""; }
  };
  $("d-producto").addEventListener("close", function () { if (pe && pe.urlPrev) { URL.revokeObjectURL(pe.urlPrev); pe.urlPrev = ""; } });

  // Lee y valida el formulario; devuelve {error} o los datos listos para guardar.
  function leerProducto() {
    var nombre = $("dp-nombre").value.trim(), g = grupoActual();
    if (!nombre) return { error: "Escribe el nombre del producto." };
    if (nombre.length > 80) return { error: "El nombre es muy largo (máximo 80 letras)." };
    if (!g) return { error: "Elige un grupo." };
    var pr = leePrecio($("dp-precio").value, false); if (pr.error) return pr;
    var color = null, tams = [];
    if (g.con_tamanos) {
      color = $("dp-color").value.trim() || null;
      if (color && !HEX.test(color)) return { error: "El color debe verse así: #f2d12e (o toca el cuadrito para elegirlo)." };
      var rows = [].slice.call($("dp-tams").children);
      for (var i = 0; i < rows.length; i++) {
        var tn = rows[i].querySelector(".t-nom").value.trim(), tp = leePrecio(rows[i].querySelector(".t-pre").value, true);
        if (!tn) return { error: "Cada tamaño necesita un nombre." };
        if (tn.length > 40) return { error: "El nombre del tamaño «" + tn.slice(0, 20) + "…» es muy largo (máximo 40 letras)." };
        if (tp.error) return { error: "Tamaño «" + tn + "»: " + tp.error.charAt(0).toLowerCase() + tp.error.slice(1) };
        tams.push({ fila: rows[i], id: rows[i].dataset.id ? +rows[i].dataset.id : null, nombre: tn, precio: tp.v, agotado: rows[i].querySelector(".t-ago").checked, orden: i });
      }
    } else color = pe.prod ? pe.prod.color : null;
    return { nombre: nombre, grupo: g, precio: pr.v, color: color, tams: tams };
  }
  async function guardarProducto() {
    var d = leerProducto(), M = $("dp-msg"), B = $("dp-ok"); M.textContent = "";
    if (d.error) { M.textContent = d.error; return; }
    enviando(B, true);
    try {
      var foto = pe.prod ? pe.prod.foto_url : null;
      if (pe.quitar) foto = null;
      if (pe.blob) { try { foto = await subirBlob(pe.blob); } catch (er) { if (er.foto) { M.textContent = "No se pudo subir la foto. Inténtalo de nuevo o guarda sin foto."; enviando(B, false); return; } throw er; } pe.blob = null; }
      var cuerpo = { grupo_id: d.grupo.id, nombre: d.nombre, precio: d.precio, color: d.color, foto_url: foto };
      if (!pe.prod || pe.prod.grupo_id !== d.grupo.id) cuerpo.orden = sigOrden(D.prods.filter(function (x) { return x.grupo_id === d.grupo.id; }));
      var id;
      if (pe.prod) { id = pe.prod.id; await api("/rest/v1/productos?id=eq." + id, { method: "PATCH", body: cuerpo, prefer: "return=minimal" }); pe.prod = Object.assign({}, pe.prod, cuerpo); }
      else { var r = await api("/rest/v1/productos", { method: "POST", body: cuerpo, prefer: "return=representation" }); pe.prod = r && r[0]; id = pe.prod && pe.prod.id; if (!id) throw new Error("sin id"); }
      if (d.grupo.con_tamanos) await guardarTamanos(id, d.tams);
      abiertos["g" + d.grupo.id] = true; abiertos["c" + d.grupo.categoria_id] = true;
      var nuevo = !D.prods.some(function (x) { return x.id === id; });
      $("d-producto").close(); toast(nuevo ? "Producto creado" : "Producto actualizado"); await cargar();
    } catch (er) { if (er.status !== 401) { M.textContent = errMsg(er) + (pe.prod && pe.prod.id && !D.prods.some(function (x) { return x.id === pe.prod.id; }) ? " (El producto ya se creó; revisa los tamaños y vuelve a guardar.)" : ""); } }
    enviando(B, false);
  }
  // Cada operación que sale bien se anota enseguida (D.vars y el id en la fila del diálogo): si otra falla,
  // al reintentar solo se repite lo pendiente y nunca se duplican tamaños ya guardados.
  async function guardarTamanos(prodId, tams) {
    var viejos = hijos(D.vars, "producto_id", prodId), op = [];
    viejos.forEach(function (v) {
      var n = tams.filter(function (t) { return t.id === v.id; })[0];
      if (!n) op.push(api("/rest/v1/variantes?id=eq." + v.id, { method: "DELETE", prefer: "return=minimal" }).then(function () { D.vars = D.vars.filter(function (x) { return x.id !== v.id; }); }));
      else if (n.nombre !== v.nombre || n.precio !== v.precio || n.agotado !== !!v.agotado || n.orden !== v.orden) {
        var c = { nombre: n.nombre, precio: n.precio, agotado: n.agotado, orden: n.orden };
        op.push(api("/rest/v1/variantes?id=eq." + v.id, { method: "PATCH", body: c, prefer: "return=minimal" }).then(function () { Object.assign(v, c); }));
      }
    });
    tams.filter(function (t) { return !t.id; }).forEach(function (t) {
      var c = { producto_id: prodId, nombre: t.nombre, precio: t.precio, agotado: t.agotado, orden: t.orden };
      op.push(api("/rest/v1/variantes", { method: "POST", body: c, prefer: "return=representation" }).then(function (r) {
        var fila = r && r[0]; if (!fila || !fila.id) throw new Error("sin id");
        t.fila.dataset.id = fila.id; D.vars.push(fila);
      }));
    });
    var res = await Promise.all(op.map(function (p) { return p.then(function () { return null; }, function (e) { return e; }); }));
    var mal = res.filter(Boolean)[0]; if (mal) throw mal;
  }
  $("f-producto").addEventListener("submit", async function (e) {
    var v = e.submitter && e.submitter.value; if (v === "no") return; e.preventDefault();
    if (v === "borrar") {
      var p = pe.prod; if (!p) return;
      if (!(await confirma("¿Borrar «" + p.nombre + "»?", "Se quita de la tienda con sus tamaños. No se puede deshacer."))) return;
      try { await api("/rest/v1/productos?id=eq." + p.id, { method: "DELETE", prefer: "return=minimal" }); $("d-producto").close(); toast("Producto borrado"); await cargar(); }
      catch (er) { if (er.status !== 401) $("dp-msg").textContent = AV.errorTxt(er); }
      return;
    }
    guardarProducto();
  });

  /* ---------- botones de la sección y registro ---------- */
  $("t-cat").onclick = function () { abrirCategoria(null); };
  $("t-grupo").onclick = function () { abrirGrupo(null); };
  $("t-prod").onclick = function () { abrirProducto(null); };
  AV.tienda = { cargar: cargar, datos: function () { return D; }, validarPrecio: leePrecio };
  if (!$("s-tienda").hidden && !$("app").hidden) cargar();
})();

/* ARTE VIVA · Panel · Tienda · Promociones (etapa 2): franja, banners, tarjetas, descuentos y «lo más vendido».
   Se carga después de admin-tienda.js; usa window.AV y los datos de categorías/grupos/productos de AV.tienda.datos().
   Todo texto de la base se pinta con textContent. */
(function () {
  "use strict";
  var AV = window.AV;
  if (!AV || !AV.tienda) return;
  var api = AV.api, el = AV.el, toast = AV.toast, confirma = AV.confirma, $ = function (i) { return document.getElementById(i); };
  var HEX = /^#[0-9a-f]{6}$/i, FECHA = /^\d{4}-\d{2}-\d{2}$/, MAX_MV = 8;
  var P = { franja: null, mv: null, ban: [], tar: [], des: [] }, huellaA = "", cargando = false, hay = false, vista = "prod";

  /* ---------- utilidades puras ---------- */
  // Una promoción con «hasta» anterior a hoy ya no se muestra en la tienda (catalogo_publico() la omite).
  function vencida(hasta, hoy) { return !!hasta && FECHA.test(String(hasta).slice(0, 10)) && String(hasta).slice(0, 10) < (hoy || AV.hoy()); }
  function fechaTxt(f) { var s = String(f || "").slice(0, 10); return FECHA.test(s) ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : ""; }
  function colorOk(c, def) { return typeof c === "string" && HEX.test(c) ? c : def; }
  function norm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function D() { return AV.tienda.datos(); }
  function porId(l, id) { for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function ord(a) { return a.slice().sort(function (x, y) { return ((x.orden || 0) - (y.orden || 0)) || (x.id - y.id); }); }
  function sigOrden(l) { return l.reduce(function (m, x) { return Math.max(m, (x.orden || 0) + 1); }, 0); }
  function nombreProd(p) { var g = porId(D().grupos, p.grupo_id); return ((g && g.prefijo) || "") + p.nombre; }
  function todosProductos() { return ord(D().prods).map(function (p) { return { id: p.id, n: nombreProd(p) }; }).sort(function (a, b) { return a.n.localeCompare(b.n, "es"); }); }
  function leeFecha(txt) { var t = String(txt || "").trim(); if (!t) return { v: null }; return FECHA.test(t) && !isNaN(Date.parse(t)) ? { v: t } : { error: "La fecha de fin no es válida." }; }

  /* ---------- datos ---------- */
  async function traer(tabla) {
    var todo = [], tanda = 1000;
    for (var ini = 0; ; ini += tanda) {
      var r = await api("/rest/v1/" + tabla + "?select=*&order=orden.asc,id.asc", { rango: ini + "-" + (ini + tanda - 1) }) || [];
      todo = todo.concat(r);
      if (r.length < tanda) return todo;
    }
  }
  function ajuste(filas, clave) { for (var i = 0; i < filas.length; i++) if (filas[i].clave === clave) return filas[i].valor || null; return null; }
  async function cargarPromos() {
    if (cargando) return;
    cargando = true;
    try {
      var r = await Promise.all([api("/rest/v1/ajustes?select=*") || [], traer("banners"), traer("tarjetas"), traer("descuentos")]);
      var aj = r[0] || [], h = JSON.stringify(r);
      P.ban = r[1]; P.tar = r[2]; P.des = r[3];
      var fr = ajuste(aj, "franja"), mv = ajuste(aj, "mas_vendidos");
      if (h !== huellaA || !hay) { huellaA = h; hay = true; P.franja = fr; P.mv = mv; pintarFranja(); pintarMv(); }
      pintarListas();
    } catch (e) {
      if (e.status !== 401) {
        if (hay) toast("No se pudo actualizar las promociones. Revisa tu internet.");
        else ["pr-ban", "pr-tar", "pr-des"].forEach(function (i) { var L = $(i); L.textContent = ""; L.appendChild(el("p", "vacio", "No se pudo cargar. Revisa tu internet y vuelve a entrar a esta sección.")); });
      }
    } finally { cargando = false; }
  }
  function guardaAjuste(clave, valor) { return api("/rest/v1/ajustes", { method: "POST", body: { clave: clave, valor: valor }, prefer: "resolution=merge-duplicates,return=minimal" }); }

  /* ---------- sub-vistas: Productos | Promociones ---------- */
  function ponerVista(v) {
    vista = v;
    [].forEach.call($("t-vistas").children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === v ? "true" : "false"); });
    $("t-v-prod").hidden = v !== "prod"; $("t-v-promo").hidden = v !== "promo";
    if (v === "promo") AV.tienda.cargar();
  }
  [].forEach.call($("t-vistas").children, function (b) { b.onclick = function () { ponerVista(b.dataset.v); }; });
  var cargarTienda = AV.tienda.cargar;
  AV.tienda.cargar = async function () { await cargarTienda(); if (vista === "promo") { await cargarPromos(); } };

  /* ---------- franja ---------- */
  function pintarFranja() {
    var f = P.franja || {}, S = $("fr-prov"); S.textContent = "";
    var o0 = el("option", "", "Todo el país"); o0.value = ""; S.appendChild(o0);
    (window.AVCalc && window.AVCalc.PROVINCIAS || []).forEach(function (n) { var o = el("option", "", n); o.value = n; S.appendChild(o); });
    S.value = f.prov || "";
    if (S.value !== (f.prov || "")) { var o = el("option", "", f.prov); o.value = f.prov; S.appendChild(o); S.value = f.prov; }
    $("fr-on").checked = !!f.on; $("fr-t").value = f.t || ""; $("fr-min").value = f.envioMin != null ? f.envioMin : ""; $("fr-hasta").value = f.hasta || "";
    $("fr-msg").textContent = "";
  }
  $("fr-ok").onclick = async function () {
    var M = $("fr-msg"), B = this; M.textContent = "";
    var on = $("fr-on").checked, t = $("fr-t").value.trim(), mn = $("fr-min").value.trim(), fe = leeFecha($("fr-hasta").value), min = null;
    if (on && !t) { M.textContent = "Escribe el texto de la franja."; return; }
    if (mn) {
      var pr = AV.tienda.validarPrecio(mn, false);
      if (pr.error) { M.textContent = "Envío gratis desde: " + pr.error.charAt(0).toLowerCase() + pr.error.slice(1); return; }
      if (!pr.v) { M.textContent = "El monto para envío gratis debe ser mayor a 0 (o déjalo vacío)."; return; }
      min = pr.v;
    }
    if (fe.error) { M.textContent = fe.error; return; }
    var valor = { on: on, t: t, envioMin: min, prov: $("fr-prov").value || null, hasta: fe.v };
    B.disabled = true;
    try { await guardaAjuste("franja", valor); P.franja = valor; huellaA = ""; toast("Franja guardada"); await cargarPromos(); }
    catch (e) { if (e.status !== 401) M.textContent = AV.errorTxt(e); }
    B.disabled = false;
  };

  /* ---------- listas: banners, tarjetas, descuentos ---------- */
  function boton(txt, titulo, fn, dis) {
    var b = el("button", "ico", txt); b.type = "button"; b.title = titulo; b.setAttribute("aria-label", titulo); b.disabled = !!dis;
    b.onclick = function (e) { e.preventDefault(); fn(); };
    return b;
  }
  function filaPromo(tabla, item, lista, nombre, sub, extra, onEditar, mues) {
    var f = el("div", "pr-fila"), t = el("div");
    t.appendChild(el("div", "nm", nombre));
    var s = el("div", "pr", sub); extra.forEach(function (x) { var g = el("span", "tag " + x[1], x[0]); g.style.marginLeft = "6px"; s.appendChild(g); });
    t.appendChild(s); f.appendChild(t);
    if (mues) { var m = el("div", "pr-mues"); m.style.background = "linear-gradient(135deg," + mues[0] + "," + mues[1] + ")"; f.appendChild(m); } else f.appendChild(el("span"));
    var c = el("div", "ctl"), l = el("label", "sw"), ch = el("input"); ch.type = "checkbox"; ch.checked = !!item.on;
    ch.setAttribute("aria-label", "Mostrar: " + nombre); ch.onchange = function () { alternar(tabla, item, ch); };
    l.appendChild(ch); l.appendChild(document.createTextNode(tabla === "descuentos" ? "Activo" : "Mostrar")); c.appendChild(l);
    var i = lista.indexOf(item);
    c.appendChild(boton("▲", "Subir " + nombre, function () { mover(lista, item, -1, tabla); }, i <= 0));
    c.appendChild(boton("▼", "Bajar " + nombre, function () { mover(lista, item, 1, tabla); }, i >= lista.length - 1));
    var e = el("button", "btn o sm ed", "Editar"); e.type = "button"; e.setAttribute("aria-label", "Editar " + nombre); e.onclick = function (ev) { ev.preventDefault(); onEditar(); };
    c.appendChild(e); f.appendChild(c);
    return f;
  }
  function etiquetas(item, muerto) {
    var x = [];
    if (vencida(item.hasta)) x.push(["Vencida", "t-ve"]);
    if (muerto) x.push(["Sin destino", "t-ve"]);
    if (!item.on) x.push(["Apagado", "t-ca"]);
    return x;
  }
  function textoHasta(item) { return item.hasta ? "Hasta " + fechaTxt(item.hasta) : "Sin fecha de fin"; }
  function pintarListas() {
    ["banners", "tarjetas"].forEach(function (tabla) {
      var lista = ord(tabla === "banners" ? P.ban : P.tar), L = $(tabla === "banners" ? "pr-ban" : "pr-tar"); L.textContent = "";
      if (!lista.length) L.appendChild(el("p", "vacio", tabla === "banners" ? "Aún no hay banners." : "Aún no hay tarjetas."));
      lista.forEach(function (b) {
        var cat = b.categoria_id != null ? porId(D().cats, b.categoria_id) : null;
        var sub = (cat ? "Lleva a: " + cat.nombre : "Lleva a la tienda") + " · " + textoHasta(b);
        L.appendChild(filaPromo(tabla, b, lista, b.titulo || "(sin título)", sub, etiquetas(b, b.categoria_id != null && !cat), function () { abrirPromo(tabla, b); }, [colorOk(b.color1, "#4f82c4"), colorOk(b.color2, "#2f55a4")]));
      });
    });
    var ds = ord(P.des), L = $("pr-des"); L.textContent = "";
    if (!ds.length) L.appendChild(el("p", "vacio", "Aún no hay descuentos."));
    ds.forEach(function (d) { var r = destinoDesc(d); L.appendChild(filaPromo("descuentos", d, ds, d.etiqueta || tituloDesc(d), tituloDesc(d) + " · " + r.txt + " · " + textoHasta(d), etiquetas(d, r.muerto), function () { abrirDesc(d); })); });
    pintarMv();
  }
  function tituloDesc(d) { return d.tipo === "2x1" ? "2x1" : (d.valor || "?") + "% de descuento"; }
  function destinoDesc(d) {
    var c = d.categoria_id != null ? porId(D().cats, d.categoria_id) : null, g = d.grupo_id != null ? porId(D().grupos, d.grupo_id) : null;
    if (d.categoria_id != null) return { txt: "Categoría: " + (c ? c.nombre : "(borrada)"), muerto: !c };
    if (d.grupo_id != null) return { txt: "Grupo: " + (g ? g.nombre : "(borrado)"), muerto: !g };
    var ids = d.producto_ids || [], vivos = ids.filter(function (id) { return porId(D().prods, id); });
    if (ids.length) return { txt: vivos.length + (vivos.length === 1 ? " producto" : " productos"), muerto: !vivos.length };
    return { txt: "Sin destino", muerto: true };
  }
  async function alternar(tabla, item, ch) {
    var v = ch.checked; ch.disabled = true;
    try { await api("/rest/v1/" + tabla + "?id=eq." + item.id, { method: "PATCH", body: { on: v }, prefer: "return=minimal" }); item.on = v; huellaA = ""; toast(v ? "Encendido" : "Apagado"); pintarListas(); }
    catch (e) { ch.checked = !v; ch.disabled = false; if (e.status !== 401) toast(AV.errorTxt(e)); }
  }
  async function mover(lista, item, dir, tabla) {
    var i = lista.indexOf(item), j = i + dir;
    if (i < 0 || j < 0 || j >= lista.length) return;
    var nueva = lista.slice(); nueva.splice(i, 1); nueva.splice(j, 0, item);
    var cambios = nueva.map(function (x, k) { return [x, k]; }).filter(function (p) { return p[0].orden !== p[1]; });
    try {
      await Promise.all(cambios.map(function (p) { return api("/rest/v1/" + tabla + "?id=eq." + p[0].id, { method: "PATCH", body: { orden: p[1] }, prefer: "return=minimal" }); }));
      cambios.forEach(function (p) { p[0].orden = p[1]; }); huellaA = ""; pintarListas();
    } catch (e) { if (e.status !== 401) toast(AV.errorTxt(e)); cargarPromos(); }
  }

  /* ---------- diálogo de banner / tarjeta ---------- */
  var pe = null; // { tabla, item, file, urlPrev, quitar }
  function fotoPrev() {
    var X = $("dpr-prev"); X.textContent = "";
    var url = pe.file ? pe.urlPrev : (!pe.quitar && pe.item && pe.item.foto_url) || "";
    if (url && (pe.file || /^https?:\/\//.test(url))) { var i = el("img"); i.src = url; i.alt = "Vista previa de la foto"; X.appendChild(i); } else X.textContent = "Sin foto";
    $("dpr-quitar").hidden = !url;
  }
  function abrirPromo(tabla, item) {
    pe = { tabla: tabla, item: item || null, file: null, urlPrev: "", quitar: false };
    var b = tabla === "banners";
    $("dpr-msg").textContent = ""; $("dpr-tit").textContent = b ? (item ? "Editar banner" : "Nuevo banner") : (item ? "Editar tarjeta" : "Nueva tarjeta");
    $("dpr-sup").value = item && item.sup || ""; $("dpr-titulo").value = item && item.titulo || ""; $("dpr-desc").value = item && item.descripcion || ""; $("dpr-boton").value = item && item.boton || "";
    var S = $("dpr-cat"); S.textContent = "";
    var o0 = el("option", "", "Toda la tienda"); o0.value = ""; S.appendChild(o0);
    ord(D().cats).forEach(function (c) { var o = el("option", "", c.nombre); o.value = c.id; S.appendChild(o); });
    S.value = item && item.categoria_id != null ? String(item.categoria_id) : "";
    if (S.value !== (item && item.categoria_id != null ? String(item.categoria_id) : "")) S.value = ""; // la categoría ya no existe
    $("dpr-c1").value = colorOk(item && item.color1, "#4f82c4"); $("dpr-c2").value = colorOk(item && item.color2, "#2f55a4");
    $("dpr-osc").checked = !!(item && item.letra_oscura); $("dpr-on").checked = item ? !!item.on : true; $("dpr-hasta").value = item && item.hasta || "";
    $("dpr-fotobox").hidden = !b; $("dpr-foto").value = ""; fotoPrev();
    $("dpr-borrar").hidden = !item; $("d-promo").returnValue = ""; $("d-promo").showModal();
  }
  $("pr-nban").onclick = function () { abrirPromo("banners", null); };
  $("pr-ntar").onclick = function () { abrirPromo("tarjetas", null); };
  $("dpr-elegir").onclick = function () { $("dpr-foto").click(); };
  $("dpr-quitar").onclick = function () { if (pe.urlPrev) URL.revokeObjectURL(pe.urlPrev); pe.file = null; pe.urlPrev = ""; pe.quitar = true; $("dpr-foto").value = ""; fotoPrev(); };
  $("dpr-foto").onchange = function () {
    var f = this.files && this.files[0], M = $("dpr-msg"); if (!f) return; M.textContent = "";
    if (!/^image\//.test(f.type)) { M.textContent = "Ese archivo no es una foto. Elige una imagen JPG, PNG o WebP."; this.value = ""; return; }
    if (pe.urlPrev) URL.revokeObjectURL(pe.urlPrev);
    pe.file = f; pe.urlPrev = URL.createObjectURL(f); pe.quitar = false; fotoPrev();
  };
  $("d-promo").addEventListener("close", function () { if (pe && pe.urlPrev) { URL.revokeObjectURL(pe.urlPrev); pe.urlPrev = ""; } });
  $("f-promo").addEventListener("submit", async function (e) {
    var v = e.submitter && e.submitter.value; if (v === "no") return; e.preventDefault();
    var M = $("dpr-msg"), B = $("dpr-ok"); M.textContent = "";
    if (v === "borrar") {
      if (!(await confirma("¿Borrar «" + (pe.item.titulo || "este elemento") + "»?", "Se quita de la tienda. No se puede deshacer."))) return;
      try { await api("/rest/v1/" + pe.tabla + "?id=eq." + pe.item.id, { method: "DELETE", prefer: "return=minimal" }); $("d-promo").close(); toast("Borrado"); await cargarPromos(); }
      catch (er) { if (er.status !== 401) M.textContent = AV.errorTxt(er); }
      return;
    }
    var titulo = $("dpr-titulo").value.trim(), fe = leeFecha($("dpr-hasta").value);
    if (!titulo) { M.textContent = "Escribe el título."; return; }
    if (titulo.length > 80) { M.textContent = "El título es muy largo (máximo 80 letras)."; return; }
    if (fe.error) { M.textContent = fe.error; return; }
    var cat = $("dpr-cat").value ? +$("dpr-cat").value : null;
    if (cat != null && !porId(D().cats, cat)) { M.textContent = "Elige una categoría que exista."; return; }
    var cuerpo = { on: $("dpr-on").checked, sup: $("dpr-sup").value.trim() || null, titulo: titulo, descripcion: $("dpr-desc").value.trim() || null, boton: $("dpr-boton").value.trim() || null,
      categoria_id: cat, enlace: (pe.item && pe.item.enlace) || "#tienda", color1: colorOk($("dpr-c1").value, "#4f82c4"), color2: colorOk($("dpr-c2").value, "#2f55a4"), letra_oscura: $("dpr-osc").checked, hasta: fe.v };
    B.disabled = true;
    try {
      if (pe.tabla === "banners") {
        var foto = pe.item ? pe.item.foto_url : null;
        if (pe.quitar) foto = null;
        if (pe.file) { try { foto = await AV.subirFoto(pe.file); } catch (er) { if (er.foto || er.amigable) { M.textContent = er.amigable || "No se pudo subir la foto. Inténtalo de nuevo o guarda sin foto."; B.disabled = false; return; } throw er; } pe.file = null; }
        cuerpo.foto_url = foto || null;
      }
      var lista = pe.tabla === "banners" ? P.ban : P.tar;
      if (pe.item) await api("/rest/v1/" + pe.tabla + "?id=eq." + pe.item.id, { method: "PATCH", body: cuerpo, prefer: "return=minimal" });
      else { cuerpo.orden = sigOrden(lista); await api("/rest/v1/" + pe.tabla, { method: "POST", body: cuerpo, prefer: "return=minimal" }); }
      var nuevo = !pe.item; $("d-promo").close(); toast(nuevo ? "Creado" : "Cambios guardados"); await cargarPromos();
    } catch (er) { if (er.status !== 401) M.textContent = AV.errorTxt(er); }
    B.disabled = false;
  });

  /* ---------- buscador de productos (descuentos y «lo más vendido») ---------- */
  function buscador(inp, res, elegidos, alElegir, tope) {
    function pintar() {
      var q = norm(inp.value.trim()); res.textContent = "";
      if (!q) return;
      var sel = elegidos(), n = 0;
      todosProductos().forEach(function (p) {
        if (n >= 30 || sel.indexOf(p.id) >= 0 || norm(p.n).indexOf(q) < 0) return;
        n++; var b = el("button", "", p.n); b.type = "button"; b.dataset.id = p.id;
        b.onclick = function () { if (tope && sel.length >= tope) return; alElegir(p.id); inp.value = ""; pintar(); };
        res.appendChild(b);
      });
      if (!n) res.appendChild(el("p", "vacio", "Ningún producto coincide."));
    }
    inp.oninput = pintar;
    return pintar;
  }
  function pintarElegidos(cont, ids, quitar) {
    cont.textContent = "";
    ids.forEach(function (id) {
      var p = porId(D().prods, id), f = el("div", "eleg"), s = el("span", "", p ? nombreProd(p) : "(producto borrado)");
      var x = el("button", "ico", "✕"); x.type = "button"; x.title = "Quitar"; x.setAttribute("aria-label", "Quitar " + (p ? nombreProd(p) : "producto borrado")); x.onclick = function () { quitar(id); };
      f.appendChild(s); f.appendChild(x); cont.appendChild(f);
    });
  }

  /* ---------- diálogo de descuento ---------- */
  var de = null; // { item, prods:[ids] }
  function opcCats(S, elegido) {
    S.textContent = ""; var o0 = el("option", "", "Elige…"); o0.value = ""; S.appendChild(o0);
    ord(D().cats).forEach(function (c) { var o = el("option", "", c.nombre); o.value = c.id; S.appendChild(o); });
    S.value = elegido != null && porId(D().cats, elegido) ? String(elegido) : "";
  }
  function opcGrupos(S, elegido) {
    S.textContent = ""; var o0 = el("option", "", "Elige…"); o0.value = ""; S.appendChild(o0);
    ord(D().cats).forEach(function (c) {
      var og = el("optgroup"); og.label = c.nombre;
      ord(D().grupos.filter(function (g) { return g.categoria_id === c.id; })).forEach(function (g) { var o = el("option", "", g.nombre); o.value = g.id; og.appendChild(o); });
      if (og.children.length) S.appendChild(og);
    });
    S.value = elegido != null && porId(D().grupos, elegido) ? String(elegido) : "";
  }
  function ajustaDesc() {
    var t = $("dd-tipo").value, a = $("dd-aplica").value;
    $("dd-valbox").hidden = t !== "%"; $("dd-catbox").hidden = a !== "cat"; $("dd-grupobox").hidden = a !== "grupo"; $("dd-prodbox").hidden = a !== "prod";
  }
  function pintarProdsDesc() { pintarElegidos($("dd-elegidos"), de.prods, function (id) { de.prods = de.prods.filter(function (x) { return x !== id; }); pintarProdsDesc(); $("dd-buscar").oninput(); }); }
  buscador($("dd-buscar"), $("dd-res"), function () { return de ? de.prods : []; }, function (id) { de.prods.push(id); pintarProdsDesc(); });
  function abrirDesc(d) {
    de = { item: d || null, prods: d && d.producto_ids ? d.producto_ids.filter(function (id) { return porId(D().prods, id); }) : [] };
    $("dd-msg").textContent = ""; $("dd-tit").textContent = d ? "Editar descuento" : "Nuevo descuento";
    opcCats($("dd-cat"), d && d.categoria_id); opcGrupos($("dd-grupo"), d && d.grupo_id);
    $("dd-tipo").value = d ? d.tipo : "%"; $("dd-valor").value = d && d.valor != null ? d.valor : "";
    $("dd-aplica").value = d && d.categoria_id != null ? "cat" : d && d.grupo_id != null ? "grupo" : d && d.producto_ids && d.producto_ids.length ? "prod" : "cat";
    $("dd-etiqueta").value = d && d.etiqueta || ""; $("dd-on").checked = d ? !!d.on : true; $("dd-hasta").value = d && d.hasta || "";
    $("dd-buscar").value = ""; $("dd-res").textContent = ""; pintarProdsDesc(); ajustaDesc();
    $("dd-borrar").hidden = !d; $("d-desc").returnValue = ""; $("d-desc").showModal();
  }
  $("pr-ndes").onclick = function () { abrirDesc(null); };
  $("dd-tipo").onchange = ajustaDesc; $("dd-aplica").onchange = ajustaDesc;
  $("f-desc").addEventListener("submit", async function (e) {
    var v = e.submitter && e.submitter.value; if (v === "no") return; e.preventDefault();
    var M = $("dd-msg"), B = $("dd-ok"); M.textContent = "";
    if (v === "borrar") {
      if (!(await confirma("¿Borrar este descuento?", "Deja de aplicarse en la tienda. No se puede deshacer."))) return;
      try { await api("/rest/v1/descuentos?id=eq." + de.item.id, { method: "DELETE", prefer: "return=minimal" }); $("d-desc").close(); toast("Descuento borrado"); await cargarPromos(); }
      catch (er) { if (er.status !== 401) M.textContent = AV.errorTxt(er); }
      return;
    }
    var tipo = $("dd-tipo").value, a = $("dd-aplica").value, fe = leeFecha($("dd-hasta").value), valor = null;
    if (tipo === "%") {
      var t = $("dd-valor").value.trim();
      if (!/^\d+$/.test(t) || +t < 1 || +t > 90) { M.textContent = "El porcentaje debe ser un número entero de 1 a 90."; return; }
      valor = +t;
    }
    var cuerpo = { on: $("dd-on").checked, tipo: tipo, valor: valor, categoria_id: null, grupo_id: null, producto_ids: [], etiqueta: $("dd-etiqueta").value.trim() || null, hasta: fe.v };
    if (a === "cat") { var c = +$("dd-cat").value; if (!porId(D().cats, c)) { M.textContent = "Elige a qué categoría se aplica."; return; } cuerpo.categoria_id = c; }
    else if (a === "grupo") { var g = +$("dd-grupo").value; if (!porId(D().grupos, g)) { M.textContent = "Elige a qué grupo se aplica."; return; } cuerpo.grupo_id = g; }
    else { if (!de.prods.length) { M.textContent = "Elige al menos un producto."; return; } cuerpo.producto_ids = de.prods.slice(); }
    if (fe.error) { M.textContent = fe.error; return; }
    B.disabled = true;
    try {
      if (de.item) await api("/rest/v1/descuentos?id=eq." + de.item.id, { method: "PATCH", body: cuerpo, prefer: "return=minimal" });
      else { cuerpo.orden = sigOrden(P.des); await api("/rest/v1/descuentos", { method: "POST", body: cuerpo, prefer: "return=minimal" }); }
      var nuevo = !de.item; $("d-desc").close(); toast(nuevo ? "Descuento creado" : "Descuento actualizado"); await cargarPromos();
    } catch (er) { if (er.status !== 401) M.textContent = AV.errorTxt(er); }
    B.disabled = false;
  });

  /* ---------- lo más vendido ---------- */
  var mv = { modo: "auto", lista: [] };
  function pintarMv() {
    var g = P.mv || {}, vivos = (g.lista || []).filter(function (id) { return porId(D().prods, id); });
    if (!mvSucio) mv = { modo: g.modo === "manual" ? "manual" : "auto", lista: vivos.slice(0, MAX_MV) };
    pintarMvUI();
  }
  var mvSucio = false;
  function pintarMvUI() {
    [].forEach.call($("mv-modo").children, function (b) { b.setAttribute("aria-pressed", b.dataset.m === mv.modo ? "true" : "false"); });
    $("mv-ayuda").textContent = mv.modo === "auto"
      ? "Se eligen solos los 4 productos que más se vendieron en los últimos 30 días. Si hay menos de 4, se completan con esta lista."
      : "Se muestran los productos de esta lista, en este orden (máximo " + MAX_MV + ").";
    pintarElegidos($("mv-elegidos"), mv.lista, function (id) { mv.lista = mv.lista.filter(function (x) { return x !== id; }); mvSucio = true; pintarMvUI(); });
    if (!mv.lista.length) $("mv-elegidos").appendChild(el("p", "vacio", "La lista está vacía."));
    $("mv-buscar").oninput();
  }
  [].forEach.call($("mv-modo").children, function (b) { b.onclick = function () { mv.modo = b.dataset.m; mvSucio = true; pintarMvUI(); }; });
  buscador($("mv-buscar"), $("mv-res"), function () { return mv.lista; }, function (id) { if (mv.lista.length >= MAX_MV) return; mv.lista.push(id); mvSucio = true; pintarMvUI(); }, MAX_MV);
  $("mv-ok").onclick = async function () {
    var M = $("mv-msg"), B = this; M.textContent = "";
    if (mv.lista.length > MAX_MV) { M.textContent = "La lista admite máximo " + MAX_MV + " productos."; return; }
    if (mv.modo === "manual" && !mv.lista.length) { M.textContent = "En modo manual elige al menos un producto."; return; }
    B.disabled = true;
    try { await guardaAjuste("mas_vendidos", { modo: mv.modo, lista: mv.lista.slice() }); mvSucio = false; huellaA = ""; toast("Lo más vendido guardado"); await cargarPromos(); }
    catch (e) { if (e.status !== 401) M.textContent = AV.errorTxt(e); }
    B.disabled = false;
  };
  AV.promos = { cargar: cargarPromos, vencida: vencida, datos: function () { return P; } };
})();

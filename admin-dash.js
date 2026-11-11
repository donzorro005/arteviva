/* ARTE VIVA · Panel · tablero de Inicio: costos, meta, pedidos por despachar, embudo, lo más vendido y precios bajos.
   Los costos y la meta viven en tablas privadas (supabase/etapa5-panel.sql). Si faltan, el resto del panel sigue igual. */
(function () {
  "use strict";
  var C = window.AVCalc, AV = window.AV, el = AV.el, api = AV.api, $ = function (i) { return document.getElementById(i); };
  var E = { costos: {}, ajustes: { meta: 0, margen: 20 }, fijos: [], visitas: [], catalogo: [], faltaSql: false, cargado: false, errores: {} }, periodoTop = "mes";

  function mesHoy() { return AV.hoy().slice(0, 7); }
  function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }
  function vacio(cont, txt, accion, fn) {
    var p = el("p", "vacio", txt); cont.appendChild(p);
    if (accion) { var d = el("div"); d.style.textAlign = "center"; var b = el("button", "btn o sm", accion); b.type = "button"; b.onclick = fn; d.appendChild(b); cont.appendChild(d); }
  }
  function aplanar(cat) {
    var l = [];
    ((cat && cat.categorias) || []).forEach(function (k) { (k.g || []).forEach(function (g) { (g.l || []).forEach(function (p) {
      var n = (g.k || "") + p.d;
      if (g.sz) (p.v || []).forEach(function (v) { l.push({ n: n + " – " + v.d, p: v.p }); }); else l.push({ n: n, p: p.p });
    }); }); });
    return l;
  }
  // Una tabla que no existe responde 404 (o 400 con la columna): quiere decir que falta correr el SQL.
  function faltaTabla(e) { return e && (e.status === 404 || e.status === 400); }

  async function cargar() {
    var desde = C.mesMas(mesHoy(), -1) + "-01", errores = {}, faltaSql = false;
    var guarda = function (clave, promesa) { return promesa.catch(function (e) { if (e.status === 401) throw e; if (faltaTabla(e) && (clave === "costos" || clave === "ajustes")) faltaSql = true; else errores[clave] = true; return null; }); };
    var r = await Promise.all([
      guarda("costos", api("/rest/v1/costos?select=clave,costo")),
      guarda("ajustes", api("/rest/v1/panel_ajustes?select=clave,valor")),
      guarda("visitas", api("/rest/v1/visitas?select=*&dia=gte." + desde)),
      guarda("catalogo", api("/rest/v1/rpc/catalogo_publico", { method: "POST", body: {} }))
    ]);
    if (r[0]) { E.costos = {}; r[0].forEach(function (x) { E.costos[x.clave] = x.costo; }); }
    if (r[1]) {
      var aj = function (k) { return (r[1].filter(function (x) { return x.clave === k; })[0] || {}).valor; };
      E.ajustes = Object.assign({ meta: 0, margen: 20 }, aj("panel")); E.fijos = aj("fijos") || [];
    }
    if (r[2]) E.visitas = r[2];
    if (r[3]) E.catalogo = aplanar(r[3]);
    E.faltaSql = faltaSql; E.errores = errores; E.cargado = true;
  }

  /* ---------- pintar ---------- */
  function pintar() {
    if (!E.cargado) { ["dsp", "meta", "emb", "catm", "top", "bajos"].forEach(function (i) { $(i).textContent = ""; $(i).appendChild(el("p", "vacio", "Cargando…")); }); return; }
    var D = AV.datos();
    pintarAviso(D); pintarDespacho(D); pintarMeta(D); pintarEmbudo(D); pintarCatalogo(D); pintarTop(D); pintarBajos();
  }
  function gananciaMes(D) { return C.gananciaReal(D.pedidos, D.gastos, mesHoy(), E.costos, C.totalFijos(E.fijos)); }
  function pintarAviso(D) {
    var A = $("dash-av"); A.textContent = ""; A.hidden = true;
    if (E.faltaSql) { A.hidden = false; A.textContent = "Para ver la ganancia real, la meta y las fechas de entrega, falta correr supabase/etapa5-panel.sql en Supabase."; return; }
    var G = gananciaMes(D), partes = [];
    if (G.sinCosto.length) partes.push(plural(G.sinCosto.length, "producto vendido sin costo registrado", "productos vendidos sin costo registrado"));
    if (G.sinDetalle) partes.push(plural(G.sinDetalle, "venta sin detalle de productos", "ventas sin detalle de productos"));
    if (!partes.length) return;
    A.hidden = false; A.appendChild(el("span", "", partes.join(" y ") + ": la ganancia es aproximada. "));
    var b = el("button", "btn o sm", "Completar costos"); b.type = "button"; b.onclick = abrirCostos; A.appendChild(b);
  }

  function filaPedido(cont, p, marca, cls) {
    var l = el("div", "li"), iz = el("div"), de = el("div", "dash-acc"), items = (p.items || []).map(function (i) { return i.q + " x " + C.nombreBase(i.n); }).join(", ");
    var t = el("b", "", p.nombre || "Sin nombre"); iz.appendChild(t);
    iz.appendChild(el("div", "mu", [C.money(p.total), p.entrega, items].filter(Boolean).join(" · ")));
    if (marca) de.appendChild(el("span", "tag " + cls, marca));
    if (!E.faltaSql) { var f = el("button", "btn o sm", "Fecha"); f.type = "button"; f.setAttribute("aria-label", "Fecha de entrega de " + (p.nombre || "este pedido")); f.onclick = function () { fechaEntrega(p); }; de.appendChild(f); }
    var v = el("button", "btn o sm", "Ver"); v.type = "button"; v.setAttribute("aria-label", "Ver pedido de " + (p.nombre || "este cliente")); v.onclick = function () { AV.verPedido(p.id); }; de.appendChild(v);
    l.appendChild(iz); l.appendChild(de); cont.appendChild(l);
  }
  function pintarDespacho(D) {
    var L = $("dsp"), R = C.porDespachar(D.pedidos, AV.hoy()); L.textContent = "";
    var total = R.atrasados.length + R.hoy.length + R.manana.length + R.luego.length + R.sinFecha.length;
    if (!total) { vacio(L, "No hay pedidos por despachar.", "Agregar venta", function () { $("b-venta").click(); }); return; }
    R.atrasados.forEach(function (p) { filaPedido(L, p, "Atrasado", "t-ve"); });
    R.hoy.forEach(function (p) { filaPedido(L, p, "Hoy", "t-pe"); });
    R.manana.forEach(function (p) { filaPedido(L, p, "Mañana", "t-ma"); });
    R.luego.forEach(function (p) { filaPedido(L, p, String(p.fecha_entrega).slice(8, 10) + "/" + String(p.fecha_entrega).slice(5, 7), "t-ca"); });
    R.sinFecha.forEach(function (p) { filaPedido(L, p, "Sin fecha", "t-ca"); });
  }
  function fechaEntrega(p) {
    var D = $("d-entrega"); $("de-txt").textContent = (p.nombre || "Sin nombre") + " · " + C.money(p.total); $("de-fecha").value = p.fecha_entrega ? String(p.fecha_entrega).slice(0, 10) : AV.hoy(); $("de-msg").textContent = "";
    $("f-entrega").onsubmit = async function (e) {
      var v = e.submitter && e.submitter.value; if (v === "no") return; e.preventDefault();
      var f = v === "quitar" ? null : $("de-fecha").value;
      if (v !== "quitar" && !f) { $("de-msg").textContent = "Elige una fecha."; return; }
      try { await api("/rest/v1/pedidos?id=eq." + p.id, { method: "PATCH", body: { fecha_entrega: f }, prefer: "return=minimal" }); D.close(); AV.toast(f ? "Fecha guardada" : "Fecha quitada"); await AV.recargar(); }
      catch (er) { if (er.status !== 401) $("de-msg").textContent = faltaTabla(er) ? "Falta correr supabase/etapa5-panel.sql en Supabase." : AV.errorTxt(er); }
    };
    D.returnValue = ""; D.showModal();
  }

  function pintarMeta(D) {
    var M = $("meta"), R = C.resumenMes(D.pedidos, D.gastos, mesHoy(), AV.hoy()), P = C.metaProgreso(R.ventas, R.nVentas, E.ajustes.meta); M.textContent = "";
    if (E.faltaSql) { M.appendChild(el("p", "vacio", "Falta correr supabase/etapa5-panel.sql en Supabase.")); return; }
    if (!P) { vacio(M, "Ponte una meta de ventas para este mes.", "Poner meta", abrirMeta); M.appendChild(el("p", "s mu", "Proyección del mes: " + C.money(R.proyeccion))); return; }
    var num = el("b", "dash-num", C.money(R.ventas)); M.appendChild(num); M.appendChild(el("span", "mu", " de " + C.money(E.ajustes.meta) + " · " + P.pct + "%"));
    var bar = el("div", "dash-bar"), i = el("i"); i.style.width = P.pct + "%"; i.style.background = "var(--gr)"; bar.setAttribute("role", "progressbar"); bar.setAttribute("aria-valuenow", P.pct); bar.setAttribute("aria-valuemin", 0); bar.setAttribute("aria-valuemax", 100); bar.setAttribute("aria-label", "Avance de la meta"); bar.appendChild(i); M.appendChild(bar);
    M.appendChild(el("p", "", !P.falta ? "¡Llegaste a la meta de este mes!" : "Te faltan " + C.money(P.falta) + (P.pedidos ? ", unos " + plural(P.pedidos, "pedido", "pedidos") + " según tu ticket promedio de " + C.money(P.ticket) + "." : ".")));
    M.appendChild(el("p", "mu", "Proyección del mes: " + C.money(R.proyeccion)));
    var b = el("button", "btn o sm", "Cambiar meta"); b.type = "button"; b.onclick = abrirMeta; M.appendChild(b);
  }
  function abrirMeta() {
    var D = $("d-meta"); $("dm-meta").value = E.ajustes.meta || ""; $("dm-margen").value = E.ajustes.margen; $("dm-msg").textContent = "";
    D.returnValue = ""; D.showModal();
  }
  async function guardarMeta(e) {
    if (e.submitter && e.submitter.value === "no") return; e.preventDefault();
    var meta = Math.round(+$("dm-meta").value || 0), margen = Math.round(+$("dm-margen").value);
    if (meta < 0 || !(margen >= 0 && margen <= 100)) { $("dm-msg").textContent = "Revisa la meta y el margen (de 0 a 100)."; return; }
    try { await api("/rest/v1/panel_ajustes", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { clave: "panel", valor: Object.assign({}, E.ajustes, { meta: meta, margen: margen }) } }); E.ajustes = Object.assign({}, E.ajustes, { meta: meta, margen: margen }); $("d-meta").close(); AV.toast("Meta guardada"); pintar(); }
    catch (er) { if (er.status !== 401) $("dm-msg").textContent = faltaTabla(er) ? "Falta correr supabase/etapa5-panel.sql en Supabase." : AV.errorTxt(er); }
  }

  function pintarEmbudo(D) {
    var L = $("emb"), R = C.embudo(E.visitas, D.pedidos, mesHoy()); L.textContent = "";
    if (E.errores.visitas) { L.appendChild(el("p", "vacio", "No se pudieron cargar las visitas.")); return; }
    if (!R.visitas && !R.pedidos) { vacio(L, "Todavía no hay visitas ni pedidos este mes. Comparte tu tienda.", "Ver mis enlaces", function () { AV.mostrar("cuentas"); }); return; }
    var max = Math.max(R.visitas, R.tienda, R.pedidos, R.completados, 1);
    [["Visitas", R.visitas, null, "var(--li)"], ["Entraron a la tienda", R.tienda, null, "var(--bl)"], ["Pedidos", R.pedidos, R.montoPedidos, "var(--ye)"], ["Completados", R.completados, R.montoCompletados, "var(--gr)"]].forEach(function (x) {
      var f = el("div", "dash-emb"), t = el("div", "dash-fila"); t.appendChild(el("span", "", x[0])); t.appendChild(el("b", "", x[1] + (x[2] != null ? " · " + C.money(x[2]) : ""))); f.appendChild(t);
      var bar = el("div", "dash-bar"), i = el("i"); i.style.width = Math.round(x[1] / max * 100) + "%"; i.style.background = x[3]; bar.appendChild(i); f.appendChild(bar); L.appendChild(f);
    });
    if (R.pedidos) L.appendChild(el("p", "mu", "Completaste " + R.completados + " de " + plural(R.pedidos, "pedido", "pedidos") + " de la tienda" + (R.cancelados ? " y " + plural(R.cancelados, "se canceló", "se cancelaron") : "") + "."));
  }
  function pintarCatalogo(D) {
    var L = $("catm"), R = C.resumenVisitasMes(E.visitas, D.pedidos, mesHoy()); L.textContent = "";
    if (E.errores.visitas) { L.appendChild(el("p", "vacio", "No se pudieron cargar las visitas.")); return; }
    [["Visitas", R.visitas], ["Clics a WhatsApp", R.whatsapp], ["Ventas desde la tienda", R.ventas], ["% que compró", R.conversion == null ? "—" : R.conversion + "%"]].forEach(function (x) {
      var l = el("div", "dash-fila li"); l.appendChild(el("span", "", x[0])); l.appendChild(el("b", "", String(x[1]))); L.appendChild(l);
    });
    var b = el("button", "btn o sm", "Ver detalle"); b.type = "button"; b.style.marginTop = "8px"; b.onclick = function () { AV.mostrar("cuentas"); }; L.appendChild(b);
  }

  function rangoTop() {
    var h = AV.hoy(), m = mesHoy();
    return periodoTop === "mes" ? [m + "-01", h] : periodoTop === "tres" ? [C.mesMas(m, -2) + "-01", h] : [h.slice(0, 4) + "-01-01", h];
  }
  function pintarTop(D) {
    var L = $("top"), r = rangoTop(), T = C.top(D.pedidos, r[0], r[1], E.costos, 5); L.textContent = "";
    if (!T.vendidos.length && !T.clientes.length) { vacio(L, "Aún no hay ventas en este período."); return; }
    var col = function (tit, lista, txt, sinTxt) {
      var c = el("div"); c.appendChild(el("h4", "dash-h", tit));
      if (!lista.length) c.appendChild(el("p", "mu", sinTxt));
      lista.forEach(function (x) { var l = el("div", "dash-fila li"); l.appendChild(el("span", "", x.n)); l.appendChild(el("b", "", txt(x))); c.appendChild(l); });
      L.appendChild(c);
    };
    col("Más vendidos", T.vendidos, function (x) { return x.unidades + " u."; }, "Sin datos.");
    col("Más ganancia", T.ganancia, function (x) { return C.money(x.ganancia); }, "Faltan los costos de lo vendido.");
    col("Mejores clientes", T.clientes, function (x) { return C.money(x.monto); }, "Las ventas no tienen nombre de cliente.");
  }

  function pintarBajos() {
    var L = $("bajos"); L.textContent = "";
    if (E.faltaSql) { L.appendChild(el("p", "vacio", "Falta correr supabase/etapa5-panel.sql en Supabase.")); return; }
    if (E.errores.catalogo) { L.appendChild(el("p", "vacio", "No se pudo cargar el catálogo.")); return; }
    var B = C.preciosBajos(E.catalogo, E.costos, E.ajustes.margen), sin = E.catalogo.filter(function (x) { return x.p > 0 && E.costos[x.n] == null; }).length;
    if (!B.length) L.appendChild(el("p", "vacio", "Ningún producto con costo está por debajo de " + E.ajustes.margen + " % de margen."));
    B.slice(0, 8).forEach(function (x) {
      var l = el("div", "li"), iz = el("div"); iz.appendChild(el("b", "", x.n)); iz.appendChild(el("div", "mu", "Precio " + C.money(x.p) + " · costo " + C.money(x.costo)));
      var de = el("div", "dash-acc"); de.appendChild(el("span", "tag t-ve", x.margen + " %"));
      var b = el("button", "btn o sm", "Editar precio"); b.type = "button"; b.setAttribute("aria-label", "Editar precio de " + x.n); b.onclick = function () { AV.mostrar("tienda"); }; de.appendChild(b);
      l.appendChild(iz); l.appendChild(de); L.appendChild(l);
    });
    if (B.length > 8) L.appendChild(el("p", "mu", "Y " + (B.length - 8) + " más."));
    if (sin) L.appendChild(el("p", "mu", plural(sin, "producto sin costo", "productos sin costo") + ": no se pueden revisar."));
    var d = el("div", "dash-acc"); d.style.marginTop = "8px"; d.style.justifyContent = "flex-start";
    var c = el("button", "btn o sm", "Editar costos"); c.type = "button"; c.onclick = abrirCostos; d.appendChild(c);
    var k = el("button", "btn o sm", "Calcular un precio"); k.type = "button"; k.onclick = function () { AV.costeo.abrir(); }; d.appendChild(k);
    var m = el("button", "btn o sm", "Cambiar margen mínimo"); m.type = "button"; m.onclick = abrirMeta; d.appendChild(m); L.appendChild(d);
  }

  /* ---------- costos ---------- */
  function abrirCostos() {
    if (E.faltaSql) { AV.toast("Falta correr supabase/etapa5-panel.sql en Supabase."); return; }
    $("dco-buscar").value = ""; $("dco-solo").checked = false; pintarCostos(); var D = $("d-costos"); D.returnValue = ""; D.showModal();
  }
  function norm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function pintarCostos() {
    var L = $("dco-lista"), q = norm($("dco-buscar").value.trim()), solo = $("dco-solo").checked; L.textContent = "";
    var lst = E.catalogo.filter(function (x) { return (!q || norm(x.n).indexOf(q) >= 0) && (!solo || E.costos[x.n] == null); });
    $("dco-info").textContent = plural(E.catalogo.filter(function (x) { return E.costos[x.n] == null; }).length, "producto sin costo", "productos sin costo");
    if (!lst.length) { L.appendChild(el("p", "vacio", "Ningún producto coincide.")); return; }
    lst.forEach(function (x) {
      var f = el("div", "li"), iz = el("div"), inp = el("input"), mg = el("div", "mu"); iz.appendChild(el("b", "", x.n));
      var pinta = function () { var c = E.costos[x.n]; mg.textContent = "Precio " + (x.p > 0 ? C.money(x.p) : "sin precio") + (c != null && x.p > 0 ? " · margen " + Math.round((x.p - c) / x.p * 100) + " %" : ""); };
      pinta(); iz.appendChild(mg);
      inp.type = "number"; inp.min = "0"; inp.step = "1"; inp.inputMode = "numeric"; inp.className = "dash-costo"; inp.placeholder = "₡"; inp.setAttribute("aria-label", "Costo de " + x.n); inp.value = E.costos[x.n] != null ? E.costos[x.n] : "";
      inp.onchange = async function () { await guardarCosto(x.n, inp); pinta(); };
      var de = el("div", "dash-acc"), cal = el("button", "btn o sm", "Calcular"); cal.type = "button"; cal.setAttribute("aria-label", "Calcular precio de " + x.n); cal.onclick = function () { $("d-costos").close(); AV.costeo.abrir(x.n); };
      de.appendChild(inp); de.appendChild(cal); f.appendChild(iz); f.appendChild(de); L.appendChild(f);
    });
  }
  async function guardarCosto(n, inp) {
    var txt = inp.value.trim(), v = Math.round(+txt), M = $("dco-msg"); M.textContent = "";
    if (txt && !(v >= 0)) { M.textContent = "Escribe un costo válido."; return; }
    try {
      if (!txt) { await api("/rest/v1/costos?clave=eq." + encodeURIComponent(n), { method: "DELETE", prefer: "return=minimal" }); delete E.costos[n]; }
      else { await api("/rest/v1/costos", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { clave: n, costo: v, actualizado: new Date().toISOString() } }); E.costos[n] = v; }
      AV.toast("Costo guardado");
    } catch (er) { if (er.status !== 401) M.textContent = AV.errorTxt(er); }
  }

  /* ---------- costos fijos del mes ---------- */
  function pintarFijos() {
    var L = $("fijos"); L.textContent = "";
    if (!E.cargado) { L.appendChild(el("p", "vacio", "Cargando…")); return; }
    if (E.faltaSql) { L.appendChild(el("p", "vacio", "Falta correr supabase/etapa5-panel.sql en Supabase.")); return; }
    if (!E.fijos.length) { vacio(L, "Anota lo que pagas todos los meses, como luz, internet o alquiler.", "Agregar costos fijos", abrirFijos); return; }
    E.fijos.forEach(function (f) { var l = el("div", "dash-fila li"); l.appendChild(el("span", "", f.n)); l.appendChild(el("b", "", C.money(f.monto) + " /mes")); L.appendChild(l); });
    var t = el("div", "dash-fila li"); t.appendChild(el("b", "", "Total mensual")); t.appendChild(el("b", "", C.money(C.totalFijos(E.fijos)))); L.appendChild(t);
    var b = el("button", "btn o sm", "Editar"); b.type = "button"; b.style.marginTop = "8px"; b.onclick = abrirFijos; L.appendChild(b);
  }
  function filaFijo(f) {
    var r = el("div", "dash-fijo"), n = el("input"), m = el("input"), x = el("button", "ico", "✕");
    n.maxLength = 60; n.placeholder = "Luz, internet, alquiler…"; n.autocomplete = "off"; n.setAttribute("aria-label", "Nombre del costo fijo"); n.value = f ? f.n : "";
    m.type = "number"; m.min = "0"; m.step = "1"; m.inputMode = "numeric"; m.placeholder = "₡"; m.setAttribute("aria-label", "Monto por mes"); m.value = f ? f.monto : "";
    n.oninput = m.oninput = totalDialogo;
    x.type = "button"; x.title = "Quitar"; x.setAttribute("aria-label", "Quitar este costo fijo"); x.onclick = function () { r.remove(); totalDialogo(); };
    r.appendChild(n); r.appendChild(m); r.appendChild(x); $("df-lista").appendChild(r);
    return n;
  }
  function totalDialogo() {
    var t = 0; [].forEach.call($("df-lista").children, function (r) { t += Math.round(+r.children[1].value) || 0; });
    $("df-total").textContent = C.money(t);
  }
  function abrirFijos() {
    if (E.faltaSql) { AV.toast("Falta correr supabase/etapa5-panel.sql en Supabase."); return; }
    $("df-lista").textContent = ""; $("df-msg").textContent = "";
    E.fijos.forEach(filaFijo); if (!E.fijos.length) filaFijo(null);
    totalDialogo(); var D = $("d-fijos"); D.returnValue = ""; D.showModal();
  }
  async function guardarFijos(e) {
    if (e.submitter && e.submitter.value === "no") return; e.preventDefault();
    var M = $("df-msg"), lista = [], mal = false; M.textContent = "";
    [].forEach.call($("df-lista").children, function (r) {
      var n = r.children[0].value.trim(), t = r.children[1].value.trim(), v = Math.round(+t);
      if (!n && !t) return;
      if (!n || !t || !(v >= 0)) { mal = true; return; }
      lista.push({ n: n, monto: v });
    });
    if (mal) { M.textContent = "Cada costo fijo necesita nombre y monto."; return; }
    try { await api("/rest/v1/panel_ajustes", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { clave: "fijos", valor: lista } }); E.fijos = lista; $("d-fijos").close(); AV.toast("Costos fijos guardados"); AV.repintar(); }
    catch (er) { if (er.status !== 401) M.textContent = faltaTabla(er) ? "Falta correr supabase/etapa5-panel.sql en Supabase." : AV.errorTxt(er); }
  }

  /* ---------- arranque ---------- */
  $("f-fijos").addEventListener("submit", guardarFijos);
  $("df-add").onclick = function () { filaFijo(null).focus(); };
  $("f-meta").addEventListener("submit", guardarMeta);
  $("dco-buscar").oninput = pintarCostos; $("dco-solo").onchange = pintarCostos;
  $("d-costos").addEventListener("close", function () { AV.repintar(); });
  [].forEach.call(document.querySelectorAll("#top-rango button"), function (b) { b.onclick = function () { periodoTop = b.dataset.r; [].forEach.call(b.parentNode.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); pintarTop(AV.datos()); }; });
  var abrirMas = function () { var D = $("d-mas"); D.returnValue = ""; D.showModal(); };
  $("b-mas").onclick = abrirMas; $("b-mas-pc").onclick = abrirMas;
  $("dmas-venta").onclick = function () { $("d-mas").close(); $("b-venta").click(); };
  $("dmas-gasto").onclick = function () { $("d-mas").close(); $("b-gasto").click(); };

  AV.dash = { cargar: cargar, pintar: pintar, costos: function () { return E.faltaSql || !E.cargado ? null : E.costos; }, fechaEntrega: fechaEntrega, faltaSql: function () { return E.faltaSql; }, totalFijos: function () { return C.totalFijos(E.fijos); }, pintarFijos: pintarFijos,
    catalogo: function () { return E.catalogo; }, costosMapa: function () { return E.costos; }, fijos: function () { return E.fijos; }, ajustes: function () { return E.ajustes; },
    guardarCosto: async function (n, v) { await api("/rest/v1/costos", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { clave: n, costo: v, actualizado: new Date().toISOString() } }); E.costos[n] = v; },
    guardarAjustes: async function (c) { var v = Object.assign({}, E.ajustes, c); await api("/rest/v1/panel_ajustes", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { clave: "panel", valor: v } }); E.ajustes = v; } };
})();

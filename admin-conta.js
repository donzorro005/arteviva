/* ARTE VIVA · Panel · Contabilidad: período, resumen y ventas. Las tablas privadas salen de supabase/etapa7-contabilidad.sql. */
(function () {
  "use strict";
  var C = window.AVCalc, AV = window.AV, el = AV.el, api = AV.api, $ = function (i) { return document.getElementById(i); };
  var FALTA = "Falta correr supabase/etapa7-contabilidad.sql en Supabase.";
  // Tasas iniciales: CCSS 2026 según KPMG Costa Rica; el dueño debe confirmarlas. El INS depende de su póliza.
  var TASAS = { ccss_patronal: 26.83, ccss_trabajador: 10.83, ins: 0, aguinaldo: 8.33, vacaciones: 4.16, patrono_desde: null };
  var E = { categorias: [], compromisos: [], omisiones: [], pagos: [], tasas: TASAS, faltaSql: false, cargado: false, error: false }, vista = "resumen", modo = "mes";

  function hoyMes() { return AV.hoy().slice(0, 7); }
  function nombreMes(m) { return ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][+m.slice(5, 7) - 1] + " " + m.slice(0, 4); }
  function faltaTabla(e) { return e && (e.status === 404 || e.status === 400); }

  async function cargar() {
    var falta = false, error = false, guarda = function (p) { return p.catch(function (e) { if (e.status === 401) throw e; if (faltaTabla(e)) falta = true; else error = true; return null; }); };
    var r = await Promise.all([
      guarda(api("/rest/v1/categorias_gasto?select=*&order=orden,id")), guarda(api("/rest/v1/compromisos?select=*&order=id")), guarda(api("/rest/v1/omisiones?select=*")),
      guarda(api("/rest/v1/panel_ajustes?select=clave,valor&clave=eq.tasas")),
      // Sin límite de fecha: un pago de hace años no debe volver a salir como pendiente.
      guarda(api("/rest/v1/gastos?select=compromiso_id,linea,periodo,monto&or=(compromiso_id.not.is.null,linea.not.is.null)"))
    ]);
    if (r[0]) E.categorias = r[0]; if (r[1]) E.compromisos = r[1]; if (r[2]) E.omisiones = r[2];
    if (r[3]) E.tasas = Object.assign({}, TASAS, r[3][0] ? r[3][0].valor : {});
    if (r[4]) E.pagos = r[4].filter(function (g) { return g.compromiso_id != null || g.linea; });
    E.faltaSql = falta; E.error = error; E.cargado = true;
  }

  // Período elegido arriba: un mes o un año (hasta el mes actual).
  function rango() {
    if (modo === "anio") {
      var a = $("k-anio").value || AV.hoy().slice(0, 4), fin = a === AV.hoy().slice(0, 4) ? hoyMes() : a + "-12";
      return { desde: a + "-01-01", hasta: a + "-12-31", meses: C.periodosEntre(a + "-01", fin, "mensual"), etiqueta: "el año " + a };
    }
    var m = $("k-mes").value || hoyMes();
    return { desde: m + "-01", hasta: m + "-" + C.diasMes(m), meses: [m], etiqueta: nombreMes(m) };
  }
  function dentro(f, R) { f = String(f).slice(0, 10); return f >= R.desde && f <= R.hasta; }
  function categoriasOk() { return E.faltaSql || !E.cargado || !E.categorias.length ? null : E.categorias; }
  function provision(mes) { return E.faltaSql ? 0 : C.provisionAguinaldo(E.compromisos, mes, E.tasas, E.pagos, E.omisiones) + C.aguinaldoExcedente(AV.datos().gastos, E.compromisos, mes, E.tasas, E.pagos, E.omisiones); }
  function ganancia(meses) {
    var D = AV.datos(), costos = (AV.dash && AV.dash.costos()) || {}, t = { ventas: 0, ganancia: 0, sinCosto: 0, sinDetalle: 0 };
    meses.forEach(function (m) { var G = C.gananciaReal(D.pedidos, D.gastos, m, costos, categoriasOk(), provision(m)); t.ventas += G.ventas; t.ganancia += G.ganancia; t.sinCosto += G.sinCosto.length; t.sinDetalle += G.sinDetalle; });
    t.margen = t.ventas ? Math.round(t.ganancia / t.ventas * 100) : 0;
    return t;
  }

  /* ---------- pintar ---------- */
  function pintar() {
    var A = $("k-aviso"); A.hidden = !(E.faltaSql || E.error); A.textContent = E.faltaSql ? FALTA : E.error ? "No se pudieron cargar algunos datos. Revisa tu internet y toca Actualizar." : "";
    if (!E.cargado) { $("k-kpis").textContent = "Cargando…"; return; }
    pintarResumen(); pintarVentas(); if (AV.contaPagos) AV.contaPagos.pintar();
  }
  function kpi(cont, cls, tit, val, sub) { var d = el("div", "k " + cls); d.appendChild(el("small", "", tit)); d.appendChild(el("b", "", val)); d.appendChild(el("em", "", sub)); cont.appendChild(d); }
  function pintarResumen() {
    var R = rango(), D = AV.datos(), G = ganancia(R.meses), K = $("k-kpis"), gs = D.gastos.filter(function (g) { return dentro(g.fecha, R); }), total = 0, porTipo = {};
    gs.forEach(function (g) { total += g.monto; var t = g.tipo || "otro"; porTipo[t] = (porTipo[t] || 0) + g.monto; });
    var pend = AV.contaPagos ? AV.contaPagos.pendientes() : [], debe = pend.reduce(function (t, x) { return t + x.monto; }, 0);
    var prev = R.meses.length === 1 ? ganancia([C.mesMas(R.meses[0], -1)]) : null, vr = prev ? C.variacion(G.ventas, prev.ventas) : null;
    K.textContent = "";
    kpi(K, "gn", "Ganancia real", C.money(G.ganancia), G.ventas ? "margen " + G.margen + "%" + (G.sinCosto || G.sinDetalle ? " · aproximada" : "") : "sin ventas aún");
    kpi(K, "v", "Ingresos", C.money(G.ventas), vr == null ? R.etiqueta : (vr >= 0 ? "▲ " : "▼ ") + Math.abs(vr) + "% vs mes anterior");
    kpi(K, "ga", "Gastos pagados", C.money(total), gs.length + (gs.length === 1 ? " gasto" : " gastos"));
    kpi(K, "pr", "Por pagar", C.money(debe), pend.length + (pend.length === 1 ? " pendiente" : " pendientes"));
    var T = $("k-tipos"); T.textContent = "";
    if (!gs.length) T.appendChild(el("p", "vacio", "No hay gastos en " + R.etiqueta + "."));
    [["variable", "Variables"], ["fijo", "Fijos"], ["salario", "Salarios"], ["otro", "Otros"]].forEach(function (x) { if (!porTipo[x[0]]) return; var l = el("div", "dash-fila li"); l.appendChild(el("span", "", x[1])); l.appendChild(el("b", "", C.money(porTipo[x[0]]))); T.appendChild(l); });
    avisoCompras(R);
  }
  // Si en los últimos meses se compra mucho más material del que se carga a lo vendido, los costos pueden estar incompletos.
  function avisoCompras(R) {
    var A = $("k-compras"), cats = categoriasOk(), D = AV.datos(), costos = (AV.dash && AV.dash.costos()) || {}; A.hidden = true; A.textContent = "";
    if (!cats) return;
    var fin = R.meses[R.meses.length - 1], comprado = 0, cargado = 0;
    [0, -1, -2].forEach(function (d) { var r = C.comprasVsCargado(D.gastos, D.pedidos, C.mesMas(fin, d), costos, cats); comprado += r.comprado; cargado += r.cargado; });
    if (comprado <= cargado * 1.5 || comprado === 0) return;
    A.hidden = false; A.textContent = "En 3 meses compraste " + C.money(comprado) + " de materiales y se cargó " + C.money(cargado) + " a lo vendido. Si esas compras no están en el costo de tus productos, la ganancia real sale más alta de lo que es.";
  }
  function pintarVentas() {
    var R = rango(), L = $("k-vlista"), T = $("k-vtot"), lst = AV.datos().pedidos.filter(function (p) { return C.esVenta(p) && dentro(p.fecha, R); }), tot = 0; L.textContent = "";
    lst.forEach(function (p) { tot += C.montoVenta(p); });
    T.textContent = C.money(tot) + " · " + lst.length + (lst.length === 1 ? " venta" : " ventas") + " en " + R.etiqueta;
    if (!lst.length) { L.appendChild(el("p", "vacio", "No hay ventas en " + R.etiqueta + ".")); return; }
    lst.forEach(function (p) {
      var l = el("div", "li"), iz = el("div"), de = el("div", "dash-acc");
      iz.appendChild(el("b", "", p.nombre || "Sin nombre"));
      iz.appendChild(el("div", "mu", [String(p.fecha).slice(8, 10) + "/" + String(p.fecha).slice(5, 7), p.pago || "Sin forma de pago", p.origen === "manual" ? "A mano" : "Tienda", p.registrado_por ? "Anotó " + p.registrado_por : ""].filter(Boolean).join(" · ")));
      de.appendChild(el("b", "", C.money(C.montoVenta(p))));
      if (p.origen === "manual") {
        var e = el("button", "btn o sm", "Editar"); e.type = "button"; e.setAttribute("aria-label", "Editar venta de " + (p.nombre || "sin nombre")); e.onclick = function () { AV.abrirVenta(p); }; de.appendChild(e);
        var b = el("button", "btn o sm", "Borrar"); b.type = "button"; b.setAttribute("aria-label", "Borrar venta de " + (p.nombre || "sin nombre")); b.onclick = function () { AV.borrarVenta(p); }; de.appendChild(b);
      }
      l.appendChild(iz); l.appendChild(de); L.appendChild(l);
    });
  }

  function ponerVista(v) {
    vista = v; [].forEach.call($("k-vistas").children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === v ? "true" : "false"); });
    ["resumen", "ventas", "gastos", "pagar", "planilla", "reportes", "ajustes"].forEach(function (x) { $("k-" + x).hidden = x !== v; });
    $("k-periodo").hidden = ["resumen", "ventas", "gastos"].indexOf(v) < 0;
  }
  function repintar() { AV.repintar(); }
  function irMes(m) { modo = "mes"; $("k-mes").value = m; marcaModo(); repintar(); }
  function marcaModo() { [].forEach.call($("k-rango").children, function (b) { b.setAttribute("aria-pressed", b.dataset.r === modo ? "true" : "false"); }); $("k-mes").hidden = modo !== "mes"; $("k-anio").hidden = modo !== "anio"; }

  var anio = +AV.hoy().slice(0, 4); [anio, anio - 1].forEach(function (a) { $("k-anio").appendChild(el("option", "", String(a))); });
  $("k-mes").value = hoyMes();
  $("k-mes").addEventListener("change", repintar); $("k-anio").addEventListener("change", repintar);
  [].forEach.call($("k-vistas").children, function (b) { b.onclick = function () { ponerVista(b.dataset.v); }; });
  [].forEach.call($("k-rango").children, function (b) { b.onclick = function () { modo = b.dataset.r; marcaModo(); repintar(); }; });
  $("k-venta").onclick = function () { AV.abrirVenta(null); };

  AV.conta = { cargar: cargar, pintar: pintar, rango: rango, irMes: irMes, ponerVista: ponerVista, categorias: function () { return E.categorias; }, categoriasOk: categoriasOk, compromisos: function () { return E.compromisos; }, omisiones: function () { return E.omisiones; }, pagos: function () { return E.pagos; },
    tasas: function () { return E.tasas; }, ponerTasas: function (t) { E.tasas = t; }, faltaSql: function () { return E.faltaSql; }, cargado: function () { return E.cargado; }, provision: provision, FALTA: FALTA, faltaTabla: faltaTabla, nombreMes: nombreMes,
    fijos: function () { return E.compromisos.filter(function (c) { return c.tipo === "fijo" && c.activo; }).map(function (c) { return { n: c.nombre, monto: c.monto }; }); } };
})();

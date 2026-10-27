/* ARTE VIVA · Panel · Cuentas · Visitas (etapa 3): visitas por día, semana y mes, de dónde llegan,
   cuántas terminan en compra, los enlaces con ?de= y el QR para imprimir. */
(function () {
  "use strict";
  var AV = window.AV, C = window.AVCalc;
  if (!AV || !C) return;
  var api = AV.api, el = AV.el, toast = AV.toast, $ = function (i) { return document.getElementById(i); };
  var VIS = [], hay = false, cargando = false, vista = "mes", modo = "mes";
  var N = { dia: 14, semana: 8, mes: 6 }, COLOR = { ig: "#cf5c7c", fb: "#4f82c4", qr: "#e8b93f", otros: "#6f8a3a" };
  var NOMBRE = { ig: "Instagram", fb: "Facebook", qr: "QR", otros: "Otros" };
  var MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  /* ---------- datos ---------- */
  async function traer(desde) {
    var todo = [], tanda = 1000;
    for (var ini = 0; ; ini += tanda) {
      var r = await api("/rest/v1/visitas?select=*&dia=gte." + desde + "&order=dia.asc", { rango: ini + "-" + (ini + tanda - 1) }) || [];
      todo = todo.concat(r);
      if (r.length < tanda) return todo;
    }
  }
  async function cargar() {
    if (cargando) return;
    cargando = true;
    try { VIS = await traer(C.mesMas(AV.hoy().slice(0, 7), -13) + "-01"); hay = true; pintar(); }
    catch (e) {
      if (e.status !== 401) {
        if (hay) toast("No se pudieron actualizar las visitas. Revisa tu internet.");
        else { var G = $("vi-graf"); G.textContent = ""; G.appendChild(el("p", "vacio", "No se pudieron cargar las visitas. Revisa tu internet y vuelve a entrar.")); }
      }
    } finally { cargando = false; }
  }

  /* ---------- pintar ---------- */
  function etiqueta(clave) {
    if (modo === "mes") return MESES[+clave.slice(5, 7) - 1];
    return +clave.slice(8, 10) + " " + MESES[+clave.slice(5, 7) - 1];
  }
  function grafica(serie) {
    var G = $("vi-graf"); G.textContent = "";
    if (!serie.some(function (s) { return s.total; })) { G.appendChild(el("p", "vacio", "Todavía no hay visitas en este período. Se empiezan a contar cuando subas la página nueva.")); return; }
    var ns = "http://www.w3.org/2000/svg", W = 360, H = 170, base = 140, max = Math.max.apply(null, serie.map(function (s) { return s.total; }).concat([1]));
    var svg = document.createElementNS(ns, "svg"); svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", "graf"); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", serie.map(function (s) { return etiqueta(s.clave) + ": " + s.total + " visitas"; }).join("; "));
    var col = W / serie.length, bw = Math.min(28, col * 0.6), cada = Math.ceil(serie.length / 7);
    serie.forEach(function (s, i) {
      var x = i * col + (col - bw) / 2, y = base;
      C.ORIGENES.forEach(function (o) {
        if (!s[o]) return;
        var h = s[o] / max * (base - 10), r = document.createElementNS(ns, "rect");
        y -= h; r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", bw); r.setAttribute("height", h); r.setAttribute("fill", COLOR[o]); svg.appendChild(r);
      });
      if (s.total) { var n = document.createElementNS(ns, "text"); n.setAttribute("x", x + bw / 2); n.setAttribute("y", y - 3); n.setAttribute("text-anchor", "middle"); n.setAttribute("fill", "rgba(239,233,219,.8)"); n.setAttribute("font-size", "10"); n.textContent = s.total; svg.appendChild(n); }
      if (i % cada === 0 || i === serie.length - 1) { var t = document.createElementNS(ns, "text"); t.setAttribute("x", x + bw / 2); t.setAttribute("y", H - 10); t.setAttribute("text-anchor", "middle"); t.setAttribute("fill", "rgba(239,233,219,.65)"); t.setAttribute("font-size", "10"); t.textContent = etiqueta(s.clave); svg.appendChild(t); }
    });
    G.appendChild(svg);
  }
  function delta(a, b) { if (!b) return "—"; var p = Math.round((a - b) / b * 100); return (p >= 0 ? "▲ " : "▼ ") + Math.abs(p) + "% vs mes anterior"; }
  function pintar() {
    var hoy = AV.hoy(), serie = C.visitasPor(VIS, modo, hoy, N[modo]);
    $("vi-tit").textContent = { dia: "Visitas por día (últimos 14 días)", semana: "Visitas por semana (últimas 8)", mes: "Visitas por mes (últimos 6)" }[modo];
    grafica(serie);
    var T = $("vi-tot"); T.textContent = "";
    var tot = { ig: 0, fb: 0, qr: 0, otros: 0 }; serie.forEach(function (s) { C.ORIGENES.forEach(function (o) { tot[o] += s[o]; }); });
    C.ORIGENES.forEach(function (o) { var t = el("span", "tag", NOMBRE[o] + ": " + tot[o]); t.style.background = COLOR[o]; t.style.color = o === "qr" ? "#141210" : "#fff"; T.appendChild(t); });
    // resumen del mes con comparación
    var mes = hoy.slice(0, 7), R = C.resumenVisitasMes(VIS, AV.datos().pedidos || [], mes), A = C.resumenVisitasMes(VIS, AV.datos().pedidos || [], C.mesMas(mes, -1));
    $("vi-mes-tit").textContent = "Este mes (" + ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][+mes.slice(5, 7) - 1] + ")";
    var K = $("vi-kpis"); K.textContent = "";
    [["v", "Visitas", String(R.visitas), delta(R.visitas, A.visitas)],
     ["ga", "Abrieron la tienda", String(R.tienda), R.visitas ? Math.round(R.tienda / R.visitas * 100) + "% de las visitas" : "—"],
     ["gn", "Tocaron WhatsApp", String(R.whatsapp), R.tienda ? Math.round(R.whatsapp / R.tienda * 100) + "% de quienes abrieron la tienda" : "—"],
     ["pr", "Compraron", R.conversion == null ? "—" : String(R.conversion).replace(".", ",") + "%", R.ventas + (R.ventas === 1 ? " venta completada" : " ventas completadas") + " de la tienda"]].forEach(function (k) {
      var d = el("div", "k " + k[0]); d.appendChild(el("small", "", k[1])); d.appendChild(el("b", "", k[2])); d.appendChild(el("em", "", k[3])); K.appendChild(d);
    });
  }

  /* ---------- enlaces y QR ---------- */
  var BASE = location.origin + location.pathname.replace(/[^/]*$/, "");
  function enlaces() {
    var L = $("vi-links"); L.textContent = "";
    [["ig", "Instagram (bio)"], ["fb", "Facebook"], ["qr", "QR de paquetes y volantes"]].forEach(function (x) {
      var u = BASE + "?de=" + x[0], f = el("div", "vi-link");
      f.appendChild(el("b", "", x[1])); f.appendChild(el("code", "", u));
      var b = el("button", "btn o sm", "Copiar"); b.type = "button";
      b.onclick = function () {
        var hecho = function () { toast("Enlace copiado"); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(hecho, function () { toast("No se pudo copiar. Mantén presionado el enlace para copiarlo."); });
        else toast("Mantén presionado el enlace para copiarlo.");
      };
      f.appendChild(b); L.appendChild(f);
    });
  }
  var qrHecho = false;
  function qr() {
    if (qrHecho) return;
    if (!window.qrcode) { $("vi-qr").textContent = "Cargando QR…"; return; }
    var q = window.qrcode(0, "M"); q.addData(BASE + "?de=qr"); q.make();
    var n = q.getModuleCount(), cel = 10, margen = 4, lado = (n + margen * 2) * cel, cv = document.createElement("canvas");
    cv.width = lado; cv.height = lado; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "Código QR que lleva a " + BASE + "?de=qr");
    var g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, lado, lado); g.fillStyle = "#141210";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + margen) * cel, (r + margen) * cel, cel, cel);
    cv.style.width = "220px"; var Q = $("vi-qr"); Q.textContent = ""; Q.appendChild(cv);
    $("vi-qr-baja").href = cv.toDataURL("image/png");
    qrHecho = true;
  }

  /* ---------- vistas de Cuentas: Por mes | Visitas ---------- */
  function ponerVista(v) {
    vista = v;
    [].forEach.call($("c-vistas").children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === v ? "true" : "false"); });
    $("c-v-mes").hidden = v !== "mes"; $("c-v-vis").hidden = v !== "vis";
    if (v === "vis") { enlaces(); qr(); cargar(); }
  }
  [].forEach.call($("c-vistas").children, function (b) { b.onclick = function () { ponerVista(b.dataset.v); }; });
  [].forEach.call($("vi-modo").children, function (b) {
    b.onclick = function () { modo = b.dataset.m; [].forEach.call($("vi-modo").children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); if (hay) pintar(); };
  });
  window.addEventListener("load", function () { if (vista === "vis") qr(); });
  AV.visitas = { alMostrar: function () { if (!$("s-cuentas").hidden && vista === "vis") { qr(); cargar(); } }, abrir: function () { ponerVista("vis"); } };
})();

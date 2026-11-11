/* ARTE VIVA · Panel · calculadora de costeo: de materiales, tiempo y costos fijos a un precio sugerido. */
(function () {
  "use strict";
  var C = window.AVCalc, AV = window.AV, el = AV.el, $ = function (i) { return document.getElementById(i); };
  var modo = "pct";

  function num(id) { return +$(id).value || 0; }
  function fijosMarcados() {
    var t = 0; [].forEach.call($("dk-fijos").querySelectorAll("input:checked"), function (c) { t += +c.dataset.monto || 0; });
    return t;
  }
  function totalExtras() {
    var t = 0; [].forEach.call($("dk-extras").children, function (r) { t += Math.round(+r.children[1].value) || 0; });
    return t;
  }
  function calcular() {
    return C.costeo({ materiales: num("dk-mat"), extras: totalExtras(), fijos: fijosMarcados(), horasMes: num("dk-horas"), minutos: num("dk-min"), modo: modo, valor: num("dk-valor") });
  }
  function pintar() {
    var R = calcular(), umbral = AV.dash.ajustes().margen, hrs = num("dk-horas") > 0 ? num("dk-horas") : 160;
    $("dk-reparto").textContent = C.money(fijosMarcados()) + " ÷ " + hrs + " h = " + C.money(R.fijoHora) + " por hora · en esta pieza " + C.money(R.fijoPieza);
    $("dk-directo").textContent = C.money(R.directo); $("dk-fijo").textContent = C.money(R.fijoPieza); $("dk-base").textContent = C.money(R.base);
    $("dk-gan").textContent = C.money(R.ganancia); $("dk-margen").textContent = R.margen + " %"; $("dk-precio").textContent = C.money(R.precio);
    var E = $("dk-estado"), bajo = R.margen < umbral, perdida = R.ganancia < 0;
    E.textContent = perdida ? "Pierdes dinero a este precio" : bajo ? "Margen bajo (menos de " + umbral + " %)" : "Margen saludable";
    E.className = "tag " + (perdida || bajo ? "t-ve" : "t-co");
    var p = producto(); $("dk-actual").textContent = p && p.p > 0 ? "Precio actual en la tienda: " + C.money(p.p) : "Este producto no tiene precio en la tienda.";
  }
  function producto() { var n = $("dk-prod").value; return AV.dash.catalogo().filter(function (x) { return x.n === n; })[0]; }
  function ponModo(m) {
    modo = m; [].forEach.call($("dk-modo").children, function (b) { b.setAttribute("aria-pressed", b.dataset.m === m ? "true" : "false"); });
    $("dk-rango").hidden = m !== "pct";
    $("dk-valor-l").textContent = m === "pct" ? "Margen de ganancia (%)" : m === "monto" ? "Ganancia por pieza (₡)" : "Precio final (₡)";
    var R = calcular();
    $("dk-valor").value = m === "pct" ? Math.max(0, Math.min(90, Math.round(R.margen))) : m === "monto" ? Math.max(0, R.ganancia) : R.precio;
    $("dk-rango").value = $("dk-valor").value; pintar();
  }
  function filaExtra(x) {
    var r = el("div", "dash-fijo"), n = el("input"), m = el("input"), b = el("button", "ico", "✕");
    n.maxLength = 60; n.placeholder = "Empaque, flete…"; n.autocomplete = "off"; n.setAttribute("aria-label", "Nombre del gasto extra"); n.value = x ? x.n : "";
    m.type = "number"; m.min = "0"; m.step = "1"; m.inputMode = "numeric"; m.placeholder = "₡"; m.setAttribute("aria-label", "Monto del gasto extra"); m.value = x ? x.monto : ""; m.oninput = pintar;
    b.type = "button"; b.title = "Quitar"; b.setAttribute("aria-label", "Quitar este gasto extra"); b.onclick = function () { r.remove(); pintar(); };
    r.appendChild(n); r.appendChild(m); r.appendChild(b); $("dk-extras").appendChild(r); return n;
  }
  function elegir() {
    var p = producto(), c = p ? AV.dash.costosMapa()[p.n] : null; $("dk-mat").value = c != null ? c : "";
    // Con precio en la tienda arranca en «Precio final»: así se ve el margen real mientras se llenan los costos.
    if (p && p.p > 0) { ponModo("precio"); $("dk-valor").value = p.p; pintar(); } else { ponModo("pct"); $("dk-valor").value = $("dk-rango").value = 40; pintar(); }
  }
  function abrir(nombre) {
    if (AV.dash.faltaSql()) { AV.toast("Falta correr supabase/etapa5-panel.sql en Supabase."); return; }
    var S = $("dk-prod"), cat = AV.dash.catalogo(); S.textContent = ""; $("dk-msg").textContent = "";
    if (!cat.length) { AV.toast("No se pudo cargar el catálogo."); return; }
    cat.forEach(function (x) { var o = el("option", "", x.n); o.value = x.n; S.appendChild(o); });
    if (nombre) S.value = nombre;
    $("dk-horas").value = AV.dash.ajustes().horas || 160; $("dk-min").value = ""; $("dk-extras").textContent = "";
    var F = $("dk-fijos"); F.textContent = "";
    if (!AV.dash.fijos().length) F.appendChild(el("p", "mu", "Aún no tienes costos fijos. Anótalos en Gastos."));
    AV.dash.fijos().forEach(function (f) {
      var l = el("label", "chk dash-fila"), iz = el("span"), c = el("input"); c.type = "checkbox"; c.checked = true; c.dataset.monto = f.monto; c.onchange = pintar;
      iz.appendChild(c); iz.appendChild(document.createTextNode(" " + f.n)); l.appendChild(iz); l.appendChild(el("b", "", C.money(f.monto) + " /mes")); F.appendChild(l);
    });
    elegir(); var D = $("d-costeo"); D.returnValue = ""; D.showModal();
  }
  async function guardar(e) {
    var v = e.submitter && e.submitter.value; if (v === "no") return; e.preventDefault();
    var M = $("dk-msg"), R = calcular(), p = producto(), horas = Math.round(num("dk-horas")); M.textContent = "";
    if (!p) { M.textContent = "Elige un producto."; return; }
    try {
      await AV.dash.guardarCosto(p.n, R.directo);
      if (horas > 0 && horas !== AV.dash.ajustes().horas) await AV.dash.guardarAjustes({ horas: horas });
      $("d-costeo").close(); AV.toast("Costo guardado: " + C.money(R.directo)); AV.repintar();
    } catch (er) { if (er.status !== 401) M.textContent = AV.errorTxt(er); }
  }

  $("f-costeo").addEventListener("submit", guardar);
  $("dk-prod").onchange = elegir;
  ["dk-mat", "dk-min", "dk-horas"].forEach(function (i) { $(i).oninput = pintar; });
  $("dk-valor").oninput = function () { if (modo === "pct") $("dk-rango").value = this.value; pintar(); };
  $("dk-rango").oninput = function () { $("dk-valor").value = this.value; pintar(); };
  $("dk-add").onclick = function () { filaExtra(null).focus(); };
  [].forEach.call($("dk-modo").children, function (b) { b.onclick = function () { ponModo(b.dataset.m); }; });
  AV.costeo = { abrir: abrir };
})();

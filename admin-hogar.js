/* ARTE VIVA · Panel · Contabilidad · Hogar: salario de la casa, % de reinversión, gastos fijos de la casa y ahorro.
   Se guarda en panel_ajustes (clave "hogar"), que solo ven los administradores. No necesita SQL nuevo. */
(function () {
  "use strict";
  var C = window.AVCalc, AV = window.AV, K = AV && AV.conta;
  if (!C || !AV || !K) return;
  var el = AV.el, api = AV.api, $ = function (i) { return document.getElementById(i); };
  var BASE = { nombre: "", salario: 0, reinversion: 20, casa: [], meses: {} };
  var H = null, cargando = false, editandoCasa = null, mesForm = "";

  function entero(t) { t = String(t == null ? "" : t).replace(/[₡\s.,]/g, ""); if (!t) return null; return /^\d{1,10}$/.test(t) ? +t : NaN; }
  function nombreSal() { return (H && H.nombre) || "Salario de la casa"; }
  function salarioDe(m) { var x = H.meses && H.meses[m]; return x && typeof x.salario === "number" ? x.salario : (H.salario || 0); }

  async function cargar() {
    if (cargando) return; cargando = true;
    try {
      var r = await api("/rest/v1/panel_ajustes?select=valor&clave=eq.hogar");
      H = Object.assign({}, BASE, r && r[0] ? r[0].valor : {});
      if (!Array.isArray(H.casa)) H.casa = []; if (!H.meses || typeof H.meses !== "object") H.meses = {};
    } catch (e) { if (e.status !== 401) { H = H || Object.assign({}, BASE); $("h-msg").textContent = "No se pudieron cargar los datos del hogar. Revisa tu internet y toca Actualizar."; } }
    finally { cargando = false; }
    editandoCasa = null; pintar();
  }
  async function guardar(v) {
    await api("/rest/v1/panel_ajustes", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { clave: "hogar", valor: v } });
    H = v;
  }

  // Fijos del negocio del mes: los pagados ya están restados en la ganancia real; los pendientes se apartan aquí.
  function fijosNegocio(m) {
    var comps = K.compromisos().filter(function (c) { return c.tipo === "fijo"; }), ids = comps.map(function (c) { return c.id; });
    var pagado = K.pagos().filter(function (g) { return ids.indexOf(g.compromiso_id) >= 0 && g.periodo === m; }).reduce(function (t, g) { return t + (g.monto || 0); }, 0);
    var pend = (AV.contaPagos ? AV.contaPagos.pendientes() : []).filter(function (x) { return x.compromiso && x.compromiso.tipo === "fijo" && x.periodo === m; }).reduce(function (t, x) { return t + (x.monto || 0); }, 0);
    return { pagado: pagado, pendiente: pend };
  }

  function calcular() {
    var R = K.rango(), t = { ganancia: 0, reinversion: 0, aporte: 0, salario: 0, disponible: 0, casa: 0, negocio: 0, fijos: 0, ahorro: 0, pagadoNegocio: 0, aprox: false };
    R.meses.forEach(function (m) {
      var G = K.ganancia([m]), F = fijosNegocio(m);
      var P = C.presupuestoHogar({ ganancia: G.ganancia, reinversion: H.reinversion, salario: salarioDe(m), casa: H.casa, negocioPendiente: F.pendiente });
      ["ganancia", "reinversion", "aporte", "salario", "disponible", "casa", "negocio", "fijos", "ahorro"].forEach(function (k) { t[k] += P[k]; });
      t.pagadoNegocio += F.pagado; if (G.sinCosto || G.sinDetalle) t.aprox = true;
    });
    t.R = R; t.pct = Math.min(100, Math.max(0, +H.reinversion || 0));
    return t;
  }

  function kpi(cont, cls, tit, val, sub) { var d = el("div", "k " + cls); d.appendChild(el("small", "", tit)); d.appendChild(el("b", "", val)); d.appendChild(el("em", "", sub)); cont.appendChild(d); }
  function fila(cont, txt, monto, cls) { var l = el("div", "dash-fila li" + (cls ? " " + cls : "")); l.appendChild(el("span", "", txt)); l.appendChild(el("b", "", monto)); cont.appendChild(l); return l; }

  function pintar() {
    if (!H) { $("h-kpis").textContent = "Cargando…"; cargar(); return; }
    if (!K.cargado()) { $("h-kpis").textContent = "Cargando…"; return; }
    var T = calcular(), Kp = $("h-kpis"), Rp = $("h-reparto"), neg = function (v) { return (v < 0 ? "− " : "") + C.money(Math.abs(v)); };
    Kp.textContent = ""; Rp.textContent = "";
    kpi(Kp, "pr", "Reinversión", C.money(T.reinversion), T.pct + "% de la ganancia, para materiales");
    kpi(Kp, "v", "Disponible para la casa", neg(T.disponible), "negocio + " + nombreSal().toLowerCase());
    kpi(Kp, "ga", "Gastos fijos", C.money(T.fijos), T.negocio ? "casa + negocio por pagar" : "de la casa");
    kpi(Kp, T.ahorro >= 0 ? "gn" : "ga", T.ahorro >= 0 ? "Ahorro" : "Faltante", C.money(Math.abs(T.ahorro)), T.ahorro >= 0 ? "lo que sobra en " + T.R.etiqueta : "faltó para cubrir los fijos");
    $("h-tit").textContent = "Cómo se reparte · " + T.R.etiqueta;
    fila(Rp, "Ganancia real de ARTE VIVA" + (T.aprox ? " (aproximada)" : ""), neg(T.ganancia), T.ganancia < 0 ? "h-neg" : "");
    fila(Rp, "− Reinversión en materiales (" + T.pct + "%)", C.money(T.reinversion));
    fila(Rp, "= Lo que el negocio aporta a la casa", neg(T.aporte), "h-res" + (T.aporte < 0 ? " h-neg" : ""));
    fila(Rp, "+ " + nombreSal(), C.money(T.salario));
    fila(Rp, "= Disponible para la casa", neg(T.disponible), "h-res" + (T.disponible < 0 ? " h-neg" : ""));
    fila(Rp, "− Gastos fijos de la casa", C.money(T.casa));
    if (T.negocio) fila(Rp, "− Fijos del negocio aún por pagar", C.money(T.negocio));
    fila(Rp, T.ahorro >= 0 ? "= Ahorro" : "= Faltante", neg(T.ahorro), "h-res" + (T.ahorro < 0 ? " h-neg" : ""));
    if (T.pagadoNegocio) Rp.appendChild(el("p", "s", "Los fijos del negocio ya pagados (" + C.money(T.pagadoNegocio) + ") ya están restados en la ganancia real, por eso no se restan otra vez.")).style.margin = "8px 0 0";
    if (T.ganancia <= 0 && T.R.meses.length === 1) Rp.appendChild(el("p", "s", "Sin ganancia este mes no se aparta reinversión.")).style.margin = "8px 0 0";
    pintarForm();
    if (editandoCasa === null) pintarCasa();
  }

  function pintarForm() {
    var R = K.rango(), m = R.meses.length === 1 ? R.meses[0] : null, foco = document.activeElement;
    var ids = ["h-nombre", "h-salario", "h-pct", "h-mes-sal"];
    if (ids.some(function (i) { return foco && foco.id === i; }) && mesForm === m) return; // no pisar lo que se está escribiendo
    $("h-nombre").value = H.nombre || ""; $("h-salario").value = H.salario || ""; $("h-pct").value = H.reinversion != null ? H.reinversion : "";
    $("h-mes-sal").disabled = !m; $("h-mes-lbl").textContent = m ? "Salario de " + K.nombreMes(m) + " (₡)" : "Salario de un mes (elige «Mes» arriba)";
    var x = m && H.meses[m]; $("h-mes-sal").value = x && typeof x.salario === "number" ? x.salario : "";
    mesForm = m;
  }

  $("h-guardar").onclick = async function () {
    var M = $("h-msg"), B = this, sal = entero($("h-salario").value), pct = $("h-pct").value === "" ? 0 : +$("h-pct").value, ms = entero($("h-mes-sal").value);
    M.textContent = "";
    if (isNaN(sal)) { M.textContent = "El salario debe ser un número entero de colones, sin decimales."; return; }
    if (!(pct >= 0 && pct <= 100)) { M.textContent = "La reinversión debe ser un porcentaje entre 0 y 100."; return; }
    if (isNaN(ms)) { M.textContent = "El salario de este mes debe ser un número entero de colones, o quedar vacío."; return; }
    var v = JSON.parse(JSON.stringify(H)); v.nombre = $("h-nombre").value.trim().slice(0, 40); v.salario = sal || 0; v.reinversion = Math.round(pct * 10) / 10;
    if (mesForm) { if (ms == null) delete v.meses[mesForm]; else v.meses[mesForm] = { salario: ms }; }
    B.disabled = true;
    try { await guardar(v); AV.toast("Guardado"); document.activeElement && document.activeElement.blur && document.activeElement.blur(); mesForm = ""; pintar(); }
    catch (e) { if (e.status !== 401) M.textContent = AV.errorTxt(e); }
    B.disabled = false;
  };

  /* ---------- gastos fijos de la casa ---------- */
  function pintarCasa() {
    var L = $("h-casa"), lista = editandoCasa || H.casa; L.textContent = "";
    if (!lista.length) { L.appendChild(el("p", "vacio", "Todavía no hay gastos de la casa. Toca «+ Agregar gasto de la casa».")); return; }
    lista.forEach(function (x, i) {
      var f = el("div", "h-fila"), n = el("input"), mo = el("input"), b = el("button", "btn o sm", "Quitar");
      n.maxLength = 60; n.placeholder = "Alquiler"; n.value = x.n || ""; n.setAttribute("aria-label", "Nombre del gasto " + (i + 1));
      mo.type = "text"; mo.inputMode = "numeric"; mo.placeholder = "₡"; mo.value = x.monto || ""; mo.setAttribute("aria-label", "Monto por mes de " + (x.n || "gasto " + (i + 1)));
      n.oninput = function () { empezar(); editandoCasa[i].n = n.value; }; mo.oninput = function () { empezar(); editandoCasa[i].monto = mo.value; };
      b.type = "button"; b.setAttribute("aria-label", "Quitar " + (x.n || "gasto")); b.onclick = function () { empezar(); editandoCasa.splice(i, 1); pintarCasa(); };
      f.appendChild(n); f.appendChild(mo); f.appendChild(b); L.appendChild(f);
    });
    var tot = lista.reduce(function (t, x) { var v = entero(x.monto); return t + (v > 0 ? v : 0); }, 0);
    var l = el("div", "dash-fila h-res"); l.appendChild(el("span", "", "Total por mes")); l.appendChild(el("b", "", C.money(tot))); L.appendChild(l);
  }
  function empezar() { if (editandoCasa === null) editandoCasa = H.casa.map(function (x) { return { n: x.n, monto: x.monto }; }); }
  $("h-casa-add").onclick = function () { empezar(); editandoCasa.push({ n: "", monto: "" }); pintarCasa(); var ins = $("h-casa").querySelectorAll(".h-fila input"); if (ins.length) ins[ins.length - 2].focus(); };
  $("h-casa-guardar").onclick = async function () {
    var M = $("h-cmsg"), B = this, lista = editandoCasa || H.casa, limpia = [];
    M.textContent = "";
    for (var i = 0; i < lista.length; i++) {
      var n = String(lista[i].n || "").trim(), v = entero(lista[i].monto);
      if (!n && v == null) continue;
      if (!n) { M.textContent = "Cada gasto necesita un nombre."; return; }
      if (v == null || isNaN(v)) { M.textContent = "«" + n + "»: el monto debe ser un número entero de colones."; return; }
      limpia.push({ n: n.slice(0, 60), monto: v });
    }
    var v2 = JSON.parse(JSON.stringify(H)); v2.casa = limpia; B.disabled = true;
    try { await guardar(v2); editandoCasa = null; AV.toast("Gastos de la casa guardados"); pintar(); }
    catch (e) { if (e.status !== 401) M.textContent = AV.errorTxt(e); }
    B.disabled = false;
  };

  AV.hogar = { pintar: pintar, cargar: cargar };
})();

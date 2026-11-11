/* ARTE VIVA · Panel · Contabilidad: por pagar, planilla y ajustes. */
(function () {
  "use strict";
  var C = window.AVCalc, AV = window.AV, K = AV.conta, el = AV.el, api = AV.api, $ = function (i) { return document.getElementById(i); };
  var pago = null, comp = null, cat = null;

  function etiquetaPeriodo(p) { return K.nombreMes(p.slice(0, 7)) + (p.length > 7 ? (p.slice(-1) === "1" ? " · 1.ª quincena" : " · 2.ª quincena") : ""); }
  function error(M, er) { if (er.status !== 401) M.textContent = K.faltaTabla(er) ? K.FALTA : AV.errorTxt(er); }
  function boton(txt, aria, fn, cls) { var b = el("button", cls || "btn o sm", txt); b.type = "button"; if (aria) b.setAttribute("aria-label", aria); b.onclick = fn; return b; }

  /* ---------- por pagar ---------- */
  function pendientes() {
    if (K.faltaSql() || !K.cargado()) return [];
    var hoy = AV.hoy(), T = K.tasas();
    var l = C.porPagar(K.compromisos(), K.pagos().filter(function (g) { return g.compromiso_id != null; }), K.omisiones(), hoy).map(function (x) {
      return { compromiso: x.compromiso, periodo: x.periodo, atrasado: x.atrasado, nombre: x.compromiso.nombre, monto: x.compromiso.monto };
    });
    if (T.patrono_desde) C.periodosEntre(String(T.patrono_desde).slice(0, 7), hoy.slice(0, 7), "mensual").forEach(function (m) {
      var G = C.cargasDelMes(K.compromisos(), m, T, T.patrono_desde, K.pagos(), K.omisiones()), hecho = function (k) { return K.pagos().some(function (g) { return g.linea === k && g.periodo === m; }); };
      if (G.ccss > 0 && !hecho("ccss")) l.push({ linea: "ccss", periodo: m, atrasado: m < hoy.slice(0, 7), nombre: "CCSS", monto: G.ccss, trabajador: G.ccssTrabajador });
      if (G.ins > 0 && !hecho("ins")) l.push({ linea: "ins", periodo: m, atrasado: m < hoy.slice(0, 7), nombre: "Póliza INS", monto: G.ins });
    });
    return l;
  }
  function pintarPagar() {
    var L = $("k-plista"), C2 = $("k-comps"); L.textContent = ""; C2.textContent = "";
    if (K.faltaSql()) { L.appendChild(el("p", "vacio", K.FALTA)); return; }
    var pend = pendientes();
    if (!pend.length) L.appendChild(el("p", "vacio", "No tienes nada por pagar."));
    pend.forEach(function (x) {
      var l = el("div", "li"), iz = el("div"), de = el("div", "dash-acc");
      iz.appendChild(el("b", "", x.nombre)); iz.appendChild(el("div", "mu", etiquetaPeriodo(x.periodo) + " · " + C.money(x.monto)));
      if (x.atrasado) de.appendChild(el("span", "tag t-ve", "Atrasado"));
      de.appendChild(boton("Pagado", "Pagar " + x.nombre + " de " + x.periodo, function () { abrirPago(x); }, "btn gr sm"));
      l.appendChild(iz); l.appendChild(de); L.appendChild(l);
    });
    var O = $("k-omit"); O.textContent = "";
    K.omisiones().forEach(function (o) {
      var c = K.compromisos().filter(function (x) { return x.id === o.compromiso_id; })[0], l = el("div", "li"), iz = el("div"), de = el("div", "dash-acc");
      iz.appendChild(el("b", "", c ? c.nombre : "Pago borrado")); iz.appendChild(el("div", "mu", "Omitido · " + etiquetaPeriodo(o.periodo)));
      de.appendChild(boton("Restaurar", null, function () { restaurar(o); })); l.appendChild(iz); l.appendChild(de); O.appendChild(l);
    });
    var cs = K.compromisos();
    if (!cs.length) { C2.appendChild(el("p", "vacio", "Anota lo que pagas siempre, como luz, alquiler o salarios.")); return; }
    cs.forEach(function (c) {
      var l = el("div", "li"), iz = el("div"), de = el("div", "dash-acc");
      iz.appendChild(el("b", "", c.nombre)); iz.appendChild(el("div", "mu", C.money(c.monto) + (c.frecuencia === "quincenal" ? " por quincena" : " por mes") + " · " + c.categoria));
      if (!c.activo) de.appendChild(el("span", "tag t-ca", "Inactivo"));
      de.appendChild(boton("Editar", "Editar " + c.nombre, function () { abrirComp(c); })); l.appendChild(iz); l.appendChild(de); C2.appendChild(l);
    });
  }
  async function restaurar(o) {
    try { await api("/rest/v1/omisiones?compromiso_id=eq." + o.compromiso_id + "&periodo=eq." + encodeURIComponent(o.periodo), { method: "DELETE", prefer: "return=minimal" }); AV.toast("Período restaurado"); await AV.recargar(); }
    catch (er) { if (er.status !== 401) AV.toast(AV.errorTxt(er)); }
  }
  function abrirPago(x) {
    pago = x; var D = $("d-pagado"); $("dpa-tit").textContent = x.nombre; $("dpa-sub").textContent = etiquetaPeriodo(x.periodo); $("dpa-fecha").value = AV.hoy(); $("dpa-monto").value = x.monto; $("dpa-msg").textContent = "";
    var T = K.tasas(), en = x.compromiso && x.compromiso.en_planilla && T.patrono_desde && x.periodo.slice(0, 7) >= String(T.patrono_desde).slice(0, 7);
    var planillado = x.compromiso && x.compromiso.en_planilla; $("dpa-monto-l").textContent = planillado ? "Salario bruto (₡)" : "Monto real (₡)";
    $("dpa-nota").textContent = x.linea === "ccss" ? "Incluye " + C.money(x.trabajador) + " del trabajador, que ya se contó en su salario: no se resta otra vez." : en ? "Entrégale " + C.money(C.planilla(x.compromiso.monto, T).neto) + ": se le rebaja su parte de CCSS. Aquí anota el bruto, no lo que le entregas." : "";
    $("dpa-omitir").hidden = !x.compromiso; D.returnValue = ""; D.showModal();
  }
  $("f-pagado").addEventListener("submit", async function (e) {
    var v = e.submitter && e.submitter.value, M = $("dpa-msg"), x = pago; if (v === "no") return; e.preventDefault(); M.textContent = "";
    try {
      if (v === "omitir") { if (!(await AV.confirma("¿Omitir este período?", x.nombre + " · " + etiquetaPeriodo(x.periodo) + ". Ya no saldrá por pagar; puedes restaurarlo abajo."))) return; await api("/rest/v1/omisiones", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", body: { compromiso_id: x.compromiso.id, periodo: x.periodo } }); $("d-pagado").close(); AV.toast("Período omitido"); await AV.recargar(); return; }
      var total = Math.round(+$("dpa-monto").value), fecha = $("dpa-fecha").value, monto = x.linea === "ccss" ? C.gastoCcss(total, x.trabajador) : total;
      if (!fecha || !(monto > 0)) { M.textContent = x.linea === "ccss" ? "El monto debe ser mayor que la parte del trabajador." : "La fecha y un monto mayor a cero son obligatorios."; return; }
      var categoria = x.compromiso ? x.compromiso.categoria : "Cargas sociales";
      var cuerpo = { fecha: fecha, monto: monto, categoria: categoria, tipo: x.compromiso ? x.compromiso.tipo : "salario", descripcion: x.nombre + " · " + etiquetaPeriodo(x.periodo), periodo: x.periodo, registrado_por: AV.correo() };
      if (x.compromiso) cuerpo.compromiso_id = x.compromiso.id; else cuerpo.linea = x.linea;
      await api("/rest/v1/gastos", { method: "POST", body: cuerpo, prefer: "return=minimal" }); $("d-pagado").close(); AV.toast("Pago registrado"); await AV.recargar();
    } catch (er) {
      if (er.status === 409) { $("d-pagado").close(); AV.toast("Ese pago ya estaba registrado"); await AV.recargar(); return; } // otra persona lo marcó primero
      error(M, er);
    }
  });

  /* ---------- pagos que se repiten ---------- */
  function llenarCats(S, tipo, actual) {
    S.textContent = ""; var ok = K.categorias().filter(function (c) { return (c.activo || c.nombre === actual) && (!tipo || c.tipo === tipo); });
    ok.forEach(function (c) { var o = el("option", "", c.nombre); o.value = c.nombre; S.appendChild(o); }); if (actual) S.value = actual;
  }
  function ajustaComp() { var t = $("dc2-tipo").value, q = $("dc2-frec").value === "quincenal"; llenarCats($("dc2-cat"), t, comp ? comp.categoria : t === "salario" ? "Salarios" : "Servicios"); $("dc2-qbox").hidden = !q; $("dc2-planbox").hidden = t !== "salario"; }
  function abrirComp(c, tipo) {
    if (K.faltaSql()) { AV.toast(K.FALTA); return; }
    comp = c || null; var D = $("d-comp"), hoy = AV.hoy(), t = c ? c.tipo : tipo || "fijo"; $("dc2-msg").textContent = ""; $("dc2-tit").textContent = c ? "Editar pago" : t === "salario" ? "Agregar persona" : "Agregar pago";
    $("dc2-nombre").value = c ? c.nombre : ""; $("dc2-monto").value = c ? c.monto : ""; $("dc2-tipo").value = t; $("dc2-frec").value = c ? c.frecuencia : t === "salario" ? "quincenal" : "mensual"; $("dc2-plan").checked = c ? c.en_planilla : false;
    var d = c ? c.desde : C.periodoDeFecha(hoy, "quincenal"); $("dc2-desde").value = d.slice(0, 7); $("dc2-q").value = d.length > 7 ? d.slice(-2) : "Q1";
    var bloq = !!c && K.pagos().some(function (p) { return p.compromiso_id === c.id; }); ["dc2-tipo", "dc2-frec", "dc2-desde", "dc2-q"].forEach(function (i) { $(i).disabled = bloq; }); $("dc2-nota").textContent = bloq ? "Ya tiene pagos: no se puede cambiar el tipo, la frecuencia ni el inicio." : "";
    ajustaComp(); $("dc2-off").hidden = !c; $("dc2-off").textContent = c && !c.activo ? "Reactivar" : "Desactivar"; D.returnValue = ""; D.showModal();
  }
  $("dc2-tipo").onchange = ajustaComp; $("dc2-frec").onchange = ajustaComp;
  $("f-comp").addEventListener("submit", async function (e) {
    var v = e.submitter && e.submitter.value, M = $("dc2-msg"); if (v === "no") return; e.preventDefault(); M.textContent = "";
    try {
      if (v === "off") {
        // Reactivar crea un pago nuevo desde hoy: el tiempo que estuvo inactivo no debe aparecer como atrasado.
        if (!comp.activo) await api("/rest/v1/compromisos", { method: "POST", prefer: "return=minimal", body: { nombre: comp.nombre, monto: comp.monto, tipo: comp.tipo, frecuencia: comp.frecuencia, categoria: comp.categoria, en_planilla: comp.en_planilla, desde: C.periodoDeFecha(AV.hoy(), comp.frecuencia) } });
        else await api("/rest/v1/compromisos?id=eq." + comp.id, { method: "PATCH", prefer: "return=minimal", body: { activo: false, hasta: C.periodoDeFecha(AV.hoy(), comp.frecuencia) } });
        var era = comp.activo; $("d-comp").close(); AV.toast(era ? "Pago desactivado" : "Pago reactivado"); await AV.recargar(); return;
      }
      var nombre = $("dc2-nombre").value.trim(), monto = Math.round(+$("dc2-monto").value), frec = $("dc2-frec").value, tipo = $("dc2-tipo").value, m = $("dc2-desde").value;
      if (!nombre || !(monto > 0) || !m || !$("dc2-cat").value) { M.textContent = "Nombre, categoría, inicio y un monto mayor a cero son obligatorios."; return; }
      var cuerpo = { nombre: nombre, monto: monto, tipo: tipo, frecuencia: frec, categoria: $("dc2-cat").value, en_planilla: tipo === "salario" && $("dc2-plan").checked, desde: frec === "quincenal" ? m + "-" + $("dc2-q").value : m };
      if (comp) await api("/rest/v1/compromisos?id=eq." + comp.id, { method: "PATCH", body: cuerpo, prefer: "return=minimal" }); else await api("/rest/v1/compromisos", { method: "POST", body: cuerpo, prefer: "return=minimal" });
      $("d-comp").close(); AV.toast("Guardado"); await AV.recargar();
    } catch (er) { error(M, er); }
  });

  /* ---------- planilla ---------- */
  function pintarPlanilla() {
    var L = $("k-gente"), R = $("k-cargas"), T = K.tasas(), m = AV.hoy().slice(0, 7); L.textContent = ""; R.textContent = "";
    if (K.faltaSql()) { L.appendChild(el("p", "vacio", K.FALTA)); return; }
    $("kp-patrono").value = T.patrono_desde || "";
    var ss = K.compromisos().filter(function (c) { return c.tipo === "salario" && c.activo; });
    if (!ss.length) L.appendChild(el("p", "vacio", "Agrega a las personas a las que les pagas."));
    ss.forEach(function (c) {
      var l = el("div", "li"), iz = el("div"), de = el("div", "dash-acc"), P = C.planilla(c.monto, T);
      iz.appendChild(el("b", "", c.nombre)); iz.appendChild(el("div", "mu", C.money(c.monto) + (c.frecuencia === "quincenal" ? " por quincena" : " por mes") + (c.en_planilla ? " · neto " + C.money(P.neto) : " · fuera de planilla")));
      de.appendChild(boton("Editar", "Editar " + c.nombre, function () { abrirComp(c); })); l.appendChild(iz); l.appendChild(de); L.appendChild(l);
    });
    var G = C.cargasDelMes(K.compromisos(), m, T, T.patrono_desde, K.pagos(), K.omisiones()), P = C.planilla(G.bruto, T), meses = 0;
    K.compromisos().forEach(function (c) { if (c.tipo === "salario" && c.en_planilla) meses = Math.max(meses, C.periodosEntre(String(c.desde).slice(0, 7), m, "mensual").length); });
    var E_ = el("span", "tag " + (G.estimado ? "t-pe" : "t-co"), G.estimado ? "Estimación: todavía no cuenta" : "Cuenta en la ganancia"); R.appendChild(E_);
    [["Salarios en planilla", G.bruto], ["CCSS patronal", G.ccssPatronal], ["CCSS del trabajador (sale del salario)", G.ccssTrabajador], ["Póliza INS", G.ins], ["Aguinaldo apartado este mes", P.aguinaldo], ["Vacaciones acumuladas (dato)", P.vacaciones * meses]].forEach(function (x) {
      var l = el("div", "dash-fila li"); l.appendChild(el("span", "", x[0])); l.appendChild(el("b", "", C.money(x[1]))); R.appendChild(l);
    });
  }
  async function guardarTasas(c, M) {
    var v = Object.assign({}, K.tasas(), c);
    try { await api("/rest/v1/panel_ajustes", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { clave: "tasas", valor: v } }); K.ponerTasas(v); AV.toast("Guardado"); AV.repintar(); }
    catch (er) { error(M, er); }
  }
  $("kp-patrono").onchange = function () { guardarTasas({ patrono_desde: this.value || null }, $("kp-msg")); };

  /* ---------- ajustes ---------- */
  function pintarAjustes() {
    var L = $("k-cats"), T = K.tasas(); L.textContent = "";
    if (K.faltaSql()) { L.appendChild(el("p", "vacio", K.FALTA)); return; }
    K.categorias().forEach(function (c) {
      var l = el("div", "li"), iz = el("div"), de = el("div", "dash-acc");
      iz.appendChild(el("b", "", c.nombre)); iz.appendChild(el("div", "mu", ({ variable: "Variable", fijo: "Fijo", salario: "Salario", otro: "Otro" })[c.tipo] + (c.en_costo ? " · va en el costo del producto" : " · se resta de la ganancia")));
      if (!c.activo) de.appendChild(el("span", "tag t-ca", "Inactiva"));
      de.appendChild(boton("Editar", "Editar categoría " + c.nombre, function () { abrirCat(c); })); l.appendChild(iz); l.appendChild(de); L.appendChild(l);
    });
    ["ccss_patronal", "ccss_trabajador", "ins", "aguinaldo", "vacaciones"].forEach(function (k) { if (document.activeElement !== $("kt-" + k)) $("kt-" + k).value = T[k]; });
  }
  function abrirCat(c) {
    if (K.faltaSql()) { AV.toast(K.FALTA); return; }
    cat = c || null; $("dcg-tit").textContent = c ? "Editar categoría" : "Agregar categoría"; $("dcg-msg").textContent = ""; $("dcg-nombre").value = c ? c.nombre : ""; $("dcg-tipo").value = c ? c.tipo : "variable"; $("dcg-costo").checked = c ? c.en_costo : false; $("dcg-activo").checked = c ? c.activo : true;
    $("dcg-borrar").hidden = !c; var D = $("d-cat"); D.returnValue = ""; D.showModal();
  }
  $("f-cat").addEventListener("submit", async function (e) {
    var v = e.submitter && e.submitter.value, M = $("dcg-msg"); if (v === "no") return; e.preventDefault(); M.textContent = "";
    try {
      if (v === "borrar") {
        var q = encodeURIComponent(cat.nombre), ug = await api("/rest/v1/gastos?select=id&limit=1&categoria=eq." + q), uc = await api("/rest/v1/compromisos?select=id&limit=1&categoria=eq." + q);
        if ((ug && ug.length) || (uc && uc.length)) { M.textContent = "Tiene gastos o pagos anotados: no se puede borrar. Desmarca «Activa» para que ya no aparezca."; return; }
        await api("/rest/v1/categorias_gasto?id=eq." + cat.id, { method: "DELETE", prefer: "return=minimal" }); $("d-cat").close(); AV.toast("Categoría borrada"); await AV.recargar(); return;
      }
      var nombre = $("dcg-nombre").value.trim(); if (!nombre) { M.textContent = "Escribe el nombre."; return; }
      if (K.categorias().some(function (x) { return x.nombre.toLowerCase() === nombre.toLowerCase() && (!cat || x.id !== cat.id); })) { M.textContent = "Ya existe una categoría con ese nombre."; return; }
      var cuerpo = { nombre: nombre, tipo: $("dcg-tipo").value, en_costo: $("dcg-costo").checked, activo: $("dcg-activo").checked };
      if (cat) {
        if (nombre !== cat.nombre) await api("/rest/v1/rpc/renombrar_categoria", { method: "POST", body: { viejo: cat.nombre, nuevo: nombre } });
        await api("/rest/v1/categorias_gasto?id=eq." + cat.id, { method: "PATCH", body: cuerpo, prefer: "return=minimal" });
      } else { cuerpo.orden = K.categorias().length + 1; await api("/rest/v1/categorias_gasto", { method: "POST", body: cuerpo, prefer: "return=minimal" }); }
      $("d-cat").close(); AV.toast("Categoría guardada"); await AV.recargar();
    } catch (er) { error(M, er); }
  });
  $("kt-guardar").onclick = function () {
    var c = {}, ok = true; ["ccss_patronal", "ccss_trabajador", "ins", "aguinaldo", "vacaciones"].forEach(function (k) { var n = +$("kt-" + k).value; if (!(n >= 0 && n <= 100)) ok = false; c[k] = n; });
    $("kt-msg").textContent = ok ? "" : "Cada porcentaje debe estar entre 0 y 100."; if (ok) guardarTasas(c, $("kt-msg"));
  };
  $("k-comp-add").onclick = function () { abrirComp(null, "fijo"); }; $("k-gente-add").onclick = function () { abrirComp(null, "salario"); }; $("k-cat-add").onclick = function () { abrirCat(null); };

  AV.contaPagos = { pendientes: pendientes, llenarCats: llenarCats, pintar: function () { pintarPagar(); pintarPlanilla(); pintarAjustes(); } };
})();

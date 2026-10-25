/* ARTE VIVA · Panel de administración (etapa 1: pedidos, ventas, gastos y cuentas).
   Habla con Supabase directo por fetch, igual que la página. Sesión guardada en este navegador. */
(function () {
  "use strict";
  var C = window.AVCalc, $ = function (i) { return document.getElementById(i); };
  var CFG = window.SUPA_CFG || {}, URL_ = String(CFG.url || "").trim().replace(/\/+$/, ""), KEY = String(CFG.key || "").trim();
  var CATS = ["Yeso", "Pinturas", "Pinceles", "Moldes", "Empaque", "Envíos", "Otros"];
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var ses = null, datos = { pedidos: [], gastos: [] }, filtro = "pendiente", rangoMapa = "mes", provSel = null;

  /* ---------- utilidades ---------- */
  function hoy() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date()); }
  function mesHoy() { return hoy().slice(0, 7); }
  function nomMes(m) { return MESES[+m.slice(5, 7) - 1] + " " + m.slice(0, 4); }
  function fechaCorta(f) { var d = String(f).slice(0, 10).split("-"); return +d[2] + " " + MESES[+d[1] - 1].slice(0, 3); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var tmT = 0;
  function toast(t) { var T = $("toast"); T.textContent = t; T.hidden = false; clearTimeout(tmT); tmT = setTimeout(function () { T.hidden = true; }, 2600); }
  function confirma(tit, txt) {
    return new Promise(function (res) {
      var D = $("d-confirma"); $("dq-tit").textContent = tit; $("dq-txt").textContent = txt;
      D.onclose = function () { res(D.returnValue === "si"); }; D.returnValue = ""; D.showModal();
    });
  }
  function aviso(t) { var A = $("aviso"); A.hidden = !t; A.textContent = t || ""; }

  /* ---------- sesión y API ---------- */
  function guardaSes(s) { ses = s; try { if (s) localStorage.setItem("av-ses", JSON.stringify(s)); else localStorage.removeItem("av-ses"); } catch (e) {} }
  function leeSes() { try { return JSON.parse(localStorage.getItem("av-ses") || "null"); } catch (e) { return null; } }
  function tomaToken(j) { return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: j.user && j.user.email }; }

  async function auth(tipo, cuerpo) {
    var r = await fetch(URL_ + "/auth/v1/token?grant_type=" + tipo, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) { var e = new Error(j.error_description || j.msg || "auth"); e.status = r.status; throw e; }
    return tomaToken(j);
  }
  async function token() {
    if (!ses) throw Object.assign(new Error("sin sesión"), { status: 401 });
    if (ses.expires_at - 60 < Date.now() / 1000) {
      try { guardaSes(Object.assign(await auth("refresh_token", { refresh_token: ses.refresh_token }), { email: ses.email })); }
      catch (e) {
        // sin internet: se conserva la sesión para reintentar; si Supabase la rechaza, se vuelve a la entrada
        if (!e.status) throw Object.assign(new Error("red"), { status: 0 });
        salir("Tu sesión venció. Vuelve a entrar.");
        throw Object.assign(new Error("sesión vencida"), { status: 401 });
      }
    }
    return ses.access_token;
  }
  async function api(ruta, op) {
    op = op || {};
    var h = { apikey: KEY, Authorization: "Bearer " + await token(), "Content-Type": "application/json" };
    if (op.prefer) h.Prefer = op.prefer;
    if (op.rango) { h.Range = op.rango; h["Range-Unit"] = "items"; }
    var r;
    try { r = await fetch(URL_ + ruta, { method: op.method || "GET", headers: h, body: op.body ? JSON.stringify(op.body) : undefined }); }
    catch (e) { throw Object.assign(new Error("red"), { status: 0 }); }
    if (r.status === 401) { salir("Tu sesión venció. Vuelve a entrar."); throw Object.assign(new Error("401"), { status: 401 }); }
    if (!r.ok) { var t = await r.text(); throw Object.assign(new Error(t || String(r.status)), { status: r.status }); }
    var txt = await r.text(); // al guardar con return=minimal Supabase responde 201 sin contenido
    return txt ? JSON.parse(txt) : null;
  }
  function errorTxt(e) { return e && e.status === 0 ? "No se pudo conectar. Revisa tu internet." : "No se pudo guardar. Inténtalo de nuevo."; }

  /* ---------- entrar y salir ---------- */
  async function entrar(correo, clave) {
    var m = $("e-msg"), b = $("b-entrar"); m.textContent = ""; b.disabled = true; b.textContent = "Entrando…";
    try {
      guardaSes(await auth("password", { email: correo, password: clave }));
      await abrirPanel();
    } catch (e) {
      guardaSes(null);
      m.textContent = e.status === 400 ? "Correo o contraseña incorrectos." : e.message === "no admin" ? "Esta cuenta no tiene acceso al panel." : e.status === 0 || !e.status ? "No se pudo conectar. Revisa tu internet." : "No se pudo entrar. Inténtalo de nuevo.";
    }
    b.disabled = false; b.textContent = "Entrar";
  }
  async function abrirPanel() {
    var ok;
    try { ok = await api("/rest/v1/rpc/es_admin", { method: "POST", body: {} }); }
    catch (e) { if (e.status === 401) throw e; throw Object.assign(new Error("red"), { status: 0 }); }
    if (ok !== true) { try { await fetch(URL_ + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + ses.access_token } }); } catch (e) {} guardaSes(null); throw new Error("no admin"); }
    $("entrada").hidden = true; $("app").hidden = false;
    await recargar();
    mostrar(location.hash.slice(1) || "inicio");
  }
  function salir(msg) {
    if (ses) { try { fetch(URL_ + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + ses.access_token } }).catch(function () {}); } catch (e) {} }
    [].forEach.call(document.querySelectorAll("dialog[open]"), function (d) { d.returnValue = ""; d.close(); });
    guardaSes(null); $("app").hidden = true; $("entrada").hidden = false; $("e-msg").textContent = msg || ""; $("e-clave").value = "";
  }

  /* ---------- datos ---------- */
  // Supabase entrega como máximo 1000 filas por consulta: se piden por tandas hasta tener todo.
  async function traerTodo(ruta) {
    var todo = [], tanda = 1000;
    for (var ini = 0; ; ini += tanda) {
      var r = await api(ruta, { rango: ini + "-" + (ini + tanda - 1) }) || [];
      todo = todo.concat(r);
      if (r.length < tanda) return todo;
    }
  }
  async function cargarDatos() {
    var desde = (+hoy().slice(0, 4) - 1) + "-01-01";
    var r = await Promise.all([
      traerTodo("/rest/v1/pedidos?select=*&fecha=gte." + desde + "&order=fecha.desc,id.desc"),
      traerTodo("/rest/v1/gastos?select=*&fecha=gte." + desde + "&order=fecha.desc,id.desc")
    ]);
    return { pedidos: r[0], gastos: r[1] };
  }
  async function recargar() {
    try { datos = await cargarDatos(); aviso(""); }
    catch (e) { if (e.status !== 401) aviso("No se pudieron cargar los datos. Revisa tu internet y recarga la página."); }
    pintarTodo();
  }
  function pintarTodo() { pintarInicio(); pintarPedidos(); pintarGastos(); pintarCuentas(); }

  /* ---------- navegación ---------- */
  function mostrar(s) {
    if (["inicio", "pedidos", "gastos", "cuentas"].indexOf(s) < 0) s = "inicio";
    [].forEach.call(document.querySelectorAll("[data-sec]"), function (x) { x.hidden = x.id !== "s-" + s; });
    [].forEach.call(document.querySelectorAll("nav.tabs button"), function (b) { if (b.dataset.s === s) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    if (location.hash !== "#" + s) history.replaceState(null, "", "#" + s);
    window.scrollTo(0, 0);
  }

  /* ---------- inicio ---------- */
  function pintarInicio() {
    var mes = mesHoy(), R = C.resumenMes(datos.pedidos, datos.gastos, mes, hoy());
    $("mes-txt").textContent = "Resumen de " + nomMes(mes);
    var K = $("kpis"); K.textContent = "";
    [["v", "Ventas del mes", C.money(R.ventas), R.nVentas + (R.nVentas === 1 ? " venta" : " ventas")],
     ["ga", "Gastos del mes", C.money(R.gastos), "materiales: " + C.money(R.materiales)],
     ["gn", "Ganancia", C.money(R.ganancia), R.ventas ? "margen " + R.margen + "%" : "sin ventas aún"],
     ["pr", "Proyección del mes", C.money(R.proyeccion), "si sigues al ritmo actual"]].forEach(function (k) {
      var d = el("div", "k " + k[0]); d.appendChild(el("small", "", k[1])); d.appendChild(el("b", "", k[2])); d.appendChild(el("em", "", k[3])); K.appendChild(d);
    });
    pintarGrafica(C.serieMeses(datos.pedidos, datos.gastos, mes, 6), R.proyeccion);
    pintarMapa();
    var P = $("pend"); P.textContent = "";
    var pend = datos.pedidos.filter(function (p) { return p.estado === "pendiente" && !p.prueba; }).length;
    var web = datos.pedidos.filter(function (p) { return p.origen === "web" && !p.prueba; })[0];
    var fila = function (t, tag, cls, ir) { var l = el("div", "li"); l.appendChild(el("span", "", t)); var b = el("button", "tag " + cls, tag); b.style.border = "0"; b.style.cursor = "pointer"; b.onclick = function () { mostrar(ir); }; l.appendChild(b); P.appendChild(l); };
    fila(pend ? pend + (pend === 1 ? " pedido por confirmar" : " pedidos por confirmar") : "No hay pedidos por confirmar", pend ? "Ver" : "OK", pend ? "t-pe" : "t-co", "pedidos");
    if (web) { var dias = Math.round((Date.parse(hoy()) - Date.parse(String(web.creado).slice(0, 10))) / 864e5); fila("Último pedido de la tienda: " + (dias <= 0 ? "hoy" : dias === 1 ? "ayer" : "hace " + dias + " días"), dias > 14 ? "Revisar" : "OK", dias > 14 ? "t-pe" : "t-co", "pedidos"); }
    else fila("Todavía no llegan pedidos desde la tienda", "Info", "t-ma", "pedidos");
  }

  function pintarGrafica(serie, proy) {
    var G = $("graf"), hay = serie.some(function (s) { return s.ventas || s.gastos; });
    G.textContent = "";
    if (!hay) { G.appendChild(el("p", "vacio", "Aún no hay datos. Cuando completes pedidos o anotes gastos, aparecerán aquí.")); return; }
    var W = 360, H = 170, base = 140, max = Math.max.apply(null, serie.map(function (s) { return Math.max(s.ventas, s.gastos, Math.abs(s.ganancia)); }).concat([proy, 1]));
    var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", "graf"); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", serie.map(function (s) { return nomMes(s.mes) + ": ventas " + C.money(s.ventas) + ", gastos " + C.money(s.gastos); }).join("; "));
    var r = function (x, y, w, h, f, extra) { var e = document.createElementNS(ns, "rect"); e.setAttribute("x", x); e.setAttribute("y", y); e.setAttribute("width", w); e.setAttribute("height", Math.max(h, 0)); e.setAttribute("rx", 2); if (extra) { e.setAttribute("fill", "none"); e.setAttribute("stroke", f); e.setAttribute("stroke-dasharray", "4 3"); e.setAttribute("stroke-width", 1.5); } else e.setAttribute("fill", f); svg.appendChild(e); };
    var ln = document.createElementNS(ns, "line"); ln.setAttribute("x1", 0); ln.setAttribute("x2", W); ln.setAttribute("y1", base); ln.setAttribute("y2", base); ln.setAttribute("stroke", "rgba(239,233,219,.2)"); svg.appendChild(ln);
    var col = W / serie.length, bw = col / 4.6;
    serie.forEach(function (s, i) {
      var x = i * col + col * .14, alt = function (v) { return v / max * (base - 10); };
      if (i === serie.length - 1 && proy > s.ventas) r(x, base - alt(proy), bw, alt(proy), "#e8b93f", true);
      r(x, base - alt(s.ventas), bw, alt(s.ventas), "#4f82c4");
      r(x + bw + 2, base - alt(s.gastos), bw, alt(s.gastos), "#cf5c7c");
      r(x + 2 * (bw + 2), base - alt(Math.max(s.ganancia, 0)), bw, alt(Math.max(s.ganancia, 0)), "#6f8a3a");
      var t = document.createElementNS(ns, "text"); t.setAttribute("x", i * col + col / 2); t.setAttribute("y", H - 10); t.setAttribute("text-anchor", "middle"); t.setAttribute("fill", "rgba(239,233,219,.65)"); t.setAttribute("font-size", "11"); t.textContent = MESES[+s.mes.slice(5, 7) - 1].slice(0, 3); svg.appendChild(t);
    });
    G.appendChild(svg);
  }

  function pintarMapa() {
    var M = $("mapa"), info = $("mapinfo"), mapa = window.CR_MAPA; M.textContent = ""; info.textContent = "";
    if (!mapa) { M.appendChild(el("p", "vacio", "No se pudo cargar el mapa.")); return; }
    var pp = C.porProvincia(datos.pedidos, rangoMapa === "mes" ? mesHoy() : null);
    if (rangoMapa === "anio") { var anio = hoy().slice(0, 4), q = datos.pedidos.filter(function (p) { return String(p.fecha).slice(0, 4) === anio; }); pp = C.porProvincia(q, null); }
    var max = Math.max.apply(null, C.PROVINCIAS.map(function (k) { return pp[k].monto; }).concat([0]));
    var tonos = ["#f6d3dc", "#eaa6b8", "#dc7c96", "#cf5c7c", "#9e2a3b"];
    var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", mapa.viewBox); svg.setAttribute("class", "mapa"); svg.setAttribute("role", "group"); svg.setAttribute("aria-label", "Mapa de ventas por provincia");
    var muestra = function (k) {
      provSel = k; [].forEach.call(svg.querySelectorAll("path"), function (p) { p.classList.toggle("sel", p.dataset.p === k); });
      info.textContent = k + ": " + pp[k].n + (pp[k].n === 1 ? " venta" : " ventas") + " · " + C.money(pp[k].monto);
    };
    C.PROVINCIAS.forEach(function (k) {
      var p = document.createElementNS(ns, "path"), v = pp[k].monto;
      p.setAttribute("d", mapa.provincias[k] || ""); p.dataset.p = k; p.setAttribute("tabindex", "0"); p.setAttribute("role", "button");
      p.setAttribute("aria-label", k + ": " + pp[k].n + " ventas, " + C.money(v));
      p.setAttribute("fill", v > 0 && max > 0 ? tonos[Math.min(4, Math.floor(v / max * 4.999))] : "rgba(239,233,219,.06)");
      p.onclick = function () { muestra(k); }; p.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); muestra(k); } };
      svg.appendChild(p);
    });
    C.PROVINCIAS.forEach(function (k) { var c = mapa.etiquetas[k]; if (!c) return; var t = document.createElementNS(ns, "text"); t.setAttribute("x", c[0]); t.setAttribute("y", c[1]); t.setAttribute("text-anchor", "middle"); t.textContent = k; svg.appendChild(t); });
    M.appendChild(svg);
    if (pp["Sin provincia"].n) info.textContent = pp["Sin provincia"].n + " venta(s) sin provincia: " + C.money(pp["Sin provincia"].monto);
    if (provSel) muestra(provSel);
  }

  /* ---------- pedidos ---------- */
  function pintarPedidos() {
    var L = $("ped-lista"); L.textContent = "";
    var lst = datos.pedidos.filter(function (p) { return filtro === "todos" || p.estado === filtro; });
    if (!lst.length) { L.appendChild(el("p", "vacio c", filtro === "pendiente" ? "No hay pedidos por confirmar." : "No hay pedidos aquí todavía.")); return; }
    lst.slice(0, 300).forEach(function (p) {
      var c = el("article", "c ped"), top = el("div", "top");
      top.appendChild(el("span", "tag " + ({ pendiente: "t-pe", completado: "t-co", cancelado: "t-ca" })[p.estado], p.estado.charAt(0).toUpperCase() + p.estado.slice(1)));
      if (p.origen === "manual") top.appendChild(el("span", "tag t-ma", "A mano"));
      if (p.prueba) top.appendChild(el("span", "tag t-pr", "Prueba"));
      top.appendChild(el("span", "mu", fechaCorta(p.fecha)));
      top.appendChild(el("span", "tot", C.money(C.montoVenta(p))));
      c.appendChild(top);
      c.appendChild(el("b", "", p.nombre || "Sin nombre"));
      var det = [p.provincia, p.entrega, p.pago].filter(Boolean).join(" · ");
      if (det) c.appendChild(el("span", "mu", det));
      if (p.direccion) c.appendChild(el("span", "mu", "Dirección: " + p.direccion));
      if (p.notas) c.appendChild(el("span", "mu", "Notas: " + p.notas));
      if (p.items && p.items.length) { var ul = el("ul"); p.items.forEach(function (i) { ul.appendChild(el("li", "", i.q + " x " + i.n + (i.t ? " · " + C.money(i.t) : ""))); }); c.appendChild(ul); }
      if (p.descuento) c.appendChild(el("span", "mu", "Descuento aplicado: −" + C.money(p.descuento)));
      if (p.monto_final != null && p.monto_final !== p.total) c.appendChild(el("span", "mu", "Total del carrito: " + C.money(p.total)));
      var acc = el("div", "acc");
      if (p.estado === "pendiente") {
        var bc = el("button", "btn gr sm", "Completar"); bc.onclick = function () { completar(p); }; acc.appendChild(bc);
        var bx = el("button", "btn o sm", "Cancelar"); bx.onclick = function () { cancelar(p); }; acc.appendChild(bx);
      } else {
        var br = el("button", "btn o sm", "Volver a pendiente"); br.onclick = function () { cambiaEstado(p, { estado: "pendiente", monto_final: null, cerrado_en: null }, "Pedido devuelto a pendientes"); }; acc.appendChild(br);
      }
      c.appendChild(acc); L.appendChild(c);
    });
  }
  async function cambiaEstado(p, cambios, ok) {
    try { await api("/rest/v1/pedidos?id=eq." + p.id, { method: "PATCH", body: cambios, prefer: "return=minimal" }); toast(ok); await recargar(); }
    catch (e) { if (e.status !== 401) toast(errorTxt(e)); }
  }
  function completarPedido(id, montoFinal) { return api("/rest/v1/pedidos?id=eq." + id, { method: "PATCH", body: { estado: "completado", monto_final: montoFinal, cerrado_en: new Date().toISOString() }, prefer: "return=minimal" }); }
  function cancelarPedido(id) { return api("/rest/v1/pedidos?id=eq." + id, { method: "PATCH", body: { estado: "cancelado", cerrado_en: new Date().toISOString() }, prefer: "return=minimal" }); }
  function completar(p) {
    var D = $("d-completar"); $("dc-txt").textContent = (p.nombre || "Sin nombre") + " · " + fechaCorta(p.fecha); $("dc-monto").value = p.total;
    D.returnValue = ""; D.onclose = async function () {
      if (D.returnValue !== "si") return; var v = Math.round(+$("dc-monto").value);
      if (!(v >= 0)) { toast("Escribe un monto válido."); return; }
      try { await completarPedido(p.id, v); toast("Pedido completado"); await recargar(); } catch (e) { if (e.status !== 401) toast(errorTxt(e)); }
    }; D.showModal();
  }
  async function cancelar(p) {
    if (!(await confirma("¿Cancelar este pedido?", (p.nombre || "Sin nombre") + " · " + C.money(p.total) + ". No contará en tus cuentas."))) return;
    try { await cancelarPedido(p.id); toast("Pedido cancelado"); await recargar(); } catch (e) { if (e.status !== 401) toast(errorTxt(e)); }
  }
  function leerItems(txt) {
    return String(txt || "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var m = l.match(/^(\d+)\s*[x×]\s*(.+)$/i); return m ? { n: m[2].trim().slice(0, 120), q: Math.min(999, +m[1]), p: 0, t: 0 } : { n: l.slice(0, 120), q: 1, p: 0, t: 0 };
    });
  }
  function guardarVentaManual(v) {
    return api("/rest/v1/pedidos", { method: "POST", prefer: "return=minimal", body: { origen: "manual", estado: "completado", fecha: v.fecha, total: v.monto, nombre: v.nombre || null, provincia: v.provincia || null, items: v.items || [], cerrado_en: new Date().toISOString() } });
  }
  function abrirVenta() {
    var D = $("d-venta"); $("f-venta").reset(); $("dv-fecha").value = hoy(); $("dv-msg").textContent = "";
    D.returnValue = ""; D.showModal();
  }
  $("f-venta").addEventListener("submit", async function (e) {
    if (e.submitter && e.submitter.value !== "si") return;
    e.preventDefault();
    var monto = Math.round(+$("dv-monto").value), fecha = $("dv-fecha").value;
    if (!fecha || !(monto > 0)) { $("dv-msg").textContent = "La fecha y un monto mayor a cero son obligatorios."; return; }
    try { await guardarVentaManual({ fecha: fecha, monto: monto, nombre: $("dv-nombre").value.trim(), provincia: $("dv-prov").value, items: leerItems($("dv-items").value) }); $("d-venta").close(); toast("Venta guardada"); await recargar(); }
    catch (er) { if (er.status !== 401) $("dv-msg").textContent = errorTxt(er); }
  });

  /* ---------- gastos ---------- */
  var gEdit = null;
  function pintarGastos() {
    var mes = $("g-mes").value || mesHoy(), lst = datos.gastos.filter(function (g) { return String(g.fecha).slice(0, 7) === mes; });
    var T = $("g-tot"), L = $("g-lista"); T.textContent = ""; L.textContent = "";
    var tot = 0, porCat = {}; lst.forEach(function (g) { tot += g.monto; porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto; });
    T.appendChild(el("b", "", C.money(tot))); T.firstChild.style.font = "700 1.6rem 'Cormorant Garamond',Georgia,serif";
    var cs = el("div", "chips"); cs.style.margin = "8px 0 0"; Object.keys(porCat).forEach(function (k) { cs.appendChild(el("span", "tag t-ma", k + " " + C.money(porCat[k]))); }); T.appendChild(cs);
    if (!lst.length) { L.appendChild(el("p", "vacio", "No hay gastos en " + nomMes(mes) + ".")); return; }
    lst.forEach(function (g) {
      var l = el("div", "li"), iz = el("div"); iz.appendChild(el("b", "", g.descripcion)); iz.appendChild(el("div", "mu", fechaCorta(g.fecha) + " · " + g.categoria));
      var de = el("div"); de.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end";
      de.appendChild(el("b", "", C.money(g.monto)));
      var be = el("button", "btn o sm", "Editar"); be.onclick = function () { abrirGasto(g); }; de.appendChild(be);
      var bb = el("button", "btn o sm", "Borrar"); bb.onclick = function () { borrarGastoUI(g); }; de.appendChild(bb);
      l.appendChild(iz); l.appendChild(de); L.appendChild(l);
    });
  }
  function guardarGasto(g) {
    var cuerpo = { fecha: g.fecha, descripcion: g.descripcion, categoria: g.categoria, monto: g.monto };
    return g.id ? api("/rest/v1/gastos?id=eq." + g.id, { method: "PATCH", body: cuerpo, prefer: "return=minimal" }) : api("/rest/v1/gastos", { method: "POST", body: cuerpo, prefer: "return=minimal" });
  }
  function borrarGasto(id) { return api("/rest/v1/gastos?id=eq." + id, { method: "DELETE", prefer: "return=minimal" }); }
  function abrirGasto(g) {
    gEdit = g || null; $("f-gasto").reset(); $("dg-msg").textContent = "";
    $("dg-tit").textContent = g ? "Editar gasto" : "Agregar gasto";
    $("dg-fecha").value = g ? g.fecha : hoy(); $("dg-monto").value = g ? g.monto : ""; $("dg-desc").value = g ? g.descripcion : ""; $("dg-cat").value = g ? g.categoria : "Yeso";
    var D = $("d-gasto"); D.returnValue = ""; D.showModal();
  }
  async function borrarGastoUI(g) {
    if (!(await confirma("¿Borrar este gasto?", g.descripcion + " · " + C.money(g.monto)))) return;
    try { await borrarGasto(g.id); toast("Gasto borrado"); await recargar(); } catch (e) { if (e.status !== 401) toast(errorTxt(e)); }
  }
  $("f-gasto").addEventListener("submit", async function (e) {
    if (e.submitter && e.submitter.value !== "si") return;
    e.preventDefault();
    var g = { id: gEdit && gEdit.id, fecha: $("dg-fecha").value, monto: Math.round(+$("dg-monto").value), descripcion: $("dg-desc").value.trim(), categoria: $("dg-cat").value };
    if (!g.fecha || !(g.monto > 0) || !g.descripcion) { $("dg-msg").textContent = "Fecha, descripción y un monto mayor a cero son obligatorios."; return; }
    try { await guardarGasto(g); $("d-gasto").close(); toast(g.id ? "Gasto actualizado" : "Gasto guardado"); $("g-mes").value = g.fecha.slice(0, 7); await recargar(); }
    catch (er) { if (er.status !== 401) $("dg-msg").textContent = errorTxt(er); }
  });

  /* ---------- cuentas y Excel ---------- */
  function pintarCuentas() {
    var S = $("c-anio"), anioHoy = +hoy().slice(0, 4);
    if (!S.options.length) [anioHoy, anioHoy - 1].forEach(function (a) { S.appendChild(el("option", "", String(a))); });
    var anio = S.value || String(anioHoy), T = $("c-tabla"); T.textContent = "";
    var hasta = anio === String(anioHoy) ? mesHoy() : anio + "-12", n = +hasta.slice(5, 7);
    var serie = C.serieMeses(datos.pedidos, datos.gastos, hasta, n).reverse();
    var hay = serie.some(function (s) { return s.ventas || s.gastos; });
    if (!hay) { T.appendChild(el("p", "vacio", "Aún no hay datos en " + anio + ".")); return; }
    var tb = el("table", "tabla"), th = el("tr");
    ["Mes", "Ventas", "Gastos", "Ganancia", "Margen", "Ventas (n)", "vs mes anterior"].forEach(function (h, i) { th.appendChild(el("th", i ? "n" : "", h)); });
    tb.appendChild(th);
    serie.forEach(function (s) {
      var R = C.resumenMes(datos.pedidos, datos.gastos, s.mes, hoy()), A = C.resumenMes(datos.pedidos, datos.gastos, C.mesMas(s.mes, -1), hoy());
      var tr = el("tr"); tr.appendChild(el("td", "", nomMes(s.mes)));
      [C.money(R.ventas), C.money(R.gastos), C.money(R.ganancia), R.margen + "%", String(R.nVentas)].forEach(function (v) { tr.appendChild(el("td", "n", v)); });
      var td = el("td", "n");
      if (A.ventas) { var pct = Math.round((R.ventas - A.ventas) / A.ventas * 100); td.textContent = (pct >= 0 ? "▲ " : "▼ ") + Math.abs(pct) + "%"; td.className = "n " + (pct >= 0 ? "sube" : "baja"); } else td.textContent = "—";
      tr.appendChild(td); tb.appendChild(tr);
    });
    T.appendChild(tb);
  }
  function descargarExcel(desde, hasta) {
    if (!window.XLSX) { toast("No se pudo cargar la herramienta de Excel. Revisa tu internet."); return; }
    var F = C.filasExcel(datos.pedidos, datos.gastos, desde, hasta), wb = XLSX.utils.book_new();
    [["Resumen por mes", F.resumen], ["Ventas", F.ventas], ["Gastos", F.gastos]].forEach(function (h) {
      var ws = XLSX.utils.aoa_to_sheet(h[1]); ws["!cols"] = h[1][0].map(function (_, i) { return { wch: i === 4 && h[0] === "Ventas" ? 40 : 16 }; });
      XLSX.utils.book_append_sheet(wb, ws, h[0]);
    });
    XLSX.writeFile(wb, "ARTEVIVA-cuentas-" + hoy() + ".xlsx");
  }
  $("x-rango").addEventListener("change", function () { $("x-mesbox").hidden = this.value !== "unmes"; });
  $("b-excel").addEventListener("click", function () {
    var r = $("x-rango").value, m = mesHoy(), desde, hasta;
    if (r === "mes" || r === "unmes") { if (r === "unmes") m = $("x-mes").value || m; desde = m + "-01"; hasta = m + "-" + C.diasMes(m); }
    else if (r === "anio") { desde = hoy().slice(0, 4) + "-01-01"; hasta = hoy().slice(0, 4) + "-12-31"; }
    else { // "Todo": desde el primer registro hasta este mes, sin meses vacíos de relleno
      var fs = datos.pedidos.map(function (p) { return String(p.fecha); }).concat(datos.gastos.map(function (g) { return String(g.fecha); })).sort();
      desde = (fs[0] || hoy()).slice(0, 7) + "-01"; hasta = m + "-" + C.diasMes(m);
      if (fs.length && fs[fs.length - 1] > hasta) hasta = fs[fs.length - 1];
    }
    descargarExcel(desde, hasta);
  });

  /* ---------- arranque ---------- */
  C.PROVINCIAS.forEach(function (p) { $("dv-prov").appendChild(el("option", "", p)); });
  CATS.forEach(function (c) { $("dg-cat").appendChild(el("option", "", c)); });
  $("g-mes").value = mesHoy(); $("x-mes").value = mesHoy();
  $("g-mes").addEventListener("change", pintarGastos);
  $("c-anio").addEventListener("change", pintarCuentas);
  $("b-venta").onclick = abrirVenta; $("b-gasto").onclick = function () { abrirGasto(null); };
  $("b-salir").onclick = function () { salir(""); };
  // Actualizar: con el botón, cada minuto y al volver a la pestaña (nunca con una ventana de edición abierta)
  var actualizando = false;
  async function actualizar(aviso_) {
    if (actualizando || $("app").hidden || document.querySelector("dialog[open]")) return;
    actualizando = true; var b = $("b-actualizar"); b.disabled = true;
    try { await recargar(); if (aviso_) toast("Datos actualizados"); } finally { actualizando = false; b.disabled = false; }
  }
  $("b-actualizar").onclick = function () { actualizar(true); };
  setInterval(function () { if (!document.hidden) actualizar(false); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) actualizar(false); });
  [].forEach.call(document.querySelectorAll("nav.tabs button"), function (b) { b.onclick = function () { mostrar(b.dataset.s); }; });
  [].forEach.call(document.querySelectorAll("#ped-filtro button"), function (b) { b.onclick = function () { filtro = b.dataset.f; [].forEach.call(b.parentNode.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); pintarPedidos(); }; });
  [].forEach.call(document.querySelectorAll("#map-rango button"), function (b) { b.onclick = function () { rangoMapa = b.dataset.r; [].forEach.call(b.parentNode.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); pintarMapa(); }; });
  $("f-entrar").addEventListener("submit", function (e) { e.preventDefault(); var c = $("e-correo").value.trim(), k = $("e-clave").value; if (!c || !k) { $("e-msg").textContent = "Escribe tu correo y tu contraseña."; return; } entrar(c, k); });
  window.addEventListener("hashchange", function () { if (!$("app").hidden) mostrar(location.hash.slice(1)); });

  if (!URL_ || !KEY) { $("e-msg").textContent = "Falta supabase-config.js junto a admin.html."; $("b-entrar").disabled = true; return; }
  var s = leeSes();
  if (s && s.refresh_token) {
    ses = s;
    abrirPanel().catch(function (e) {
      if (e.status === 0) { $("e-msg").textContent = "No se pudo conectar. Revisa tu internet y recarga la página."; return; } // se conserva la sesión
      salir(e.message === "no admin" ? "Esta cuenta no tiene acceso al panel." : "Tu sesión venció. Vuelve a entrar.");
    });
  }
})();

/* ARTE VIVA · Panel · Tienda · Reseñas (etapa 3): aprobar o rechazar las reseñas con foto y borrar las publicadas.
   Se carga después de admin-importar.js. Todo texto de la base se pinta con textContent. */
(function () {
  "use strict";
  var AV = window.AV;
  if (!AV || !AV.tienda) return;
  var api = AV.api, el = AV.el, toast = AV.toast, confirma = AV.confirma, $ = function (i) { return document.getElementById(i); };
  var R = [], hay = false, cargando = false, vista = "prod", RAIZ_FOTOS = "/storage/v1/object/public/fotos/";

  /* ---------- utilidades ---------- */
  function fechaTxt(f) { var d = new Date(f); return isNaN(d) ? "" : d.toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" }); }
  function fotoOk(u) { return typeof u === "string" && /^https:\/\//i.test(u); }
  function enEspera(r) { return r.visible === false; }
  // Ruta del archivo dentro del bucket «fotos», a partir de su dirección pública; null si no es de ese bucket.
  function rutaFoto(u) {
    if (!u) return null;
    var i = String(u).indexOf(RAIZ_FOTOS);
    return i < 0 ? null : decodeURIComponent(String(u).slice(i + RAIZ_FOTOS.length).split("?")[0]);
  }

  /* ---------- datos ---------- */
  async function traer() {
    var todo = [], tanda = 1000;
    for (var ini = 0; ; ini += tanda) {
      var r = await api("/rest/v1/resenas?select=*&order=creado.desc,id.desc", { rango: ini + "-" + (ini + tanda - 1) }) || [];
      todo = todo.concat(r);
      if (r.length < tanda) return todo;
    }
  }
  async function cargar() {
    if (cargando) return;
    cargando = true;
    try { R = await traer(); hay = true; pintar(); }
    catch (e) {
      if (e.status !== 401) {
        if (hay) toast("No se pudieron actualizar las reseñas. Revisa tu internet.");
        else ["rv-espera", "rv-publicadas"].forEach(function (i) { var L = $(i); L.textContent = ""; L.appendChild(el("p", "vacio", "No se pudo cargar. Revisa tu internet y vuelve a entrar a esta sección.")); });
      }
    } finally { cargando = false; }
  }
  // Para «Pendientes» en Inicio: cuántas reseñas con foto esperan revisión.
  async function contar() {
    var r = await api("/rest/v1/resenas?select=id&visible=eq.false", { rango: "0-999" }) || [];
    AV.resenas.pendientes = r.length;
    return r.length;
  }

  // Borra la foto del bucket «fotos». Si ya no existe, sigue sin error.
  async function borrarFoto(u) {
    var ruta = rutaFoto(u);
    if (!ruta) return;
    var r;
    try {
      r = await fetch(AV.URL + "/storage/v1/object/fotos/" + ruta.split("/").map(encodeURIComponent).join("/"),
        { method: "DELETE", headers: { apikey: AV.KEY, Authorization: "Bearer " + await AV.token() } });
    } catch (e) { if (e.status === 401) throw e; throw Object.assign(new Error("red"), { status: 0 }); }
    if (r.ok || r.status === 404 || r.status === 400) return; // 400/404: el archivo ya no estaba
    throw Object.assign(new Error("foto " + r.status), { status: r.status });
  }
  async function borrarFila(id) {
    var r = await api("/rest/v1/resenas?id=eq." + id, { method: "DELETE", prefer: "return=representation" });
    if (!r || !r.length) throw Object.assign(new Error("sin fila"), { status: 404 });
  }

  /* ---------- acciones ---------- */
  async function aprobar(x, b) {
    b.disabled = true;
    try {
      var r = await api("/rest/v1/resenas?id=eq." + x.id, { method: "PATCH", body: { visible: true, foto_aprobada: true }, prefer: "return=representation" });
      if (!r || !r.length) throw Object.assign(new Error("sin fila"), { status: 404 });
      toast("Reseña aprobada: ya se ve en tu página");
      await despues();
    } catch (e) { b.disabled = false; aviso(e, "aprobar"); }
  }
  async function quitar(x, b, rechazo) {
    var tit = rechazo ? "¿Rechazar esta reseña?" : "¿Borrar esta reseña?";
    var txt = (x.nombre || "Sin nombre") + (x.foto_url ? " · se borra también su foto." : ".") + " No se puede deshacer.";
    if (!(await confirma(tit, txt))) return;
    b.disabled = true;
    try {
      await borrarFoto(x.foto_url);
      await borrarFila(x.id);
      toast(rechazo ? "Reseña rechazada" : "Reseña borrada");
      await despues();
    } catch (e) { b.disabled = false; aviso(e, rechazo ? "rechazar" : "borrar"); }
  }
  function aviso(e, que) {
    if (e.status === 401) return;
    if (e.status === 404) { toast("Esa reseña ya no existe. Actualizando…"); despues(); return; }
    toast(e.status === 0 ? "No se pudo conectar. Revisa tu internet." : "No se pudo " + que + ". Inténtalo de nuevo.");
  }
  async function despues() { await cargar(); try { await contar(); } catch (e) {} }

  /* ---------- pintar ---------- */
  function tarjeta(x) {
    var c = el("article", "c rv-adm");
    if (x.foto_url && fotoOk(x.foto_url)) { var im = el("img"); im.src = x.foto_url; im.alt = "Foto de la obra de " + (x.nombre || "un cliente"); im.loading = "lazy"; c.appendChild(im); }
    var top = el("div", "top");
    top.appendChild(el("b", "", x.nombre || "Sin nombre"));
    var cal = Math.max(0, Math.min(5, Math.round(+x.calificacion || 0)));
    top.appendChild(el("span", "tag t-ye", cal + " de 5 pinceles"));
    top.appendChild(el("span", "mu", fechaTxt(x.creado)));
    c.appendChild(top);
    if (x.comentario) c.appendChild(el("p", "", x.comentario));
    var acc = el("div", "acc");
    if (enEspera(x)) {
      var ba = el("button", "btn gr sm", "Aprobar"); ba.onclick = function () { aprobar(x, ba); }; acc.appendChild(ba);
      var br = el("button", "btn o sm", "Rechazar"); br.onclick = function () { quitar(x, br, true); }; acc.appendChild(br);
    } else {
      if (x.foto_url && !x.foto_aprobada) c.appendChild(el("span", "mu", "La foto de esta reseña no está aprobada y no se muestra."));
      var bb = el("button", "btn o sm", "Borrar"); bb.onclick = function () { quitar(x, bb, false); }; acc.appendChild(bb);
    }
    c.appendChild(acc);
    return c;
  }
  function pintar() {
    var E = $("rv-espera"), P = $("rv-publicadas"), esp = R.filter(enEspera), pub = R.filter(function (x) { return !enEspera(x); });
    E.textContent = ""; P.textContent = "";
    $("rv-n-espera").textContent = esp.length ? "(" + esp.length + ")" : "";
    $("rv-n-pub").textContent = pub.length ? "(" + pub.length + ")" : "";
    if (!esp.length) E.appendChild(el("p", "vacio", "No hay reseñas con foto esperando revisión."));
    esp.forEach(function (x) { E.appendChild(tarjeta(x)); });
    if (!pub.length) P.appendChild(el("p", "vacio", "Todavía no hay reseñas publicadas."));
    pub.forEach(function (x) { P.appendChild(tarjeta(x)); });
  }

  /* ---------- tercera vista de Tienda: Reseñas ---------- */
  var chips = $("t-vistas"), chipRes = chips.querySelector('[data-v="res"]');
  function ponerRes(on) {
    $("t-v-res").hidden = !on;
    if (on) {
      vista = "res";
      [].forEach.call(chips.children, function (b) { b.setAttribute("aria-pressed", b === chipRes ? "true" : "false"); });
      $("t-v-prod").hidden = true; $("t-v-promo").hidden = true;
      cargar();
    } else vista = "otra";
  }
  [].forEach.call(chips.children, function (b) {
    var antes = b.onclick;
    b.onclick = function () { if (b === chipRes) ponerRes(true); else { ponerRes(false); if (antes) antes.call(b); } };
  });
  var cargarTienda = AV.tienda.cargar;
  AV.tienda.cargar = async function () { await cargarTienda(); if (vista === "res") await cargar(); };
  AV.resenas = { pendientes: 0, contar: contar, abrir: function () { ponerRes(true); }, rutaFoto: rutaFoto };
})();

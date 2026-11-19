/* Solo para pruebas locales: imita Supabase en memoria para probar admin.html sin datos reales. */
(function () {
  window.SUPA_CFG = { url: "https://simulado.supabase.co", key: "sb_publishable_simulado_123456789" };
  var hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date()), mes = hoy.slice(0, 7);
  var mesAnt = (function () { var a = +mes.slice(0, 4), m = +mes.slice(5, 7) - 2; if (m < 0) { m = 11; a--; } return a + "-" + ("0" + (m + 1)).slice(-2); })();
  var id = 100, db = {
    pedidos: [
      { id: 1, creado: hoy + "T10:00:00Z", fecha: hoy, estado: "pendiente", origen: "web", prueba: false, nombre: "Ana Mora", telefono: "88881234", provincia: "Cartago", entrega: "Envío por correo o mensajería", direccion: "La Unión, 200 m norte", pago: "SINPE Móvil", notas: "", items: [{ n: "Figura: Sol", q: 2, p: 500, t: 500 }, { n: "Paquete de relajación: Flores", q: 1, p: 3500, t: 3500 }], subtotal: 4500, descuento: 500, total: 4000 },
      { id: 2, creado: hoy + "T09:00:00Z", fecha: mes + "-02", estado: "completado", origen: "web", prueba: false, nombre: "Luis R.", provincia: "San José", entrega: "Retiro en persona", pago: "Efectivo", items: [{ n: "Paquete de pinceles: Completo", q: 1, p: 1500, t: 1500 }], subtotal: 1500, descuento: 0, total: 1500, monto_final: 1500 },
      { id: 3, creado: hoy + "T08:00:00Z", fecha: mes + "-01", estado: "completado", origen: "manual", prueba: false, nombre: "Feria", provincia: "Cartago", items: [], total: 12000 },
      { id: 4, creado: hoy + "T07:00:00Z", fecha: mesAnt + "-15", estado: "completado", origen: "web", prueba: false, nombre: "Sofía", provincia: "Heredia", items: [], total: 8000 },
      { id: 5, creado: hoy + "T06:00:00Z", fecha: hoy, estado: "pendiente", origen: "web", prueba: true, nombre: "Prueba demo", provincia: "Limón", items: [{ n: "Figura: Luna", q: 1, p: 500, t: 500 }], total: 500 }
    ],
    gastos: [
      { id: 1, fecha: mes + "-03", descripcion: "Yeso 10 kg", categoria: "Yeso", monto: 9800 },
      { id: 2, fecha: mes + "-05", descripcion: "Envío de pedido", categoria: "Envíos", monto: 2500 },
      { id: 3, fecha: mesAnt + "-10", descripcion: "Pinturas (12)", categoria: "Pinturas", monto: 14400 }
    ],
    categorias: [{ id: 1, nombre: "Figuras de yeso", descripcion: "Lienzos en relieve", color: "#4f82c4", orden: 0 }, { id: 2, nombre: "Pinturas", descripcion: "", color: "#6f8a3a", orden: 1 }],
    grupos: [{ id: 1, categoria_id: 1, nombre: "Figuras sueltas", prefijo: "Figura: ", con_foto: true, con_tamanos: false, orden: 0 }, { id: 2, categoria_id: 2, nombre: "Colores", prefijo: "Pintura: ", con_foto: false, con_tamanos: true, orden: 0 }],
    productos: [
      { id: 1, grupo_id: 1, nombre: "Abeja", precio: 500, color: null, foto_url: null, agotado: false, nuevo: false, orden: 0 },
      { id: 2, grupo_id: 1, nombre: "Sol", precio: 500, color: null, foto_url: "https://simulado.supabase.co/storage/v1/object/public/productos/2026/10/sol.jpg", agotado: false, nuevo: true, orden: 1 },
      { id: 3, grupo_id: 2, nombre: "Amarillo", precio: null, color: "#f2d12e", foto_url: null, agotado: false, nuevo: false, orden: 0 }
    ],
    variantes: [
      { id: 1, producto_id: 3, nombre: "Unidad (5 ml)", precio: 500, agotado: false, orden: 0 },
      { id: 2, producto_id: 3, nombre: "Frasco de 27 ml", precio: 1200, agotado: true, orden: 1 }
    ],
    ajustes: [
      { clave: "franja", valor: { on: true, t: "Envíos gratis en Cartago en compras superiores a ₡15.000", envioMin: 15000, prov: "Cartago", hasta: null } },
      { clave: "mas_vendidos", valor: { modo: "auto", lista: [1, 2] } }
    ],
    banners: [
      { id: 1, on: true, sup: "Envíos en Cartago", titulo: "Envío gratis desde ₡15.000", descripcion: "Arma tu pedido.", boton: "Ir a la tienda", categoria_id: null, enlace: "#tienda", foto_url: null, color1: "#6f8a3a", color2: "#4f6a26", letra_oscura: false, hasta: null, orden: 0 },
      { id: 2, on: true, sup: null, titulo: "Oferta vieja", descripcion: null, boton: null, categoria_id: 1, enlace: "#tienda", foto_url: null, color1: "#cf5c7c", color2: "#9e2a3b", letra_oscura: false, hasta: "2020-01-01", orden: 1 }
    ],
    tarjetas: [
      { id: 1, on: false, sup: null, titulo: "Pinturas nuevas", descripcion: "Colores", boton: "Ver", categoria_id: 2, enlace: "#tienda", color1: "#e8b93f", color2: "#ee8a2e", letra_oscura: true, hasta: null, orden: 0 }
    ],
    visitas: (function () { var hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date()), d = function (k) { var t = new Date(hoy + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() - k); return t.toISOString().slice(0, 10); };
      return [{ dia: d(0), origen: "ig", evento: "visita", n: 12 }, { dia: d(0), origen: "qr", evento: "visita", n: 3 }, { dia: d(1), origen: "fb", evento: "visita", n: 5 },
        { dia: d(0), origen: "ig", evento: "tienda", n: 6 }, { dia: d(0), origen: "otros", evento: "whatsapp", n: 2 }, { dia: d(40), origen: "otros", evento: "visita", n: 9 }]; })(),
    resenas: [
      { id: 501, nombre: "Ana", calificacion: 5, comentario: "Me encantó pintar mi mariposa", foto_url: null, foto_aprobada: false, visible: true, creado: "2026-10-20T15:00:00Z" },
      { id: 502, nombre: "Luis <b>x</b>", calificacion: 4, comentario: "Miren mi obra", foto_url: "https://simulado.supabase.co/storage/v1/object/public/fotos/123-abc.jpg", foto_aprobada: false, visible: false, creado: "2026-10-26T15:00:00Z" },
      { id: 503, nombre: "Sofía", calificacion: 3, comentario: "Foto ya borrada del bucket", foto_url: "https://simulado.supabase.co/storage/v1/object/public/fotos/no-existe.jpg", foto_aprobada: false, visible: false, creado: "2026-10-25T15:00:00Z" }
    ],
    descuentos: [
      { id: 1, on: true, tipo: "2x1", valor: null, categoria_id: 1, grupo_id: null, producto_ids: [], etiqueta: "2x1 en figuras", hasta: null, orden: 0 },
      { id: 2, on: true, tipo: "%", valor: 20, categoria_id: 99, grupo_id: null, producto_ids: [], etiqueta: null, hasta: null, orden: 1 }
    ]
  };
  var CAT = ["categorias", "grupos", "productos", "variantes", "banners", "tarjetas", "descuentos"], UNICO = { categorias: ["nombre"], grupos: ["categoria_id", "nombre"], productos: ["grupo_id", "nombre"] };
  db.costos = [{ clave: "Figura: Sol", costo: 16 }, { clave: "Pintura: Amarillo – Unidad (5 ml)", costo: 450 }];
  db.panel_ajustes = [{ clave: "panel", valor: { meta: 50000, margen: 20 } }];
  if (window.__sinEtapa5) { delete db.costos; delete db.panel_ajustes; }
  db.categorias_gasto = [["Yeso","variable",true],["Envíos","variable",false],["Servicios","fijo",false],["Salarios","salario",false],["Cargas sociales","salario",false],["Otros","otro",false],["Pinturas","variable",true]].map(function (c, i) { return { id: i + 1, nombre: c[0], tipo: c[1], en_costo: c[2], orden: i + 1, activo: true }; });
  db.compromisos = [{ id: 1, nombre: "Luz", tipo: "fijo", monto: 1000, frecuencia: "mensual", categoria: "Servicios", activo: true, en_planilla: false, desde: mes, hasta: null }, { id: 2, nombre: "Internet", tipo: "fijo", monto: 500, frecuencia: "mensual", categoria: "Servicios", activo: true, en_planilla: false, desde: mes, hasta: null }];
  db.omisiones = [];
  if (window.__sinEtapa7) { delete db.categorias_gasto; delete db.compromisos; delete db.omisiones; }
  if (window.__sinVisitas) db.visitas = [];
  if (window.__resenasExtra) db.resenas = window.__resenasExtra;
  if (window.__kitFotos) db.ajustes.push({ clave: "kit_fotos", valor: window.__kitFotos });
  if (window.__vacio) ["categorias", "grupos", "productos", "variantes", "ajustes", "banners", "tarjetas", "descuentos"].forEach(function (k) { db[k] = []; }); // base recién creada (antes de importar)
  window.__subidas = []; window.__db = db; window.__admin = true; window.__llamadas = [];
  var resp = function (st, body) { return Promise.resolve(new Response(body == null ? null : JSON.stringify(body), { status: st, headers: { "Content-Type": "application/json" } })); };
  window.fetch = function (u, o) {
    o = o || {}; var url = new URL(u), p = url.pathname, m = o.method || "GET", prefer = (o.headers && o.headers.Prefer) || "";
    window.__llamadas.push(m + " " + p + url.search);
    if (p.indexOf("/storage/v1/object/productos/") === 0) { // Storage: se anota el archivo recibido (tipo, bytes y medidas)
      var blob = o.body, reg = { path: p.replace("/storage/v1/object/productos/", ""), type: blob.type, ctype: o.headers["Content-Type"], size: blob.size, auth: o.headers.Authorization, apikey: o.headers.apikey };
      window.__subidas.push(reg);
      if (window.__storageFalla) return resp(500, { message: "fallo" });
      return createImageBitmap(blob).then(function (im) { reg.w = im.width; reg.h = im.height; return resp(200, { Key: "productos/" + reg.path }); });
    }
    if (p.indexOf("/storage/v1/object/fotos/") === 0 && m === "DELETE") { // fotos de reseñas: 404 si el archivo ya no existe
      var nf = decodeURIComponent(p.replace("/storage/v1/object/fotos/", "")); window.__fotosBorradas = (window.__fotosBorradas || []).concat(nf);
      if (window.__fotosFalla) return Promise.reject(new TypeError("Failed to fetch"));
      return nf === "no-existe.jpg" ? resp(400, { statusCode: "404", error: "not_found" }) : resp(200, [{ name: nf }]);
    }
    var b = o.body ? JSON.parse(o.body) : null;
    if (p === "/auth/v1/token") {
      if (b.password === "mala") return resp(400, { error_description: "Invalid login credentials" });
      if (b.refresh_token && window.__refreshFalla === "red") return Promise.reject(new TypeError("Failed to fetch"));
      if (b.refresh_token && window.__refreshFalla) return resp(400, { error_description: "Invalid Refresh Token" }); return resp(200, { access_token: "tok", refresh_token: "ref", expires_in: window.__expira || 3600, user: { email: b.email || "dueno@x.com" } }); }
    if (p === "/auth/v1/logout") return resp(204);
    if (p === "/rest/v1/rpc/es_admin") return resp(200, window.__admin);
    if (p === "/rest/v1/rpc/catalogo_publico") return resp(200, window.__catalogoPublico || {});
    if (m !== "GET" && typeof window.__fallarSi === "function" && window.__fallarSi(m + " " + p, b)) return resp(500, { message: "fallo simulado" });
    var t = p.split("/").pop(), q = url.searchParams, idEq = (q.get("id") || "").replace("eq.", "");
    if (t === "categorias_gasto" && window.__fallaCategorias) return resp(500, { message: "fallo" });
    if (p === "/rest/v1/rpc/renombrar_categoria") { db.categorias_gasto.forEach(function (c) { if (c.nombre === b.viejo) c.nombre = b.nuevo; }); ["gastos", "compromisos"].forEach(function (k) { db[k].forEach(function (r) { if (r.categoria === b.viejo) r.categoria = b.nuevo; }); }); return resp(204); }
    if (t === "omisiones" && m === "DELETE") { var oc = q.get("compromiso_id").replace("eq.", ""), op = q.get("periodo").replace("eq.", ""); db.omisiones = db.omisiones.filter(function (o) { return !(String(o.compromiso_id) === oc && o.periodo === op); }); return resp(204); }
    if (!db[t]) return resp(404, { code: "PGRST205" }); // tabla que aún no existe
    if (m === "GET") { // como Supabase: máximo 1000 filas por respuesta; respeta el encabezado Range
      var todo = db[t].slice().sort(CAT.indexOf(t) >= 0 ? function (a, c) { return (a.orden - c.orden) || (a.id - c.id); } : function (a, c) { return a.fecha < c.fecha ? 1 : -1; }), rg = (o.headers && o.headers.Range || "").match(/^(\d+)-(\d+)$/);
      var ini = rg ? +rg[1] : 0, fin = rg ? +rg[2] : ini + 999; fin = Math.min(fin, ini + 999);
      q.forEach(function (v, k) { if (k !== "select" && k !== "order" && /^eq\./.test(v)) { var w = v.slice(3); todo = todo.filter(function (r) { return String(r[k]) === w; }); } });
      return resp(200, todo.slice(ini, fin + 1));
    }
    if (window.__dbFalla && m !== "GET") return resp(500, { message: "fallo" });
    if (t === "variantes" && m === "POST" && window.__failVar > 0) { window.__failVar--; return resp(500, { message: "fallo" }); }
    var choca = function (fila, ignora) { var u = UNICO[t]; return u && db[t].some(function (r) { return String(r.id) !== String(ignora) && u.every(function (k) { return r[k] === fila[k]; }); }); };
    if (m === "POST" && (t === "ajustes" || t === "panel_ajustes" || t === "costos")) { // upsert por clave (Prefer: resolution=merge-duplicates)
      if (prefer.indexOf("merge-duplicates") < 0) return resp(409, { code: "23505" });
      var ya = db[t].filter(function (r) { return r.clave === b.clave; })[0];
      if (ya) Object.assign(ya, b); else db[t].push(b);
      return resp(201);
    }
    if (m === "DELETE" && t === "costos") { var cl = (q.get("clave") || "").replace("eq.", ""); db.costos = db.costos.filter(function (r) { return r.clave !== cl; }); return resp(204); }
    if (m === "POST" && t === "gastos" && ((b.compromiso_id != null && db.gastos.some(function (g) { return g.compromiso_id === b.compromiso_id && g.periodo === b.periodo; })) || (b.linea && db.gastos.some(function (g) { return g.linea === b.linea && g.periodo === b.periodo; })))) return resp(409, { code: "23505" });
    if (m === "POST" && t === "omisiones") { db.omisiones.push(b); return resp(201); }
    if (m === "POST" && (t === "compromisos" || t === "categorias_gasto") && b.activo == null) b.activo = true; // valor por defecto de la base
    if (m === "PATCH" && !idEq && q.get("categoria")) { var cv = q.get("categoria").replace("eq.", ""); db[t].forEach(function (r) { if (r.categoria === cv) Object.assign(r, b); }); return resp(204); }
    if (m === "POST") { // una fila o varias; con ?on_conflict=… y Prefer ignore-duplicates las repetidas se omiten (como PostgREST)
      var filas = Array.isArray(b) ? b : [b], ignora = q.get("on_conflict") && prefer.indexOf("ignore-duplicates") >= 0, nuevas = [];
      for (var fi = 0; fi < filas.length; fi++) {
        var fila = filas[fi]; if (CAT.indexOf(t) < 0) fila.creado = new Date().toISOString();
        if (UNICO[t] && UNICO[t].some(function (k) { return fila[k] == null; })) return resp(400, { code: "23502" });
        if (choca(fila) || nuevas.some(function (r) { return UNICO[t] && UNICO[t].every(function (k) { return r[k] === fila[k]; }); })) { if (ignora) continue; return resp(409, { code: "23505" }); }
        fila.id = ++id; nuevas.push(fila);
      }
      nuevas.forEach(function (r) { db[t].push(r); });
      return prefer.indexOf("representation") >= 0 ? resp(201, Array.isArray(b) ? nuevas : [nuevas[0]]) : resp(201);
    }
    if (m === "PATCH") {
      var nuevo = null; db[t].forEach(function (r) { if (String(r.id) === idEq) nuevo = Object.assign({}, r, b); });
      if (nuevo && choca(nuevo, idEq)) return resp(409, { code: "23505" });
      var cambiadas = []; db[t].forEach(function (r) { if (String(r.id) === idEq) { Object.assign(r, b); cambiadas.push(r); } });
      return prefer.indexOf("representation") >= 0 ? resp(200, cambiadas) : resp(204);
    }
    if (m === "DELETE") { // con borrado en cascada como la base real
      var ids = { categorias: "categoria_id", grupos: "grupo_id", productos: "producto_id" }, hijo = { categorias: "grupos", grupos: "productos", productos: "variantes" };
      var borra = function (tab, f) { var fuera = db[tab].filter(f); db[tab] = db[tab].filter(function (r) { return !f(r); }); if (hijo[tab]) fuera.forEach(function (x) { borra(hijo[tab], function (r) { return r[ids[tab]] === x.id; }); }); };
      var borradas = db[t].filter(function (r) { return String(r.id) === idEq; });
      borra(t, function (r) { return String(r.id) === idEq; });
      return prefer.indexOf("representation") >= 0 ? resp(200, borradas) : resp(204);
    }
    return resp(404);
  };
})();

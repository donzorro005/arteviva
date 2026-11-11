/* ARTE VIVA · Panel · cálculos de cuentas (sin acceso a internet ni a la página; solo números). */
(function (raiz, fab) {
  var M = fab();
  if (typeof module === "object" && module.exports) module.exports = M; else raiz.AVCalc = M;
})(this, function () {
  var PROVINCIAS = ["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"];
  var MATERIALES = ["Yeso", "Pinturas", "Pinceles", "Moldes"];
  var GASTOS_OPERATIVOS = ["Envíos", "Otros"];

  function money(n) { n = Math.round(n || 0); return (n < 0 ? "−" : "") + "₡" + Math.abs(n).toLocaleString("es-CR"); }
  function montoVenta(p) { return p.monto_final != null ? p.monto_final : (p.total || 0); }
  function esVenta(p) { return p.estado === "completado" && !p.prueba; }
  function mesDe(fecha) { return String(fecha).slice(0, 7); }
  function diasMes(mes) { var a = +mes.slice(0, 4), m = +mes.slice(5, 7); return new Date(Date.UTC(a, m, 0)).getUTCDate(); }
  function mesMas(mes, d) { var a = +mes.slice(0, 4), m = +mes.slice(5, 7) - 1 + d; a += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return a + "-" + ("0" + (m + 1)).slice(-2); }
  function norm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }

  function resumenMes(pedidos, gastos, mes, hoy) {
    var r = { ventas: 0, gastos: 0, materiales: 0, ganancia: 0, margen: 0, proyeccion: 0, nVentas: 0, nPendientes: 0 };
    pedidos.forEach(function (p) {
      if (mesDe(p.fecha) !== mes || p.prueba) return;
      if (p.estado === "pendiente") r.nPendientes++;
      if (esVenta(p)) { r.ventas += montoVenta(p); r.nVentas++; }
    });
    gastos.forEach(function (g) {
      if (mesDe(g.fecha) !== mes) return;
      r.gastos += g.monto;
      if (MATERIALES.indexOf(g.categoria) > -1) r.materiales += g.monto;
    });
    r.ganancia = r.ventas - r.gastos;
    r.margen = r.ventas ? Math.round(r.ganancia / r.ventas * 100) : 0;
    var dias = diasMes(mes);
    if (mesDe(hoy) === mes) { var hechos = Math.max(1, +String(hoy).slice(8, 10)); r.proyeccion = Math.round(r.ventas / hechos * dias); }
    else r.proyeccion = r.ventas;
    return r;
  }

  function serieMeses(pedidos, gastos, hastaMes, n) {
    n = n || 6;
    var s = [];
    for (var i = n - 1; i >= 0; i--) {
      var m = mesMas(hastaMes, -i), r = resumenMes(pedidos, gastos, m, m + "-01");
      s.push({ mes: m, ventas: r.ventas, gastos: r.gastos, ganancia: r.ganancia });
    }
    return s;
  }

  function porProvincia(pedidos, mes) {
    var o = {}, idx = {};
    PROVINCIAS.forEach(function (p) { o[p] = { n: 0, monto: 0 }; idx[norm(p)] = p; });
    o["Sin provincia"] = { n: 0, monto: 0 };
    pedidos.forEach(function (p) {
      if (!esVenta(p) || (mes && mesDe(p.fecha) !== mes)) return;
      var k = idx[norm(p.provincia)] || "Sin provincia";
      o[k].n++; o[k].monto += montoVenta(p);
    });
    return o;
  }

  function filasExcel(pedidos, gastos, desde, hasta) {
    var dentro = function (f) { return f >= desde && f <= hasta; };
    var ps = pedidos.filter(function (p) { return esVenta(p) && dentro(p.fecha); }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
    var gs = gastos.filter(function (g) { return dentro(g.fecha); }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
    var ventas = [["Fecha", "Cliente", "Provincia", "Origen", "Productos", "Total", "Monto cobrado"]].concat(ps.map(function (p) {
      return [p.fecha, p.nombre || "", p.provincia || "", p.origen === "manual" ? "A mano" : "Tienda",
        (p.items || []).map(function (i) { return i.q + " x " + i.n; }).join(", "), p.total || 0, montoVenta(p)];
    }));
    var gastosF = [["Fecha", "Descripción", "Categoría", "Monto"]].concat(gs.map(function (g) { return [g.fecha, g.descripcion, g.categoria, g.monto]; }));
    var meses = [], m = mesDe(desde);
    while (m <= mesDe(hasta)) { meses.push(m); m = mesMas(m, 1); }
    var resumen = [["Mes", "Ventas", "Gastos", "Materiales", "Ganancia", "Margen %", "Ventas (n)"]].concat(meses.map(function (mm) {
      var r = resumenMes(ps, gs, mm, mm + "-01");
      return [mm, r.ventas, r.gastos, r.materiales, r.ganancia, r.margen, r.nVentas];
    }));
    return { resumen: resumen, ventas: ventas, gastos: gastosF };
  }

  /* ---------- visitas (etapa 3) ---------- */
  var ORIGENES = ["ig", "fb", "qr", "otros"];
  function diaMas(dia, d) { var t = new Date(dia + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); }
  function lunesDe(dia) { var t = new Date(dia + "T12:00:00Z"), w = (t.getUTCDay() + 6) % 7; return diaMas(dia, -w); }
  function clavePor(dia, modo) { return modo === "mes" ? String(dia).slice(0, 7) : modo === "semana" ? lunesDe(String(dia).slice(0, 10)) : String(dia).slice(0, 10); }
  // Visitas (evento «visita») de los últimos n días, semanas o meses hasta «hasta», separadas por origen; los períodos sin datos van en 0.
  function visitasPor(visitas, modo, hasta, n) {
    var claves = [], ult = clavePor(hasta, modo), i;
    for (i = n - 1; i >= 0; i--) claves.push(modo === "mes" ? mesMas(ult, -i) : diaMas(ult, -i * (modo === "semana" ? 7 : 1)));
    var por = {};
    claves.forEach(function (k) { por[k] = { clave: k, ig: 0, fb: 0, qr: 0, otros: 0, total: 0 }; });
    visitas.forEach(function (v) {
      if (v.evento !== "visita" || ORIGENES.indexOf(v.origen) < 0) return;
      var f = por[clavePor(v.dia, modo)]; if (!f) return;
      f[v.origen] += v.n || 0; f.total += v.n || 0;
    });
    return claves.map(function (k) { return por[k]; });
  }
  // Mes: visitas, aperturas de tienda, toques de WhatsApp, ventas de la tienda web y % de visitas que compraron (null si no hubo visitas).
  function resumenVisitasMes(visitas, pedidos, mes) {
    var r = { visitas: 0, tienda: 0, whatsapp: 0, ventas: 0, conversion: null, porOrigen: { ig: 0, fb: 0, qr: 0, otros: 0 } };
    visitas.forEach(function (v) {
      if (mesDe(v.dia) !== mes) return;
      if (v.evento === "visita") { r.visitas += v.n || 0; if (r.porOrigen[v.origen] != null) r.porOrigen[v.origen] += v.n || 0; }
      else if (v.evento === "tienda") r.tienda += v.n || 0;
      else if (v.evento === "whatsapp") r.whatsapp += v.n || 0;
    });
    pedidos.forEach(function (p) { if (esVenta(p) && p.origen !== "manual" && mesDe(p.fecha) === mes) r.ventas++; });
    // sin visitas, o con más ventas que visitas contadas (el primer mes, antes de empezar a contar), no hay porcentaje confiable
    if (r.visitas && r.ventas <= r.visitas) r.conversion = Math.round(r.ventas / r.visitas * 1000) / 10;
    return r;
  }

  /* ---------- tablero de Inicio ---------- */
  // Los paquetes guardan las figuras elegidas en el nombre: para buscar el costo solo sirve la parte de antes.
  function nombreBase(n) { return String(n || "").split(" · Figuras:")[0].trim(); }
  function variacion(actual, anterior) { return anterior ? Math.round((actual - anterior) / anterior * 100) : null; }

  function porCobrar(pedidos) {
    var r = { monto: 0, n: 0 };
    pedidos.forEach(function (p) { if (p.estado === "pendiente" && !p.prueba) { r.monto += p.total || 0; r.n++; } });
    return r;
  }

  // Las compras de materiales ya están en el costo de cada producto: aquí solo se restan los demás gastos, para no contarlas dos veces.
  function gananciaReal(pedidos, gastos, mes, costos, fijos) {
    var r = { ventas: 0, costoVendido: 0, operativos: 0, fijos: fijos || 0, ganancia: 0, margen: 0, sinCosto: [], sinDetalle: 0 }, faltan = {};
    pedidos.forEach(function (p) {
      if (!esVenta(p) || mesDe(p.fecha) !== mes) return;
      r.ventas += montoVenta(p);
      if (!p.items || !p.items.length) { r.sinDetalle++; return; }
      p.items.forEach(function (i) {
        var b = nombreBase(i.n);
        if (costos[b] != null) r.costoVendido += costos[b] * (i.q || 1); else faltan[b] = true;
      });
    });
    gastos.forEach(function (g) { if (mesDe(g.fecha) === mes && GASTOS_OPERATIVOS.indexOf(g.categoria) > -1) r.operativos += g.monto; });
    r.sinCosto = Object.keys(faltan).sort();
    r.ganancia = r.ventas - r.costoVendido - r.operativos - r.fijos;
    r.margen = r.ventas ? Math.round(r.ganancia / r.ventas * 100) : 0;
    return r;
  }

  function totalFijos(fijos) { return (fijos || []).reduce(function (t, f) { return t + (f.monto || 0); }, 0); }

  // Margen sobre el precio, igual que en «Precios bajos». modo: "pct" (margen %), "monto" (ganancia en ₡) o "precio" (precio final).
  function costeo(o) {
    var hrs = o.horasMes > 0 ? o.horasMes : 160, fijoHora = (o.fijos || 0) / hrs, fijoPieza = fijoHora * (o.minutos || 0) / 60;
    var directo = (o.materiales || 0) + (o.extras || 0), base = directo + fijoPieza, v = o.valor || 0;
    var precio = o.modo === "precio" ? v : o.modo === "monto" ? base + v : base / (1 - Math.min(Math.max(v, 0), 95) / 100);
    return { fijoHora: Math.round(fijoHora), fijoPieza: Math.round(fijoPieza), directo: Math.round(directo), base: Math.round(base), precio: Math.round(precio), ganancia: Math.round(precio - base), margen: precio > 0 ? Math.round((precio - base) / precio * 1000) / 10 : 0 };
  }

  function metaProgreso(ventas, nVentas, meta) {
    if (!(meta > 0)) return null;
    var falta = Math.max(0, meta - ventas), ticket = nVentas ? Math.round(ventas / nVentas) : 0;
    return { pct: Math.min(100, Math.round(ventas / meta * 100)), falta: falta, ticket: ticket, pedidos: ticket ? Math.ceil(falta / ticket) : null };
  }

  // catalogo: [{ n, p }]. Solo entran los que tienen precio y costo: sin alguno de los dos no hay margen que medir.
  function preciosBajos(catalogo, costos, umbral) {
    return catalogo.filter(function (x) { return x.p > 0 && costos[x.n] != null; }).map(function (x) {
      return { n: x.n, p: x.p, costo: costos[x.n], margen: Math.round((x.p - costos[x.n]) / x.p * 100) };
    }).filter(function (x) { return x.margen < umbral; }).sort(function (a, b) { return a.margen - b.margen; });
  }

  function porDespachar(pedidos, hoy) {
    var man = diaMas(hoy, 1), r = { atrasados: [], hoy: [], manana: [], luego: [], sinFecha: [] };
    pedidos.forEach(function (p) {
      if (p.estado !== "pendiente" || p.prueba) return;
      var f = p.fecha_entrega ? String(p.fecha_entrega).slice(0, 10) : "";
      (!f ? r.sinFecha : f < hoy ? r.atrasados : f === hoy ? r.hoy : f === man ? r.manana : r.luego).push(p);
    });
    var porFecha = function (a, b) { return String(a.fecha_entrega) < String(b.fecha_entrega) ? -1 : 1; };
    r.atrasados.sort(porFecha); r.luego.sort(porFecha);
    return r;
  }

  function embudo(visitas, pedidos, mes) {
    var r = { visitas: 0, tienda: 0, pedidos: 0, completados: 0, montoPedidos: 0, montoCompletados: 0, cancelados: 0 };
    visitas.forEach(function (v) { if (mesDe(v.dia) !== mes) return; if (v.evento === "visita") r.visitas += v.n || 0; else if (v.evento === "tienda") r.tienda += v.n || 0; });
    pedidos.forEach(function (p) {
      if (p.prueba || p.origen === "manual" || mesDe(p.fecha) !== mes) return;
      r.pedidos++; r.montoPedidos += p.total || 0;
      if (p.estado === "completado") { r.completados++; r.montoCompletados += montoVenta(p); }
      else if (p.estado === "cancelado") r.cancelados++;
    });
    return r;
  }

  function top(pedidos, desde, hasta, costos, n) {
    var prods = {}, clientes = {};
    pedidos.forEach(function (p) {
      var f = String(p.fecha).slice(0, 10);
      if (!esVenta(p) || f < desde || f > hasta) return;
      var nom = String(p.nombre || "").trim();
      if (nom) { var k = norm(nom), c = clientes[k] || (clientes[k] = { n: nom, monto: 0, compras: 0 }); c.monto += montoVenta(p); c.compras++; }
      (p.items || []).forEach(function (i) {
        var b = nombreBase(i.n), x = prods[b] || (prods[b] = { n: b, unidades: 0, ingreso: 0, ganancia: 0, conGanancia: false }), q = i.q || 1;
        x.unidades += q; x.ingreso += i.t || 0;
        if (i.t && costos[b] != null) { x.ganancia += i.t - costos[b] * q; x.conGanancia = true; }
      });
    });
    var lista = Object.keys(prods).map(function (k) { return prods[k]; }), corta = function (a) { return a.slice(0, n || 5); };
    return {
      vendidos: corta(lista.slice().sort(function (a, b) { return b.unidades - a.unidades || b.ingreso - a.ingreso; })),
      ganancia: corta(lista.filter(function (x) { return x.conGanancia; }).sort(function (a, b) { return b.ganancia - a.ganancia; })),
      clientes: corta(Object.keys(clientes).map(function (k) { return clientes[k]; }).sort(function (a, b) { return b.monto - a.monto; }))
    };
  }

  return { nombreBase: nombreBase, variacion: variacion, porCobrar: porCobrar, gananciaReal: gananciaReal, totalFijos: totalFijos, costeo: costeo, metaProgreso: metaProgreso, preciosBajos: preciosBajos, porDespachar: porDespachar, embudo: embudo, top: top, diaMas: diaMas,
    ORIGENES: ORIGENES, visitasPor: visitasPor, resumenVisitasMes: resumenVisitasMes, lunesDe: lunesDe,
    PROVINCIAS: PROVINCIAS, MATERIALES: MATERIALES, money: money, montoVenta: montoVenta, esVenta: esVenta,
    mesMas: mesMas, diasMes: diasMes, resumenMes: resumenMes, serieMeses: serieMeses, porProvincia: porProvincia, filasExcel: filasExcel };
});

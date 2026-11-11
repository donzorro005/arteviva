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
    var gastosF = [["Fecha", "Descripción", "Tipo", "Categoría", "Monto", "N.º de factura", "IVA pagado", "Anotó"]].concat(gs.map(function (g) { return [g.fecha, g.descripcion, g.tipo || "", g.categoria, g.monto, g.factura || "", g.iva || 0, g.registrado_por || ""]; }));
    var meses = [], m = mesDe(desde);
    while (m <= mesDe(hasta)) { meses.push(m); m = mesMas(m, 1); }
    var resumen = [["Mes", "Ventas", "Gastos", "Materiales", "Ventas menos gastos", "Margen %", "Ventas (n)"]].concat(meses.map(function (mm) {
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
  function gananciaReal(pedidos, gastos, mes, costos, categorias, provision) {
    var r = { ventas: 0, costoVendido: 0, operativos: 0, provision: provision || 0, ganancia: 0, margen: 0, sinCosto: [], sinDetalle: 0 }, faltan = {};
    pedidos.forEach(function (p) {
      if (!esVenta(p) || mesDe(p.fecha) !== mes) return;
      r.ventas += montoVenta(p);
      if (!p.items || !p.items.length) { r.sinDetalle++; return; }
      p.items.forEach(function (i) {
        var b = nombreBase(i.n);
        if (costos[b] != null) r.costoVendido += costos[b] * (i.q || 1); else faltan[b] = true;
      });
    });
    var enCosto = {}; (categorias || []).forEach(function (c) { enCosto[c.nombre] = c.en_costo; });
    gastos.forEach(function (g) {
      if (mesDe(g.fecha) !== mes) return;
      if (categorias ? !enCosto[g.categoria] : GASTOS_OPERATIVOS.indexOf(g.categoria) > -1) r.operativos += g.monto;
    });
    r.sinCosto = Object.keys(faltan).sort();
    r.ganancia = r.ventas - r.costoVendido - r.operativos - r.provision;
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

  /* ---------- contabilidad ---------- */
  // Períodos: "AAAA-MM" (mensual), "AAAA-MM-Q1" (días 1 a 15) y "AAAA-MM-Q2" (16 a fin de mes).
  function periodoDeFecha(fecha, frecuencia) {
    var f = String(fecha).slice(0, 10), m = f.slice(0, 7);
    return frecuencia === "quincenal" ? m + (+f.slice(8, 10) <= 15 ? "-Q1" : "-Q2") : m;
  }
  function periodosEntre(desde, hasta, frecuencia) {
    var quin = frecuencia === "quincenal", norm_ = function (x, fin) { x = String(x); return quin ? (x.length === 7 ? x + (fin ? "-Q2" : "-Q1") : x) : x.slice(0, 7); };
    var d = norm_(desde, false), h = norm_(hasta, true), l = [], m = d.slice(0, 7);
    for (; m <= h.slice(0, 7); m = mesMas(m, 1)) (quin ? [m + "-Q1", m + "-Q2"] : [m]).forEach(function (p) { if (p >= d && p <= h) l.push(p); });
    return l;
  }
  function porPagar(compromisos, pagos, omisiones, hoy) {
    var hechos = {}, l = [], marca = function (x) { hechos[x.compromiso_id + "|" + x.periodo] = true; };
    pagos.forEach(marca); omisiones.forEach(marca);
    compromisos.forEach(function (c) {
      if (!c.activo && !c.hasta) return;
      var actual = periodoDeFecha(hoy, c.frecuencia), fin = c.hasta && c.hasta < actual ? c.hasta : actual;
      periodosEntre(c.desde, fin, c.frecuencia).forEach(function (p) { if (!hechos[c.id + "|" + p]) l.push({ compromiso: c, periodo: p, atrasado: p < actual }); });
    });
    return l.sort(function (a, b) { return a.periodo < b.periodo ? -1 : a.periodo > b.periodo ? 1 : a.compromiso.id - b.compromiso.id; });
  }
  function planilla(bruto, tasas) {
    var t = tasas || {}, pct = function (k) { return Math.round(bruto * (+t[k] || 0) / 100); }, r = { bruto: bruto, ccssPatronal: pct("ccss_patronal"), ccssTrabajador: pct("ccss_trabajador"), ins: pct("ins"), aguinaldo: pct("aguinaldo"), vacaciones: pct("vacaciones") };
    r.neto = bruto - r.ccssTrabajador; r.costo = bruto + r.ccssPatronal + r.ins;
    return r;
  }
  // Salarios en planilla del mes, período por período: lo pagado vale lo que se pagó, lo omitido no cuenta y lo demás usa el salario actual.
  function brutoMes(compromisos, mes, pagos, omisiones) {
    var pago = {}, omit = {};
    (pagos || []).forEach(function (p) { pago[p.compromiso_id + "|" + p.periodo] = p.monto; });
    (omisiones || []).forEach(function (o) { omit[o.compromiso_id + "|" + o.periodo] = true; });
    return compromisos.reduce(function (t, c) {
      if (c.tipo !== "salario" || !c.en_planilla || (!c.activo && !c.hasta)) return t;
      var fin = c.hasta && String(c.hasta).slice(0, 7) <= mes ? c.hasta : mes;
      periodosEntre(c.desde, fin, c.frecuencia).forEach(function (p) {
        var k = c.id + "|" + p;
        if (p.slice(0, 7) === mes && !omit[k]) t += pago[k] != null ? pago[k] : c.monto;
      });
      return t;
    }, 0);
  }
  function provisionAguinaldo(compromisos, mes, tasas, pagos, omisiones) { return planilla(brutoMes(compromisos, mes, pagos, omisiones), tasas).aguinaldo; }
  // Lo pagado de aguinaldo que supera lo apartado en los 12 meses anteriores (por ejemplo, tiempo trabajado antes de usar el panel) sí se resta.
  function aguinaldoExcedente(gastos, compromisos, mes, tasas, pagos, omisiones) {
    var pagado = gastos.reduce(function (t, g) { return t + (mesDe(g.fecha) === mes && g.categoria === "Aguinaldo pagado" ? g.monto : 0); }, 0), apartado = 0;
    if (!pagado) return 0;
    for (var d = 0; d < 12; d++) apartado += provisionAguinaldo(compromisos, mesMas(mes, -d), tasas, pagos, omisiones);
    return Math.max(0, pagado - apartado);
  }
  function cargasDelMes(compromisos, mes, tasas, patronoDesde, pagos, omisiones) {
    var P = planilla(brutoMes(compromisos, mes, pagos, omisiones), tasas);
    return { bruto: P.bruto, ccssPatronal: P.ccssPatronal, ccssTrabajador: P.ccssTrabajador, ccss: P.ccssPatronal + P.ccssTrabajador, ins: P.ins, estimado: !patronoDesde || mes < String(patronoDesde).slice(0, 7) };
  }
  // Lo que se paga a la CCSS incluye la parte del trabajador, que ya se contó dentro del salario bruto.
  function gastoCcss(totalPagado, ccssTrabajador) { return Math.max(0, totalPagado - ccssTrabajador); }
  function comprasVsCargado(gastos, pedidos, mes, costos, categorias) {
    var mat = {}; categorias.forEach(function (c) { if (c.en_costo && c.tipo === "variable") mat[c.nombre] = true; });
    return { comprado: gastos.reduce(function (t, g) { return t + (mesDe(g.fecha) === mes && mat[g.categoria] ? g.monto : 0); }, 0), cargado: gananciaReal(pedidos, [], mes, costos, categorias).costoVendido };
  }
  // Mientras los precios no incluyan IVA, lo cobrado es cero.
  function resumenIva(gastos, desde, hasta) {
    var filas = gastos.filter(function (g) { var f = String(g.fecha).slice(0, 10); return f >= desde && f <= hasta; });
    return { pagado: filas.reduce(function (t, g) { return t + (g.iva || 0); }, 0), cobrado: 0, filas: filas };
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

  return { nombreBase: nombreBase, variacion: variacion, porCobrar: porCobrar, gananciaReal: gananciaReal, totalFijos: totalFijos, costeo: costeo, periodoDeFecha: periodoDeFecha, periodosEntre: periodosEntre, porPagar: porPagar, planilla: planilla, provisionAguinaldo: provisionAguinaldo, aguinaldoExcedente: aguinaldoExcedente, cargasDelMes: cargasDelMes, gastoCcss: gastoCcss, comprasVsCargado: comprasVsCargado, resumenIva: resumenIva, metaProgreso: metaProgreso, preciosBajos: preciosBajos, porDespachar: porDespachar, embudo: embudo, top: top, diaMas: diaMas,
    ORIGENES: ORIGENES, visitasPor: visitasPor, resumenVisitasMes: resumenVisitasMes, lunesDe: lunesDe,
    PROVINCIAS: PROVINCIAS, MATERIALES: MATERIALES, money: money, montoVenta: montoVenta, esVenta: esVenta,
    mesMas: mesMas, diasMes: diasMes, resumenMes: resumenMes, serieMeses: serieMeses, porProvincia: porProvincia, filasExcel: filasExcel };
});

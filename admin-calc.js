/* ARTE VIVA · Panel · cálculos de cuentas (sin acceso a internet ni a la página; solo números). */
(function (raiz, fab) {
  var M = fab();
  if (typeof module === "object" && module.exports) module.exports = M; else raiz.AVCalc = M;
})(this, function () {
  var PROVINCIAS = ["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"];
  var MATERIALES = ["Yeso", "Pinturas", "Pinceles", "Moldes"];

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

  return { PROVINCIAS: PROVINCIAS, MATERIALES: MATERIALES, money: money, montoVenta: montoVenta, esVenta: esVenta,
    mesMas: mesMas, diasMes: diasMes, resumenMes: resumenMes, serieMeses: serieMeses, porProvincia: porProvincia, filasExcel: filasExcel };
});

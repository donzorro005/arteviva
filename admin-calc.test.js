const test = require("node:test"), assert = require("node:assert");
const C = require("../admin-calc.js");
const P = (o) => Object.assign({estado:"completado",prueba:false,total:0,fecha:"2026-10-05",items:[]}, o);

test("monto final manda sobre total", () => assert.equal(C.montoVenta(P({total:5000, monto_final:5500})), 5500));

test("resumenMes cuenta solo completados no prueba", () => {
  const ped=[P({total:10000}), P({total:3000, estado:"pendiente"}), P({total:9000, prueba:true}), P({total:2000, estado:"cancelado"})];
  const gas=[{fecha:"2026-10-02",categoria:"Yeso",monto:3000},{fecha:"2026-10-03",categoria:"Envíos",monto:1000}];
  const r=C.resumenMes(ped,gas,"2026-10","2026-10-10");
  assert.deepEqual([r.ventas,r.gastos,r.materiales,r.ganancia,r.nVentas,r.nPendientes],[10000,4000,3000,6000,1,1]);
  assert.equal(r.proyeccion, 31000); // 10000/10*31
});

test("resumenMes vacío no da NaN", () => {
  const r=C.resumenMes([],[],"2026-10","2026-10-01");
  for (const v of Object.values(r)) assert.ok(Number.isFinite(v));
});

test("mes cerrado: proyección = ventas", () => assert.equal(C.resumenMes([P({total:7000,fecha:"2026-09-10"})],[],"2026-09","2026-10-10").proyeccion, 7000));

test("serieMeses rellena meses vacíos", () => {
  const s=C.serieMeses([P({total:1000})],[],"2026-10",6);
  assert.equal(s.length,6); assert.equal(s[0].mes,"2026-05"); assert.equal(s[5].ventas,1000); assert.equal(s[4].ventas,0);
});

test("serieMeses cruza el año", () => {
  const s=C.serieMeses([],[],"2026-02",3);
  assert.deepEqual(s.map(x=>x.mes),["2025-12","2026-01","2026-02"]);
});

test("porProvincia normaliza y agrupa sin provincia", () => {
  const m=C.porProvincia([P({total:1000,provincia:"san jose"}),P({total:500,provincia:null}),P({total:200,provincia:"Cartago",prueba:true})],null);
  assert.deepEqual(m["San José"],{n:1,monto:1000}); assert.deepEqual(m["Sin provincia"],{n:1,monto:500}); assert.deepEqual(m["Cartago"],{n:0,monto:0});
});

test("porProvincia filtra por mes", () => {
  const m=C.porProvincia([P({total:1000,provincia:"Limón",fecha:"2026-09-01"})],"2026-10");
  assert.deepEqual(m["Limón"],{n:0,monto:0});
});

test("money", () => assert.equal(C.money(15000).replace(/\s/g," "), "₡15 000"));
test("money negativo pone el signo antes del colón", () => assert.equal(C.money(-6400).replace(/\s/g," "), "−₡6 400"));

test("filasExcel encabezados", () => {
  const f=C.filasExcel([P({total:1000,nombre:"Ana",items:[{n:"Figura: Sol",q:2,p:500,t:1000}]})],[],"2026-10-01","2026-10-31");
  assert.equal(f.ventas[0][0],"Fecha"); assert.equal(f.ventas[1][4],"2 x Figura: Sol"); assert.equal(f.resumen[0][6],"Ventas (n)");
});

test("filasExcel respeta el rango y omite pruebas", () => {
  const f=C.filasExcel([P({total:1000,fecha:"2026-09-30"}),P({total:2000}),P({total:9,prueba:true})],[{fecha:"2026-11-01",descripcion:"x",categoria:"Otros",monto:5}],"2026-10-01","2026-10-31");
  assert.equal(f.ventas.length,2); assert.equal(f.gastos.length,1); assert.deepEqual(f.resumen[1].slice(0,3),["2026-10",2000,0]);
});

// ---------- Visitas (etapa 3) ----------
const V = (dia, origen, evento, n) => ({ dia, origen, evento, n });
const VIS = [V("2026-10-05","ig","visita",10), V("2026-10-05","fb","visita",4), V("2026-10-06","qr","visita",2), V("2026-10-06","otros","visita",1),
  V("2026-10-05","ig","tienda",5), V("2026-10-06","otros","whatsapp",3), V("2026-09-30","ig","visita",7)];

test("visitasPor día rellena días vacíos y separa por origen", () => {
  const s = C.visitasPor(VIS, "dia", "2026-10-07", 3);
  assert.deepEqual(s.map(x => x.clave), ["2026-10-05","2026-10-06","2026-10-07"]);
  assert.deepEqual([s[0].ig, s[0].fb, s[0].total], [10, 4, 14]);
  assert.deepEqual([s[1].qr, s[1].otros, s[1].total], [2, 1, 3]);
  assert.equal(s[2].total, 0);
});

test("visitasPor semana agrupa de lunes a domingo", () => {
  const s = C.visitasPor(VIS, "semana", "2026-10-07", 2); // 2026-10-05 es lunes
  assert.deepEqual(s.map(x => x.clave), ["2026-09-28","2026-10-05"]);
  assert.deepEqual([s[0].total, s[1].total], [7, 17]);
});

test("visitasPor cuenta WhatsApp aparte", () => {
  const s = C.visitasPor([V("2026-10-05","wa","visita",4), V("2026-10-05","ig","visita",1)], "dia", "2026-10-05", 1);
  assert.deepEqual([s[0].wa, s[0].ig, s[0].total], [4, 1, 5]);
  assert.equal(C.resumenVisitasMes([V("2026-10-05","wa","visita",4)], [], "2026-10").porOrigen.wa, 4);
});

test("visitasPor mes cruza el año", () => {
  const s = C.visitasPor([V("2025-12-31","ig","visita",2), V("2026-01-01","fb","visita",3)], "mes", "2026-01-15", 2);
  assert.deepEqual(s.map(x => [x.clave, x.total]), [["2025-12", 2], ["2026-01", 3]]);
});

test("resumenVisitasMes cruza con ventas y calcula el % que compró", () => {
  const ped = [P({ total: 1000, fecha: "2026-10-05" }), P({ total: 500, fecha: "2026-10-06", origen: "manual" }), P({ total: 9, fecha: "2026-10-06", prueba: true }), P({ total: 7, fecha: "2026-10-06", estado: "pendiente" })];
  const r = C.resumenVisitasMes(VIS, ped, "2026-10");
  assert.deepEqual([r.visitas, r.tienda, r.whatsapp, r.ventas], [17, 5, 3, 1]); // solo ventas de la tienda web (la manual no vino de una visita)
  assert.deepEqual(r.porOrigen, { ig: 10, fb: 4, wa: 0, qr: 2, otros: 1 });
  assert.equal(r.conversion, 5.9); // 1 / 17
});

test("resumenVisitasMes sin visitas no divide entre cero", () => {
  const r = C.resumenVisitasMes([], [P({ total: 1000 })], "2026-10");
  assert.equal(r.visitas, 0); assert.equal(r.conversion, null);
});

test("resumenVisitasMes no pasa de 100% si hay más ventas que visitas contadas (primer mes)", () => {
  const r = C.resumenVisitasMes([V("2026-10-27","ig","visita",1)], [P({ total: 1, fecha: "2026-10-03" }), P({ total: 1, fecha: "2026-10-04" })], "2026-10");
  assert.equal(r.conversion, null);
});

/* ---------- tablero de Inicio ---------- */
const I = (n, q, t) => ({ n, q, p: 0, t });

test("nombreBase quita las figuras elegidas", () => assert.equal(C.nombreBase("Paquete de relajación: Flores · Figuras: Sol, Luna"), "Paquete de relajación: Flores"));

test("variacion: sube, baja y sin mes anterior", () => {
  assert.equal(C.variacion(150, 100), 50); assert.equal(C.variacion(50, 100), -50); assert.equal(C.variacion(50, 0), null);
});

test("porCobrar suma solo pendientes que no son prueba", () => {
  assert.deepEqual(C.porCobrar([P({total:3000,estado:"pendiente"}), P({total:9000,estado:"pendiente",prueba:true}), P({total:5000})]), {monto:3000,n:1});
});

test("gananciaReal resta costo y solo gastos operativos, sin contar materiales dos veces", () => {
  const ped=[P({total:10000,items:[I("Figura: Sol",2,1000),I("Paquete: X · Figuras: Luna",1,9000)]})];
  const gas=[{fecha:"2026-10-02",categoria:"Yeso",monto:5000},{fecha:"2026-10-03",categoria:"Envíos",monto:1000},{fecha:"2026-10-04",categoria:"Otros",monto:500},{fecha:"2026-09-04",categoria:"Otros",monto:700}];
  const r=C.gananciaReal(ped,gas,"2026-10",{"Figura: Sol":16,"Paquete: X":800});
  assert.deepEqual([r.ventas,r.costoVendido,r.operativos,r.ganancia,r.margen],[10000,832,1500,7668,77]);
  assert.deepEqual(r.sinCosto,[]);
});

test("gananciaReal avisa productos sin costo y ventas sin detalle", () => {
  const r=C.gananciaReal([P({total:1000,items:[I("Figura: Sol",1,1000)]}),P({total:2000})],[],"2026-10",{});
  assert.deepEqual(r.sinCosto,["Figura: Sol"]); assert.equal(r.sinDetalle,1); assert.equal(r.ganancia,3000);
});

test("gananciaReal vacía no da NaN", () => assert.equal(C.gananciaReal([],[],"2026-10",{}).margen,0));

test("metaProgreso calcula lo que falta y los pedidos", () => {
  assert.deepEqual(C.metaProgreso(10000,4,20000),{pct:50,falta:10000,ticket:2500,pedidos:4});
  assert.equal(C.metaProgreso(30000,1,20000).pct,100); assert.equal(C.metaProgreso(30000,1,20000).falta,0);
  assert.equal(C.metaProgreso(0,0,20000).pedidos,null); assert.equal(C.metaProgreso(5,1,0),null);
});

test("preciosBajos lista bajo el umbral, del peor al mejor, e ignora sin costo o precio", () => {
  const r=C.preciosBajos([{n:"a",p:1000},{n:"b",p:1000},{n:"c",p:1000},{n:"d",p:null},{n:"e",p:1000}],{a:900,b:850,c:100,d:5},20);
  assert.deepEqual(r.map(x=>[x.n,x.margen]),[["a",10],["b",15]]);
});

test("porDespachar separa atrasados, hoy, mañana, luego y sin fecha", () => {
  const f=(d,o)=>P(Object.assign({estado:"pendiente",fecha_entrega:d},o));
  const r=C.porDespachar([f("2026-10-01"),f("2026-10-10"),f("2026-10-11"),f("2026-10-20"),f(null),f("2026-10-01",{estado:"completado"}),f("2026-10-01",{prueba:true})],"2026-10-10");
  assert.deepEqual([r.atrasados,r.hoy,r.manana,r.luego,r.sinFecha].map(x=>x.length),[1,1,1,1,1]);
});

test("porDespachar cruza fin de mes", () => assert.equal(C.porDespachar([P({estado:"pendiente",fecha_entrega:"2026-11-01"})],"2026-10-31").manana.length,1));

test("embudo cuenta visitas y solo pedidos de la tienda", () => {
  const v=[{dia:"2026-10-02",evento:"visita",n:10},{dia:"2026-10-02",evento:"tienda",n:4},{dia:"2026-09-02",evento:"visita",n:99}];
  const p=[P({total:1000,origen:"web"}),P({total:500,origen:"web",estado:"pendiente"}),P({total:800,origen:"web",estado:"cancelado"}),P({total:7000,origen:"manual"})];
  assert.deepEqual(C.embudo(v,p,"2026-10"),{visitas:10,tienda:4,pedidos:3,completados:1,montoPedidos:2300,montoCompletados:1000,cancelados:1});
});

test("top ordena por unidades, por ganancia y agrupa clientes por nombre", () => {
  const p=[P({total:3000,nombre:"Ana",items:[I("A",3,300),I("B",1,2700)]}),P({total:1000,nombre:" ana ",items:[I("A",1,100)]}),P({total:9000,nombre:"Luis",items:[I("C",1,9000)]})];
  const r=C.top(p,"2026-10-01","2026-10-31",{A:10,B:100},5);
  assert.deepEqual(r.vendidos.map(x=>x.n),["A","C","B"]); // B y C empatan en unidades: gana el de más ingreso
  assert.deepEqual(r.ganancia.map(x=>[x.n,x.ganancia]),[["B",2600],["A",360]]);
  assert.deepEqual(r.clientes.map(x=>[x.n,x.monto,x.compras]),[["Luis",9000,1],["Ana",4000,2]]);
});

test("costeo reparte los fijos por tiempo y calcula el precio por margen", () => {
  const r=C.costeo({materiales:300,extras:100,fijos:16000,horasMes:160,minutos:30,modo:"pct",valor:50});
  assert.deepEqual([r.fijoHora,r.fijoPieza,r.directo,r.base,r.precio,r.ganancia,r.margen],[100,50,400,450,900,450,50]);
});

test("costeo por monto y por precio final", () => {
  assert.equal(C.costeo({materiales:400,modo:"monto",valor:100}).precio,500);
  const r=C.costeo({materiales:400,modo:"precio",valor:500}); assert.deepEqual([r.ganancia,r.margen],[100,20]);
});

test("costeo: precio bajo el costo da margen negativo y sin precio no da NaN", () => {
  assert.equal(C.costeo({materiales:600,modo:"precio",valor:500}).ganancia,-100);
  const r=C.costeo({modo:"precio",valor:0}); for (const v of Object.values(r)) assert.ok(Number.isFinite(v));
});

test("costeo sin horas usa 160 y el margen tiene tope", () => {
  assert.equal(C.costeo({fijos:1600,horasMes:0,minutos:60,modo:"pct",valor:0}).fijoHora,10);
  assert.ok(Number.isFinite(C.costeo({materiales:100,modo:"pct",valor:100}).precio));
});

/* ---------- contabilidad ---------- */
const CATS = [{nombre:"Yeso",tipo:"variable",en_costo:true},{nombre:"Envíos",tipo:"variable",en_costo:false},{nombre:"Salarios",tipo:"salario",en_costo:false},{nombre:"Aguinaldo pagado",tipo:"salario",en_costo:true}];
const TASAS = {ccss_patronal:26.83,ccss_trabajador:10.83,ins:1,aguinaldo:8.33,vacaciones:4.16};
const K = (o) => Object.assign({id:1,nombre:"Luz",tipo:"fijo",monto:1000,frecuencia:"mensual",categoria:"Servicios",activo:true,en_planilla:false,desde:"2026-10",hasta:null}, o);
const S = (o) => K(Object.assign({id:2,nombre:"Ana",tipo:"salario",monto:100000,frecuencia:"quincenal",categoria:"Salarios",en_planilla:true,desde:"2026-10-Q1"}, o));

test("periodosEntre quincenal cruza fin de mes", () => assert.deepEqual(C.periodosEntre("2026-02-Q2","2026-03-Q1","quincenal"),["2026-02-Q2","2026-03-Q1"]));
test("periodosEntre mensual cruza el año", () => assert.deepEqual(C.periodosEntre("2026-11","2027-01","mensual"),["2026-11","2026-12","2027-01"]));
test("periodosEntre: desde mensual en compromiso quincenal arranca en Q1", () => assert.deepEqual(C.periodosEntre("2026-11","2026-11-Q2","quincenal"),["2026-11-Q1","2026-11-Q2"]));
test("periodosEntre vacío si desde es posterior", () => assert.deepEqual(C.periodosEntre("2026-12","2026-11","mensual"),[]));
test("periodoDeFecha", () => {
  assert.equal(C.periodoDeFecha("2026-02-28","quincenal"),"2026-02-Q2"); assert.equal(C.periodoDeFecha("2026-02-15","quincenal"),"2026-02-Q1"); assert.equal(C.periodoDeFecha("2026-02-16","quincenal"),"2026-02-Q2"); assert.equal(C.periodoDeFecha("2026-02-28","mensual"),"2026-02");
});

test("porPagar respeta desde, pagos y omisiones, y marca atrasados", () => {
  const r=C.porPagar([K()],[{compromiso_id:1,periodo:"2026-10"}],[],"2026-12-05");
  assert.deepEqual(r.map(x=>[x.periodo,x.atrasado]),[["2026-11",true],["2026-12",false]]);
  assert.deepEqual(C.porPagar([K()],[],[{compromiso_id:1,periodo:"2026-10"},{compromiso_id:1,periodo:"2026-11"}],"2026-11-05").length,0);
});
test("porPagar: compromiso creado a mitad de mes no inventa períodos anteriores", () => {
  assert.deepEqual(C.porPagar([S({desde:"2026-11-Q2"})],[],[],"2026-11-20").map(x=>x.periodo),["2026-11-Q2"]);
});
test("porPagar: inactivo deja de generar pero conserva lo atrasado hasta su fin", () => {
  assert.deepEqual(C.porPagar([K({activo:false,hasta:"2026-10"})],[],[],"2026-12-01").map(x=>x.periodo),["2026-10"]);
});

test("planilla: neto y costo salen del bruto", () => {
  const r=C.planilla(100000,TASAS);
  assert.deepEqual([r.bruto,r.ccssPatronal,r.ccssTrabajador,r.ins,r.aguinaldo,r.vacaciones,r.neto,r.costo],[100000,26830,10830,1000,8330,4160,89170,127830]);
});
test("planilla sin tasas no da NaN", () => { for (const v of Object.values(C.planilla(100000,{}))) assert.ok(Number.isFinite(v)); });

test("gananciaReal con categorías no resta las que van en el costo", () => {
  const ped=[P({total:10000,items:[I("A",1,10000)]})];
  const gas=[{fecha:"2026-10-02",categoria:"Yeso",monto:5000},{fecha:"2026-10-03",categoria:"Envíos",monto:1000},{fecha:"2026-10-04",categoria:"Salarios",monto:2000},{fecha:"2026-10-05",categoria:"Aguinaldo pagado",monto:900},{fecha:"2026-10-06",categoria:"Inventada",monto:100}];
  const r=C.gananciaReal(ped,gas,"2026-10",{A:1000},CATS,500);
  assert.deepEqual([r.costoVendido,r.operativos,r.provision,r.ganancia],[1000,3100,500,5400]);
});
test("gananciaReal sin categorías sigue con los gastos operativos", () => {
  assert.equal(C.gananciaReal([],[{fecha:"2026-10-03",categoria:"Envíos",monto:1000},{fecha:"2026-10-02",categoria:"Yeso",monto:5000}],"2026-10",{}).ganancia,-1000);
});

test("provisionAguinaldo: quincenal cuenta dos pagos y solo quien está en planilla", () => {
  assert.equal(C.provisionAguinaldo([S(),S({id:3,en_planilla:false}),K()],"2026-10",TASAS),16660);
});
test("provisionAguinaldo no cambia meses anteriores a desde ni posteriores a hasta", () => {
  assert.equal(C.provisionAguinaldo([S({desde:"2026-11-Q1"})],"2026-10",TASAS),0);
  assert.equal(C.provisionAguinaldo([S({activo:false,hasta:"2026-10-Q2"})],"2026-10",TASAS),16660);
  assert.equal(C.provisionAguinaldo([S({activo:false,hasta:"2026-10-Q2"})],"2026-11",TASAS),0);
});

test("cargasDelMes: sin fecha de patrono es estimación", () => {
  assert.deepEqual(C.cargasDelMes([S()],"2026-10",TASAS,null),{bruto:200000,ccssPatronal:53660,ccssTrabajador:21660,ccss:75320,ins:2000,estimado:true});
});
test("cargasDelMes: antes de la fecha sigue siendo estimación, desde ella cuenta", () => {
  assert.equal(C.cargasDelMes([S()],"2026-10",TASAS,"2026-11-05").estimado,true);
  assert.equal(C.cargasDelMes([S()],"2026-11",TASAS,"2026-11-05").estimado,false);
});

test("gastoCcss descuenta la parte del trabajador, que ya está en el salario", () => {
  assert.equal(C.gastoCcss(75320,21660),53660); assert.equal(C.gastoCcss(1000,21660),0);
});

test("comprasVsCargado compara materiales comprados con lo cargado a lo vendido", () => {
  const r=C.comprasVsCargado([{fecha:"2026-10-02",categoria:"Yeso",monto:5000},{fecha:"2026-10-03",categoria:"Envíos",monto:999},{fecha:"2026-10-04",categoria:"Aguinaldo pagado",monto:700}],[P({total:1000,items:[I("A",2,1000)]})],"2026-10",{A:300},CATS);
  assert.deepEqual(r,{comprado:5000,cargado:600});
});

test("resumenIva suma el IVA de compras del rango", () => {
  const r=C.resumenIva([{fecha:"2026-10-02",descripcion:"a",categoria:"Yeso",monto:1130,iva:130,factura:"123"},{fecha:"2026-10-03",descripcion:"b",categoria:"Otros",monto:500},{fecha:"2026-09-30",descripcion:"c",categoria:"Yeso",monto:113,iva:13}],"2026-10-01","2026-10-31");
  assert.equal(r.pagado,130); assert.equal(r.cobrado,0); assert.equal(r.filas.length,2);
});

test("cargasDelMes: una persona que entra en la 2.ª quincena cuenta una sola", () => {
  const r=C.cargasDelMes([S({desde:"2026-11-Q2"})],"2026-11",TASAS,null);
  assert.deepEqual([r.bruto,r.ccss,r.ccssTrabajador],[100000,37660,10830]);
  assert.equal(C.provisionAguinaldo([S({desde:"2026-11-Q2"})],"2026-11",TASAS),8330);
});
test("cargasDelMes: quien sale en la 1.ª quincena cuenta una sola", () => assert.equal(C.cargasDelMes([S({activo:false,hasta:"2026-11-Q1"})],"2026-11",TASAS,null).bruto,100000));
test("cargasDelMes: una quincena omitida no cuenta", () => assert.equal(C.cargasDelMes([S()],"2026-10",TASAS,null,[],[{compromiso_id:2,periodo:"2026-10-Q1"}]).bruto,100000));
test("cargasDelMes: lo ya pagado no cambia si después sube el salario", () => {
  assert.equal(C.cargasDelMes([S({monto:150000})],"2026-10",TASAS,null,[{compromiso_id:2,periodo:"2026-10-Q1",monto:100000},{compromiso_id:2,periodo:"2026-10-Q2",monto:100000}],[]).bruto,200000);
  assert.equal(C.provisionAguinaldo([S({monto:150000})],"2026-10",TASAS,[{compromiso_id:2,periodo:"2026-10-Q1",monto:100000},{compromiso_id:2,periodo:"2026-10-Q2",monto:100000}],[]),16660);
});
test("aguinaldoExcedente: lo pagado de más sobre lo apartado sí se resta", () => {
  const g=[{fecha:"2026-12-10",categoria:"Aguinaldo pagado",monto:100000}], c=[S({desde:"2026-11-Q1"})];
  assert.equal(C.aguinaldoExcedente(g,c,"2026-12",TASAS,[],[]),66680); // apartado: 2 meses de 16 660
  assert.equal(C.aguinaldoExcedente([],c,"2026-12",TASAS,[],[]),0);
  assert.equal(C.aguinaldoExcedente([{fecha:"2026-12-10",categoria:"Aguinaldo pagado",monto:1000}],c,"2026-12",TASAS,[],[]),0);
});
test("filasExcel rotula «Ventas menos gastos»", () => assert.equal(C.filasExcel([],[],"2026-10-01","2026-10-31").resumen[0][4],"Ventas menos gastos"));

test("presupuestoHogar reparte ganancia, salario, fijos y ahorro", () => {
  const r = C.presupuestoHogar({ ganancia: 100000, reinversion: 30, salario: 400000, casa: [{ n: "Alquiler", monto: 250000 }, { n: "Luz", monto: 20000 }], negocioPendiente: 15000 });
  assert.deepEqual([r.reinversion, r.aporte, r.disponible, r.casa, r.fijos, r.ahorro], [30000, 70000, 470000, 270000, 285000, 185000]);
});

test("presupuestoHogar sin ganancia no reinvierte y una pérdida baja lo disponible", () => {
  const r = C.presupuestoHogar({ ganancia: -20000, reinversion: 30, salario: 300000, casa: [{ monto: 350000 }] });
  assert.deepEqual([r.reinversion, r.aporte, r.disponible, r.ahorro], [0, -20000, 280000, -70000]);
});

test("presupuestoHogar limita el porcentaje y no da NaN", () => {
  const r = C.presupuestoHogar({ ganancia: 1000, reinversion: 150 });
  assert.deepEqual([r.pct, r.reinversion, r.salario, r.casa, r.ahorro], [100, 1000, 0, 0, 0]);
});

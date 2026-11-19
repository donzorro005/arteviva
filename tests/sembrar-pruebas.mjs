// Crea datos de prueba en el Supabase REAL, igual que lo haría un cliente desde la tienda publicada:
// 20 pedidos (nombre «PRUEBA NN – …») y 15 reseñas (10 con foto, en espera; 5 sin foto, se publican al instante).
// Se abre la tienda con ?demo para que estas visitas no se cuenten. Uso: node tests/sembrar-pruebas.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_TIENDA = "https://donzorro005.github.io/arteviva/?demo";
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const PUERTO = 9339, perfil = mkdtempSync(join(tmpdir(), "av-edge-"));
const nav = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=" + PUERTO, "--user-data-dir=" + perfil, "about:blank"], { stdio: "ignore" });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) { try { await (await fetch(`http://127.0.0.1:${PUERTO}/json/version`)).json(); break; } catch { await espera(200); } }
const t = await (await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {};
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "error"); return r.result.result.value; };

try {
  await cmd("Runtime.enable"); await cmd("Page.enable");
  await cmd("Page.navigate", { url: URL_TIENDA });
  for (let i = 0; i < 100; i++) { try { if (await ev(`typeof TIENDA_LISTA!=="undefined"&&TIENDA_LISTA&&PRODUCTS.length>0&&!!SUPA.url`)) break; } catch {} await espera(200); }
  console.log("tienda cargada:", await ev(`PRODUCTS.length+" productos"`));

  // ---------- 20 pedidos ----------
  const pedidos = await ev(`(async function(){
    var nombres=["Ana Mora","Luis Rojas","Sofía Vargas","Carlos Jiménez","María Solano","José Castro","Daniela Quesada","Andrés Chaves","Valeria Araya","Diego Soto",
      "Camila Rodríguez","Pablo Méndez","Fernanda Calderón","Javier Alfaro","Natalia Brenes","Esteban Ulate","Gabriela Porras","Ricardo Campos","Paula Herrera","Mauricio Salas"];
    var provs=["Cartago","Cartago","San José","Heredia","Alajuela","Cartago","San José","Guanacaste","Puntarenas","Limón","Cartago","Heredia","San José","Alajuela","Cartago","San José","Heredia","Cartago","Limón","Guanacaste"];
    var venta=PRODUCTS.filter(function(p){return p.p!=null&&!agotado(p)}), res=[], semilla=7;
    var azar=function(n){semilla=(semilla*9301+49297)%233280;return Math.floor(semilla/233280*n)};
    for(var i=0;i<20;i++){
      var n=1+azar(3),items=[],usados={};
      for(var k=0;k<n;k++){var p=venta[azar(venta.length)];if(usados[p.id])continue;usados[p.id]=1;var q=1+azar(3);items.push({n:p.n,q:q,p:p.p,t:p.p*q})}
      var tot=items.reduce(function(s,x){return s+x.t},0),envio=i%3!==0;
      var cuerpo={nombre:"PRUEBA "+String(i+1).padStart(2,"0")+" – "+nombres[i],provincia:provs[i],entrega:envio?"Envío por correo o mensajería":"Retiro en persona",
        direccion:envio?"Dirección de prueba "+(i+1):"",pago:i%2?"Efectivo":"SINPE Móvil",notas:i%4===0?"Pedido de prueba creado para probar el panel":"",items:items,subtotal:tot,descuento:0,total:tot,prueba:false};
      var r=await fetch(SUPA.url+"/rest/v1/rpc/crear_pedido",{method:"POST",headers:hdr({"Content-Type":"application/json"}),body:JSON.stringify({p:cuerpo})});
      res.push({n:cuerpo.nombre,total:tot,estado:r.status,id:await r.text()});
      await new Promise(function(ok){setTimeout(ok,400)});
    }
    return res})()`);
  pedidos.forEach((p) => console.log("pedido", p.estado, p.id, p.n, "₡" + p.total));

  // ---------- 15 reseñas: 10 con foto ----------
  const resenas = [
    ["PRUEBA – Ana", 5, "Pinté la mariposa con mi hija y quedó preciosa.", 1], ["PRUEBA – Luis", 4, "Muy relajante después del trabajo.", 1],
    ["PRUEBA – Sofía", 5, "Los colores son hermosos, ya pedí otro paquete.", 1], ["PRUEBA – Carlos", 5, "Regalo perfecto para mi mamá.", 1],
    ["PRUEBA – María", 4, "El yeso viene muy bien hecho.", 1], ["PRUEBA – José", 5, "Mi primera obra, quedé encantado.", 1],
    ["PRUEBA – Daniela", 3, "Bonito, pero me faltó un poco de pintura blanca.", 1], ["PRUEBA – Andrés", 5, "Pintamos en familia un domingo.", 1],
    ["PRUEBA – Valeria", 4, "La técnica de acuarela me salió mejor de lo esperado.", 1], ["PRUEBA – Diego", 5, "Llegó rapidísimo a Cartago.", 1],
    ["PRUEBA – Camila", 5, "Excelente atención por WhatsApp.", 0], ["PRUEBA – Pablo", 4, "Buen precio y bonito empaque.", 0],
    ["PRUEBA – Fernanda", 5, "Me encantaron los pinceles.", 0], ["PRUEBA – Javier", 4, "Lo recomiendo para desestresarse.", 0],
    ["PRUEBA – Natalia", 5, "Ya voy por mi tercer paquete.", 0]];
  for (let i = 0; i < resenas.length; i++) {
    const [nombre, cal, txt, conFoto] = resenas[i];
    let intento = 0, r;
    while (true) {
      r = await ev(`(async function(){
        var foto=null;
        if(${conFoto}){ // obra de prueba: pinceladas de colores en un lienzo, como JPEG
          var c=document.createElement("canvas");c.width=800;c.height=600;var g=c.getContext("2d");g.fillStyle="#efe9db";g.fillRect(0,0,800,600);
          var col=["#4f82c4","#cf5c7c","#e8b93f","#6f8a3a","#b79ad6","#ee8a2e"];g.lineCap="round";
          for(var k=0;k<14;k++){g.strokeStyle=col[(k+${i})%col.length];g.globalAlpha=.75;g.lineWidth=30+((k*37+${i}*11)%50);g.beginPath();
            var x=(k*97+${i}*53)%800,y=(k*61+${i}*29)%600;g.moveTo(x,y);g.bezierCurveTo((x+200)%800,(y+150)%600,(x+350)%800,(y+50)%600,(x+500)%800,(y+250)%600);g.stroke()}
          g.globalAlpha=1;g.fillStyle="#141210";g.font="bold 44px Georgia";g.fillText("Obra de prueba ${i + 1}",40,560);
          var b=await new Promise(function(ok){c.toBlob(ok,"image/jpeg",.85)});
          var nm=Date.now()+"-prueba-${i + 1}.jpg",u=await fetch(SUPA.url+"/storage/v1/object/fotos/"+nm,{method:"POST",headers:hdr({"Content-Type":"image/jpeg"}),body:b});
          if(!u.ok)return {estado:"foto "+u.status,txt:await u.text()};
          foto=SUPA.url+"/storage/v1/object/public/fotos/"+nm}
        var r=await fetch(SUPA.url+"/rest/v1/resenas",{method:"POST",headers:hdr({"Content-Type":"application/json",Prefer:"return=minimal"}),
          body:JSON.stringify({nombre:${JSON.stringify(nombre)},calificacion:${cal},comentario:${JSON.stringify(txt)},foto_url:foto})});
        return {estado:r.status,txt:await r.text(),foto:!!foto}})()`);
      if (/demasiadas_resenas/.test(r.txt) && intento++ < 8) { console.log("  límite por minuto, espero 20 s…"); await espera(20000); continue; }
      break;
    }
    console.log("reseña", r.estado, r.foto ? "con foto" : "sin foto", nombre, r.txt ? r.txt.slice(0, 120) : "");
    await espera(1500);
  }
} finally {
  try { ws.close(); } catch {}
  nav.kill(); await espera(500); try { rmSync(perfil, { recursive: true, force: true }); } catch {}
}

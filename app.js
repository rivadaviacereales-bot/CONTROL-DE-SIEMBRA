/* ============================
   Registro PWA (service worker y manifest) - todo en runtime
   ============================ */
(function registerPWA(){
  try {
    // create a simple manifest and add link
    const manifest = {
      name: "Siembra Precisa",
      short_name: "SiembraPrecisa",
      description: "Evaluador de uniformidad de siembra (INTA)",
      start_url: ".",
      display: "standalone",
      background_color: "#f7fbee",
      theme_color: "#38761d",
      icons: [
        { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='45' fill='%231f6f1f'/%3E%3Ctext x='50' y='57' font-size='48' text-anchor='middle' fill='white'%3E%F0%9F%8C%B1%3C/text%3E%3C/svg%3E", sizes:"192x192", type:"image/svg+xml" }
      ]
    };
    const mfBlob = new Blob([JSON.stringify(manifest)], {type:'application/json'});
    const mfURL = URL.createObjectURL(mfBlob);
    const link = document.createElement('link'); link.rel='manifest'; link.href=mfURL;
    document.head.appendChild(link);

    // create a very small service worker via blob (cache essential assets)
    if('serviceWorker' in navigator){
      const swCode = `
        const CACHE = 'siembra-precisa-v1';
        self.addEventListener('install', e=> {
          self.skipWaiting();
        });
        self.addEventListener('activate', e=> {
          e.waitUntil(clients.claim());
        });
        self.addEventListener('fetch', e=>{
          // basic network-first for asset requests, fallback to cache
          e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
        });
      `;
      const swBlob = new Blob([swCode], {type:'text/javascript'});
      const swUrl = URL.createObjectURL(swBlob);
      navigator.serviceWorker.register(swUrl).then(reg=>{
        console.log('ServiceWorker registrado:', reg.scope);
        // show install button when possible
        document.getElementById('installBtn').style.display='inline-block';
      }).catch(err=>console.warn('SW error',err));
    }
  } catch(e){ console.warn('PWA init error', e); }
})();

/* ============================
   UTILIDADES UI (no tocan cálculos)
   ============================ */
function openProfPIN(){
  const pin = prompt("Ingrese PIN de acceso al Modo Profesional:");
  if(pin===null) return;
  if(pin.trim()==='1234'){ showProfessionalPanel(); }
  else alert("PIN incorrecto.");
}
document.getElementById('openProfBtn').addEventListener('click', openProfPIN);

function showProfessionalPanel(){
  document.getElementById('panelProfesional').style.display='block';
  document.getElementById('panelProfesional').setAttribute('aria-hidden','false');
  document.getElementById('metaLote').innerText = 'Lote: ' + ((document.getElementById('nombre') && document.getElementById('nombre').value.trim()) || '—');
  actualizarHistorico();
}

function closeAllPanels(){ document.getElementById('panelProfesional').style.display='none' }
function cerrarPanelProfesional(){ closeAllPanels(); }
function nuevaMedicionOperario(){ // reuse existing reset behavior
  // clear only inputs for operario
  document.getElementById('nombre').value=''; document.getElementById('densidadObj').value=70000;
  document.getElementById('distSurco').value=70; document.getElementById('tramo').value=14.3;
  document.getElementById('distancias').value=''; document.getElementById('salida').innerHTML=''; document.getElementById('pantalla3').style.display='none';
  document.getElementById('semaforoDiv').style.background='#ddd'; document.getElementById('semaforoTextMain').innerText='Esperando medición...';
  document.getElementById('densidadCorregidaOperario').innerText='Densidad corregida: —';
  document.getElementById('recomendacionPrincipal').innerText='Recomendación: —';
}

/* ============================
   PARSE DISTANCIAS (INTOCABLE)
   ============================ */
function parseDistancias(str) {
    return str.replace(/\n/g,',').replace(/\s+/g,',')
              .split(',').map(x=>parseFloat(x.trim()))
              .filter(x=>!isNaN(x) && x>=1);
}

/* ============================
   FUNCIÓN calcular() (INTOCABLE)
   - ESTE BLOQUE NO FUE MODIFICADO
   ============================ */
function calcular() {
    let densidadObj=parseFloat(document.getElementById('densidadObj').value);
    let distSurco=parseFloat(document.getElementById('distSurco').value);
    let tramo=parseFloat(document.getElementById('tramo').value);
    let nombre=document.getElementById('nombre').value.trim();
    let distancias=parseDistancias(document.getElementById('distancias').value);

    if(distancias.length<2||isNaN(tramo)||isNaN(distSurco)||isNaN(densidadObj)){
        alert("Completa todos los campos y al menos dos distancias válidas (>=1 cm).");
        return;
    }

    let e=distSurco/100; 
    let Dref=(10000*100)/(e*densidadObj);
    let falla_simple=1.5*Dref;
    let falla_doble=2.5*Dref;
    let falla_triple=3.5*Dref;
    let duplicacion=0.5*Dref;

    let fallas=0, fallas_doble=0, fallas_triple=0, duplicaciones=0, bien=0, def_in_tolerancia=0;

    distancias.forEach(d=>{
        if(d>falla_triple) fallas_triple++;
        else if(d>falla_doble) fallas_doble++;
        else if(d>falla_simple) fallas++;
        else if(d<duplicacion) duplicaciones++;
        else {
            bien++;
            if(0.75*Dref<=d && d<=1.25*Dref) def_in_tolerancia++;
        }
    });

    let eventos_corregidos=distancias.length + fallas + 2*fallas_doble + 3*fallas_triple - duplicaciones;
    if(eventos_corregidos<=0) eventos_corregidos=distancias.length;
    let dens_corregida=Math.round((eventos_corregidos*10000)/(tramo*e));

    let porc_fallas=eventos_corregidos>0 ? Math.round(((fallas+2*fallas_doble+3*fallas_triple)/eventos_corregidos)*1000)/10 : 0;
    let porc_dup=eventos_corregidos>0 ? Math.round((duplicaciones/eventos_corregidos)*1000)/10 : 100;

    let promedio=distancias.reduce((a,b)=>a+b,0)/distancias.length;
    let varianza=distancias.reduce((sum,d)=>sum+Math.pow(d-promedio,2),0)/distancias.length;
    let desviacion=Math.sqrt(varianza);
    let coefVar=promedio>0 ? (desviacion/promedio)*100 : 0;
    let porc_tolerancia=bien>0 ? Math.round((def_in_tolerancia/bien)*1000)/10 : 0;
    let total_surcos=Math.round(tramo*100/distSurco);

    // ----- SEMÁFORO MEJORADO
    let estado=coefVar<=25?"✔️ Aceptable (INTA)":(coefVar<=50?"⚠️ Revisar sembradora / terreno":"❌ Muy alta variación");
    let clase=estado.includes("✔️")?"ok":estado.includes("⚠️")?"warning":"error";
    let colorSem=coefVar<=25?"#009E60":(coefVar<=50?"#F7C948":"#D64550");
    document.getElementById('semaforoDiv').style.background=colorSem;
    document.getElementById('semaforoTextMain').innerText = estado;

    // ----- RECOMENDACIONES AUTOMÁTICAS
    let recos=[];
    if(porc_fallas>10) recos.push("⚠️ Muchas fallas, revisá dosificador.");
    if(porc_dup>5) recos.push("⚠️ Muchas duplicaciones, verifica plato/sistema.");
    if(coefVar>25) recos.push("⚠️ Alta variación, controlá velocidad o calidad del terreno.");
    if(porc_tolerancia>=80) recos.push("✔️ Buena uniformidad en distribución");
    if(recos.length===0) recos.push("✔️ Parámetros óptimos de siembra");

    let salidaHTML=`
    <div class="result">
        <div class="diagnosis ${clase}">${estado}</div>
        <hr>
        <b>Lote/usuario:</b> ${nombre||"(anónimo)"}<br>
        <b>Semillas medidas:</b> ${distancias.length} | Eventos corregidos: ${eventos_corregidos}<br>
        <b>Densidad objetivo:</b> ${densidadObj} semillas/ha<br>
        <b>Densidad corregida:</b> <span style="font-weight:bold;color:#38761d;">${dens_corregida} semillas/ha</span>
        <hr>
        <b>Parámetros técnicos:</b><br>
        Distancia surcos: ${distSurco} cm (${e.toFixed(2)} m) | Tramo: ${tramo} m | Surcos muestreados: ${total_surcos}<br>
        Distancia ref. (Dref): ${Dref.toFixed(2)} cm<br>
        Espaciamiento promedio: ${promedio.toFixed(2)} cm | Desv. estándar: ${desviacion.toFixed(2)} cm<br>
        Coef. variación: ${coefVar.toFixed(2)}% (INTA recomienda ≤25%)<hr>
        <b>Análisis de eventos:</b><br>
        Fallas simples: ${fallas} | Fallas dobles: ${fallas_doble} | Fallas triples: ${fallas_triple} | Duplicaciones: ${duplicaciones}<br>
        % fallas: ${porc_fallas}% | % duplicaciones: ${porc_dup}% | Bien sembradas ±25%: ${porc_tolerancia}%<hr>
        <b>Recomendaciones:</b>
        <ul style="margin-left:15px;">${recos.map(r=>"<li>"+r+"</li>").join("")}</ul>
    </div>`;
    document.getElementById('salida').innerHTML=salidaHTML;

    // Actualizaciones para vista operario (NO tocar lógica de cálculo)
    //  - Actualizamos semáforo operario grande
    document.getElementById('semaforoOperario') && (document.getElementById('semaforoOperario').style.background=colorSem);
    document.getElementById('semaforoTexto') && (document.getElementById('semaforoTexto').innerText=estado);

    //  - densidad corregida mostrado en panel operario
    document.getElementById('densidadCorregidaOperario') && (document.getElementById('densidadCorregidaOperario').innerText = "Densidad corregida: " + dens_corregida + " semillas/ha");

    //  - recomendación principal (primera recomendación)
    document.getElementById('recomendacionPrincipal') && (document.getElementById('recomendacionPrincipal').innerText = "Recomendación: " + (recos.length? recos[0] : "—"));

    // Mostrar pantalla3 para compatibilidad con botones existentes
    document.getElementById('pantalla3') && (document.getElementById('pantalla3').style.display='block');

    dibujarGrafico(distancias);
    actualizarHistorico();

    // Guardamos el HTML de salida en un atributo temporal para parseo posterior (NO altera cálculos)
    document.getElementById('salida').setAttribute('data-last-distancias', JSON.stringify(distancias));
    document.getElementById('salida').setAttribute('data-last-html', salidaHTML);

    // impacto económico estimado (simple proxy)
    try {
      // ejemplo: pérdida estimada = coefVar% * 0.8 kg/ha * densidad/1000 -> heurística informativa
      const impactKg = Math.round((coefVar * 0.8) * (dens_corregida/1000));
      document.getElementById('impactoEconomico').innerText = `Pérdida estimada aproximada: ${impactKg} kg/ha (referencial)`;
    } catch(e){}
}

/* ============================
   HISTÓRICO Y GUARDADO (mejorado, no toca cálculos)
   ============================ */
function guardarMedicion(){
    try {
        const salidaElem = document.getElementById('salida');
        if(!salidaElem || !salidaElem.innerHTML.trim()){
            alert("No hay resultados para guardar. Ejecutá primero 'CALCULAR'.");
            return;
        }
        const html = salidaElem.innerHTML;
        const distJSON = salidaElem.getAttribute('data-last-distancias');
        const distancias = distJSON ? JSON.parse(distJSON) : [];
        const densMatch = html.match(/Densidad corregida:<\/b>\s*<span[^>]*>([\d,\.]+)\s*semillas\/ha<\/span>/i);
        const densCorregida = densMatch ? densMatch[1].replace(',','') : '';
        const cvMatch = html.match(/Coef\. variación:\s*([\d,\.]+)%/i);
        const coefVar = cvMatch ? parseFloat(cvMatch[1].replace(',','.')) : null;
        const estadoMatch = html.match(/<div class="diagnosis [^"]*">([^<]+)<\/div>/i);
        const estado = estadoMatch ? estadoMatch[1] : '';
        const nombre = (document.getElementById('nombre') && document.getElementById('nombre').value.trim()) || "anónimo";

        let historicos = JSON.parse(localStorage.getItem("siembraHistorico")||"[]");
        const nueva = {
            fecha: new Date().toLocaleString(),
            nombre: nombre,
            densidadCorregida: densCorregida,
            coefVar: coefVar,
            estado: estado,
            html: html,
            distancias: distancias
        };
        historicos.unshift(nueva);
        if(historicos.length>5) historicos = historicos.slice(0,5);
        localStorage.setItem("siembraHistorico", JSON.stringify(historicos));
        alert("¡Medición guardada en el dispositivo!");
        actualizarHistorico();
    } catch(e){
        console.error("Error guardando medición:", e);
        alert("Error al guardar medición. Revisa la consola.");
    }
}

function actualizarHistorico(){
    let historicos=JSON.parse(localStorage.getItem("siembraHistorico")||"[]");
    // Operario compacto
    let htmlOp = "";
    htmlOp+="<ul style='margin:6px 0;padding-left:16px;'>";
    if(historicos.length==0) htmlOp+="<li style='color:#999'>No hay mediciones guardadas aún.</li>";
    else {
        historicos.slice(0,5).forEach(h=>{
            htmlOp+=`<li style="margin-bottom:8px;"><b>${h.fecha}</b><br><span class="small">${h.nombre} — CV: ${h.coefVar!==null? h.coefVar.toFixed(2)+'%':'—'}</span><br><button class="btn-secondary" onclick='verHistoricoDetalle("${h.fecha.replace(/"/g,"&quot;")}")' style="margin-top:6px">Ver</button></li>`;
        });
    }
    htmlOp+="</ul>";
    document.getElementById('historicoOperario').innerHTML = htmlOp;

    // Pantalla3 / profesional tabla
    let htmlProf = "";
    if(historicos.length==0) htmlProf+="<p style='color:#999;'>No hay mediciones guardadas aún.</p>";
    else {
        htmlProf += `<table><thead><tr><th>Fecha</th><th>Lote</th><th>CV%</th><th>Estado</th><th></th></tr></thead><tbody>`;
        historicos.forEach(h=>{
            htmlProf += `<tr><td>${h.fecha}</td><td>${h.nombre}</td><td>${h.coefVar!==null? h.coefVar.toFixed(2)+'%':'—'}</td><td>${h.estado}</td><td><button class="btn-secondary" onclick='verHistoricoDetalle("${h.fecha.replace(/"/g,"&quot;")}")'>Ver</button></td></tr>`;
        });
        htmlProf += `</tbody></table>`;
    }
    document.getElementById('tablaHistoricoProfesional').innerHTML = htmlProf;

    // update main historic block if exists
    const histMain = document.getElementById('historico');
    if(histMain) histMain.innerHTML = "<h4>Histórico de mediciones</h4>" + (historicos.length? "<ul>"+historicos.map(h=>`<li><b>${h.fecha}</b> — ${h.nombre} — ${h.estado}</li>`).join("")+"</ul>" : "<p style='color:#999'>No hay mediciones guardadas aún.</p>");
}
actualizarHistorico();

function verHistoricoDetalle(fecha){
    let historicos=JSON.parse(localStorage.getItem("siembraHistorico")||"[]");
    const item = historicos.find(h=>h.fecha===fecha);
    if(!item){ alert("Registro no encontrado."); return; }
    mostrarPanelConHtml(item.html, item);
}

function limpiarHistoricoConfirm(){
    if(!confirm("¿Borrar todo el histórico guardado en este dispositivo? Esta acción no se puede deshacer.")) return;
    localStorage.removeItem("siembraHistorico");
    actualizarHistorico();
    alert("Histórico eliminado.");
}

/* ============================
   EXPORT / PDF / CSV (no tocan cálculos)
   ============================ */
function exportarPDF(){ window.print(); }

function exportarCSV(){
    let distancias=parseDistancias(document.getElementById('distancias').value).join(";");
    let densObj=document.getElementById('densidadObj').value;
    let distSurco=document.getElementById('distSurco').value;
    let tramo=document.getElementById('tramo').value;
    let nombre=document.getElementById('nombre').value.trim()||"anónimo";
    let csvContent=`Fecha;Lote;DensidadObj;DistSurco;Tramo;Distancias
${new Date().toLocaleString()};${nombre};${densObj};${distSurco};${tramo};"${distancias}"`;
    let blob=new Blob([csvContent], {type:'text/csv;charset=utf-8;'});
    let link=document.createElement("a");
    link.href=URL.createObjectURL(blob);
    link.download=`Siembra_${nombre}_${Date.now()}.csv`;
    link.click();
}

function generarPDFProfesional(){
    const titulo = "<h2>Informe Siembra Precisa (INTA)</h2>";
    const meta = document.getElementById('metaLote') ? "<div>"+document.getElementById('metaLote').innerText+"</div>" : "";
    const detalle = document.getElementById('detalleTecnicoHTML') ? document.getElementById('detalleTecnicoHTML').innerHTML : document.getElementById('salida').innerHTML;
    const grafImg = document.getElementById('graficoSnapshotContainer') ? document.getElementById('graficoSnapshotContainer').innerHTML : "";
    const histor = document.getElementById('tablaHistoricoProfesional') ? document.getElementById('tablaHistoricoProfesional').innerHTML : "";
    const win = window.open("","_blank","width=900,height=700");
    win.document.write("<html><head><title>Informe Siembra Precisa</title>");
    win.document.write("<style>body{font-family:Arial,Helvetica,sans-serif;padding:20px;} h2{color:#1f6f1f;} table{width:100%;border-collapse:collapse;} th,td{padding:6px;border:1px solid #ddd;text-align:left;} </style>");
    win.document.write("</head><body>");
    win.document.write(titulo);
    win.document.write(meta);
    win.document.write("<hr>");
    win.document.write(detalle);
    win.document.write("<hr>");
    win.document.write("<h4>Gráfico</h4>");
    win.document.write(grafImg);
    win.document.write("<hr>");
    win.document.write("<h4>Histórico</h4>");
    win.document.write(histor);
    win.document.write("</body></html>");
    win.document.close();
    setTimeout(()=>{ win.print(); }, 600);
}

/* ============================
   GRÁFICO (INTOCABLE dibujarGrafico) - NO modificar
   ============================ */
let chartInstance=null;
function dibujarGrafico(distancias){
    const ctx=document.getElementById('grafico').getContext('2d');
    if(chartInstance) chartInstance.destroy();
    const bins=10;
    const min=Math.min(...distancias);
    const max=Math.max(...distancias);
    const step=(max-min)/bins;
    let labels=[], counts=[];
    for(let i=0;i<bins;i++){
        labels.push(`${(min+i*step).toFixed(1)} - ${(min+(i+1)*step).toFixed(1)} cm`);
        counts.push(distancias.filter(d=>d>=min+i*step && d<min+(i+1)*step).length);
    }
    chartInstance=new Chart(ctx,{
        type:'bar',
        data:{ labels:labels, datasets:[{label:'Frecuencia de distancias', data:counts, backgroundColor:'#38761d'}] },
        options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}}
    });

    // snapshot to show in professional panel
    setTimeout(()=> {
        try {
            const canvas = document.getElementById('grafico');
            if(canvas && canvas.toDataURL){
                const dataURL = canvas.toDataURL("image/png");
                const container = document.getElementById('graficoSnapshotContainer');
                if(container){
                    container.innerHTML = `<img src="${dataURL}" alt="Histograma" style="max-width:100%; height:auto; display:block; margin:0 auto;">`;
                }
            }
        } catch(e){ console.warn("No se pudo generar snapshot del grafico", e); }
    }, 300);
}

/* ============================
   PANEL PROFESIONAL: mostrar / poblar / ISO calc (ISO es opcional y separada)
   ============================ */
function mostrarDetallesProfesional(){
    const salidaElem = document.getElementById('salida');
    if(!salidaElem || !salidaElem.innerHTML.trim()){
        mostrarPanelHistorico();
        return;
    }
    const htmlSalida = salidaElem.innerHTML;
    mostrarPanelConHtml(htmlSalida, null);
}

function mostrarPanelConHtml(htmlSalida, optionalItem){
    const panel = document.getElementById('panelProfesional');
    panel.style.display = 'block';
    panel.setAttribute('aria-hidden','false');
    const nombre = optionalItem ? optionalItem.nombre : ((document.getElementById('nombre') && document.getElementById('nombre').value.trim()) || 'anónimo');
    document.getElementById('metaLote').innerText = `Lote: ${nombre}`;
    const detalleDiv = document.getElementById('detalleTecnicoHTML');
    detalleDiv.innerHTML = htmlSalida;
    if(optionalItem && optionalItem.distancias && optionalItem.distancias.length){
        detalleDiv.innerHTML += `<h4>Distancias (muestra)</h4><div style="max-height:150px; overflow:auto; border:1px solid #efefef; padding:8px;">${optionalItem.distancias.join(', ')}</div>`;
    }
    const snapContainer = document.getElementById('graficoSnapshotContainer');
    if(!snapContainer || !snapContainer.innerHTML.trim()){
        document.getElementById('graficoSnapshotContainer').innerHTML = '<div style="text-align:center;color:#999;">(Ejecutá CALCULAR para generar histograma)</div>';
    }
    actualizarHistorico();
    panel.scrollIntoView({behavior:'smooth', block:'center'});
}

function mostrarPanelHistorico(){
    const panel = document.getElementById('panelProfesional');
    panel.style.display = 'block';
    panel.setAttribute('aria-hidden','false');
    document.getElementById('metaLote').innerText = 'Histórico — dispositivo local';
    document.getElementById('detalleTecnicoHTML').innerHTML = "<p class='small'>Mostrando mediciones guardadas (máx. 5). Seleccione una para ver detalles.</p>";
    actualizarHistorico();
}

/* ============================
   ISO (OPCIONAL) - NUEVA FUNCIÓN SEPARADA (NO SOBREESCRIBE INTA)
   ============================ */
let isoVisible = false;
function toggleISO(){
  isoVisible = !isoVisible;
  document.getElementById('isoResults').style.display = isoVisible ? 'block' : 'none';
  document.getElementById('toggleISOBtn').innerText = isoVisible ? 'Ocultar ISO' : 'Mostrar ISO (avanzado)';
  if(isoVisible) calcularISO();
}

function calcularISO(){
  // Esta función es adicional: compara una métrica ISO orientativa (no altera INTA)
  try {
    const distancias = JSON.parse(document.getElementById('salida').getAttribute('data-last-distancias') || '[]');
    if(!distancias || !distancias.length){ document.getElementById('isoHTML').innerHTML = '<div class="small">Ejecutá CALCULAR primero para generar distancias.</div>'; return; }
    // ejemplo simplificado: ISO suele calcular uniformidad por CV sobre espaciamientos ajustados
    const n = distancias.length;
    const mean = distancias.reduce((a,b)=>a+b,0)/n;
    const variance = distancias.reduce((s,d)=>s+Math.pow(d-mean,2),0)/n;
    const sd = Math.sqrt(variance);
    const cv_iso = mean>0 ? (sd/mean)*100 : 0;
    // presentamos comparativo
    document.getElementById('isoHTML').innerHTML = `<div>ISO (comparativo) — Coef. variación estimado: <b>${cv_iso.toFixed(2)}%</b></div><div class="small" style="margin-top:6px">Nota: cálculo ISO mostrado sólo como referencia técnica. Método INTA sigue siendo el origen oficial en esta herramienta.</div>`;
  } catch(e){
    document.getElementById('isoHTML').innerHTML = '<div class="small">No se pudo calcular ISO: revisá entradas.</div>';
  }
}

/* ============================
   UTILIDADES (comparar, etc.)
   ============================ */
function compararUltimas(){
  let historicos=JSON.parse(localStorage.getItem("siembraHistorico")||"[]");
  if(historicos.length<2){ alert("Se requieren al menos 2 mediciones guardadas para comparar."); return; }
  const a = historicos[0], b = historicos[1];
  alert(`Comparativo:\n1) ${a.fecha} - ${a.nombre} - CV:${a.coefVar!==null? a.coefVar.toFixed(2)+'%':'—'}\n2) ${b.fecha} - ${b.nombre} - CV:${b.coefVar!==null? b.coefVar.toFixed(2)+'%':'—'}`);
}

/* ============================
   Inicialización UI
   ============================ */
(function initUI(){
  // show operario default
  document.getElementById('pantalla3').style.display='none';
  actualizarHistorico();
})();
/* ============================
   MEJORAS JS ADICIONALES
   ============================ */

/* ===== MODO NOCHE / DARK MODE ===== */
(function initDarkMode(){
    const darkClass = 'dark-mode';
    // crear botón toggle en header si no existe
    if(!document.getElementById('toggleDarkBtn')){
        const btn = document.createElement('button');
        btn.id = 'toggleDarkBtn';
        btn.className = 'btn-secondary';
        btn.style.marginLeft = '8px';
        btn.innerText = 'Modo Noche';
        document.querySelector('header .top-actions').appendChild(btn);
        btn.addEventListener('click', toggleDarkMode);
    }

    // aplicar modo guardado
    const saved = localStorage.getItem('modoNoche');
    if(saved==='true') document.body.classList.add(darkClass);

    function toggleDarkMode(){
        document.body.classList.toggle(darkClass);
        const enabled = document.body.classList.contains(darkClass);
        localStorage.setItem('modoNoche', enabled);
    }

    // Estilos dark-mode (solo JS, evita tocar tu CSS principal)
    const style = document.createElement('style');
    style.innerHTML = `
    .dark-mode { background: #1e1e1e !important; color: #f0f0f0 !important; }
    .dark-mode .container { background: rgba(30,30,30,0.95) !important; }
    .dark-mode input, .dark-mode textarea, .dark-mode select { background:#333;color:#f0f0f0;border:1px solid #555; }
    .dark-mode .card { background: rgba(40,40,40,0.85) !important; border:1px solid #555; }
    .dark-mode .btn-primary { background:#00a86b !important; }
    .dark-mode .btn-secondary { background:#555 !important; color:#f0f0f0; border:1px solid #777; }
    .dark-mode .btn-action { background:#444 !important; color:#f0f0f0; border:1px solid #666; }
    .dark-mode table, .dark-mode th, .dark-mode td { border-color:#555; }
    `;
    document.head.appendChild(style);
})();

/* ===== TOOLTIP (SI EXISTEN ELEMENTOS CON CLASE .tooltip) ===== */
(function initTooltips(){
    const tooltipElems = document.querySelectorAll('.tooltip');
    if(tooltipElems.length){
        tooltipElems.forEach(el=>{
            const span = el.querySelector('span.tooltiptext');
            if(span){
                el.addEventListener('mouseenter', ()=>{ span.style.visibility='visible'; });
                el.addEventListener('mouseleave', ()=>{ span.style.visibility='hidden'; });
            }
        });
    } else {
        console.log("No se encontraron botones con clase '.tooltip'. No se generará lógica de tooltips.");
    }
})();

/* ===== PANEL PROFESIONAL (mostrar/ocultar independiente) ===== */
function mostrarPanelProfesional(){
    const panel = document.getElementById('panelProfesional');
    if(panel){
        panel.style.display='block';
        panel.setAttribute('aria-hidden','false');
        panel.scrollIntoView({behavior:'smooth', block:'center'});
    }
}

function ocultarPanelProfesional(){
    const panel = document.getElementById('panelProfesional');
    if(panel){
        panel.style.display='none';
        panel.setAttribute('aria-hidden','true');
    }
}

/* ===== BOTÓN “AGREGAR A PANTALLA” PARA PWA ===== */
(function initInstallBtn(){
    const installBtn = document.getElementById('installBtn');
    if(!installBtn) return;

    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installBtn.style.display = 'inline-block';
    });

    installBtn.addEventListener('click', async ()=>{
        if(deferredPrompt){
            deferredPrompt.prompt();
            const choiceResult = await deferredPrompt.userChoice;
            if(choiceResult.outcome === 'accepted'){
                console.log('PWA agregado a pantalla.');
            } else {
                console.log('Usuario canceló instalación PWA.');
            }
            deferredPrompt = null;
        }
    });
})();

/* ===== UX ADICIONAL: ESCAPE CIERRA PANEL PROFESIONAL ===== */
document.addEventListener('keydown', (e)=>{
    if(e.key==='Escape'){
        ocultarPanelProfesional();
    }
});
/* ============================
   COPIAR RESULTADO AL PORTAPAPELES
   ============================ */
function copiarResultado() {
    const salidaElem = document.getElementById('salida');
    if(!salidaElem || !salidaElem.innerText.trim()){
        alert("No hay resultados para copiar. Ejecutá primero 'CALCULAR'.");
        return;
    }
    const texto = salidaElem.innerText;
    navigator.clipboard.writeText(texto).then(()=>{
        alert("✅ Resultado copiado al portapapeles.");
    }).catch(err=>{
        console.error("Error copiando al portapapeles:", err);
        alert("No se pudo copiar el resultado.");
    });
}



/* ======================== SPRINT 0: BACKUP ANTES DE INDEXEDDB ======================== */


//* ============================= INDEXEDDB INITIALIZATION ============================= */
let idbDB;

async function initIndexedDB() {
  try {
    // Cargar idb library desde CDN
    if(!window.idb) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/idb@7/build/umd.js';
      script.onload = () => { console.log('idb loaded'); };
      document.head.appendChild(script);
      return new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    idbDB = await window.idb.openDB('SiembraApp', 1, {
      upgrade(db) {
        // Store para mediciones completas
        if(!db.objectStoreNames.contains('mediciones')) {
          const mediStore = db.createObjectStore('mediciones', {keyPath: 'id', autoIncrement: true});
          mediStore.createIndex('fecha', 'fecha', {unique: false});
          mediStore.createIndex('lote', 'nombre', {unique: false});
          mediStore.createIndex('sincronizado', 'sincronizado', {unique: false});
        }
        
        // Store para datos temporales
        if(!db.objectStoreNames.contains('temp')) {
          db.createObjectStore('temp');
        }
      }
    });
    console.log('IndexedDB initialized successfully');
    return true;
  } catch(e) {
    console.warn('IndexedDB init failed, will use localStorage fallback:', e);
    return false;
  }
}

// Inicializar IndexedDB al cargar
if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIndexedDB);
} else {
  initIndexedDB();
}

//* ===== Guardar con fallback ===== */
async function guardarMedicionIDB(medicion) {
  try {
    if(!idbDB) {
      console.log('IDB not ready, using localStorage');
      return guardarLocalStorageLegacy(medicion);
    }
    const tx = idbDB.transaction('mediciones', 'readwrite');
    await tx.store.add(medicion);
    await tx.done;
    console.log('Medición guardada en IndexedDB');
    return true;
  } catch(e) {
    console.warn('IDB save failed, fallback to localStorage:', e);
    return guardarLocalStorageLegacy(medicion);
  }
}

function guardarLocalStorageLegacy(medicion) {
  try {
    let historicos = JSON.parse(localStorage.getItem("siembraHistorico") || "[]");
    historicos.unshift(medicion);
    if(historicos.length > 5) historicos = historicos.slice(0, 5);
    localStorage.setItem("siembraHistorico", JSON.stringify(historicos));
    console.log('Medición guardada en localStorage (fallback)');
    return true;
  } catch(e) {
    console.error('Error guardando en localStorage:', e);
    return false;
  }
}

//* ===== Actualizar histórico desde IndexedDB ===== */
async function actualizarHistoricoDesdeIndexedDB() {
  try {
    if(!idbDB) {
      console.log('IDB not ready, reading from localStorage');
      return JSON.parse(localStorage.getItem("siembraHistorico") || "[]");
    }
    const tx = idbDB.transaction('mediciones', 'readonly');
    const allRecords = await tx.store.getAll();
    // Ordenar por fecha descendente
    allRecords.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return allRecords.slice(0, 5);
  } catch(e) {
    console.warn('Error reading from IDB, fallback to localStorage:', e);
    return JSON.parse(localStorage.getItem("siembraHistorico") || "[]");
  }
}

//* ===== MODIFICAR guardarMedicion() existente para usar IDB ===== */
// REEMPLAZAR la función guardarMedicion() anterior con esta versión mejorada
const guardarMedicionOriginal = guardarMedicion;

async function guardarMedicion() {
  try {
    const salidaElem = document.getElementById('salida');
    if(!salidaElem || !salidaElem.innerHTML.trim()){
      alert("No hay resultados para guardar. Ejecutá primero 'CALCULAR'.");
      return;
    }
    
    const html = salidaElem.innerHTML;
    const distJSON = salidaElem.getAttribute('data-last-distancias');
    const distancias = distJSON ? JSON.parse(distJSON) : [];
    const densMatch = html.match(/Densidad corregida:<\/b>\s*]*(\[\d,\.]+)\s*semillas\/ha<\/span>/i);
    const densCorregida = densMatch ? densMatch[1].replace(',','') : '';
    const cvMatch = html.match(/Coef\. variación:\s*(\[\d,\.]+)%/i);
    const coefVar = cvMatch ? parseFloat(cvMatch[1].replace(',','.')) : null;
    const estadoMatch = html.match(/\n\n([^<]+)<\/div>/i);
    const estado = estadoMatch ? estadoMatch[1] : '';
    const nombre = (document.getElementById('nombre') && document.getElementById('nombre').value.trim()) || "anónimo";
    
    const nueva = {
      fecha: new Date().toLocaleString(),
      nombre: nombre,
      densidadCorregida: densCorregida,
      coefVar: coefVar,
      estado: estado,
      html: html,
      distancias: distancias,
      sincronizado: false
    };
    
    await guardarMedicionIDB(nueva);
    alert("¡Medición guardada en el dispositivo!");
    actualizarHistorico();
  } catch(e){
    console.error("Error guardando medición:", e);
    alert("Error al guardar medición. Revisa la consola.");
  }
}


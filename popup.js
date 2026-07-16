// ══════════════════════════════════════════════════════════════
//  popup.js — Extensión SRI v3 con filtro por tipo de comprobante
// ══════════════════════════════════════════════════════════════

const EJEMPLOS = {
  clave:                   'Ej: 2101202401110179227800120010030000001234000...',
  tipo_ruc_serie:          'Ej: FACTURA_1792278001_001-001-000001234',
  fecha_tipo_serie_nombre: 'Ej: 2024-01-21_FACTURA_001-001-000001234_Proveedor SA'
};

const NOMBRES_TIPO = {
  '01': 'Factura',
  '03': 'Liquidación Compra',
  '04': 'Nota Crédito',
  '05': 'Nota Débito',
  '07': 'Retención'
};

// ── Referencias al DOM ──────────────────────────────────────
const selTipo       = document.getElementById('sel-tipo-descarga');
const selFormato    = document.getElementById('sel-formato-nombre');
const inputAnio     = document.getElementById('input-anio');
const selMes        = document.getElementById('sel-mes');
const inputDia      = document.getElementById('input-dia');
const ejemploTexto  = document.getElementById('ejemplo-texto');
const inputDesde    = document.getElementById('input-desde');
const inputHasta    = document.getElementById('input-hasta');
const inputSubcarpeta = document.getElementById('input-subcarpeta');
const btnAbrirCarpeta = document.getElementById('btn-abrir-carpeta');
const btnCalcular   = document.getElementById('btn-calcular');
const btnDescargar  = document.getElementById('btn-descargar');
const btnDetener    = document.getElementById('btn-detener');
const btnText       = document.getElementById('btn-text');
const btnIcon       = document.getElementById('btn-icon');
const smartIcon     = document.getElementById('smart-icon');
const progressCont  = document.getElementById('progress-container');
const progressFill  = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const progressPct   = document.getElementById('progress-percent');
const progressDet   = document.getElementById('progress-detail');
const resultLog     = document.getElementById('result-log');
const statusBar     = document.getElementById('status-bar');
const statusText    = document.getElementById('status-text');
const btnToggleTipos = document.getElementById('btn-toggle-tipos');
const tiposResumen  = document.getElementById('tipos-resumen');

// ── Nuevos Elementos para Pestañas y Reportes ───────────────
const btnTabDescargas = document.querySelector('[data-target="panel-descargas"]');
const btnTabEmitidos  = document.querySelector('[data-target="panel-emitidos"]');
const btnTabReportes  = document.querySelector('[data-target="panel-reportes"]');
const panelDescargas  = document.getElementById('panel-descargas');
const panelEmitidos   = document.getElementById('panel-emitidos');
const panelReportes   = document.getElementById('panel-reportes');

// ── Elementos de Emitidos ───────────────────────────────────
const selTipoEmi = document.getElementById('sel-tipo-descarga-emi');
const inputAnioEmi = document.getElementById('input-anio-emi');
const selMesEmi = document.getElementById('sel-mes-emi');
const inputDiaDesdeEmi = document.getElementById('input-dia-desde-emi');
const inputDiaHastaEmi = document.getElementById('input-dia-hasta-emi');
const inputSubcarpetaEmi = document.getElementById('input-subcarpeta-emi');
const btnToggleTiposEmi = document.getElementById('btn-toggle-tipos-emi');
const btnDescargarEmi = document.getElementById('btn-descargar-emi');
const btnDetenerEmi = document.getElementById('btn-detener-emi');
const btnAbrirCarpetaEmi = document.getElementById('btn-abrir-carpeta-emi');
const tiposResumenEmi = document.getElementById('tipos-resumen-emi');
const progressContEmi = document.getElementById('progress-container-emi');
const progressFillEmi = document.getElementById('progress-fill-emi');
const progressLabelEmi = document.getElementById('progress-label-emi');
const progressPctEmi = document.getElementById('progress-percent-emi');
const progressDetEmi = document.getElementById('progress-detail-emi');
const resultLogEmi = document.getElementById('result-log-emi');

const inputXmlFolder = document.getElementById('input-xml-folder');
const btnSelectFolder = document.getElementById('btn-select-folder');
const labelArchivosCargados = document.getElementById('label-archivos-cargados');
const btnGenerarExcel = document.getElementById('btn-generar-excel');
const btnGenerarAts = document.getElementById('btn-generar-ats');
const inputRucInformante = document.getElementById('input-ruc-informante');
const inputRsInformante = document.getElementById('input-rs-informante');
const selAtsMes = document.getElementById('sel-ats-mes');
const inputAtsAnio = document.getElementById('input-ats-anio');
const inputAtsTotalVentas = document.getElementById('input-ats-total-ventas');
const inputAtsEstab = document.getElementById('input-ats-estab');

let archivosXmlCargados = [];

let isRunning = false;
let todosSeleccionados = true;
let licenciaInfo = { mesesDescargados: [], activado: false };

function verificarBloqueo() {
  const overlay = document.getElementById('license-overlay');
  if (overlay) {
    if (!licenciaInfo.activado && licenciaInfo.mesesDescargados.length >= 3) {
      overlay.style.display = 'flex';
    } else {
      overlay.style.display = 'none';
    }
  }
}

// ── Inicialización ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Cargar preferencias guardadas
  chrome.storage.local.get(
    ['tipoDescarga', 'formatoNombre', 'desde', 'hasta', 'tiposComprobante', 'subcarpetaDestino', 'anio', 'mes', 'dia', 'licencia'],
    (data) => {
      if (data.licencia) licenciaInfo = data.licencia;
      verificarBloqueo();

      if (data.tipoDescarga)  selTipo.value    = data.tipoDescarga;
      if (data.formatoNombre) selFormato.value = data.formatoNombre;
      if (data.desde)         inputDesde.value = data.desde;
      if (data.hasta)         inputHasta.value = data.hasta;
      if (data.anio)          inputAnio.value  = data.anio;
      if (data.mes)           selMes.value     = data.mes;
      if (data.dia)           inputDia.value   = data.dia;
      if (data.subcarpetaDestino !== undefined) inputSubcarpeta.value = data.subcarpetaDestino;
      
      // Restaurar datos ATS si existen
      chrome.storage.local.get(['rucInformante', 'rsInformante', 'atsMes', 'atsAnio', 'atsTotalVentas', 'atsEstab'], (atsData) => {
        if (atsData.rucInformante && inputRucInformante) inputRucInformante.value = atsData.rucInformante;
        if (atsData.rsInformante && inputRsInformante) inputRsInformante.value = atsData.rsInformante;
        if (atsData.atsMes && selAtsMes) selAtsMes.value = atsData.atsMes;
        if (atsData.atsAnio && inputAtsAnio) inputAtsAnio.value = atsData.atsAnio;
        if (atsData.atsTotalVentas && inputAtsTotalVentas) inputAtsTotalVentas.value = atsData.atsTotalVentas;
        if (atsData.atsEstab && inputAtsEstab) inputAtsEstab.value = atsData.atsEstab;
      });

      // Restaurar preferencias de Emitidos
      if (data.tipoDescargaEmi) selTipoEmi.value = data.tipoDescargaEmi;
      if (data.anioEmi) inputAnioEmi.value = data.anioEmi;
      if (data.mesEmi) selMesEmi.value = data.mesEmi;
      if (data.diaDesdeEmi) inputDiaDesdeEmi.value = data.diaDesdeEmi;
      if (data.diaHastaEmi) inputDiaHastaEmi.value = data.diaHastaEmi;
      if (data.subcarpetaDestinoEmi !== undefined) inputSubcarpetaEmi.value = data.subcarpetaDestinoEmi;

      // Restaurar tipos seleccionados (Recibidos)
      if (data.tiposComprobante && Array.isArray(data.tiposComprobante)) {
        document.querySelectorAll('.tipo-check input').forEach(cb => {
          cb.checked = data.tiposComprobante.includes(cb.value);
        });
      }

      // Restaurar tipos seleccionados (Emitidos)
      if (data.tiposComprobanteEmi && Array.isArray(data.tiposComprobanteEmi)) {
        document.querySelectorAll('.tipo-check-emi input').forEach(cb => {
          cb.checked = data.tiposComprobanteEmi.includes(cb.value);
        });
      }

      actualizarEjemplo();
      actualizarResumenTipos();
      actualizarResumenTiposEmi();
      
      // Auto-calcular la cantidad de filas reales de la página al abrir
      calcularFilas(true);
      // Restaurar estado visual si ya está descargando
      chrome.storage.local.get('estadoDescarga', (estData) => {
        if (estData.estadoDescarga && estData.estadoDescarga.activa) {
          restaurarInterfazDescargando(estData.estadoDescarga);
        }
      });
    }
  );

  // ── Restaurar Interfaz si la descarga sigue activa ──────────
  function restaurarInterfazDescargando(estado) {
    isRunning = true;
    btnDescargar.disabled = true;
    btnDetener.style.display = 'block';
    btnText.textContent = 'Descargando...';
    btnIcon.textContent = '⏳';
    smartIcon.style.display = 'none';
    progressCont.style.display = 'flex';
    resultLog.style.display = 'block';
    
    // Dejar un mensaje temporal hasta que lleguen los nuevos mensajes de PROGRESO
    progressDet.textContent = 'Reanudando vista del progreso...';
    setStatus('info', 'Bot trabajando en segundo plano...');
  }

  // Eventos de formato
  selFormato.addEventListener('change', actualizarEjemplo);

  // Eventos de tipos de comprobante
  document.querySelectorAll('.tipo-check input').forEach(cb => {
    cb.addEventListener('change', () => {
      actualizarResumenTipos();
      guardarPreferencias();
    });
  });

  // Botón toggle todos/ninguno
  btnToggleTipos.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.tipo-check input');
    todosSeleccionados = !todosSeleccionados;
    checkboxes.forEach(cb => cb.checked = todosSeleccionados);
    btnToggleTipos.textContent = todosSeleccionados ? 'Todos' : 'Ninguno';
    actualizarResumenTipos();
    guardarPreferencias();
  });

  // Botón toggle todos/ninguno (Emitidos)
  let todosSeleccionadosEmi = true;
  btnToggleTiposEmi.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.tipo-check-emi input');
    todosSeleccionadosEmi = !todosSeleccionadosEmi;
    checkboxes.forEach(cb => cb.checked = todosSeleccionadosEmi);
    btnToggleTiposEmi.textContent = todosSeleccionadosEmi ? 'Todos' : 'Ninguno';
    actualizarResumenTiposEmi();
    guardarPreferencias();
  });
  
  // Update checkbox summaries on change
  document.querySelectorAll('.tipo-check input').forEach(cb => {
    cb.addEventListener('change', () => { actualizarResumenTipos(); guardarPreferencias(); });
  });
  document.querySelectorAll('.tipo-check-emi input').forEach(cb => {
    cb.addEventListener('change', () => { actualizarResumenTiposEmi(); guardarPreferencias(); });
  });

  // Botón Activar Licencia
  const btnActivar = document.getElementById('link-activar');
  if (btnActivar) {
    btnActivar.addEventListener('click', (e) => {
      e.preventDefault();
      if (licenciaInfo.activado) {
        alert('El sistema ya se encuentra en su versión Premium sin límites.');
        return;
      }
      const pwd = prompt('Ingrese la Clave Maestra para desbloquear la versión completa:');
      if (pwd === 'SIFT-PRO-PREMIUM-2026') {
        licenciaInfo.activado = true;
        chrome.storage.local.set({ licencia: licenciaInfo });
        alert('¡Clave correcta! El sistema se ha desbloqueado para siempre.');
        verificarBloqueo();
      } else if (pwd !== null) {
        alert('Clave incorrecta.');
      }
    });
  }

  // Eventos principales
  btnCalcular.addEventListener('click', calcularFilas);
  btnDescargar.addEventListener('click', iniciarDescarga);
  btnDetener.addEventListener('click', detenerDescarga);
  btnAbrirCarpeta.addEventListener('click', () => {
    try {
      chrome.downloads.showDefaultFolder();
    } catch (e) {
      console.error('Error al abrir la carpeta de descargas:', e);
    }
  });

  btnDescargarEmi.addEventListener('click', iniciarDescargaEmi);
  btnDetenerEmi.addEventListener('click', detenerDescargaEmi);
  btnAbrirCarpetaEmi.addEventListener('click', () => {
    try { chrome.downloads.showDefaultFolder(); } catch (e) { }
  });

  // Guardar al cambiar o escribir
  [selTipo, selFormato, inputDesde, inputHasta, inputSubcarpeta, inputAnio, selMes, inputDia, inputRucInformante, inputRsInformante, selAtsMes, inputAtsAnio, inputAtsTotalVentas, inputAtsEstab, selTipoEmi, inputAnioEmi, selMesEmi, inputDiaDesdeEmi, inputDiaHastaEmi, inputSubcarpetaEmi].forEach(el => {
    if (el) {
      el.addEventListener('change', guardarPreferencias);
      el.addEventListener('input', guardarPreferencias);
    }
  });

  // ── Eventos de Pestañas y Reportes ──────────────────────
  if (btnTabDescargas && btnTabReportes && btnTabEmitidos) {
    const tabs = [
      { btn: btnTabDescargas, panel: panelDescargas },
      { btn: btnTabEmitidos,  panel: panelEmitidos },
      { btn: btnTabReportes,  panel: panelReportes }
    ];
    tabs.forEach(tab => {
      tab.btn.addEventListener('click', () => {
        tabs.forEach(t => {
          t.btn.classList.remove('active');
          t.panel.classList.remove('active');
          t.panel.style.display = 'none';
        });
        tab.btn.classList.add('active');
        tab.panel.classList.add('active');
        tab.panel.style.display = 'block';
      });
    });
  }

  if (btnSelectFolder) {
    btnSelectFolder.addEventListener('click', () => {
      inputXmlFolder.click();
    });
  }

  if (inputXmlFolder) {
    inputXmlFolder.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.xml'));
      if (files.length === 0) {
        labelArchivosCargados.textContent = 'No se encontraron archivos XML.';
        labelArchivosCargados.style.color = 'var(--error)';
        btnGenerarExcel.disabled = true;
        btnGenerarAts.disabled = true;
        btnGenerarExcel.style.opacity = '0.5';
        btnGenerarExcel.style.cursor = 'not-allowed';
        btnGenerarAts.style.opacity = '0.5';
        btnGenerarAts.style.cursor = 'not-allowed';
        return;
      }
      labelArchivosCargados.textContent = `⏳ Leyendo ${files.length} archivos...`;
      labelArchivosCargados.style.color = 'var(--ecuador-blue)';
      
      archivosXmlCargados = [];
      for (let f of files) {
        const text = await f.text();
        archivosXmlCargados.push({ nombre: f.name, contenido: text });
      }
      
      labelArchivosCargados.textContent = `✅ ${archivosXmlCargados.length} XML listos.`;
      labelArchivosCargados.style.color = 'var(--success)';
      btnGenerarExcel.disabled = false;
      btnGenerarAts.disabled = false;
      btnGenerarExcel.style.opacity = '1';
      btnGenerarExcel.style.cursor = 'pointer';
      btnGenerarAts.style.opacity = '1';
      btnGenerarAts.style.cursor = 'pointer';
    });
  }

  if (btnGenerarExcel) btnGenerarExcel.addEventListener('click', procesarYDescargarExcel);
  if (btnGenerarAts) btnGenerarAts.addEventListener('click', procesarYDescargarAts);

});

// ── Actualizar resumen de tipos seleccionados ───────────────
function actualizarResumenTipos() {
  const seleccionados = Array.from(document.querySelectorAll('.tipo-check input:checked'))
    .map(cb => NOMBRES_TIPO[cb.value] || cb.value);

  if (seleccionados.length === 0) {
    tiposResumen.textContent = '⚠️ Ningún tipo seleccionado';
    tiposResumen.style.color = 'var(--error)';
  } else if (seleccionados.length === 5) {
    tiposResumen.textContent = '5 tipos seleccionados (todos)';
    tiposResumen.style.color = 'var(--text-muted)';
  } else {
    tiposResumen.textContent = seleccionados.join(' · ');
    tiposResumen.style.color = '#E88898';
  }

  // Actualizar texto del botón toggle
  const total = document.querySelectorAll('.tipo-check input').length;
  const marcados = seleccionados.length;
  todosSeleccionados = marcados === total;
  btnToggleTipos.textContent = todosSeleccionados ? 'Ninguno' : 'Todos';
}

// ── Actualizar resumen de tipos seleccionados (Emitidos) ────
function actualizarResumenTiposEmi() {
  const seleccionados = Array.from(document.querySelectorAll('.tipo-check-emi input:checked'))
    .map(cb => cb.value);

  if (seleccionados.length === 0) {
    tiposResumenEmi.textContent = '⚠️ Ningún tipo seleccionado';
    tiposResumenEmi.style.color = 'var(--error)';
  } else if (seleccionados.length === 6) {
    tiposResumenEmi.textContent = '6 tipos seleccionados (todos)';
    tiposResumenEmi.style.color = 'var(--text-muted)';
  } else {
    tiposResumenEmi.textContent = seleccionados.join(' · ');
    tiposResumenEmi.style.color = '#E88898';
  }

  const total = document.querySelectorAll('.tipo-check-emi input').length;
  const marcados = seleccionados.length;
  btnToggleTiposEmi.textContent = marcados === total ? 'Ninguno' : 'Todos';
}

// ── Obtener tipos seleccionados ─────────────────────────────
function getTiposSeleccionados() {
  return Array.from(document.querySelectorAll('.tipo-check input:checked'))
    .map(cb => cb.value);
}

function getTiposSeleccionadosEmi() {
  return Array.from(document.querySelectorAll('.tipo-check-emi input:checked'))
    .map(cb => cb.value);
}

// ── Actualizar ejemplo de nombre ────────────────────────────
function actualizarEjemplo() {
  ejemploTexto.textContent = EJEMPLOS[selFormato.value] || EJEMPLOS.clave;
}

// ── Guardar preferencias ────────────────────────────────────
function guardarPreferencias() {
  chrome.storage.local.set({
    tipoDescarga:      selTipo.value,
    formatoNombre:     selFormato.value,
    desde:             inputDesde.value,
    hasta:             inputHasta.value,
    anio:              inputAnio.value,
    mes:               selMes.value,
    dia:               inputDia.value,
    tiposComprobante:  getTiposSeleccionados(),
    subcarpetaDestino: inputSubcarpeta.value,
    rucInformante:     inputRucInformante ? inputRucInformante.value : '',
    rsInformante:      inputRsInformante ? inputRsInformante.value : '',
    atsMes:            selAtsMes ? selAtsMes.value : '',
    atsAnio:           inputAtsAnio ? inputAtsAnio.value : '',
    atsTotalVentas:    inputAtsTotalVentas ? inputAtsTotalVentas.value : '',
    atsEstab:          inputAtsEstab ? inputAtsEstab.value : '',
    tipoDescargaEmi:   selTipoEmi.value,
    anioEmi:           inputAnioEmi.value,
    mesEmi:            selMesEmi.value,
    diaDesdeEmi:       inputDiaDesdeEmi.value,
    diaHastaEmi:       inputDiaHastaEmi.value,
    tiposComprobanteEmi: getTiposSeleccionadosEmi(),
    subcarpetaDestinoEmi: inputSubcarpetaEmi.value
  });
}

// ── Calcular documentos disponibles ─────────────────────────
async function calcularFilas(silencioso = false) {
  if (!silencioso) {
    setStatus('running', 'Calculando documentos disponibles...');
    btnCalcular.textContent = '⏳';
    btnCalcular.disabled = true;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.includes('srienlinea.sri.gob.ec')) {
      if (!silencioso) {
        setStatus('warning', 'Abre el portal SRI primero');
        addLog('⚠️ Debes estar en https://srienlinea.sri.gob.ec', 'log-skip');
      }
      return;
    }

    // PASO 1: Leer datos de la página actual
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const xmlBtns = document.querySelectorAll('a[id*="lnkXml"]');
        const paginatorCurrent = document.querySelector('.ui-paginator-current');

        let totalXml = xmlBtns.length;
        let paginado = false;
        let totalPagesDetected = 1;
        let itemsPerPage = xmlBtns.length;
        let usaRangoExacto = false;

        if (paginatorCurrent) {
          const text = paginatorCurrent.textContent.trim();
          // Caso 1: Rango exacto "1-50 de 184" → total directo
          const rangeMatch = text.match(/\d+\s*(?:-|al|to)\s*\d+\s+(?:de|of)\s+(\d+)/i);
          if (rangeMatch) {
            totalXml = parseInt(rangeMatch[1]);
            paginado = true;
            usaRangoExacto = true;
          } else {
            // Caso 2: Formato de páginas "(1 de 2)" — necesitamos ir a la última página
            const pageMatch = text.match(/(\d+)\s+(?:de|of)\s+(\d+)/i);
            if (pageMatch) {
              totalPagesDetected = parseInt(pageMatch[2]);
              paginado = totalPagesDetected > 1;
              // Estimación provisional (se corregirá en el paso 2)
              totalXml = totalPagesDetected * itemsPerPage;
            }
          }
        }

        // Contar por tipo (página actual)
        const filas = Array.from(document.querySelectorAll('table tbody tr'))
          .filter(r => r.querySelector('a[id*="lnkXml"]'));

        const porTipo = {};
        filas.forEach(fila => {
          const textos = Array.from(fila.querySelectorAll('td')).map(td => td.textContent.trim());
          const tipoTexto = textos.find(t =>
            /factura|liquidaci|nota de cr|nota de d|retenci/i.test(t)
          ) || '';
          let cod = 'otro';
          if (/factura/i.test(tipoTexto))        cod = '01';
          else if (/liquidaci/i.test(tipoTexto))  cod = '03';
          else if (/nota de cr/i.test(tipoTexto)) cod = '04';
          else if (/nota de d/i.test(tipoTexto))  cod = '05';
          else if (/retenci/i.test(tipoTexto))    cod = '07';
          porTipo[cod] = (porTipo[cod] || 0) + 1;
        });

        return {
          xml: totalXml,
          pdf: totalXml,
          porTipo,
          paginado,
          localXml: xmlBtns.length,
          totalPages: totalPagesDetected,
          itemsPerPage,
          usaRangoExacto
        };
      }
    });

    let { xml = 0, pdf = 0, porTipo = {}, paginado = false, localXml = 0,
          totalPages = 1, itemsPerPage = 0, usaRangoExacto = false } = results?.[0]?.result ?? {};

    // PASO 2: Si hay múltiples páginas y NO usamos rango exacto,
    // ir a la última página para contar los items reales y calcular el total exacto
    if (paginado && !usaRangoExacto && totalPages > 1) {
      if (!silencioso) {
        setStatus('running', `Calculando total exacto (${totalPages} páginas)...`);
      }

      const lastPageResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (totalPages) => {
          // Función de espera
          const esperar = (ms) => new Promise(r => setTimeout(r, ms));

          // Ir a la última página
          const lastBtn = document.querySelector('.ui-paginator-last');
          const nextBtn = document.querySelector('.ui-paginator-next');

          if (lastBtn && !lastBtn.classList.contains('ui-state-disabled')) {
            const oldText = document.querySelector('.ui-paginator-current')?.textContent || '';
            lastBtn.click();
            // Esperar cambio de página
            for (let i = 0; i < 40; i++) {
              await esperar(200);
              const newText = document.querySelector('.ui-paginator-current')?.textContent || '';
              if (newText !== oldText) break;
            }
            await esperar(800);
          } else if (nextBtn && !nextBtn.classList.contains('ui-state-disabled')) {
            // Si no hay botón "última", ir página por página hasta la última
            for (let p = 1; p < totalPages; p++) {
              const nb = document.querySelector('.ui-paginator-next');
              if (!nb || nb.classList.contains('ui-state-disabled')) break;
              const oldText = document.querySelector('.ui-paginator-current')?.textContent || '';
              nb.click();
              for (let i = 0; i < 40; i++) {
                await esperar(200);
                const newText = document.querySelector('.ui-paginator-current')?.textContent || '';
                if (newText !== oldText) break;
              }
              await esperar(500);
            }
          }

          // Contar XMLs en la última página
          const lastPageXml = document.querySelectorAll('a[id*="lnkXml"]').length;

          // Volver a la primera página
          const firstBtn = document.querySelector('.ui-paginator-first');
          if (firstBtn && !firstBtn.classList.contains('ui-state-disabled')) {
            const oldText = document.querySelector('.ui-paginator-current')?.textContent || '';
            firstBtn.click();
            for (let i = 0; i < 40; i++) {
              await esperar(200);
              const newText = document.querySelector('.ui-paginator-current')?.textContent || '';
              if (newText !== oldText) break;
            }
            await esperar(800);
          }

          return lastPageXml;
        },
        args: [totalPages]
      });

      const lastPageItems = lastPageResult?.[0]?.result ?? 0;
      if (lastPageItems > 0) {
        // Total exacto = (páginas anteriores completas × items/página) + items de la última página
        xml = (totalPages - 1) * itemsPerPage + lastPageItems;
        pdf = xml;
      }
    }

    if (xml > 0) {
      inputHasta.value = xml;
      guardarPreferencias();

      if (!silencioso) {
        // Mostrar resumen por tipo de la página actual
        const resumenTipos = Object.entries(porTipo)
          .map(([cod, n]) => `${NOMBRES_TIPO[cod] || cod}: ${n}`)
          .join(' | ');

        setStatus('done', `${xml} documentos encontrados`);
        if (paginado) {
          addLog(`📊 Total exacto: ${xml} documentos en ${totalPages} páginas`, 'log-ok');
          addLog(`ℹ️ Página actual tiene ${localXml} documentos.`, 'log-skip');
        } else {
          addLog(`✅ Total: ${xml} XML · ${pdf} RIDE`, 'log-ok');
        }
        if (resumenTipos) addLog(`📊 Tipo (pág. actual): ${resumenTipos}`, 'log-skip');
      }
    } else {
      if (!silencioso) {
        setStatus('warning', 'No se encontraron documentos');
        addLog('⚠️ Sin documentos. ¿Estás en "Comprobantes Recibidos"?', 'log-skip');
      }
    }
  } catch (err) {
    if (!silencioso) {
      setStatus('error', 'Error al calcular');
      addLog(`❌ ${err.message}`, 'log-err');
    }
  } finally {
    if (!silencioso) {
      btnCalcular.textContent = 'Calcular';
      btnCalcular.disabled = false;
      resultLog.style.display = 'block';
    }
  }
}

// ── Iniciar descarga ─────────────────────────────────────────
async function iniciarDescarga() {
  if (isRunning) return;

  const tipos = getTiposSeleccionados();
  if (tipos.length === 0) {
    setStatus('error', 'Selecciona al menos un tipo de comprobante');
    return;
  }

  const desde = parseInt(inputDesde.value) || 1;
  const hasta = parseInt(inputHasta.value) || 0;
  const tipo  = selTipo.value;
  const fmt   = selFormato.value;
  const anio  = inputAnio.value.trim();
  const mes   = selMes.value;
  const dia   = inputDia.value.trim();

  if (hasta > 0 && desde > hasta) {
    setStatus('error', 'El rango "Desde" no puede ser mayor que "Hasta"');
    return;
  }

  // Validación de Licencia
  if (!licenciaInfo.activado) {
    if (mes === 'Todos' || !mes) {
      setStatus('error', 'En la versión de prueba no puede descargar "Todos" los meses a la vez. Seleccione un mes.');
      return;
    }
    const periodo = `${anio}-${mes}`;
    if (!licenciaInfo.mesesDescargados.includes(periodo)) {
      if (licenciaInfo.mesesDescargados.length >= 3) {
        verificarBloqueo();
        return;
      }
      licenciaInfo.mesesDescargados.push(periodo);
      chrome.storage.local.set({ licencia: licenciaInfo });
      if (licenciaInfo.mesesDescargados.length >= 3) {
        alert('Atención: Acaba de usar su 3er y último mes de prueba.');
      }
    }
  }

  isRunning = true;
  guardarPreferencias();

  // UI en modo descarga
  btnDescargar.disabled = true;
  btnDetener.style.display = 'block';
  btnText.textContent = 'Descargando...';
  btnIcon.textContent = '⏳';
  smartIcon.style.display = 'none';
  progressCont.style.display = 'flex';
  resultLog.style.display = 'block';
  resultLog.innerHTML = '';
  setStatus('running', 'Iniciando descarga inteligente...');

  const tiposNombres = tipos.map(c => NOMBRES_TIPO[c] || c).join(', ');
  addLog(`📋 Tipos a descargar: ${tiposNombres}`, 'log-skip');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.includes('srienlinea.sri.gob.ec')) {
      setStatus('warning', 'Abre el portal SRI primero');
      addLog('⚠️ Navega al portal SRI antes de descargar', 'log-skip');
      resetUI();
      return;
    }

    await chrome.tabs.sendMessage(tab.id, {
      action: 'INICIAR_DESCARGA',
      config: { desde, hasta, tipo, fmt, tiposComprobante: tipos, anio, mes, dia }
    });

  } catch (err) {
    setStatus('error', `Error al comunicar: ${err.message}`);
    addLog(`❌ Error al comunicar con la página: ${err.message}. Por favor actualiza la página de comprobantes en el SRI e inténtalo de nuevo.`, 'log-err');
    resetUI();
  }
}

// ── Detener descarga ─────────────────────────────────────────
async function detenerDescarga() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    try { await chrome.tabs.sendMessage(tab.id, { action: 'DETENER_DESCARGA' }); } catch (e) {}
  }
  setStatus('warning', 'Descarga detenida por el usuario');
  addLog('⏹️ Descarga detenida', 'log-skip');
  resetUI();
}

// ── Iniciar descarga (Emitidos) ─────────────────────────────
async function iniciarDescargaEmi() {
  if (isRunning) return;

  const tipos = getTiposSeleccionadosEmi();
  if (tipos.length === 0) {
    setStatus('error', 'Selecciona al menos un tipo de comprobante');
    return;
  }

  const anio = inputAnioEmi.value.trim();
  const mes = selMesEmi.value;
  const diaDesde = parseInt(inputDiaDesdeEmi.value) || 1;
  const diaHasta = parseInt(inputDiaHastaEmi.value) || 31;
  const tipoFmt = selTipoEmi.value;

  if (diaDesde > diaHasta) {
    setStatus('error', 'El "Día Inicial" no puede ser mayor al "Día Final"');
    return;
  }

  isRunning = true;
  guardarPreferencias();

  btnDescargarEmi.disabled = true;
  btnDetenerEmi.style.display = 'block';
  document.getElementById('btn-text-emi').textContent = 'Descargando...';
  document.getElementById('btn-icon-emi').textContent = '⏳';
  document.getElementById('smart-icon-emi').style.display = 'none';
  progressContEmi.style.display = 'flex';
  resultLogEmi.style.display = 'block';
  resultLogEmi.innerHTML = '';
  setStatus('running', 'Iniciando descarga Emitidos...');

  const tiposNombres = tipos.join(', ');
  addLog(`📋 Tipos a descargar: ${tiposNombres}`, 'log-skip');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('srienlinea.sri.gob.ec')) {
      setStatus('warning', 'Abre el portal SRI primero');
      addLog('⚠️ Navega al portal SRI antes de descargar', 'log-skip');
      resetUIEmi();
      return;
    }
    
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'INICIAR_DESCARGA_EMI',
        config: { anio, mes, diaDesde, diaHasta, tipoFmt, tiposComprobante: tipos }
      });
    } catch (err) {
      if (err.message.includes('Receiving end does not exist')) {
        addLog('⏳ Inyectando script en la página. Intentando de nuevo...', 'log-skip');
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await new Promise(r => setTimeout(r, 500)); // Esperar que inicialice
        await chrome.tabs.sendMessage(tab.id, {
          action: 'INICIAR_DESCARGA_EMI',
          config: { anio, mes, diaDesde, diaHasta, tipoFmt, tiposComprobante: tipos }
        });
      } else {
        throw err;
      }
    }
  } catch (err) {
    setStatus('error', `Error al comunicar: ${err.message}`);
    addLog(`❌ Error: ${err.message}. Por favor, presiona F5 en el SRI y vuelve a intentar.`, 'log-err');
    resetUIEmi();
  }
}

async function detenerDescargaEmi() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    try { await chrome.tabs.sendMessage(tab.id, { action: 'DETENER_DESCARGA_EMI' }); } catch (e) {}
  }
  setStatus('warning', 'Descarga detenida');
  addLog('⏹️ Descarga detenida', 'log-skip');
  resetUIEmi();
}

// ── Mensajes del content script ──────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  const isEmi = panelEmitidos.classList.contains('active');
  const pFill = isEmi ? progressFillEmi : progressFill;
  const pLabel = isEmi ? progressLabelEmi : progressLabel;
  const pPct = isEmi ? progressPctEmi : progressPct;
  const pDet = isEmi ? progressDetEmi : progressDet;

  if (msg.type === 'PROGRESO') {
    const { actual, total, archivo, accion } = msg;
    const pct = total > 0 ? Math.round((actual / total) * 100) : 0;
    pFill.style.width = pct + '%';
    
    if (total > 0) {
      pLabel.textContent = `${actual} / ${total} archivos`;
      pPct.textContent   = pct + '%';
      
      const cls   = accion === 'ok' ? 'log-ok' : accion === 'skip' ? 'log-skip' : 'log-err';
      const icono = accion === 'ok' ? '✅' : accion === 'skip' ? '⏭️' : '❌';
      addLog(`${icono} [${actual}/${total}] ${archivo}`, cls);
      setStatus('running', `Descargando ${actual} de ${total}...`);
    } else {
      pLabel.textContent = '0 / 0 archivos';
      pPct.textContent   = '0%';
      
      const cls   = accion === 'ok' ? 'log-ok' : accion === 'skip' ? 'log-skip' : 'log-err';
      addLog(`${archivo}`, cls);
      setStatus('running', archivo || 'Iniciando...');
    }
    pDet.textContent = archivo || '';
  }

  if (msg.type === 'DESCARGA_COMPLETA') {
    const { ok, skip, err, total, porTipo } = msg;
    setStatus('done', `✅ ${ok} descargados · ⏭️ ${skip} omitidos · ❌ ${err} errores`);
    addLog(`\n🎉 Completado: ${ok} ✅ | ${skip} ⏭️ | ${err} ❌`, 'log-ok');

    if (porTipo && Object.keys(porTipo).length > 0) {
      const r = Object.entries(porTipo)
        .map(([cod, n]) => `${NOMBRES_TIPO[cod] || cod}: ${n}`)
        .join(' | ');
      addLog(`📊 Por tipo: ${r}`, 'log-skip');
    }

    pFill.style.width    = '100%';
    pLabel.textContent   = `${total} / ${total} archivos`;
    pPct.textContent     = '100%';
    pDet.textContent     = 'Descarga finalizada';
    if (isEmi) resetUIEmi(false); else resetUI(false);
  }

  if (msg.type === 'ERROR_DESCARGA') {
    setStatus('error', msg.mensaje || 'Error inesperado');
    addLog(`❌ Error: ${msg.mensaje}`, 'log-err');
    if (isEmi) resetUIEmi(); else resetUI();
  }
});

// ── Helpers ──────────────────────────────────────────────────
function setStatus(tipo, texto) {
  statusBar.className = `status-bar status-${tipo}`;
  statusText.textContent = texto;
}

function addLog(texto, cls = '') {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = texto;
  const isEmi = panelEmitidos.classList.contains('active');
  const targetLog = isEmi ? resultLogEmi : resultLog;
  targetLog.appendChild(line);
  targetLog.scrollTop = targetLog.scrollHeight;
}

function resetUI(ocultarProgress = true) {
  isRunning = false;
  btnDescargar.disabled = false;
  btnDetener.style.display = 'none';
  btnText.textContent = 'Descarga inteligente';
  btnIcon.textContent = '⬇️';
  smartIcon.style.display = 'block';
  if (ocultarProgress) progressCont.style.display = 'none';
}

function resetUIEmi(ocultarProgress = true) {
  isRunning = false;
  btnDescargarEmi.disabled = false;
  btnDetenerEmi.style.display = 'none';
  document.getElementById('btn-text-emi').textContent = 'Descarga Emitidos';
  document.getElementById('btn-icon-emi').textContent = '⬇️';
  document.getElementById('smart-icon-emi').style.display = 'block';
  if (ocultarProgress) progressContEmi.style.display = 'none';
}

// ══════════════════════════════════════════════════════════
//  PROCESADOR DE XML Y GENERADOR DE REPORTES
// ══════════════════════════════════════════════════════════

function extraerDatosXml(xmlString) {
  const parser = new DOMParser();
  let xmlDoc = parser.parseFromString(xmlString, "text/xml");
  
  // Extraer el XML real si está dentro de <comprobante> (formato de autorización del SRI)
  const comprobanteNode = xmlDoc.getElementsByTagName('comprobante')[0];
  if (comprobanteNode && comprobanteNode.textContent) {
    const innerXml = comprobanteNode.textContent.trim();
    if (innerXml.startsWith('<')) {
       xmlDoc = parser.parseFromString(innerXml, "text/xml");
    }
  }
  
  // Función para obtener texto seguro
  const getVal = (tag, parent = xmlDoc) => {
    const el = parent.getElementsByTagName(tag)[0];
    return el ? el.textContent.trim() : '';
  };

  const codDoc = getVal('codDoc');
  const ruc = getVal('ruc') || getVal('rucProveedor') || getVal('identificacionSujetoRetenido') || getVal('identificacionComprador');
  const razonSocial = getVal('razonSocial') || getVal('razonSocialProveedor') || getVal('razonSocialSujetoRetenido') || getVal('razonSocialComprador');
  const fechaEmision = getVal('fechaEmision');
  
  const estab = getVal('estab');
  const ptoEmi = getVal('ptoEmi');
  const sec = getVal('secuencial');
  const numComprobante = `${estab}-${ptoEmi}-${sec}`;
  const claveAcceso = getVal('claveAcceso');

  let base0 = 0, baseGravada = 0, montoIva = 0, total = 0;

  // Facturas y Notas de Crédito
  if (codDoc === '01' || codDoc === '04') {
    const totalConImpuestos = xmlDoc.getElementsByTagName('totalConImpuestos')[0];
    if (totalConImpuestos) {
      const impuestos = totalConImpuestos.getElementsByTagName('totalImpuesto');
      for (let i = 0; i < impuestos.length; i++) {
        const codigo = getVal('codigo', impuestos[i]);
        const codigoPorcentaje = getVal('codigoPorcentaje', impuestos[i]);
        const baseImponible = parseFloat(getVal('baseImponible', impuestos[i]) || 0);
        const valor = parseFloat(getVal('valor', impuestos[i]) || 0);
        
        if (codigo === '2') { // IVA
          if (codigoPorcentaje === '0') {
            base0 += baseImponible;
          } else {
            baseGravada += baseImponible;
            montoIva += valor;
          }
        }
      }
    }
    total = parseFloat(getVal('importeTotal') || getVal('valorModificacion') || 0);
  } else if (codDoc === '07') { // Retencion
      total = parseFloat(getVal('totalRetenido') || 0);
  }

  return {
    tipo: NOMBRES_TIPO[codDoc] || codDoc,
    codDoc,
    ruc,
    razonSocial,
    fechaEmision,
    numComprobante,
    claveAcceso,
    base0: base0.toFixed(2),
    baseGravada: baseGravada.toFixed(2),
    montoIva: montoIva.toFixed(2),
    total: total.toFixed(2)
  };
}

function procesarYDescargarExcel() {
  if (!archivosXmlCargados.length) return;

  // ── 1. Parsear todos los XMLs y agrupar por tipo ──────────
  const TIPOS_ORDEN = ['01', '03', '04', '05', '07'];
  const NOMBRE_HOJA = { '01': 'Facturas', '03': 'Liq. Compra', '04': 'Notas Credito', '05': 'Notas Debito', '07': 'Retenciones' };
  const HEADERS = ['TIPO','RUC/IDENTIFICACION','RAZON SOCIAL','FECHA EMISION','COMPROBANTE','CLAVE ACCESO','BASE 0%','BASE GRAVADA','MONTO IVA','TOTAL'];
  const grupos = {};
  let procesados = 0;

  for (const archivo of archivosXmlCargados) {
    try {
      const data = extraerDatosXml(archivo.contenido);
      const cod = data.codDoc || 'otro';
      if (!grupos[cod]) grupos[cod] = [];
      grupos[cod].push(data);
      procesados++;
    } catch (e) {
      console.error('Error parseando XML:', archivo.nombre, e);
    }
  }

  if (procesados === 0) { alert('No se pudieron procesar los archivos XML.'); return; }

  // ── 2. Helpers SpreadsheetML ──────────────────────────────
  const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const celda = (v, num=false) => (num && v !== '' && !isNaN(v))
    ? `<Cell><Data ss:Type="Number">${esc(v)}</Data></Cell>`
    : `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  const filaEnc = () => '<Row ss:StyleID="sEnc">' + HEADERS.map(h => `<Cell ss:StyleID="sEnc"><Data ss:Type="String">${esc(h)}</Data></Cell>`).join('') + '</Row>';
  const filaD = (d) => '<Row>' + celda(d.tipo) + celda(d.ruc) + celda(d.razonSocial) + celda(d.fechaEmision) + celda(d.numComprobante) + celda(d.claveAcceso) + celda(d.base0,true) + celda(d.baseGravada,true) + celda(d.montoIva,true) + celda(d.total,true) + '</Row>';
  const opcFreeze = `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions>`;
  const colWidths = '<Column ss:Width="100"/><Column ss:Width="130"/><Column ss:Width="200"/><Column ss:Width="90"/><Column ss:Width="120"/><Column ss:Width="180"/><Column ss:Width="80"/><Column ss:Width="90"/><Column ss:Width="80"/><Column ss:Width="80"/>';

  const crearHoja = (nombre, filas) =>
    `<Worksheet ss:Name="${esc(nombre)}"><Table ss:DefaultColumnWidth="120">${colWidths}${filaEnc()}${filas.map(d=>filaD(d)).join('')}</Table>${opcFreeze}</Worksheet>`;

  // ── 3. Construir hojas ────────────────────────────────────
  const todos = TIPOS_ORDEN.flatMap(c => grupos[c] || []).concat(Object.entries(grupos).filter(([c])=>!TIPOS_ORDEN.includes(c)).flatMap(([,a])=>a));
  let hojas = crearHoja('RESUMEN', todos);
  for (const cod of TIPOS_ORDEN) {
    if (grupos[cod] && grupos[cod].length > 0) hojas += crearHoja(NOMBRE_HOJA[cod] || cod, grupos[cod]);
  }
  for (const [cod, filas] of Object.entries(grupos)) {
    if (!TIPOS_ORDEN.includes(cod)) hojas += crearHoja('Tipo_' + cod, filas);
  }

  // ── 4. Documento SpreadsheetML ────────────────────────────
  const xls = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel">
<Styles><Style ss:ID="sEnc"><Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="11"/><Interior ss:Color="#1F4E79" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style></Styles>
${hojas}</Workbook>`;

  // ── 5. Descargar ──────────────────────────────────────────
  const fecha = new Date().toISOString().slice(0,10).replace(/-/g,'');
  descargarArchivo('\uFEFF' + xls, `Reporte_SRI_${fecha}.xls`, 'application/vnd.ms-excel;charset=utf-8');

  const resumen = Object.entries(grupos).map(([cod,arr]) => `• ${NOMBRES_TIPO[cod]||cod}: ${arr.length} registros`).join('\n');
  alert(`✅ Excel generado con ${procesados} comprobantes en ${Object.keys(grupos).length + 1} pestaña(s):\n• RESUMEN (todos)\n${resumen}`);
}

function procesarYDescargarAts() {
  const rucInformante = inputRucInformante.value.trim();
  const rsInformante = inputRsInformante && inputRsInformante.value.trim() !== '' ? inputRsInformante.value.trim() : 'EMPRESA INFORMANTE';
  const anio = inputAtsAnio.value.trim();
  const mes = selAtsMes.value;
  const totalVentas = inputAtsTotalVentas && inputAtsTotalVentas.value.trim() !== '' ? inputAtsTotalVentas.value.trim() : '0.00';
  const estab = inputAtsEstab && inputAtsEstab.value.trim() !== '' ? inputAtsEstab.value.trim() : '001';
  
  if (!rucInformante || rucInformante.length !== 13) {
    alert("Por favor ingrese un RUC válido de 13 dígitos en los datos del Informante.");
    return;
  }
  
  let comprasXml = '';
  
  for (const archivo of archivosXmlCargados) {
    try {
      const data = extraerDatosXml(archivo.contenido);
      // ATS Compras (solo para facturas - tipo 01)
      if (data.codDoc === '01') { 
        comprasXml += `
    <detalleCompras>
      <codSustento>01</codSustento>
      <tpIdProv>01</tpIdProv>
      <idProv>${data.ruc}</idProv>
      <tipoComprobante>01</tipoComprobante>
      <tipoProv>01</tipoProv>
      <fechaRegistro>${data.fechaEmision}</fechaRegistro>
      <establecimiento>${data.numComprobante.split('-')[0] || '001'}</establecimiento>
      <puntoEmision>${data.numComprobante.split('-')[1] || '001'}</puntoEmision>
      <secuencial>${data.numComprobante.split('-')[2] || '000000001'}</secuencial>
      <fechaEmision>${data.fechaEmision}</fechaEmision>
      <autorizacion>${data.claveAcceso}</autorizacion>
      <baseNoGraIva>0.00</baseNoGraIva>
      <baseImponible>${data.base0}</baseImponible>
      <baseImpGrav>${data.baseGravada}</baseImpGrav>
      <baseImpExe>0.00</baseImpExe>
      <montoIce>0.00</montoIce>
      <montoIva>${data.montoIva}</montoIva>
      <valRetBien10>0.00</valRetBien10>
      <valRetServ20>0.00</valRetServ20>
      <valorRetBienes>0.00</valorRetBienes>
      <valRetServ50>0.00</valRetServ50>
      <valorRetServicios>0.00</valorRetServicios>
      <valRetServ100>0.00</valRetServ100>
      <totbasesImpReemb>0.00</totbasesImpReemb>
      <pagoExterior>
        <pagoLocExt>01</pagoLocExt>
        <paisEfecPago>NA</paisEfecPago>
        <aplicConvDobTrib>NA</aplicConvDobTrib>
        <pagExtSujRetNorLeg>NA</pagExtSujRetNorLeg>
      </pagoExterior>
      <formasDePago>
        <formaPago>01</formaPago>
      </formasDePago>
    </detalleCompras>`;
      }
    } catch (e) {
      console.error('Error procesando ATS:', e);
    }
  }

  const atsDoc = `<?xml version="1.0" encoding="UTF-8"?>
<iva>
  <TipoIDInformante>R</TipoIDInformante>
  <IdInformante>${rucInformante}</IdInformante>
  <razonSocial>${rsInformante}</razonSocial>
  <Anio>${anio}</Anio>
  <Mes>${mes}</Mes>
  <numEstabRuc>${estab}</numEstabRuc>
  <totalVentas>${totalVentas}</totalVentas>
  <codigoOperativo>IVA</codigoOperativo>
  <compras>${comprasXml}
  </compras>
</iva>`;

  descargarArchivo(atsDoc, `ATS_${rucInformante}_${anio}_${mes}.xml`, 'application/xml');
}

function descargarArchivo(contenido, nombreArchivo, tipoMime) {
  const blob = new Blob([contenido], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

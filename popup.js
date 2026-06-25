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

let isRunning = false;
let todosSeleccionados = true;

// ── Inicialización ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Cargar preferencias guardadas
  chrome.storage.local.get(
    ['tipoDescarga', 'formatoNombre', 'desde', 'hasta', 'tiposComprobante', 'subcarpetaDestino', 'anio', 'mes', 'dia'],
    (data) => {
      if (data.tipoDescarga)  selTipo.value    = data.tipoDescarga;
      if (data.formatoNombre) selFormato.value = data.formatoNombre;
      if (data.desde)         inputDesde.value = data.desde;
      if (data.hasta)         inputHasta.value = data.hasta;
      if (data.anio)          inputAnio.value  = data.anio;
      if (data.mes)           selMes.value     = data.mes;
      if (data.dia)           inputDia.value   = data.dia;
      if (data.subcarpetaDestino !== undefined) inputSubcarpeta.value = data.subcarpetaDestino;

      // Restaurar tipos seleccionados
      if (data.tiposComprobante && Array.isArray(data.tiposComprobante)) {
        document.querySelectorAll('.tipo-check input').forEach(cb => {
          cb.checked = data.tiposComprobante.includes(cb.value);
        });
      }

      actualizarEjemplo();
      actualizarResumenTipos();
      
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

  // Guardar al cambiar o escribir
  [selTipo, selFormato, inputDesde, inputHasta, inputSubcarpeta, inputAnio, selMes, inputDia].forEach(el => {
    el.addEventListener('change', guardarPreferencias);
    el.addEventListener('input', guardarPreferencias);
  });
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

// ── Obtener tipos seleccionados ─────────────────────────────
function getTiposSeleccionados() {
  return Array.from(document.querySelectorAll('.tipo-check input:checked'))
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
    subcarpetaDestino: inputSubcarpeta.value
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
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'DETENER_DESCARGA' });
    } catch (e) {
      // Ignorar error si la pestaña ya no responde
    }
  }
  setStatus('warning', 'Descarga detenida por el usuario');
  addLog('⏹️ Descarga detenida', 'log-skip');
  resetUI();
}

// ── Mensajes del content script ──────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PROGRESO') {
    const { actual, total, archivo, accion } = msg;
    const pct = total > 0 ? Math.round((actual / total) * 100) : 0;
    progressFill.style.width = pct + '%';
    
    if (total > 0) {
      progressLabel.textContent = `${actual} / ${total} archivos`;
      progressPct.textContent   = pct + '%';
      
      const cls   = accion === 'ok' ? 'log-ok' : accion === 'skip' ? 'log-skip' : 'log-err';
      const icono = accion === 'ok' ? '✅' : accion === 'skip' ? '⏭️' : '❌';
      addLog(`${icono} [${actual}/${total}] ${archivo}`, cls);
      setStatus('running', `Descargando ${actual} de ${total}...`);
    } else {
      progressLabel.textContent = '0 / 0 archivos';
      progressPct.textContent   = '0%';
      
      const cls   = accion === 'ok' ? 'log-ok' : accion === 'skip' ? 'log-skip' : 'log-err';
      addLog(`${archivo}`, cls);
      setStatus('running', archivo || 'Iniciando...');
    }
    progressDet.textContent = archivo || '';
  }

  if (msg.type === 'DESCARGA_COMPLETA') {
    const { ok, skip, err, total, porTipo } = msg;
    setStatus('done', `✅ ${ok} descargados · ⏭️ ${skip} omitidos · ❌ ${err} errores`);
    addLog(`\n🎉 Completado: ${ok} ✅ | ${skip} ⏭️ | ${err} ❌`, 'log-ok');

    // Mostrar resumen por tipo si existe
    if (porTipo && Object.keys(porTipo).length > 0) {
      const r = Object.entries(porTipo)
        .map(([cod, n]) => `${NOMBRES_TIPO[cod] || cod}: ${n}`)
        .join(' | ');
      addLog(`📊 Por tipo: ${r}`, 'log-skip');
    }

    progressFill.style.width    = '100%';
    progressLabel.textContent   = `${total} / ${total} archivos`;
    progressPct.textContent     = '100%';
    progressDet.textContent     = 'Descarga finalizada';
    resetUI(false);
  }

  if (msg.type === 'ERROR_DESCARGA') {
    setStatus('error', msg.mensaje || 'Error inesperado');
    addLog(`❌ Error: ${msg.mensaje}`, 'log-err');
    resetUI();
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
  resultLog.appendChild(line);
  resultLog.scrollTop = resultLog.scrollHeight;
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

// ══════════════════════════════════════════════════════════════
//  content.js — Descargador SRI v3.0
//  Selectores verificados con diagnóstico real del portal SRI
//
//  Estructura confirmada:
//  - XML:  <A id="frmPrincipal:tablaCompRecibidos:N:lnkXml">
//  - PDF:  <A id="frmPrincipal:tablaCompRecibidos:N:lnkPdf">
//  - Filas: table tbody tr  (12 celdas, celda 9=XML, celda 10=PDF)
// ══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  if (window.__SRI_DESCARGADOR_v3__) return;
  window.__SRI_DESCARGADOR_v3__ = true;

  let cancelado = false;

  // Mapa de códigos SRI a nombres
  const TIPOS = {
    '01': 'Factura',
    '03': 'Liquidación Compra',
    '04': 'Nota Crédito',
    '05': 'Nota Débito',
    '07': 'Retención'
  };

  // Palabras clave para detectar tipo desde texto de la fila
  const TIPO_REGEX = [
    { cod: '01', re: /^factura/i },
    { cod: '03', re: /liquidaci/i },
    { cod: '04', re: /nota de cr/i },
    { cod: '05', re: /nota de d/i },
    { cod: '07', re: /retenci/i },
  ];

  // ── Escuchar mensajes del popup ─────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'INICIAR_DESCARGA') {
      cancelado = false;
      try {
        iniciarDescarga(msg.config).catch(err => {
          console.error('[SRI v3] Error asíncrono en iniciarDescarga:', err);
          notificar('ERROR_DESCARGA', { mensaje: err.message || String(err) });
        });
      } catch (err) {
        console.error('[SRI v3] Error síncrono en iniciarDescarga:', err);
        notificar('ERROR_DESCARGA', { mensaje: err.message || String(err) });
      }
    }
    if (msg.action === 'DETENER_DESCARGA') {
      cancelado = true;
      ocultarBotonCancelar();
      // Limpiar estado persistente al detener
      chrome.storage.local.get('estadoDescarga', (data) => {
        if (data.estadoDescarga) {
          data.estadoDescarga.activa = false;
          chrome.storage.local.set({ estadoDescarga: data.estadoDescarga });
        }
      });
    }
    if (msg.action === 'CALCULAR_FILAS') {
      try {
        const total = contarDocumentos();
        notificar('TOTAL_FILAS', { total });
      } catch (err) {
        console.error('[SRI v3] Error en contarDocumentos:', err);
      }
    }
    return true;
  });

  // ══════════════════════════════════════════════════════════
  //  CONTAR DOCUMENTOS DISPONIBLES
  //  Cuenta los botones XML reales (no todas las filas)
  // ══════════════════════════════════════════════════════════
  function contarDocumentos() {
    // Contar botones lnkXml presentes en la tabla (= documentos reales)
    const botonesXml = document.querySelectorAll('a[id*="lnkXml"]');
    return botonesXml.length;
  }

  // ══════════════════════════════════════════════════════════
  //  FUNCIÓN PRINCIPAL DE DESCARGA (MÁQUINA DE ESTADOS)
  // ══════════════════════════════════════════════════════════
  async function iniciarDescarga(config) {
    const { tiposComprobante } = config;
    
    if (!Array.isArray(tiposComprobante) || tiposComprobante.length === 0) {
      notificar('ERROR_DESCARGA', {
        mensaje: 'No se seleccionó ningún tipo de comprobante para descargar.'
      });
      return;
    }

    console.log(`[SRI v3] Iniciando ciclo multi-tipo para: ${tiposComprobante.map(t => TIPOS[t] || t).join(', ')}`);
    
    // Limpiar la cola de descargas y preparar el estado para iniciar limpios
    try {
      await chrome.storage.local.set({ colaDescargas: [] });
      await chrome.storage.local.set({
        estadoDescarga: {
          activa: true,
          config: config,
          indiceActual: 0,
          stats: { ok: 0, skip: 0, err: 0, porTipo: {} }
        }
      });
    } catch (e) {
      console.error('[SRI v3] Error al inicializar estado de descargas:', e);
    }
    
    notificar('PROGRESO', {
      actual: 0,
      total: 0,
      archivo: '🚀 Iniciando ciclo de consultas...',
      accion: 'skip'
    });

    mostrarBotonCancelar();

    // Iniciar el procesamiento del primer tipo
    procesarSiguienteTipo();
  }

  // ══════════════════════════════════════════════════════════
  //  PROCESAR EL SIGUIENTE TIPO EN EL ESTADO ACTUAL
  // ══════════════════════════════════════════════════════════
  async function procesarSiguienteTipo() {
    try {
      const data = await chrome.storage.local.get('estadoDescarga');
      if (!data.estadoDescarga || !data.estadoDescarga.activa || cancelado) return;
      
      const estado = data.estadoDescarga;
      const { config, indiceActual, stats } = estado;
      const { tiposComprobante } = config;

      if (indiceActual >= tiposComprobante.length) {
        // Ya terminamos todos los tipos
        estado.activa = false;
        await chrome.storage.local.set({ estadoDescarga: estado });
        ocultarBotonCancelar();
        notificar('DESCARGA_COMPLETA', { ok: stats.ok, skip: stats.skip, err: stats.err, total: stats.ok + stats.skip + stats.err, porTipo: stats.porTipo });
        return;
      }

      const codTipo = tiposComprobante[indiceActual];
      const nombreTipo = TIPOS[codTipo] || codTipo;

      console.log(`[SRI v3] 🔄 Procesando tipo: ${nombreTipo} [${indiceActual + 1}/${tiposComprobante.length}]`);
      notificar('PROGRESO', {
        actual: 0, total: 0,
        archivo: `🔄 Cambiando tipo a: ${nombreTipo} (${indiceActual + 1}/${tiposComprobante.length})...`,
        accion: 'skip'
      });

      // ── PASO A: Buscar el formulario (con reintento) ─────────────────
      let selectEl = buscarSelectTipoComprobante();
      let btnConsultar = buscarBotonConsultar();

      if (!selectEl || !btnConsultar) {
        console.warn(`[SRI v3] Formulario no encontrado para ${nombreTipo}. Reintentando en 2s...`);
        notificar('PROGRESO', { actual: 0, total: 0, archivo: `⏳ Buscando formulario...`, accion: 'skip' });
        await esperar(2000);
        selectEl = buscarSelectTipoComprobante();
        btnConsultar = buscarBotonConsultar();
        if (!selectEl || !btnConsultar) {
          notificar('PROGRESO', { actual: 0, total: 0, archivo: `❌ No se encontró formulario para ${nombreTipo}. Saltando...`, accion: 'err' });
          await avanzarAlSiguienteTipo(estado, tiposComprobante);
          return;
        }
      }

      // ── PASO A.5: Configurar la fecha (si se especificó en el popup) ─
      await configurarFechas(config.anio, config.mes, config.dia);

      // ── PASO B: Cambiar el tipo en el dropdown ───────────────────────
      const selectResult = await seleccionarTipoComprobante(selectEl, codTipo);
      if (!selectResult.exito) {
        console.warn(`[SRI v3] No se pudo seleccionar ${nombreTipo}. Opciones del select no coinciden.`);
        notificar('PROGRESO', { actual: 0, total: 0, archivo: `⚠️ Tipo ${nombreTipo} no disponible en este portal. Saltando...`, accion: 'skip' });
        await avanzarAlSiguienteTipo(estado, tiposComprobante);
        return;
      }

      // ── PASO C: Si cambió, esperar y VERIFICAR que el cambio pegó ────
      if (selectResult.cambiado) {
        console.log(`[SRI v3] Select cambiado. Verificando y esperando AJAX...`);
        notificar('PROGRESO', { actual: 0, total: 0, archivo: `⏳ Aplicando selección de tipo ${nombreTipo}...`, accion: 'skip' });

        // Pausa inicial para que JSF procese el evento
        await esperarAleatorio(1200, 2000);

        // Verificar que el tipo realmente cambió (con reintentos)
        const verificado = await verificarTipoSeleccionado(codTipo, 3);
        if (!verificado) {
          console.warn(`[SRI v3] ⚠️ No se pudo confirmar el cambio de tipo a ${nombreTipo}. Continuando de todas formas...`);
          notificar('PROGRESO', { actual: 0, total: 0, archivo: `⚠️ Cambio de tipo no confirmado para ${nombreTipo}`, accion: 'err' });
        }

        await esperarAleatorio(800, 1500);
      } else {
        // Ya estaba seleccionado
        await esperarAleatorio(500, 900);
      }

      if (cancelado) return;

      // ── PASO D: Hacer clic en "Consultar" ────────────────────────────
      // Siempre buscar el botón fresco (puede haberse regenerado el DOM)
      btnConsultar = buscarBotonConsultar();
      if (!btnConsultar) {
        notificar('PROGRESO', { actual: 0, total: 0, archivo: `❌ Botón Consultar no encontrado para ${nombreTipo}`, accion: 'err' });
        await avanzarAlSiguienteTipo(estado, tiposComprobante);
        return;
      }

      console.log(`[SRI v3] 🔍 Clic en "Consultar" para: ${nombreTipo}`);
      notificar('PROGRESO', { actual: 0, total: 0, archivo: `🔍 Consultando: ${nombreTipo}...`, accion: 'skip' });
      await clickearElementoHumano(btnConsultar);

      // Pausa post-click
      await esperarAleatorio(1000, 1800);

      if (cancelado) return;

      // ── PASO E: Esperar que la tabla cargue ──────────────────────────
      notificar('PROGRESO', { actual: 0, total: 0, archivo: `⏳ Cargando resultados de ${nombreTipo}...`, accion: 'skip' });
      const cargado = await esperarCargaTabla();
      if (!cargado) {
        console.warn(`[SRI v3] Timeout cargando tabla de ${nombreTipo}. Continuando de todas formas...`);
      }

      if (cancelado) return;

      // ── PASO F: Descargar los comprobantes de este tipo ──────────────
      let result = await procesarDescargaTipo(config, codTipo);

      // DOBLE CHECK: Si dio 0 resultados, hacer un segundo intento de consulta
      if (result && result.ok === 0 && result.skip === 0 && result.err === 0) {
        console.log(`[SRI v3] ⚠️ 0 resultados en ${nombreTipo}. Realizando DOBLE CHECK (reintento)...`);
        notificar('PROGRESO', { actual: 0, total: 0, archivo: `⚠️ 0 resultados. Reintentando consulta por si acaso...`, accion: 'skip' });
        
        btnConsultar = buscarBotonConsultar();
        if (btnConsultar) {
          await clickearElementoHumano(btnConsultar);
          await esperarAleatorio(1500, 2500);
          await esperarCargaTabla();
          if (cancelado) return;
          result = await procesarDescargaTipo(config, codTipo);
        }
      }

      if (result) {
        stats.ok += result.ok;
        stats.skip += result.skip;
        stats.err += result.err;
        stats.porTipo[codTipo] = (stats.porTipo[codTipo] || 0) + result.ok;
        console.log(`[SRI v3] ✅ Tipo ${nombreTipo} finalizado: ${result.ok} OK, ${result.skip} omitidos, ${result.err} errores`);
      }

      // ── PASO G: Avanzar al siguiente y refrescar ──────────────
      await avanzarAlSiguienteTipo(estado, tiposComprobante);

    } catch (e) {
      console.error('[SRI v3] Error en procesarSiguienteTipo:', e);
      notificar('ERROR_DESCARGA', { mensaje: e.message || String(e) });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  CONFIGURAR FECHAS EN EL PORTAL SRI
  // ══════════════════════════════════════════════════════════
  async function configurarFechas(anio, mes, dia) {
    if (!anio && !mes && !dia) return;

    const selects = Array.from(document.querySelectorAll('select'));
    if (selects.length < 3) return;

    // Asumimos que los primeros 3 selects del formulario son: Año, Mes, Día
    const [selAnio, selMes, selDia] = selects;

    console.log(`[SRI v3] Configurando fecha: ${anio || '*'} / ${mes || '*'} / ${dia || '*'}`);

    async function setPrimeFacesSelect(selectEl, targetValue) {
      if (!targetValue) return;
      const options = Array.from(selectEl.options);
      let opt = options.find(o => normalizarTexto(o.textContent) === normalizarTexto(targetValue) || o.value === targetValue);
      if (!opt) opt = options.find(o => normalizarTexto(o.textContent).includes(normalizarTexto(targetValue)));
      if (!opt || selectEl.value === opt.value) return;

      console.log(`[SRI v3] Cambiando fecha a: "${opt.textContent.trim()}" (valor: ${opt.value})`);
      
      // Sincronizar en el MAIN world para evitar desajustes
      try {
        await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { action: 'EJECUTAR_EN_MAIN_WORLD', selectId: selectEl.id, codTipo: opt.value },
            (response) => resolve()
          );
        });
        await esperar(1200);
      } catch (e) {
        console.error('[SRI v3] Error al configurar fecha:', e);
      }
    }

    notificar('PROGRESO', { actual: 0, total: 0, archivo: `⏳ Configurando fecha...`, accion: 'skip' });
    if (anio) await setPrimeFacesSelect(selAnio, anio);
    if (mes) await setPrimeFacesSelect(selMes, mes);
    if (dia) await setPrimeFacesSelect(selDia, dia);
    await esperar(800);
  }

  // ══════════════════════════════════════════════════════════
  //  AVANZAR AL SIGUIENTE TIPO Y RECARGAR LA PÁGINA
  // ══════════════════════════════════════════════════════════
  async function avanzarAlSiguienteTipo(estado, tiposComprobante) {
    if (cancelado) return;
    
    estado.indiceActual++;
    await chrome.storage.local.set({ estadoDescarga: estado });

    if (estado.indiceActual < tiposComprobante.length) {
      console.log(`[SRI v3] Refrescando página para el siguiente tipo...`);
      notificar('PROGRESO', { actual: 0, total: 0, archivo: `🔄 Refrescando página para limpiar el portal SRI...`, accion: 'skip' });
      await esperarAleatorio(1500, 2500);
      location.reload();
    } else {
      // Finalizó todos los tipos
      estado.activa = false;
      await chrome.storage.local.set({ estadoDescarga: estado });
      ocultarBotonCancelar();
      const { stats } = estado;
      notificar('DESCARGA_COMPLETA', { ok: stats.ok, skip: stats.skip, err: stats.err, total: stats.ok + stats.skip + stats.err, porTipo: stats.porTipo });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  PROCESAR LA DESCARGA DE UN TIPO ESPECÍFICO DE COMPROBANTE
  // ══════════════════════════════════════════════════════════
  async function procesarDescargaTipo(config, codTipo) {
    const { desde, hasta, tipo, fmt } = config;

    let xmlBtnsOnPage = document.querySelectorAll('a[id*="lnkXml"]').length;
    
    // Verificar si el tbody tiene mensaje de vacío
    const tbody = document.querySelector('.ui-datatable-data, table tbody');
    const tbodyText = tbody ? tbody.textContent.trim().toLowerCase() : '';
    const esVacioTbody = tbodyText.includes('no se encontraron') || tbodyText.includes('ningún registro') || tbodyText.includes('no existen') || tbodyText.includes('no se encontraron registros');

    // Verificar si hay algún banner de advertencia global en pantalla
    const bannerMensajeVacio = Array.from(document.querySelectorAll('.ui-messages-warn, .ui-messages-info, .ui-messages-error, .ui-message, .ui-growl, .ui-state-highlight'))
      .some(el => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const text = el.textContent.trim().toLowerCase();
        return text.includes('no existen datos') || text.includes('no se encontraron') || text.includes('ningún registro') || text.includes('no se encontraron registros');
      });

    const esVacio = esVacioTbody || bannerMensajeVacio || xmlBtnsOnPage === 0;

    if (esVacio) {
      console.log(`[SRI v3] No se encontraron registros para ${TIPOS[codTipo] || codTipo}.`);
      notificar('PROGRESO', {
        actual: 0,
        total: 0,
        archivo: `⚠️ [${TIPOS[codTipo] || codTipo}] Sin documentos para los parámetros ingresados`,
        accion: 'skip'
      });
      await esperarAleatorio(800, 1500); // Pausa corta humanizada
      return { ok: 0, skip: 0, err: 0 };
    }

    // Si hay paginador y no estamos en la página 1, regresar a la página 1 ANTES de calcular el total y comenzar
    const firstBtn = document.querySelector('.ui-paginator-first');
    const paginatorCurrent = document.querySelector('.ui-paginator-current');
    if (firstBtn && !firstBtn.classList.contains('ui-state-disabled')) {
      console.log('[SRI v3] Regresando a la página 1 de resultados antes de iniciar...');
      const oldPageText = paginatorCurrent ? paginatorCurrent.textContent || '' : '';
      await clickearBoton(firstBtn);
      
      let pageChanged = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        await esperar(200);
        const newPageText = document.querySelector('.ui-paginator-current')?.textContent || '';
        if (newPageText !== oldPageText) {
          pageChanged = true;
          break;
        }
      }
      if (!pageChanged) {
        await esperar(2000);
      }
      // Actualizar el número de botones XML ahora que estamos en la página 1
      xmlBtnsOnPage = document.querySelectorAll('a[id*="lnkXml"]').length;
    }

    // Calcular el total global de documentos
    let totalGlobalDocs = 0;
    const paginatorCurrentFresco = document.querySelector('.ui-paginator-current');
    if (paginatorCurrentFresco) {
      const text = paginatorCurrentFresco.textContent.trim();
      const rangeMatch = text.match(/\d+\s*(?:-|al|to)\s*\d+\s+(?:de|of)\s+(\d+)/i);
      if (rangeMatch) {
        totalGlobalDocs = parseInt(rangeMatch[1]);
      } else {
        const pageMatch = text.match(/(\d+)\s+(?:de|of)\s+(\d+)/i);
        if (pageMatch) {
          totalGlobalDocs = parseInt(pageMatch[2]) * xmlBtnsOnPage;
        }
      }
    }
    if (!totalGlobalDocs) {
      totalGlobalDocs = xmlBtnsOnPage;
    }

    const desdeVal = Math.max(1, parseInt(desde) || 1);
    // Si hasta está especificado de forma válida, confiamos en él directamente sin caparlo de forma restrictiva
    const hastaVal = (hasta && parseInt(hasta) > 0) ? parseInt(hasta) : totalGlobalDocs;
    const totalAdescargar = Math.max(1, hastaVal - desdeVal + 1);

    let contOk = 0, contSkip = 0, contErr = 0;

    console.log(`[SRI v3] Descargando ${TIPOS[codTipo] || codTipo}: rango global ${desdeVal}-${hastaVal}, total estimado: ${totalAdescargar}`);

    let globalRowIndex = 1;
    let paginando = true;

    while (paginando) {
      if (cancelado) break;

      const botonesXml = Array.from(document.querySelectorAll('a[id*="lnkXml"]'));
      const botonesPdf = Array.from(document.querySelectorAll('a[id*="lnkPdf"]'));
      const numRows = botonesXml.length;

      if (numRows === 0) {
        break;
      }

      console.log(`[SRI v3] Procesando página para ${TIPOS[codTipo] || codTipo}. Rango global: ${globalRowIndex} a ${globalRowIndex + numRows - 1}`);

      for (let localIdx = 0; localIdx < numRows; localIdx++) {
        if (cancelado) break;

        const rowIdxGlobal = globalRowIndex + localIdx;

        // Omitir antes del rango 'desde'
        if (rowIdxGlobal < desdeVal) {
          continue;
        }

        // Detener si supera el rango 'hasta'
        if (rowIdxGlobal > hastaVal) {
          paginando = false;
          break;
        }

        const btnXml = botonesXml[localIdx];
        const btnPdf = botonesPdf[localIdx];
        const posRelativa = rowIdxGlobal - desdeVal + 1;
        const nombreRef = obtenerNombreDesdeId(btnXml?.id || '', fmt, rowIdxGlobal, codTipo);

        // Extraer metadata de la fila
        let metadata = null;
        if (btnXml || btnPdf) {
          metadata = extraerMetadataFila(btnXml || btnPdf, codTipo);
        }

        try {
          // Descargar XML con retraso humanizado
          if ((tipo === 'xml' || tipo === 'xml_pdf') && btnXml) {
            console.log(`[SRI v3] Descargando XML fila ${rowIdxGlobal}:`, btnXml.id);
            
            if (metadata) {
              await registrarEnColaDescargas(metadata, 'xml');
            }

            await clickearBoton(btnXml);
            contOk++;
            notificar('PROGRESO', {
              actual: posRelativa,
              total: totalAdescargar,
              archivo: `[${TIPOS[codTipo] || codTipo}] XML [${rowIdxGlobal}] ${nombreRef}`,
              accion: 'ok'
            });
            // Espera rápida después de descargar XML
            await esperarAleatorio(100, 300);
          } else if (tipo === 'xml' && !btnXml) {
            contSkip++;
            notificar('PROGRESO', { actual: posRelativa, total: totalAdescargar, archivo: `Sin XML en fila ${rowIdxGlobal}`, accion: 'skip' });
          }

          // Descargar PDF con retraso humanizado
          if ((tipo === 'pdf' || tipo === 'xml_pdf') && btnPdf) {
            if (tipo === 'xml_pdf') {
              // Pausa muy breve entre XML y PDF
              await esperarAleatorio(50, 150);
            }

            console.log(`[SRI v3] Descargando PDF/RIDE fila ${rowIdxGlobal}:`, btnPdf.id);
            
            if (metadata) {
              await registrarEnColaDescargas(metadata, 'pdf');
            }

            await clickearBoton(btnPdf);

            if (tipo === 'pdf') contOk++;
            notificar('PROGRESO', {
              actual: posRelativa,
              total: totalAdescargar,
              archivo: `[${TIPOS[codTipo] || codTipo}] RIDE [${rowIdxGlobal}] ${nombreRef}`,
              accion: 'ok'
            });
            // Espera rápida después de descargar PDF
            await esperarAleatorio(100, 300);
          } else if (tipo === 'pdf' && !btnPdf) {
            contSkip++;
            notificar('PROGRESO', { actual: posRelativa, total: totalAdescargar, archivo: `Sin RIDE en fila ${rowIdxGlobal}`, accion: 'skip' });
          }

          // Pausa corta entre filas consecutivas para ir más rápido
          await esperarAleatorio(50, 150);

        } catch (err) {
          contErr++;
          console.error(`[SRI v3] Error en fila ${rowIdxGlobal}:`, err);
          notificar('PROGRESO', {
            actual: posRelativa,
            total: totalAdescargar,
            archivo: `Error en fila ${rowIdxGlobal}: ${err.message}`,
            accion: 'err'
          });
          await esperarAleatorio(500, 1000);
        }
      }

      if (cancelado || !paginando) break;

      globalRowIndex += numRows;

      if (globalRowIndex > hastaVal) {
        break;
      }

      // Buscar siguiente página
      const nextBtn = document.querySelector('.ui-paginator-next');
      if (nextBtn && !nextBtn.classList.contains('ui-state-disabled')) {
        console.log('[SRI v3] Navegando a la siguiente página...');
        const oldPageText = document.querySelector('.ui-paginator-current')?.textContent || '';
        await clickearBoton(nextBtn);

        let pageChanged = false;
        for (let attempt = 0; attempt < 50; attempt++) {
          await esperar(200);
          const newPageText = document.querySelector('.ui-paginator-current')?.textContent || '';
          if (newPageText !== oldPageText) {
            pageChanged = true;
            break;
          }
        }
        if (!pageChanged) {
          console.warn('[SRI v3] Timeout paginación. Espera de 2.5s...');
          await esperar(2500);
        }
      } else {
        break;
      }
    }

    return { ok: contOk, skip: contSkip, err: contErr };
  }

  // ══════════════════════════════════════════════════════════
  //  CLICK EN BOTÓN JSF (PrimeFaces / mojarra)
  //  Los botones del SRI usan mojarra.jsfcljs() en el onclick
  //  Es necesario disparar eventos reales para que funcione
  // ══════════════════════════════════════════════════════════
  async function clickearBoton(elemento) {
    return new Promise((resolve) => {
      try {
        // Asegurarse de que el elemento es visible
        elemento.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(() => {
          // Disparar la cadena completa de eventos del mouse
          const eventos = ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click'];
          eventos.forEach(tipo => {
            elemento.dispatchEvent(new MouseEvent(tipo, {
              bubbles: true,
              cancelable: true,
              view: window
            }));
          });

          // También llamar directamente al onclick si existe (para JSF/mojarra)
          const onclickAttr = elemento.getAttribute('onclick');
          if (onclickAttr) {
            try {
              // ejecutar el onclick directamente
              elemento.click();
            } catch (e) { /* ignorar */ }
          }

          resolve();
        }, 300);
      } catch (e) {
        console.error('[SRI v3] Error al clickear:', e);
        resolve();
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  //  DETECTAR TIPO DE COMPROBANTE DE UNA FILA
  //  Primero intenta leer el texto de la celda tipo/serie;
  //  si no, usa la clave de acceso (dígitos 9-10 = codDoc)
  // ══════════════════════════════════════════════════════════
  function detectarTipoFila(btnXml) {
    try {
      const fila = btnXml?.closest('tr');
      if (!fila) return 'otro';

      // Buscar en el texto de la fila
      const textos = Array.from(fila.querySelectorAll('td'))
        .map(td => td.textContent.trim());

      for (const { cod, re } of TIPO_REGEX) {
        if (textos.some(t => re.test(t))) return cod;
      }

      // Fallback: leer dígitos 9-10 de la clave de acceso
      const clave = textos.find(t => /^\d{49}$/.test(t));
      if (clave) return clave.substring(8, 10);

    } catch (e) { /* ignorar */ }
    return 'otro';
  }

  // ══════════════════════════════════════════════════════════
  //  GENERAR NOMBRE DE REFERENCIA PARA EL LOG
  // ══════════════════════════════════════════════════════════
  function obtenerNombreDesdeId(id, fmt, num, codTipo) {
    // Extraer el índice de la fila del ID del botón
    const match = id.match(/:(\d+):lnk/);
    const indice = match ? match[1] : num;

    // Buscar la fila correspondiente para extraer datos
    try {
      // La fila tiene celda con clave de acceso (49 dígitos)
      const fila = document.querySelector(`a[id*=":${indice}:lnkXml"]`)?.closest('tr');
      if (fila) {
        const textos = Array.from(fila.querySelectorAll('td'))
          .map(td => td.textContent.trim().replace(/\s+/g, ' '));

        const clave = textos.find(t => /^\d{49}$/.test(t));
        const serie = textos.find(t => /^\d{3}-\d{3,4}-\d{6,9}$/.test(t));
        const ruc   = textos.find(t => /^\d{13}$/.test(t));
        const tipoNombre = TIPOS[codTipo] || 'DOC';

        switch (fmt) {
          case 'tipo_ruc_serie':
            return `${tipoNombre}_${ruc || 'RUC'}_${serie || num}`;
          case 'fecha_tipo_serie_nombre':
            return `${tipoNombre}_${serie || `fila_${num}`}`;
          case 'clave':
          default:
            return clave ? clave.substring(0, 15) + '...' : `fila_${num}`;
        }
      }
    } catch (e) { /* ignorar */ }

    return `fila_${num}`;
  }

  // ══════════════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════════════
  function notificar(type, data) {
    try {
      chrome.runtime.sendMessage({ type, ...data }, () => {
        // Limpiar runtime.lastError para evitar excepciones no controladas
        const err = chrome.runtime.lastError;
      });
    } catch (e) {
      // Ignorar error si el popup está cerrado
    }
  }

  function esperar(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Helper de esperas aleatorias (humanizadas)
  function esperarAleatorio(minMs, maxMs) {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return esperar(ms);
  }

  // Busca el elemento <select> de Tipo de Comprobante por coincidencia de opciones
  function buscarSelectTipoComprobante() {
    const selects = Array.from(document.querySelectorAll('select'));
    for (const sel of selects) {
      const options = Array.from(sel.options);
      const textos = options.map(opt => ((opt && opt.textContent) || '').toLowerCase());
      const tieneFactura = textos.some(t => t.includes('factura'));
      const tieneRetencion = textos.some(t => t.includes('retención') || t.includes('retencion'));
      const tieneLiquidacion = textos.some(t => t.includes('liquidación') || t.includes('liquidacion'));
      
      if (tieneFactura && (tieneRetencion || tieneLiquidacion)) {
        return sel;
      }
    }
    return document.querySelector('select[id*="tipo" i], select[id*="comprobante" i]');
  }

  // Busca el botón de "Consultar" basado en texto o valor
  function buscarBotonConsultar() {
    const elements = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.ui-button, a[id*="btn" i]'));
    for (const el of elements) {
      const text = (el.textContent || el.value || '').trim().toLowerCase();
      if (text === 'consultar') {
        return el;
      }
    }
    return document.querySelector('input[id*="consultar" i], button[id*="consultar" i], a[id*="consultar" i]');
  }

  // Helper para normalizar texto (quitar acentos/tildes y pasar a minúsculas)
  function normalizarTexto(txt) {
    if (txt === null || txt === undefined) return '';
    return String(txt).toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  // Simular eventos de mouse humanizados en un elemento con pausas reales y movimiento
  async function clickearElementoHumano(el) {
    if (!el) return;
    try {
      // 1. Simular Hover (mouseenter y mouseover)
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }));
      await esperar(150);
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
      await esperar(150);
      
      // Simular pequeñas variaciones de movimiento de mouse
      for (let i = 0; i < 2; i++) {
        el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window }));
        await esperar(100);
      }
      
      // 2. Simular presionar botón (mousedown)
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      await esperar(200);
      
      try { el.focus(); } catch(e) {}
      await esperar(100);
      
      // 3. Simular soltar botón (mouseup)
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      await esperar(150);
      
      // 4. Simular clic final
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      await esperar(400);
    } catch (e) {
      console.error('[SRI v3] Error en clickearElementoHumano:', e);
      try { el.click(); } catch(e2) {}
    }
  }

  // Selecciona la opción adecuada en el select y dispara la cadena completa de eventos
  // para que JSF/PrimeFaces procese el cambio correctamente
  async function seleccionarTipoComprobante(selectEl, codTipo) {
    const palabrasClave = {
      '01': ['factura'],
      '03': ['liquidac'],
      '04': ['cred', 'créd'],
      '05': ['deb', 'déb'],
      '07': ['retencion']
    };

    const keywords = palabrasClave[codTipo];
    if (!keywords) return { cambiado: false, exito: false };

    const options = Array.from(selectEl.options);
    let optionTarget = null;
    let optionIndex = -1;

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const txt = normalizarTexto(opt.textContent);
      const val = opt.value || '';
      
      if (keywords.some(kw => txt.includes(kw)) || val === codTipo || val === parseInt(codTipo).toString()) {
        optionTarget = opt;
        optionIndex = i;
        break;
      }
    }

    if (!optionTarget) {
      console.warn(`[SRI v3] No se encontró opción para tipo ${codTipo} en el select. Opciones disponibles:`,
        Array.from(selectEl.options).map(o => `"${o.textContent.trim()}" (val=${o.value})`).join(', '));
      return { cambiado: false, exito: false };
    }

    // Forzar siempre la interacción y sincronización con el servidor para evitar desajustes de JSF
    console.log(`[SRI v3] Iniciando proceso de selección para "${optionTarget.textContent.trim()}" (valor: ${optionTarget.value})`);

    console.log(`[SRI v3] Cambiando selección a "${optionTarget.textContent.trim()}" (valor: ${optionTarget.value})`);

    let exitoVisual = false;

    // Intentar interactuar con el componente PrimeFaces visible
    const pfWrapper = selectEl.closest('.ui-selectonemenu') || document.getElementById(selectEl.id.replace(/_input$/, ''));
    if (pfWrapper) {
      console.log('[SRI v3] Componente PrimeFaces detectado. Iniciando simulación de mouse visual...');
      
      // Resaltar visualmente el dropdown con un borde rojo llamativo y centrar la pantalla instantáneamente (sin animaciones de scroll)
      const originalOutline = pfWrapper.style.outline;
      pfWrapper.style.outline = '4px solid #ff4757';
      pfWrapper.style.outlineOffset = '2px';
      pfWrapper.scrollIntoView({ behavior: 'auto', block: 'center' });
      await esperar(800); // Dar tiempo al usuario para ver el resalte
      
      // Abrir el dropdown simulando el clic del mouse
      const trigger = pfWrapper.querySelector('.ui-selectonemenu-trigger') || pfWrapper;
      await clickearElementoHumano(trigger);
      await esperar(800); // Esperar a que se abra la lista desplegable
      
      const panelId = pfWrapper.id + '_panel';
      let panel = document.getElementById(panelId);
      
      let panelVisible = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        if (!panel) panel = document.getElementById(panelId);
        if (!panel) panel = document.querySelector('.ui-selectonemenu-panel'); // fallback
        
        if (panel) {
          const style = window.getComputedStyle(panel);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            panelVisible = true;
            break;
          }
        }
        await esperar(150);
      }
      
      if (panelVisible && panel) {
        console.log('[SRI v3] Panel visible. Buscando la opción...');
        await esperar(300);
        
        const items = Array.from(panel.querySelectorAll('li.ui-selectonemenu-item'));
        let targetLi = null;
        
        for (const item of items) {
          const itemText = normalizarTexto(item.textContent);
          if (keywords.some(kw => itemText.includes(kw))) {
            targetLi = item;
            break;
          }
        }
        
        if (!targetLi && optionIndex !== -1 && items[optionIndex]) {
          targetLi = items[optionIndex];
        }
        
        if (targetLi) {
          // Resaltar visualmente la opción dentro de la lista desplegable
          const originalBg = targetLi.style.backgroundColor;
          const originalColor = targetLi.style.color;
          targetLi.style.backgroundColor = '#ff4757';
          targetLi.style.color = '#ffffff';
          targetLi.scrollIntoView({ behavior: 'auto', block: 'nearest' });
          
          await esperar(800); // Pausa para que el usuario aprecie la selección antes de clickear
          
          await clickearElementoHumano(targetLi);
          await esperar(800); // Esperar a que el panel se cierre
          exitoVisual = true;
        }
      }
      
      // Restaurar el estilo original del dropdown
      pfWrapper.style.outline = originalOutline;
    } else {
      // Resaltar select estándar si no es PrimeFaces
      const originalOutline = selectEl.style.outline;
      selectEl.style.outline = '4px solid #ff4757';
      selectEl.scrollIntoView({ behavior: 'auto', block: 'center' });
      await esperar(800);
      selectEl.style.outline = originalOutline;
    }

    // Sincronizar en el MAIN world de la página a través de background.js
    try {
      console.log('[SRI v3] Enviando mensaje de sincronización a MAIN world...');
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'EJECUTAR_EN_MAIN_WORLD', selectId: selectEl.id, codTipo: optionTarget.value },
          (response) => {
            console.log('[SRI v3] Respuesta de sincronización en MAIN world:', response);
            resolve();
          }
        );
      });
      // Espera de estabilidad para que JSF termine su AJAX
      await esperar(2000);
    } catch (e) {
      console.error('[SRI v3] Error al sincronizar con el MAIN world:', e);
    }

    if (selectEl.value === optionTarget.value || exitoVisual) {
      return { cambiado: true, exito: true, valorSeleccionado: optionTarget.value };
    }

    // Fallback nativo
    selectEl.value = optionTarget.value;

    const mouseEvts = ['mousedown', 'mouseup', 'click'];
    mouseEvts.forEach(evtType => {
      try {
        selectEl.dispatchEvent(new MouseEvent(evtType, {
          bubbles: true, cancelable: true, view: window
        }));
      } catch(e) {}
    });

    ['input', 'change'].forEach(evtType => {
      try {
        selectEl.dispatchEvent(new Event(evtType, { bubbles: true, cancelable: true }));
      } catch(e) {}
    });

    const changeEvt = new Event('change', { bubbles: true });
    if (typeof selectEl.onchange === 'function') {
      try { selectEl.onchange(changeEvt); } catch(e) {}
    }

    await esperar(1000);
    return { cambiado: true, exito: true, valorSeleccionado: optionTarget.value };
  }

  // Verifica que el select del SRI muestre efectivamente el tipo esperado
  async function verificarTipoSeleccionado(codTipo, maxIntentos = 3) {
    for (let i = 0; i < maxIntentos; i++) {
      await esperar(800);
      const sel = buscarSelectTipoComprobante();
      if (!sel) continue;

      const valorActual = normalizarTexto(
        sel.options[sel.selectedIndex]?.textContent || sel.value || ''
      );

      const palabrasClave = {
        '01': ['factura'],
        '03': ['liquidac'],
        '04': ['cred', 'créd'],
        '05': ['deb', 'déb'],
        '07': ['retencion']
      };
      const keywords = palabrasClave[codTipo] || [];
      const coincide = keywords.some(kw => valorActual.includes(kw));

      if (coincide) {
        console.log(`[SRI v3] ✅ Verificado: select muestra "${valorActual}" para tipo ${codTipo}`);
        return true;
      }
      console.warn(`[SRI v3] ⚠️ Select muestra "${valorActual}", esperado tipo ${codTipo}. Reintentando...`);

      // Reintentar el cambio si no pegó
      const resultado = await seleccionarTipoComprobante(sel, codTipo);
      if (!resultado.exito) return false;
    }
    return false;
  }

  // Espera a que la tabla termine de cargar dinámicamente
  async function esperarCargaTabla() {
    console.log('[SRI v3] Esperando a que se cargue la tabla...');
    await esperar(1200);

    for (let i = 0; i < 40; i++) {
      const blockerVisible = Array.from(document.querySelectorAll('.ui-blockui, [id*="statusDialog" i], [id*="status" i], div[id*="cargando" i], div[id*="loading" i]'))
        .some(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
        });

      if (!blockerVisible) {
        // Verificar si se muestra el banner de advertencia global indicando que no hay datos
        const bannerMensajeVacio = Array.from(document.querySelectorAll('.ui-messages-warn, .ui-messages-info, .ui-messages-error, .ui-message, .ui-growl, .ui-state-highlight'))
          .some(el => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const text = el.textContent.trim().toLowerCase();
            return text.includes('no existen datos') || text.includes('no se encontraron') || text.includes('ningún registro') || text.includes('no se encontraron registros');
          });

        if (bannerMensajeVacio) {
          console.log('[SRI v3] Detectado aviso de "No existen datos". Fin de espera.');
          await esperarAleatorio(400, 800);
          return true;
        }

        const tbody = document.querySelector('.ui-datatable-data, table tbody');
        if (tbody) {
          const text = tbody.textContent.trim().toLowerCase();
          const tieneFilas = tbody.querySelectorAll('tr[data-ri], tr.ui-widget-content').length > 0;
          const esVacio = text.includes('no se encontraron') || text.includes('ningún registro') || text.includes('no existen') || text.includes('no se encontraron registros');
          
          if (tieneFilas || esVacio) {
            console.log('[SRI v3] Tabla detectada como cargada.');
            await esperarAleatorio(500, 1000); // Pausa humanizada extra de estabilidad
            return true;
          }
        }
      }
      await esperar(200);
    }
    return false;
  }

  // Registra la metadata y la extensión del archivo en una cola de descargas
  async function registrarEnColaDescargas(metadata, ext) {
    try {
      const data = await chrome.storage.local.get('colaDescargas');
      const cola = data.colaDescargas || [];
      cola.push({
        metadata: metadata,
        extension: ext,
        timestamp: Date.now()
      });
      await chrome.storage.local.set({ colaDescargas: cola });
      console.log(`[SRI v3] Registrado en cola de descargas: ${ext} de ${metadata.clave}`);
    } catch (e) {
      console.error('[SRI v3] Error al registrar en cola de descargas:', e);
    }
  }

  // Extrae la metadata (RUC, serie, razón social, fecha, clave) de una fila de la tabla
  function extraerMetadataFila(btnElement, codTipo) {
    try {
      const fila = btnElement?.closest('tr');
      if (!fila) return null;

      const textos = Array.from(fila.querySelectorAll('td'))
        .map(td => td.textContent.trim().replace(/\s+/g, ' '));

      const clave = textos.find(t => /^\d{49}$/.test(t));
      const serie = textos.find(t => /^\d{3}-\d{3,4}-\d{6,9}$/.test(t));
      const ruc   = textos.find(t => /^\d{13}$/.test(t));

      let razonSocial = '';
      if (ruc) {
        const celdaRucRazon = Array.from(fila.querySelectorAll('td')).find(td => td.textContent.includes(ruc));
        if (celdaRucRazon) {
          // Quitar el RUC del texto de la celda para obtener el nombre comercial / razón social
          razonSocial = celdaRucRazon.textContent.replace(ruc, '').trim().replace(/\s+/g, ' ');
        }
      }

      let fecha = '';
      for (const t of textos) {
        const matchFecha = t.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
        if (matchFecha) {
          fecha = `${matchFecha[3]}-${matchFecha[2]}-${matchFecha[1]}`;
          break;
        }
      }

      const tipoNombre = TIPOS[codTipo] || 'DOCUMENTO';

      return {
        clave: clave || '',
        serie: serie || '',
        ruc: ruc || '',
        razonSocial: razonSocial || '',
        fecha: fecha || '',
        tipo: tipoNombre
      };
    } catch (e) {
      console.error('[SRI v3] Error al extraer metadata de fila:', e);
      return null;
    }
  }

  // ── Auto-diagnóstico y reanudación al cargar ──────────────────────────────
  setTimeout(() => {
    const xml = document.querySelectorAll('a[id*="lnkXml"]').length;
    const pdf = document.querySelectorAll('a[id*="lnkPdf"]').length;
    console.log(`[SRI Descargador v3] ✅ Listo | ${xml} botones XML | ${pdf} botones PDF/RIDE`);
    
    chrome.storage.local.get('estadoDescarga', (data) => {
      if (data.estadoDescarga && data.estadoDescarga.activa) {
        console.log('[SRI v3] Reanudando descarga tras recarga de página...');
        mostrarBotonCancelar();
        procesarSiguienteTipo();
      }
    });
  }, 1500);

  // ══════════════════════════════════════════════════════════
  //  BOTÓN FLOTANTE DE CANCELAR EN LA PÁGINA
  // ══════════════════════════════════════════════════════════
  function mostrarBotonCancelar() {
    if (document.getElementById('sri-bot-cancelar')) return;
    const btn = document.createElement('button');
    btn.id = 'sri-bot-cancelar';
    btn.innerHTML = '⏹️ Cancelar Descarga Inteligente';
    btn.style.cssText = `
      position: fixed;
      bottom: 30px;
      right: 30px;
      z-index: 999999;
      background: #ff4757;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 50px;
      font-size: 16px;
      font-family: Arial, sans-serif;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(255, 71, 87, 0.4);
      transition: all 0.3s ease;
    `;
    btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
    btn.onmouseout = () => btn.style.transform = 'scale(1)';
    btn.onclick = () => {
      btn.innerHTML = 'Cancelando...';
      btn.style.background = '#ff6b81';
      chrome.runtime.sendMessage({ action: 'DETENER_DESCARGA' }); // Si el background necesita saberlo
      cancelado = true;
      ocultarBotonCancelar();
      chrome.storage.local.get('estadoDescarga', (data) => {
        if (data.estadoDescarga) {
          data.estadoDescarga.activa = false;
          chrome.storage.local.set({ estadoDescarga: data.estadoDescarga });
        }
      });
      alert('Descarga inteligente cancelada.');
    };
    document.body.appendChild(btn);
  }

  function ocultarBotonCancelar() {
    const btn = document.getElementById('sri-bot-cancelar');
    if (btn) btn.remove();
  }

})();

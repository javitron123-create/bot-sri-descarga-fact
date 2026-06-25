// ══════════════════════════════════════════════════════════════
//  background.js — Service Worker de la extensión SRI
// ══════════════════════════════════════════════════════════════

// Escucha cuando se instala la extensión
chrome.runtime.onInstalled.addListener(() => {
  console.log('[SRI Descargador] Extensión instalada correctamente');
});

// Reenviar mensajes entre content script y popup, y manejar ejecución en MAIN world
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EJECUTAR_EN_MAIN_WORLD') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: (selectId, codTipo) => {
          try {
            console.log('[SRI Main World] Sincronizando selección:', codTipo, 'para:', selectId);
            var cleanId = selectId.replace(/_input$/, '');
            
            var pfMetodo = '';
            
            // 1. Intentar mediante PrimeFaces native widget
            if (window.PrimeFaces && window.PrimeFaces.widgets) {
              var widget = window.PrimeFaces.getWidgetById(cleanId) || window.PrimeFaces.getWidgetById(selectId);
              if (!widget) {
                for (var key in window.PrimeFaces.widgets) {
                  var w = window.PrimeFaces.widgets[key];
                  if (w) {
                    var inputId = '';
                    if (w.input) {
                      if (typeof w.input.attr === 'function') {
                        inputId = w.input.attr('id') || '';
                      } else if (w.input.id) {
                        inputId = w.input.id;
                      }
                    }
                    if (w.id === cleanId || w.id === selectId || inputId === selectId || inputId === cleanId) {
                      widget = w;
                      break;
                    }
                  }
                }
              }
              if (widget && typeof widget.selectValue === 'function') {
                try {
                  widget.selectValue(codTipo);
                  pfMetodo = 'PrimeFaces.selectValue';
                } catch (errWidget) {
                  console.warn('[SRI Main World] Error en widget.selectValue:', errWidget);
                }
              }
            }
            
            // 2. Ejecutar también el trigger de jQuery / cambio nativo para asegurar propagación
            var selectEl = document.getElementById(selectId) || 
                           document.getElementById(cleanId) ||
                           document.querySelector('select[id*="tipo" i], select[id*="comprobante" i]');
            if (window.$ && selectEl) {
              var $el = window.$(selectEl);
              $el.val(codTipo);
              $el.trigger('change');
              return { exito: true, metodo: pfMetodo ? (pfMetodo + ' + jQuery.trigger') : 'jQuery.trigger' };
            }
            
            // 3. Fallback nativo
            if (selectEl) {
              selectEl.value = codTipo;
              selectEl.dispatchEvent(new Event('change', { bubbles: true }));
              return { exito: true, metodo: pfMetodo ? (pfMetodo + ' + JS Nativo') : 'JS Nativo' };
            }
            return { exito: false, error: 'Elemento no encontrado' };
          } catch (e) {
            console.error('[SRI Main World] Error:', e);
            return { exito: false, error: e.message };
          }
        },
        args: [message.selectId, message.codTipo]
      }).then(results => {
        sendResponse(results?.[0]?.result || { exito: false });
      }).catch(err => {
        console.error('[SRI background] Error al inyectar script:', err);
        sendResponse({ exito: false, error: err.message });
      });
      return true; // Mantener canal abierto para respuesta asíncrona
    }
  }

  // Reenvío al popup
  if (sender.tab) {
    chrome.runtime.sendMessage(message).catch(() => {
      // Ignorar error si el popup está cerrado
    });
  }
  return true;
});

// Helper para limpiar nombres de archivos (quitar caracteres inválidos en sistemas de archivos)
function sanitizarNombreArchivo(nombre) {
  if (!nombre) return '';
  return nombre
    .replace(/[\\/:*?"<>|]/g, '_') // Reemplazar caracteres prohibidos por guion bajo
    .replace(/\s+/g, ' ')          // Colapsar espacios múltiples
    .trim();
}

// Gestionar descargas: renombrar y mover a la subcarpeta seleccionada
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  // Verificar si la descarga proviene del SRI
  if (!downloadItem.url.includes('sri.gob.ec') && !downloadItem.finalUrl.includes('sri.gob.ec')) {
    suggest({ filename: downloadItem.filename });
    return;
  }

  const extension = downloadItem.filename.split('.').pop() || 'xml';

  // Buscar en la cola de descargas de forma asíncrona
  chrome.storage.local.get(['formatoNombre', 'subcarpetaDestino', 'colaDescargas'], (data) => {
    const format = data.formatoNombre || 'clave';
    let subfolder = (data.subcarpetaDestino || 'SRI_Descargas').trim();
    let cola = data.colaDescargas || [];

    // Asegurarse de que la subcarpeta no empiece ni termine con barras inclinadas
    subfolder = subfolder.replace(/^[\\/]+|[\\/]+$/g, '');

    // Buscar el primer elemento de la cola que coincida con la extensión
    let idxCoincidencia = -1;
    for (let i = 0; i < cola.length; i++) {
      if (cola[i].extension.toLowerCase() === extension.toLowerCase()) {
        idxCoincidencia = i;
        break;
      }
    }

    // Si no coincide la extensión exacta, tomar el primero de la cola como fallback
    if (idxCoincidencia === -1 && cola.length > 0) {
      idxCoincidencia = 0;
    }

    let nuevoNombre = '';
    let meta = null;

    if (idxCoincidencia !== -1) {
      // Consumir el elemento de la cola
      const item = cola.splice(idxCoincidencia, 1)[0];
      meta = item.metadata;
      
      // Guardar de vuelta la cola actualizada
      chrome.storage.local.set({ colaDescargas: cola });
    }

    if (meta) {
      const tipo = sanitizarNombreArchivo(meta.tipo || 'DOCUMENTO');
      const ruc = sanitizarNombreArchivo(meta.ruc || 'RUC');
      const serie = sanitizarNombreArchivo(meta.serie || '000-000-000000000');
      const razonSocial = sanitizarNombreArchivo(meta.razonSocial || 'EMISOR');
      const fecha = sanitizarNombreArchivo(meta.fecha || 'FECHA');
      const clave = sanitizarNombreArchivo(meta.clave || '');

      if (format === 'clave') {
        nuevoNombre = clave || downloadItem.filename.split('.')[0];
      } else if (format === 'tipo_ruc_serie') {
        nuevoNombre = `${tipo}_${ruc}_${serie}`;
      } else if (format === 'fecha_tipo_serie_nombre') {
        // Truncar la razón social a 35 caracteres para evitar nombres de archivo excesivamente largos
        const razonTrunc = razonSocial.substring(0, 35).trim();
        nuevoNombre = `${fecha}_${tipo}_${serie}_${razonTrunc}`;
      }
    } else {
      // Si no hay metadatos en la cola, usar el nombre original del SRI (sin el formato del popup)
      nuevoNombre = downloadItem.filename.split('.')[0];
    }

    nuevoNombre = sanitizarNombreArchivo(nuevoNombre);
    const rutaCompleta = subfolder ? `${subfolder}/${nuevoNombre}.${extension}` : `${nuevoNombre}.${extension}`;

    console.log(`[SRI Descargador] Sugiriendo ruta de descarga: ${rutaCompleta}`);
    suggest({ filename: rutaCompleta });
  });

  return true; // Obligatorio en Manifest V3 para permitir llamadas asíncronas a suggest
});

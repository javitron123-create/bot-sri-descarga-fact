// ══════════════════════════════════════════════════════════════
//  diagnostico.js — Script de diagnóstico para el portal SRI
//  Pégalo en la consola del navegador (F12 → Consola) mientras
//  estás en la página de comprobantes recibidos del SRI
// ══════════════════════════════════════════════════════════════

(function diagnosticarSRI() {
  console.log('=== DIAGNÓSTICO SRI ===\n');

  // 1. Buscar todas las tablas
  const tablas = document.querySelectorAll('table');
  console.log(`Tablas encontradas: ${tablas.length}`);

  // 2. Buscar filas con contenido
  const posiblesFilas = [
    '.ui-datatable tbody tr',
    '.ui-datatable-data tr',
    'tr[data-ri]',
    'table tbody tr',
  ];

  let mejorSelector = null;
  let mejorFilas = 0;

  posiblesFilas.forEach(sel => {
    try {
      const f = document.querySelectorAll(sel);
      const conCeldas = Array.from(f).filter(r => r.querySelectorAll('td').length >= 3);
      console.log(`Selector "${sel}": ${conCeldas.length} filas válidas`);
      if (conCeldas.length > mejorFilas) {
        mejorFilas = conCeldas.length;
        mejorSelector = sel;
      }
    } catch(e) {}
  });

  console.log(`\n✅ Mejor selector: "${mejorSelector}" con ${mejorFilas} filas\n`);

  // 3. Analizar primera fila
  if (mejorSelector) {
    const filas = Array.from(document.querySelectorAll(mejorSelector))
      .filter(r => r.querySelectorAll('td').length >= 3);

    if (filas.length > 0) {
      const fila = filas[0];
      console.log('=== PRIMERA FILA ===');
      console.log('HTML:', fila.innerHTML.substring(0, 2000));

      const celdas = fila.querySelectorAll('td');
      console.log(`\nTotal celdas: ${celdas.length}`);

      celdas.forEach((td, i) => {
        const texto = td.textContent.trim().substring(0, 50);
        const links = td.querySelectorAll('a, button, img, span[onclick]');
        console.log(`  Celda ${i}: "${texto}" | elementos clickeables: ${links.length}`);
        links.forEach(el => {
          console.log(`    → <${el.tagName}> id="${el.id}" class="${el.className}" title="${el.title}" onclick="${(el.getAttribute('onclick')||'').substring(0,80)}"`);
        });
      });
    }
  }

  // 4. Buscar elementos con "xml" o "ride" en sus atributos
  console.log('\n=== ELEMENTOS CON "xml" en atributos ===');
  ['xml', 'XML', 'ride', 'RIDE', 'Xml', 'Ride'].forEach(kw => {
    const els = document.querySelectorAll(`[id*="${kw}"], [class*="${kw}"], [title*="${kw}"]`);
    if (els.length > 0) {
      console.log(`Keyword "${kw}": ${els.length} elementos`);
      Array.from(els).slice(0, 3).forEach(el => {
        console.log(`  <${el.tagName}> id="${el.id}" class="${el.className.substring(0,60)}" title="${el.title}"`);
      });
    }
  });

  console.log('\n=== FIN DIAGNÓSTICO ===');
})();

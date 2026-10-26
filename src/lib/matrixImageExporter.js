import { toast } from 'sonner';
import getHtml2Canvas from './html2canvasWrapper';

/**
 * Escapa caracteres especiales para HTML
 */
function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Dibuja un rectángulo con esquinas redondeadas (pill / badge) en un contexto Canvas 2D
 */
function drawRoundedRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.save();
  ctx.beginPath();
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Construye una tabla HTML con estilos en línea nativos y metadatos de Microsoft Excel,
 * permitiendo que al pegar en Excel (Ctrl + V) se combine directamente con las celdas y formato de este.
 */
export function generateMatrixHtmlTable({ tripsList = [], bannerTitle = '', activeDate = '', totalM3 = '0' }) {
  const fullBannerTitle = `ASIGNACIÓN DE RUTAS - ${bannerTitle || 'FAST FOOD'}`;
  const subtitle = `Despacho ${activeDate} | Base: Lago Riñihue 02319, San Bernardo`;

  let rowsHtml = '';
  const tsvRows = [];

  // Filas para texto plano (TSV)
  tsvRows.push(fullBannerTitle);
  tsvRows.push(subtitle);
  tsvRows.push('');
  tsvRows.push([
    'Fecha', 'Operación', 'Ruta', 'Camión', 'N° de vuelta',
    'Conductor', 'Auxiliar', 'Zona (Ruta, Cliente, Comuna Más Lejana, LC, m³)',
    'Vol Carga', 'Turno', 'Hora Cita', 'Prioridad', 'Destino Prioritario'
  ].join('\t'));

  tripsList.forEach((trip, idx) => {
    const isPrioUrgente = trip.prioridad === 'Prioridad urgente';
    const isUrgente = trip.prioridad === 'Urgente';
    const isRedespacho = trip.prioridad === 'Redespacho';

    // Colores Pastel Solicitados para Ruteo:
    // 1. Rojo pastel (#FFD6D6, texto #7F1D1D)
    // 2. Amarillo pastel (#FEF9C3, texto #78350F)
    // 3. Negro pastel (#334155, texto #FFFFFF)
    let rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    let rowColor = '#1E293B';
    let rowBorder = '#E2E8F0';
    let isBold = false;

    if (isPrioUrgente) {
      rowBg = '#FFD6D6';
      rowColor = '#7F1D1D';
      rowBorder = '#FCA5A5';
      isBold = true;
    } else if (isUrgente) {
      rowBg = '#FEF9C3';
      rowColor = '#78350F';
      rowBorder = '#FDE047';
      isBold = true;
    } else if (isRedespacho) {
      rowBg = '#334155';
      rowColor = '#FFFFFF';
      rowBorder = '#1E293B';
      isBold = true;
    }

    let zonaCompleta = (trip.zonaItems || []).map(z => z.text).join(' | ');
    if (trip.destino_prioritario) {
      zonaCompleta += ` | 🎯 Prioridad: ${trip.destino_prioritario}`;
    }
    const auxStr = trip.auxiliares?.length > 0 ? trip.auxiliares.join(', ') : '-';
    const volNum = (Number(trip.totalM3) || 0).toFixed(4);

    const baseCell = `border: 1px solid ${rowBorder}; padding: 5px 8px; font-size: 10pt; font-family: Calibri, 'Segoe UI', Arial, sans-serif; background-color: ${rowBg}; color: ${rowColor}; ${isBold ? 'font-weight: bold;' : ''}`;

    rowsHtml += `
    <tr style="background-color: ${rowBg};">
      <td style="${baseCell} text-align: center;">${escapeHtml(trip.fecha)}</td>
      <td style="${baseCell} text-align: left; text-transform: uppercase;">${escapeHtml(trip.operacionStr)}</td>
      <td style="${baseCell} text-align: center; font-family: Consolas, monospace; mso-number-format:'\\@';">${escapeHtml(trip.rutasStr)}</td>
      <td style="${baseCell} text-align: left; font-weight: bold; mso-number-format:'\\@';">${escapeHtml(trip.camion)}</td>
      <td style="${baseCell} text-align: center;">${escapeHtml(trip.displayVuelta)}</td>
      <td style="${baseCell} text-align: left;">${escapeHtml(trip.conductor_name)}</td>
      <td style="${baseCell} text-align: left;">${escapeHtml(auxStr)}</td>
      <td style="${baseCell} text-align: left;">${escapeHtml(zonaCompleta)}</td>
      <td style="${baseCell} text-align: right; mso-number-format:'0\\.0000';">${volNum}</td>
      <td style="${baseCell} text-align: center;">${escapeHtml(trip.turno || '')}</td>
      <td style="${baseCell} text-align: center;">${escapeHtml(trip.hora_cita || '')}</td>
      <td style="${baseCell} text-align: center; font-weight: bold;">${escapeHtml(trip.prioridad || 'Normal')}</td>
      <td style="${baseCell} text-align: left;">${escapeHtml(trip.destino_prioritario || '')}</td>
    </tr>`;

    tsvRows.push([
      trip.fecha,
      trip.operacionStr,
      trip.rutasStr,
      trip.camion,
      trip.displayVuelta,
      trip.conductor_name,
      auxStr,
      zonaCompleta,
      volNum,
      trip.turno || '',
      trip.hora_cita || '',
      trip.prioridad || 'Normal',
      trip.destino_prioritario || ''
    ].join('\t'));
  });

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<!--[if gte mso 9]>
<xml>
 <x:ExcelWorkbook>
  <x:ExcelWorksheets>
   <x:ExcelWorksheet>
    <x:Name>Matriz Ruteo</x:Name>
    <x:WorksheetOptions>
     <x:DisplayGridlines/>
    </x:WorksheetOptions>
   </x:ExcelWorksheet>
  </x:ExcelWorksheets>
 </x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
  table { border-collapse: collapse; font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 10pt; }
  th, td { border: 1px solid #cbd5e1; }
</style>
</head>
<body>
<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 10pt;">
  <tr style="height: 30px;">
    <th colspan="13" style="background-color: #132C54; color: #FFFFFF; font-size: 13pt; font-weight: bold; text-align: left; padding: 8px 12px; border: 1px solid #132C54;">
      ${escapeHtml(fullBannerTitle)}
    </th>
  </tr>
  <tr style="height: 22px;">
    <th colspan="13" style="background-color: #132C54; color: #FDE047; font-size: 10pt; font-weight: bold; text-align: left; padding: 4px 12px; border: 1px solid #132C54;">
      ${escapeHtml(subtitle)}
    </th>
  </tr>
  <tr style="height: 8px;">
    <td colspan="13" style="border: none; background-color: #ffffff; height: 8px;"></td>
  </tr>
  <tr style="background-color: #183564; color: #FFFFFF; font-weight: bold; font-size: 9.5pt; text-transform: uppercase;">
    <th style="background-color: #183564; color: #ffffff; border: 1px solid #22447C; padding: 6px 8px; text-align: center;">Fecha</th>
    <th style="background-color: #183564; color: #ffffff; border: 1px solid #22447C; padding: 6px 8px; text-align: left;">Operación</th>
    <th style="background-color: #183564; color: #ffffff; border: 1px solid #22447C; padding: 6px 8px; text-align: center; mso-number-format:'\\@';">Ruta</th>
    <th style="background-color: #183564; color: #ffffff; border: 1px solid #22447C; padding: 6px 8px; text-align: left; mso-number-format:'\\@';">Camión</th>
    <th style="background-color: #183564; color: #ffffff; border: 1px solid #22447C; padding: 6px 8px; text-align: center;">N° de vuelta</th>
    <th style="background-color: #183564; color: #ffffff; border: 1px solid #22447C; padding: 6px 8px; text-align: left;">Conductor</th>
    <th style="background-color: #183564; color: #ffffff; border: 1px solid #22447C; padding: 6px 8px; text-align: left;">Auxiliar</th>
    <th style="background-color: #183564; color: #ffffff; border: 1px solid #22447C; padding: 6px 8px; text-align: left;">Zona (Ruta, Cliente, Comuna Más Lejana, LC, m³)</th>
    <th style="background-color: #183564; color: #ffffff; border: 1px solid #22447C; padding: 6px 8px; text-align: right;">Vol Carga</th>
    <th style="background-color: #183564; color: #ffffff; border: 1px solid #22447C; padding: 6px 8px; text-align: center;">Turno</th>
    <th style="background-color: #183564; color: #ffffff; border: 1px solid #22447C; padding: 6px 8px; text-align: center;">Hora Cita</th>
    <th style="background-color: #183564; color: #ffffff; border: 1px solid #22447C; padding: 6px 8px; text-align: center;">Prioridad</th>
    <th style="background-color: #183564; color: #ffffff; border: 1px solid #22447C; padding: 6px 8px; text-align: left;">Destino Prioritario</th>
  </tr>
  ${rowsHtml}
  <tr style="height: 24px; font-weight: bold; background-color: #E2E8F0; color: #0F172A;">
    <td colspan="8" style="text-align: right; padding: 6px 8px; border: 1px solid #CBD5E1;">TOTAL CARGA (m³):</td>
    <td style="text-align: right; padding: 6px 8px; border: 1px solid #CBD5E1; mso-number-format:'0\\.0000'; font-weight: bold;">${totalM3}</td>
    <td colspan="4" style="border: 1px solid #CBD5E1; background-color: #E2E8F0;"></td>
  </tr>
</table>
</body>
</html>`;

  return {
    html,
    tsv: tsvRows.join('\r\n')
  };
}

/**
 * Genera HTML y TSV para copiar el Briefing directamente en celdas de Excel
 */
export function generateBriefingHtmlTable({ rows = [], totals = {}, activeDate = '' }) {
  const fullBannerTitle = `RESUMEN DE ASIGNACIÓN · BRIEFING - DESPACHO ${activeDate}`;
  const subtitle = `Control operacional y balance de flota, cajas, kilos y ambientes por cliente`;

  const headers = [
    'Operación', '# Rutas', 'Real Key 1era V', 'Real Terceros 1era V',
    '2da V (Cubiertas Key)', '2da V (Terceros)', 'Sin cobertura',
    'Cajas', 'Kilos', 'Congelado m3', 'Refrigerado m3', 'Seco m3',
    'Volumen', 'N° Destinos'
  ];

  const tsvRows = [];
  tsvRows.push(fullBannerTitle);
  tsvRows.push(subtitle);
  tsvRows.push('');
  tsvRows.push(headers.join('\t'));

  let rowsHtml = '';
  rows.forEach((r, idx) => {
    const isZebra = idx % 2 === 1;
    const rowBg = isZebra ? '#F4F7FB' : '#FFFFFF';
    const border = '#CBD5E1';

    const cellL = `border: 1px solid ${border}; padding: 5px 8px; font-family: Calibri, sans-serif; font-size: 10pt; text-align: left; background-color: ${rowBg};`;
    const cellC = `border: 1px solid ${border}; padding: 5px 8px; font-family: Calibri, sans-serif; font-size: 10pt; text-align: center; background-color: ${rowBg};`;
    const cellR = `border: 1px solid ${border}; padding: 5px 8px; font-family: Calibri, sans-serif; font-size: 10pt; text-align: right; background-color: ${rowBg};`;

    rowsHtml += `
    <tr style="background-color: ${rowBg};">
      <td style="${cellL} font-weight: bold; text-transform: uppercase;">${escapeHtml(r.operacion)}</td>
      <td style="${cellC} font-weight: bold; background-color: #EBF3FF;">${r.numRutas || 0}</td>
      <td style="${cellC}">${r.propia1v || 0}</td>
      <td style="${cellC}">${r.externa1v || 0}</td>
      <td style="${cellC}">${r.propia2v || 0}</td>
      <td style="${cellC}">${r.externa2v || 0}</td>
      <td style="${cellC} color: #DC2626; font-weight: bold;">${r.sinCobertura || 0}</td>
      <td style="${cellR} mso-number-format:'#,##0';">${r.cajas || 0}</td>
      <td style="${cellR} mso-number-format:'#,##0.00';">${(Number(r.kilos) || 0).toFixed(2)} Kg</td>
      <td style="${cellR} mso-number-format:'#,##0.00';">${(Number(r.congeladoM3) || 0).toFixed(2)}</td>
      <td style="${cellR} mso-number-format:'#,##0.00';">${(Number(r.refrigeradoM3) || 0).toFixed(2)}</td>
      <td style="${cellR} mso-number-format:'#,##0.00';">${(Number(r.secoM3) || 0).toFixed(2)}</td>
      <td style="${cellR} font-weight: bold; mso-number-format:'#,##0.00';">${(Number(r.volumenM3) || 0).toFixed(2)} m3</td>
      <td style="${cellC}">${r.numDestinos || 0}</td>
    </tr>`;

    tsvRows.push([
      r.operacion,
      r.numRutas || 0,
      r.propia1v || 0,
      r.externa1v || 0,
      r.propia2v || 0,
      r.externa2v || 0,
      r.sinCobertura || 0,
      r.cajas || 0,
      `${(Number(r.kilos) || 0).toFixed(2)} Kg`,
      (Number(r.congeladoM3) || 0).toFixed(2),
      (Number(r.refrigeradoM3) || 0).toFixed(2),
      (Number(r.secoM3) || 0).toFixed(2),
      `${(Number(r.volumenM3) || 0).toFixed(2)} m3`,
      r.numDestinos || 0
    ].join('\t'));
  });

  // Fila Total
  const t = totals || {};
  const totBg = '#0E2A47';
  const totCellL = `border: 1px solid #1E3A8A; padding: 6px 8px; font-family: Calibri, sans-serif; font-size: 10pt; font-weight: bold; text-align: left; background-color: ${totBg}; color: #FFFFFF;`;
  const totCellC = `border: 1px solid #1E3A8A; padding: 6px 8px; font-family: Calibri, sans-serif; font-size: 10pt; font-weight: bold; text-align: center; background-color: ${totBg}; color: #FFFFFF;`;
  const totCellR = `border: 1px solid #1E3A8A; padding: 6px 8px; font-family: Calibri, sans-serif; font-size: 10pt; font-weight: bold; text-align: right; background-color: ${totBg}; color: #FFFFFF;`;

  rowsHtml += `
  <tr style="background-color: ${totBg}; color: #FFFFFF; font-weight: bold;">
    <td style="${totCellL}">TOTAL GENERAL</td>
    <td style="${totCellC}">${t.numRutas || 0}</td>
    <td style="${totCellC}">${t.propia1v || 0}</td>
    <td style="${totCellC}">${t.externa1v || 0}</td>
    <td style="${totCellC}">${t.propia2v || 0}</td>
    <td style="${totCellC}">${t.externa2v || 0}</td>
    <td style="${totCellC}">${t.sinCobertura || 0}</td>
    <td style="${totCellR} mso-number-format:'#,##0';">${t.cajas || 0}</td>
    <td style="${totCellR} mso-number-format:'#,##0.00';">${(Number(t.kilos) || 0).toFixed(2)} Kg</td>
    <td style="${totCellR} mso-number-format:'#,##0.00';">${(Number(t.congeladoM3) || 0).toFixed(2)}</td>
    <td style="${totCellR} mso-number-format:'#,##0.00';">${(Number(t.refrigeradoM3) || 0).toFixed(2)}</td>
    <td style="${totCellR} mso-number-format:'#,##0.00';">${(Number(t.secoM3) || 0).toFixed(2)}</td>
    <td style="${totCellR} color: #6EE7B7; mso-number-format:'#,##0.00';">${(Number(t.volumenM3) || 0).toFixed(2)} m3</td>
    <td style="${totCellC}">${t.numDestinos || 0}</td>
  </tr>`;

  tsvRows.push([
    'TOTAL GENERAL',
    t.numRutas || 0,
    t.propia1v || 0,
    t.externa1v || 0,
    t.propia2v || 0,
    t.externa2v || 0,
    t.sinCobertura || 0,
    t.cajas || 0,
    `${(Number(t.kilos) || 0).toFixed(2)} Kg`,
    (Number(t.congeladoM3) || 0).toFixed(2),
    (Number(t.refrigeradoM3) || 0).toFixed(2),
    (Number(t.secoM3) || 0).toFixed(2),
    `${(Number(t.volumenM3) || 0).toFixed(2)} m3`,
    t.numDestinos || 0
  ].join('\t'));

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<!--[if gte mso 9]>
<xml>
 <x:ExcelWorkbook>
  <x:ExcelWorksheets>
   <x:ExcelWorksheet>
    <x:Name>Briefing</x:Name>
    <x:WorksheetOptions>
     <x:DisplayGridlines/>
    </x:WorksheetOptions>
   </x:ExcelWorksheet>
  </x:ExcelWorksheets>
 </x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
  table { border-collapse: collapse; font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 10pt; }
  th, td { border: 1px solid #cbd5e1; }
</style>
</head>
<body>
<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 10pt;">
  <tr style="height: 30px;">
    <th colspan="14" style="background-color: #0B2545; color: #FFFFFF; font-size: 13pt; font-weight: bold; text-align: left; padding: 8px 12px; border: 1px solid #0B2545;">
      ${escapeHtml(fullBannerTitle)}
    </th>
  </tr>
  <tr style="height: 20px;">
    <th colspan="14" style="background-color: #0B2545; color: #93C5FD; font-size: 9.5pt; font-weight: normal; text-align: left; padding: 3px 12px; border: 1px solid #0B2545;">
      ${escapeHtml(subtitle)}
    </th>
  </tr>
  <tr style="height: 6px;">
    <td colspan="14" style="border: none; background-color: #ffffff; height: 6px;"></td>
  </tr>
  <tr style="background-color: #0E2A47; color: #FFFFFF; font-weight: bold; font-size: 9pt; text-transform: uppercase;">
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: left;">Operación</th>
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: center;"># Rutas</th>
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: center;">Real Key 1era V</th>
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: center;">Real Terceros 1era V</th>
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: center;">2da V (Cubiertas Key)</th>
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: center;">2da V (Terceros)</th>
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: center;">Sin cobertura</th>
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: right;">Cajas</th>
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: right;">Kilos</th>
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: right;">Congelado m3</th>
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: right;">Refrigerado m3</th>
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: right;">Seco m3</th>
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: right;">Volumen</th>
    <th style="background-color: #0E2A47; color: #ffffff; border: 1px solid #1E3A8A; padding: 6px 8px; text-align: center;">N° Destinos</th>
  </tr>
  ${rowsHtml}
</table>
</body>
</html>`;

  return {
    html,
    tsv: tsvRows.join('\r\n')
  };
}

/**
 * Fallback para generar HTML a partir del elemento DOM si no se cuenta con datos estructurados
 */
function extractHtmlFromDomElement(element, activeDate) {
  const table = element.querySelector('table');
  if (!table) return { html: '', tsv: '' };

  const clone = table.cloneNode(true);

  // Remover primera columna (checkbox) y última columna (acciones/detalle) si existen
  clone.querySelectorAll('tr').forEach(row => {
    const firstCell = row.firstElementChild;
    if (firstCell && firstCell.querySelector('input[type="checkbox"]')) {
      row.removeChild(firstCell);
    }
    const lastCell = row.lastElementChild;
    if (lastCell && lastCell.querySelector('button, svg')) {
      row.removeChild(lastCell);
    }
  });

  const bannerEl = element.querySelector('h1, h2');
  const bannerTitle = bannerEl ? bannerEl.innerText : 'ASIGNACIÓN DE RUTAS';

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<style>
table { border-collapse: collapse; font-family: Calibri, sans-serif; font-size: 10pt; }
th, td { border: 1px solid #cbd5e1; padding: 5px 8px; }
th { background-color: #183564; color: #ffffff; }
</style>
</head>
<body>
<h3>${escapeHtml(bannerTitle)} - Despacho ${escapeHtml(activeDate)}</h3>
${clone.outerHTML}
</body>
</html>`;

  return { html, tsv: clone.innerText || '' };
}

/**
 * Motor de Renderizado 100% Nativo en Canvas 2D para la Matriz de Ruteo
 * - Altura dinámica por fila según desglose completo de Zona (Rutas, Comunas, Locales, m³, Destino Prioritario)
 * - Ancho de columnas expandido para evitar truncamiento con '...'
 * - Calidad Retina HD (DPR = 2) sin pixelación ni desenfoque
 */
export function renderMatrixWithCanvas2D(tableData) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const cols = [
    { title: 'Fecha', key: 'fecha', width: 95, align: 'center' },
    { title: 'Operación', key: 'operacionStr', width: 250, align: 'left', bold: true },
    { title: 'Ruta', key: 'rutasStr', width: 130, align: 'center', mono: true },
    { title: 'Camión', key: 'camion', width: 145, align: 'left', bold: true },
    { title: 'N° vuelta', key: 'displayVuelta', width: 100, align: 'center' },
    { title: 'Conductor', key: 'conductor_name', width: 220, align: 'left', bold: true },
    { title: 'Auxiliar', key: 'auxiliares', width: 180, align: 'left' },
    { title: 'Zona (Ruta, Cliente, Comuna Más Lejana, LC, m³)', key: 'zona', width: 700, align: 'left' },
    { title: 'Vol Carga', key: 'vol', width: 105, align: 'right', mono: true, bold: true },
    { title: 'Turno', key: 'turno', width: 95, align: 'center', bold: true },
    { title: 'Hora Cita', key: 'hora_cita', width: 95, align: 'center', bold: true },
    { title: 'Prioridad', key: 'prioridad', width: 135, align: 'center', bold: true },
    { title: 'Destino Prioritario', key: 'destino_prioritario', width: 190, align: 'left', bold: true }
  ];

  const totalWidth = cols.reduce((a, c) => a + c.width, 0);
  const trips = tableData?.tripsList || [];
  const bannerTitle = `ASIGNACIÓN DE RUTAS - ${tableData?.bannerTitle || 'FAST FOOD'}`;
  const subtitle = `Despacho ${tableData?.activeDate || ''} | Base: Lago Riñihue 02319, San Bernardo`;

  const bannerHeight = 78;
  const colHeaderHeight = 40;
  const totalRowHeight = 40;

  // Cálculo de alturas dinámicas por fila para detallar completamente la información
  const rowHeights = trips.map(trip => {
    const zonaItems = trip.zonaItems || [];
    const hasPrio = !!trip.destino_prioritario;
    const numLines = Math.max(1, zonaItems.length + (hasPrio ? 1 : 0));
    return Math.max(48, numLines * 25 + 16);
  });

  const sumRowsHeight = rowHeights.reduce((a, b) => a + b, 0);
  const totalHeight = bannerHeight + colHeaderHeight + sumRowsHeight + totalRowHeight;

  // Escala para calidad Retina 2x ultra nítida
  const dpr = 2;
  canvas.width = Math.round(totalWidth * dpr);
  canvas.height = Math.round(totalHeight * dpr);
  ctx.scale(dpr, dpr);

  // Fondo blanco completo
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // 1. BANNER ENTERPRISE
  ctx.fillStyle = '#132C54';
  ctx.fillRect(0, 0, totalWidth, bannerHeight);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`🚛  ${bannerTitle}`, 20, 28);

  ctx.fillStyle = '#FDE047';
  ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`📅  ${subtitle}`, 20, 56);

  // Badge derecho de estadísticas en banner
  const badgeText = `${trips.length} Viajes Planificados  •  Volumen Total: ${tableData?.totalM3 || '0'} m³`;
  ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
  const badgeW = ctx.measureText(badgeText).width + 24;
  drawRoundedRect(ctx, totalWidth - badgeW - 20, 24, badgeW, 30, 8, 'rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.3)');
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, totalWidth - badgeW / 2 - 20, 39);

  // 2. ENCABEZADOS DE COLUMNA
  let currentY = bannerHeight;
  ctx.fillStyle = '#183564';
  ctx.fillRect(0, currentY, totalWidth, colHeaderHeight);

  let currentX = 0;
  cols.forEach(col => {
    ctx.strokeStyle = '#22447C';
    ctx.lineWidth = 1;
    ctx.strokeRect(currentX, currentY, col.width, colHeaderHeight);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11.5px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';

    let textX = currentX + 10;
    if (col.align === 'center') {
      ctx.textAlign = 'center';
      textX = currentX + col.width / 2;
    } else if (col.align === 'right') {
      ctx.textAlign = 'right';
      textX = currentX + col.width - 10;
    } else {
      ctx.textAlign = 'left';
    }

    ctx.fillText(col.title.toUpperCase(), textX, currentY + colHeaderHeight / 2);
    currentX += col.width;
  });

  currentY += colHeaderHeight;

  // 3. FILAS DE DATOS (DETALLADO COMPLETO)
  trips.forEach((trip, idx) => {
    const isPrioUrgente = trip.prioridad === 'Prioridad urgente';
    const isUrgente = trip.prioridad === 'Urgente';
    const isRedespacho = trip.prioridad === 'Redespacho';
    const rHeight = rowHeights[idx];

    let rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    let textColor = '#1E293B';
    let borderColor = '#E2E8F0';

    if (isPrioUrgente) {
      rowBg = '#FFD6D6';
      textColor = '#7F1D1D';
      borderColor = '#FCA5A5';
    } else if (isUrgente) {
      rowBg = '#FEF9C3';
      textColor = '#78350F';
      borderColor = '#FDE047';
    } else if (isRedespacho) {
      rowBg = '#334155';
      textColor = '#FFFFFF';
      borderColor = '#1E293B';
    }

    ctx.fillStyle = rowBg;
    ctx.fillRect(0, currentY, totalWidth, rHeight);

    let cellX = 0;
    cols.forEach(col => {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(cellX, currentY, col.width, rHeight);

      const midY = currentY + rHeight / 2;

      // Columna especializada: Zona (Desglose ruta por ruta)
      if (col.key === 'zona') {
        const zonaItems = trip.zonaItems || [];
        const startY = currentY + 14;

        zonaItems.forEach((z, zIdx) => {
          const itemY = startY + zIdx * 24;
          let drawCursor = cellX + 10;

          // 1. Badge Ruta
          ctx.font = 'bold 11px Consolas, monospace';
          const rText = String(z.ruta || '');
          const rW = ctx.measureText(rText).width + 12;
          drawRoundedRect(ctx, drawCursor, itemY - 11, rW, 19, 4, '#FFFFFF', '#CBD5E1');
          ctx.fillStyle = '#1E3A8A';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(rText, drawCursor + 6, itemY);
          drawCursor += rW + 8;

          // 2. Cliente / Operación
          ctx.fillStyle = isRedespacho ? '#F8FAFC' : '#0F172A';
          ctx.font = 'bold 11.5px "Segoe UI", Arial, sans-serif';
          const cText = String(z.cliente || '');
          ctx.fillText(cText, drawCursor, itemY);
          drawCursor += ctx.measureText(cText).width + 8;

          // 3. Separador •
          ctx.fillStyle = '#94A3B8';
          ctx.font = 'bold 11px Arial';
          ctx.fillText('•', drawCursor, itemY);
          drawCursor += 12;

          // 4. Comuna 📍
          ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
          const comText = `📍 ${z.comuna || 'Sin comuna'}`;
          const comW = ctx.measureText(comText).width + 10;
          drawRoundedRect(ctx, drawCursor, itemY - 10, comW, 18, 4, isRedespacho ? '#1E293B' : '#F1F5F9', '#CBD5E1');
          ctx.fillStyle = isRedespacho ? '#E2E8F0' : '#334155';
          ctx.fillText(comText, drawCursor + 5, itemY);
          drawCursor += comW + 8;

          // 5. Separador •
          ctx.fillStyle = '#94A3B8';
          ctx.fillText('•', drawCursor, itemY);
          drawCursor += 12;

          // 6. Locales
          ctx.fillStyle = isRedespacho ? '#93C5FD' : '#3730A3';
          ctx.font = 'bold 11.5px "Segoe UI", Arial, sans-serif';
          const locText = `${z.locales || 0} LC`;
          ctx.fillText(locText, drawCursor, itemY);
          drawCursor += ctx.measureText(locText).width + 8;

          // 7. Separador •
          ctx.fillStyle = '#94A3B8';
          ctx.fillText('•', drawCursor, itemY);
          drawCursor += 12;

          // 8. Volumen m³
          ctx.fillStyle = isRedespacho ? '#6EE7B7' : '#065F46';
          ctx.font = 'bold 11.5px Consolas, monospace';
          const m3Text = `${z.m3 || '0.0000'} m³`;
          ctx.fillText(m3Text, drawCursor, itemY);
        });

        // Línea Destino Prioritario si existe
        if (trip.destino_prioritario) {
          const prioLineY = startY + zonaItems.length * 24;
          const prioText = `🎯 Prioridad: ${trip.destino_prioritario}`;
          ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
          const pW = ctx.measureText(prioText).width + 16;
          drawRoundedRect(ctx, cellX + 10, prioLineY - 10, pW, 20, 4, '#FEE2E2', '#FCA5A5');
          ctx.fillStyle = '#991B1B';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(prioText, cellX + 18, prioLineY);
        }
      } 
      // Columna especializada: Ruta
      else if (col.key === 'rutasStr') {
        const rStr = String(trip.rutasStr || '');
        ctx.font = 'bold 12px Consolas, monospace';
        const rw = ctx.measureText(rStr).width + 16;
        let pillBg = '#DBEAFE';
        let pillBorder = '#93C5FD';
        let pillText = '#1E3A8A';

        if (isPrioUrgente) {
          pillBg = '#FCA5A5';
          pillBorder = '#EF4444';
          pillText = '#7F1D1D';
        } else if (isUrgente) {
          pillBg = '#FDE047';
          pillBorder = '#EAB308';
          pillText = '#713F12';
        } else if (isRedespacho) {
          pillBg = '#0F172A';
          pillBorder = '#475569';
          pillText = '#FFFFFF';
        }

        drawRoundedRect(ctx, cellX + (col.width - rw) / 2, midY - 11, rw, 22, 6, pillBg, pillBorder);
        ctx.fillStyle = pillText;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rStr, cellX + col.width / 2, midY);
      }
      // Columna especializada: N° vuelta
      else if (col.key === 'displayVuelta') {
        const vStr = String(trip.displayVuelta || 'Vuelta 1');
        const isSecond = vStr.includes('2') || vStr.includes('3');
        ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
        const vw = ctx.measureText(vStr).width + 14;
        const vBg = isSecond ? '#FEF08A' : (isRedespacho ? '#1E293B' : '#F1F5F9');
        const vBorder = isSecond ? '#FACC15' : '#CBD5E1';
        const vColor = isSecond ? '#713F12' : (isRedespacho ? '#F8FAFC' : '#334155');

        drawRoundedRect(ctx, cellX + (col.width - vw) / 2, midY - 10, vw, 20, 6, vBg, vBorder);
        ctx.fillStyle = vColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(vStr, cellX + col.width / 2, midY);
      }
      // Columna especializada: Camión
      else if (col.key === 'camion') {
        const cStr = `🚛  ${trip.camion || 'Sin Camión'}`;
        ctx.fillStyle = textColor;
        ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(cStr, cellX + 10, midY);
      }
      // Columna especializada: Prioridad
      else if (col.key === 'prioridad') {
        const pStr = String(trip.prioridad || 'Normal');
        ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
        const pw = ctx.measureText(pStr).width + 14;
        let pBg = '#F1F5F9';
        let pBorder = '#CBD5E1';
        let pText = '#334155';

        if (isPrioUrgente) {
          pBg = '#FEE2E2';
          pBorder = '#F87171';
          pText = '#991B1B';
        } else if (isUrgente) {
          pBg = '#FEF9C3';
          pBorder = '#FACC15';
          pText = '#854D0E';
        } else if (isRedespacho) {
          pBg = '#0F172A';
          pBorder = '#64748B';
          pText = '#FFFFFF';
        }

        drawRoundedRect(ctx, cellX + (col.width - pw) / 2, midY - 10, pw, 20, 6, pBg, pBorder);
        ctx.fillStyle = pText;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pStr, cellX + col.width / 2, midY);
      }
      // Columna especializada: Destino Prioritario
      else if (col.key === 'destino_prioritario') {
        const dStr = trip.destino_prioritario || '';
        if (dStr) {
          ctx.fillStyle = isRedespacho ? '#FCA5A5' : '#B91C1C';
          ctx.font = 'bold 11.5px "Segoe UI", Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`🎯 ${dStr}`, cellX + 10, midY);
        } else {
          ctx.fillStyle = isRedespacho ? '#94A3B8' : '#94A3B8';
          ctx.font = '11px "Segoe UI", Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('-', cellX + 10, midY);
        }
      }
      // Columnas Estándar con soporte multi-línea si es necesario
      else {
        let val = '';
        if (col.key === 'fecha') val = trip.fecha || '';
        else if (col.key === 'operacionStr') val = trip.operacionStr || '';
        else if (col.key === 'conductor_name') val = trip.conductor_name || '';
        else if (col.key === 'auxiliares') val = trip.auxiliares?.join(', ') || '-';
        else if (col.key === 'vol') val = (Number(trip.totalM3) || 0).toFixed(4);
        else if (col.key === 'turno') val = trip.turno || '-';
        else if (col.key === 'hora_cita') val = trip.hora_cita || '-';

        ctx.fillStyle = textColor;
        if (col.mono) {
          ctx.font = col.bold ? 'bold 12px Consolas, monospace' : '11.5px Consolas, monospace';
        } else {
          ctx.font = col.bold ? 'bold 12px "Segoe UI", Arial, sans-serif' : '11.5px "Segoe UI", Arial, sans-serif';
        }
        ctx.textBaseline = 'middle';

        let textX = cellX + 10;
        if (col.align === 'center') {
          ctx.textAlign = 'center';
          textX = cellX + col.width / 2;
        } else if (col.align === 'right') {
          ctx.textAlign = 'right';
          textX = cellX + col.width - 10;
        } else {
          ctx.textAlign = 'left';
        }

        // Si es Operación o Conductor y es muy largo, permitir 2 líneas
        const maxW = col.width - 20;
        if (ctx.measureText(val).width > maxW && (col.key === 'operacionStr' || col.key === 'conductor_name')) {
          const words = val.split(' ');
          let l1 = '';
          let l2 = '';
          words.forEach(w => {
            if (ctx.measureText(l1 + ' ' + w).width < maxW) {
              l1 += (l1 ? ' ' : '') + w;
            } else {
              l2 += (l2 ? ' ' : '') + w;
            }
          });
          ctx.fillText(l1, textX, midY - 8);
          ctx.fillText(l2, textX, midY + 8);
        } else {
          let drawStr = val;
          if (ctx.measureText(drawStr).width > maxW) {
            while (drawStr.length > 3 && ctx.measureText(drawStr + '...').width > maxW) {
              drawStr = drawStr.slice(0, -1);
            }
            drawStr += '...';
          }
          ctx.fillText(drawStr, textX, midY);
        }
      }

      cellX += col.width;
    });

    currentY += rHeight;
  });

  // 4. TOTALES GENERALES
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(0, currentY, totalWidth, totalRowHeight);
  ctx.strokeStyle = '#CBD5E1';
  ctx.strokeRect(0, currentY, totalWidth, totalRowHeight);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('TOTAL CARGA (m³):', 20, currentY + totalRowHeight / 2);

  ctx.textAlign = 'right';
  ctx.font = 'bold 14px Consolas, monospace';
  const totalM3Str = `${tableData?.totalM3 || '0'} m³`;
  ctx.fillText(totalM3Str, totalWidth - 24, currentY + totalRowHeight / 2);

  return canvas;
}

/**
 * Motor de Renderizado en Canvas 2D para la Matriz de Briefing
 */
export function renderBriefingWithCanvas2D(briefingData) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const cols = [
    { title: 'Operación', key: 'operacion', width: 220, align: 'left', bold: true },
    { title: '# Rutas', key: 'numRutas', width: 85, align: 'center', bold: true },
    { title: 'Real Key 1era V', key: 'propia1v', width: 115, align: 'center' },
    { title: 'Real Terceros 1era V', key: 'externa1v', width: 125, align: 'center' },
    { title: '2da V (Cubiertas Key)', key: 'propia2v', width: 135, align: 'center' },
    { title: '2da V (Terceros)', key: 'externa2v', width: 115, align: 'center' },
    { title: 'Sin cobertura', key: 'sinCobertura', width: 105, align: 'center', bold: true },
    { title: 'Cajas', key: 'cajas', width: 90, align: 'right' },
    { title: 'Kilos', key: 'kilos', width: 120, align: 'right' },
    { title: 'Congelado m3', key: 'congeladoM3', width: 105, align: 'right' },
    { title: 'Refrigerado m3', key: 'refrigeradoM3', width: 110, align: 'right' },
    { title: 'Seco m3', key: 'secoM3', width: 95, align: 'right' },
    { title: 'Volumen', key: 'volumenM3', width: 115, align: 'right', bold: true },
    { title: 'N° Destinos', key: 'numDestinos', width: 95, align: 'center' }
  ];

  const totalWidth = cols.reduce((a, c) => a + c.width, 0);
  const rows = briefingData?.rows || [];
  const totals = briefingData?.totals || {};
  const activeDate = briefingData?.activeDate || 'Despacho';

  const bannerHeight = 72;
  const colHeaderHeight = 38;
  const rowHeight = 32;
  const totalRowHeight = 36;
  const totalHeight = bannerHeight + colHeaderHeight + (rows.length * rowHeight) + totalRowHeight;

  const dpr = 2;
  canvas.width = Math.round(totalWidth * dpr);
  canvas.height = Math.round(totalHeight * dpr);
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Banner
  ctx.fillStyle = '#0B2545';
  ctx.fillRect(0, 0, totalWidth, bannerHeight);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('RESUMEN DE ASIGNACIÓN · BRIEFING', 20, 26);

  ctx.fillStyle = '#93C5FD';
  ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`Despacho ${activeDate} | Balance de flota, cajas, kilos y ambientes por cliente`, 20, 50);

  // Encabezados
  let currentY = bannerHeight;
  ctx.fillStyle = '#0E2A47';
  ctx.fillRect(0, currentY, totalWidth, colHeaderHeight);

  let currentX = 0;
  cols.forEach(col => {
    ctx.strokeStyle = '#1E3A8A';
    ctx.lineWidth = 1;
    ctx.strokeRect(currentX, currentY, col.width, colHeaderHeight);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';

    let tx = currentX + 8;
    if (col.align === 'center') {
      ctx.textAlign = 'center';
      tx = currentX + col.width / 2;
    } else if (col.align === 'right') {
      ctx.textAlign = 'right';
      tx = currentX + col.width - 8;
    } else {
      ctx.textAlign = 'left';
    }

    ctx.fillText(col.title.toUpperCase(), tx, currentY + colHeaderHeight / 2);
    currentX += col.width;
  });

  currentY += colHeaderHeight;

  // Filas
  rows.forEach((r, idx) => {
    const isZebra = idx % 2 === 1;
    const bg = isZebra ? '#F4F7FB' : '#FFFFFF';
    ctx.fillStyle = bg;
    ctx.fillRect(0, currentY, totalWidth, rowHeight);

    let cellX = 0;
    cols.forEach(col => {
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.strokeRect(cellX, currentY, col.width, rowHeight);

      let text = '';
      if (col.key === 'operacion') text = r.operacion || '';
      else if (col.key === 'numRutas') text = String(r.numRutas || 0);
      else if (col.key === 'propia1v') text = String(r.propia1v || 0);
      else if (col.key === 'externa1v') text = String(r.externa1v || 0);
      else if (col.key === 'propia2v') text = String(r.propia2v || 0);
      else if (col.key === 'externa2v') text = String(r.externa2v || 0);
      else if (col.key === 'sinCobertura') text = String(r.sinCobertura || 0);
      else if (col.key === 'cajas') text = (r.cajas || 0).toLocaleString('de-DE');
      else if (col.key === 'kilos') text = `${(Number(r.kilos) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kg`;
      else if (col.key === 'congeladoM3') text = (Number(r.congeladoM3) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      else if (col.key === 'refrigeradoM3') text = (Number(r.refrigeradoM3) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      else if (col.key === 'secoM3') text = (Number(r.secoM3) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      else if (col.key === 'volumenM3') text = `${(Number(r.volumenM3) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m3`;
      else if (col.key === 'numDestinos') text = String(r.numDestinos || 0);

      ctx.fillStyle = col.key === 'sinCobertura' && r.sinCobertura > 0 ? '#DC2626' : '#1E293B';
      ctx.font = col.bold ? 'bold 11px "Segoe UI", Arial, sans-serif' : '11px "Segoe UI", Arial, sans-serif';
      ctx.textBaseline = 'middle';

      let tx = cellX + 8;
      if (col.align === 'center') {
        ctx.textAlign = 'center';
        tx = cellX + col.width / 2;
      } else if (col.align === 'right') {
        ctx.textAlign = 'right';
        tx = cellX + col.width - 8;
      } else {
        ctx.textAlign = 'left';
      }

      ctx.fillText(text, tx, currentY + rowHeight / 2);
      cellX += col.width;
    });

    currentY += rowHeight;
  });

  // Fila Total
  ctx.fillStyle = '#0E2A47';
  ctx.fillRect(0, currentY, totalWidth, totalRowHeight);

  let cellX = 0;
  cols.forEach(col => {
    ctx.strokeStyle = '#1E3A8A';
    ctx.lineWidth = 1;
    ctx.strokeRect(cellX, currentY, col.width, totalRowHeight);

    let text = '';
    if (col.key === 'operacion') text = 'TOTAL GENERAL';
    else if (col.key === 'numRutas') text = String(totals.numRutas || 0);
    else if (col.key === 'propia1v') text = String(totals.propia1v || 0);
    else if (col.key === 'externa1v') text = String(totals.externa1v || 0);
    else if (col.key === 'propia2v') text = String(totals.propia2v || 0);
    else if (col.key === 'externa2v') text = String(totals.externa2v || 0);
    else if (col.key === 'sinCobertura') text = String(totals.sinCobertura || 0);
    else if (col.key === 'cajas') text = (totals.cajas || 0).toLocaleString('de-DE');
    else if (col.key === 'kilos') text = `${(Number(totals.kilos) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kg`;
    else if (col.key === 'congeladoM3') text = (Number(totals.congeladoM3) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    else if (col.key === 'refrigeradoM3') text = (Number(totals.refrigeradoM3) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    else if (col.key === 'secoM3') text = (Number(totals.secoM3) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    else if (col.key === 'volumenM3') text = `${(Number(totals.volumenM3) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m3`;
    else if (col.key === 'numDestinos') text = String(totals.numDestinos || 0);

    ctx.fillStyle = col.key === 'volumenM3' ? '#6EE7B7' : '#FFFFFF';
    ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';

    let tx = cellX + 8;
    if (col.align === 'center') {
      ctx.textAlign = 'center';
      tx = cellX + col.width / 2;
    } else if (col.align === 'right') {
      ctx.textAlign = 'right';
      tx = cellX + col.width - 8;
    } else {
      ctx.textAlign = 'left';
    }

    ctx.fillText(text, tx, currentY + totalRowHeight / 2);
    cellX += col.width;
  });

  return canvas;
}

/**
 * Genera el Canvas final optimizado para exportación o portapapeles
 */
async function renderMatrixCanvas(element, tableData = null) {
  // Si contamos con la data estructurada de los viajes, el motor Canvas 2D nativo
  // produce una renderización 100% nítida, sin recorte de texto y con todo el detalle de Zona
  if (tableData && tableData.tripsList && tableData.tripsList.length > 0) {
    return renderMatrixWithCanvas2D(tableData);
  }

  const html2canvas = getHtml2Canvas();
  if (html2canvas && element) {
    try {
      const rect = element.getBoundingClientRect();
      const scrollW = Math.max(element.scrollWidth || 0, Math.ceil(rect.width) || 1200);
      const scrollH = Math.max(element.scrollHeight || 0, Math.ceil(rect.height) || 800);

      const canvas = await html2canvas(element, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: scrollW,
        height: scrollH,
        scrollX: 0,
        scrollY: 0,
        windowWidth: Math.max(scrollW, 1920),
        windowHeight: Math.max(scrollH, 1080)
      });
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        return canvas;
      }
    } catch (h2cError) {
      console.warn('html2canvas capture warning, activando motor Canvas 2D nativo:', h2cError);
    }
  }

  // Fallback garantizado sin restricciones de seguridad
  return renderMatrixWithCanvas2D(tableData || { tripsList: [], bannerTitle: 'RUTEO' });
}

/**
 * Copia la matriz de Ruteo al portapapeles combinando el formato nativo para Excel (text/html y text/plain)
 * y formato de imagen (image/png). Al pegar en Excel (Ctrl + V), se combina directamente
 * en las celdas con el diseño, colores pastel y bordes de la matriz.
 */
export async function copyMatrixAsImage(element, activeDate = '', tableData = null) {
  if (!element && !tableData) {
    toast.error('No se encontró el contenedor de la matriz para copiar.');
    return;
  }

  const toastId = toast.loading('Copiando matriz para Excel con formato...');

  try {
    let htmlContent = '';
    let tsvContent = '';

    if (tableData && tableData.tripsList && tableData.tripsList.length > 0) {
      const formatted = generateMatrixHtmlTable({
        tripsList: tableData.tripsList,
        bannerTitle: tableData.bannerTitle || '',
        activeDate: tableData.activeDate || activeDate,
        totalM3: tableData.totalM3 || '0'
      });
      htmlContent = formatted.html;
      tsvContent = formatted.tsv;
    } else if (element) {
      const extracted = extractHtmlFromDomElement(element, activeDate);
      htmlContent = extracted.html;
      tsvContent = extracted.tsv;
    }

    let pngBlob = null;
    try {
      const canvas = await renderMatrixCanvas(element, tableData);
      if (canvas) {
        pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      }
    } catch (canvasErr) {
      console.warn('Canvas rasterization warning (continuando con copiado HTML):', canvasErr);
    }

    let copied = false;

    if (navigator.clipboard && window.ClipboardItem) {
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([tsvContent], { type: 'text/plain' });

      if (pngBlob) {
        try {
          const item = new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
            'image/png': pngBlob
          });
          await navigator.clipboard.write([item]);
          copied = true;
        } catch (multiErr) {
          console.warn('Clipboard multi-MIME attempt rejected, writing text/html + text/plain for Excel:', multiErr);
        }
      }

      if (!copied) {
        try {
          const item = new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob
          });
          await navigator.clipboard.write([item]);
          copied = true;
        } catch (htmlErr) {
          console.warn('Clipboard HTML write failed, trying image only:', htmlErr);
          if (pngBlob) {
            try {
              const item = new ClipboardItem({
                'image/png': pngBlob
              });
              await navigator.clipboard.write([item]);
              copied = true;
            } catch (imgErr) {
              console.error('All ClipboardItem write attempts failed:', imgErr);
            }
          }
        }
      }
    }

    if (!copied && htmlContent) {
      try {
        const copyHandler = (e) => {
          e.preventDefault();
          e.clipboardData.setData('text/html', htmlContent);
          e.clipboardData.setData('text/plain', tsvContent);
        };
        document.addEventListener('copy', copyHandler);
        copied = document.execCommand('copy');
        document.removeEventListener('copy', copyHandler);
      } catch (execErr) {
        console.warn('document.execCommand copy fallback failed:', execErr);
      }
    }

    if (copied) {
      toast.success('¡Matriz copiada! Al presionar Ctrl + V en Excel se pegará combinada en celdas con el formato de la matriz.', { id: toastId });
    } else if (pngBlob) {
      const url = URL.createObjectURL(pngBlob);
      const link = document.createElement('a');
      link.download = `Matriz_Ruteo_${activeDate || 'Despacho'}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1500);
      toast.info('Se descargó la imagen PNG para pegarla en Excel.', { id: toastId });
    } else {
      throw new Error('No se pudo transferir la matriz al portapapeles.');
    }
  } catch (error) {
    console.error('Error copying matrix to clipboard:', error);
    toast.error('Error al copiar la matriz al portapapeles.', { id: toastId });
  }
}

/**
 * Copia el Briefing al portapapeles combinando formato Excel nativo (text/html y text/plain)
 * e imagen PNG. Al pegar en Excel se combina directamente en celdas con diseño y formato oficial.
 */
export async function copyBriefingAsImage(element, activeDate = '', briefingData = null) {
  const toastId = toast.loading('Copiando Briefing para Excel con formato...');

  try {
    let htmlContent = '';
    let tsvContent = '';

    if (briefingData && briefingData.rows) {
      const formatted = generateBriefingHtmlTable({
        rows: briefingData.rows,
        totals: briefingData.totals,
        activeDate: briefingData.activeDate || activeDate
      });
      htmlContent = formatted.html;
      tsvContent = formatted.tsv;
    } else if (element) {
      const extracted = extractHtmlFromDomElement(element, activeDate);
      htmlContent = extracted.html;
      tsvContent = extracted.tsv;
    }

    let pngBlob = null;
    try {
      const canvas = renderBriefingWithCanvas2D(briefingData || { rows: [], totals: {}, activeDate });
      if (canvas) {
        pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      }
    } catch (canvasErr) {
      console.warn('Briefing canvas rasterization warning:', canvasErr);
    }

    let copied = false;

    if (navigator.clipboard && window.ClipboardItem) {
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([tsvContent], { type: 'text/plain' });

      if (pngBlob) {
        try {
          const item = new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
            'image/png': pngBlob
          });
          await navigator.clipboard.write([item]);
          copied = true;
        } catch (multiErr) {
          console.warn('Briefing clipboard multi-MIME attempt rejected, writing text/html + text/plain:', multiErr);
        }
      }

      if (!copied) {
        try {
          const item = new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob
          });
          await navigator.clipboard.write([item]);
          copied = true;
        } catch (htmlErr) {
          console.warn('Briefing HTML clipboard failed, fallback image:', htmlErr);
          if (pngBlob) {
            try {
              const item = new ClipboardItem({ 'image/png': pngBlob });
              await navigator.clipboard.write([item]);
              copied = true;
            } catch (imgErr) {
              console.error('All briefing clipboard writes failed:', imgErr);
            }
          }
        }
      }
    }

    if (!copied && htmlContent) {
      try {
        const copyHandler = (e) => {
          e.preventDefault();
          e.clipboardData.setData('text/html', htmlContent);
          e.clipboardData.setData('text/plain', tsvContent);
        };
        document.addEventListener('copy', copyHandler);
        copied = document.execCommand('copy');
        document.removeEventListener('copy', copyHandler);
      } catch (execErr) {
        console.warn('execCommand copy fallback failed:', execErr);
      }
    }

    if (copied) {
      toast.success('¡Briefing copiado! Al presionar Ctrl + V en Excel se pegará combinado en celdas con formato.', { id: toastId });
    } else if (pngBlob) {
      const url = URL.createObjectURL(pngBlob);
      const link = document.createElement('a');
      link.download = `Resumen_Briefing_${activeDate || 'Despacho'}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1500);
      toast.info('Se descargó la imagen PNG del Briefing.', { id: toastId });
    } else {
      throw new Error('No se pudo copiar el Briefing al portapapeles.');
    }
  } catch (error) {
    console.error('Error copying briefing to clipboard:', error);
    toast.error('Error al copiar el Briefing al portapapeles.', { id: toastId });
  }
}

/**
 * Descarga la matriz completa en formato de imagen PNG en ultra alta definición (Retina 2x, sin recortes)
 */
export async function downloadMatrixAsImage(element, activeDate = '', tableData = null) {
  if (!element && !tableData) {
    toast.error('No se encontró el contenedor de la matriz para descargar.');
    return;
  }

  const toastId = toast.loading('Generando imagen de alta definición sin recortes...');

  try {
    const canvas = await renderMatrixCanvas(element, tableData);
    
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('No se pudo generar el archivo de imagen.'));
      }, 'image/png');
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `Matriz_Ruteo_${activeDate || 'Despacho'}.png`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 1500);

    toast.success('¡Imagen descargada exitosamente en formato PNG de alta resolución!', { id: toastId });
  } catch (error) {
    console.error('Error downloading matrix image:', error);
    toast.error('Error al descargar la imagen de la matriz.', { id: toastId });
  }
}

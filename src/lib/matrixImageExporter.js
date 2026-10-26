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

    const zonaCompleta = (trip.zonaItems || []).map(z => z.text).join(' | ');
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
 * Fallback para generar HTML a partir del elemento DOM si no se cuenta con datos estructurados
 */
function extractHtmlFromDomElement(element, activeDate) {
  const table = element.querySelector('table');
  if (!table) return { html: '', tsv: '' };

  const clone = table.cloneNode(true);

  // Remover primera columna (checkbox) y última columna (acciones/detalle)
  clone.querySelectorAll('tr').forEach(row => {
    const firstCell = row.firstElementChild;
    if (firstCell) row.removeChild(firstCell);
    const lastCell = row.lastElementChild;
    if (lastCell && lastCell.querySelector('button, svg')) {
      row.removeChild(lastCell);
    }
  });

  const bannerEl = element.querySelector('h2');
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
 * Motor de Renderizado 100% Nativo en Canvas 2D (Sin CORS, sin taint de SVG, 100% compatible con todos los PCs)
 */
export function renderMatrixWithCanvas2D(tableData) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const cols = [
    { title: 'Fecha', key: 'fecha', width: 95, align: 'center' },
    { title: 'Operación', key: 'operacionStr', width: 160, align: 'left' },
    { title: 'Ruta', key: 'rutasStr', width: 100, align: 'center', mono: true },
    { title: 'Camión', key: 'camion', width: 125, align: 'left', bold: true },
    { title: 'N° vuelta', key: 'displayVuelta', width: 95, align: 'center' },
    { title: 'Conductor', key: 'conductor_name', width: 195, align: 'left' },
    { title: 'Auxiliar', key: 'auxiliares', width: 165, align: 'left' },
    { title: 'Zona (Ruta, Cliente, Comuna Más Lejana, LC, m³)', key: 'zona', width: 380, align: 'left' },
    { title: 'Vol Carga', key: 'vol', width: 95, align: 'right' },
    { title: 'Turno', key: 'turno', width: 85, align: 'center' },
    { title: 'Hora Cita', key: 'hora_cita', width: 85, align: 'center' },
    { title: 'Prioridad', key: 'prioridad', width: 130, align: 'center' },
    { title: 'Destino Prioritario', key: 'destino_prioritario', width: 160, align: 'left' }
  ];

  const totalWidth = cols.reduce((a, c) => a + c.width, 0);
  const trips = tableData?.tripsList || [];
  const bannerTitle = `ASIGNACIÓN DE RUTAS - ${tableData?.bannerTitle || 'FAST FOOD'}`;
  const subtitle = `Despacho ${tableData?.activeDate || ''} | Base: Lago Riñihue 02319, San Bernardo`;

  const bannerHeight = 70;
  const colHeaderHeight = 36;
  const rowHeight = 30;
  const totalRowHeight = 34;
  const totalHeight = bannerHeight + colHeaderHeight + (trips.length * rowHeight) + totalRowHeight;

  // Escala para calidad Retina / HD
  const dpr = 1.35;
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
  ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`🚛  ${bannerTitle}`, 16, 26);

  ctx.fillStyle = '#FDE047';
  ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
  ctx.fillText(subtitle, 16, 52);

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
    ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';

    let textX = currentX + 8;
    if (col.align === 'center') {
      ctx.textAlign = 'center';
      textX = currentX + col.width / 2;
    } else if (col.align === 'right') {
      ctx.textAlign = 'right';
      textX = currentX + col.width - 8;
    } else {
      ctx.textAlign = 'left';
    }

    ctx.fillText(col.title.toUpperCase(), textX, currentY + colHeaderHeight / 2);
    currentX += col.width;
  });

  currentY += colHeaderHeight;

  // 3. FILAS DE DATOS
  trips.forEach((trip, idx) => {
    const isPrioUrgente = trip.prioridad === 'Prioridad urgente';
    const isUrgente = trip.prioridad === 'Urgente';
    const isRedespacho = trip.prioridad === 'Redespacho';

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
    ctx.fillRect(0, currentY, totalWidth, rowHeight);

    let cellX = 0;
    cols.forEach(col => {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(cellX, currentY, col.width, rowHeight);

      let val = '';
      if (col.key === 'fecha') val = trip.fecha || '';
      else if (col.key === 'operacionStr') val = trip.operacionStr || '';
      else if (col.key === 'rutasStr') val = trip.rutasStr || '';
      else if (col.key === 'camion') val = trip.camion || '';
      else if (col.key === 'displayVuelta') val = trip.displayVuelta || '';
      else if (col.key === 'conductor_name') val = trip.conductor_name || '';
      else if (col.key === 'auxiliares') val = trip.auxiliares?.join(', ') || '-';
      else if (col.key === 'zona') val = (trip.zonaItems || []).map(z => z.text).join(' | ');
      else if (col.key === 'vol') val = (Number(trip.totalM3) || 0).toFixed(4);
      else if (col.key === 'turno') val = trip.turno || '';
      else if (col.key === 'hora_cita') val = trip.hora_cita || '';
      else if (col.key === 'prioridad') val = trip.prioridad || 'Normal';
      else if (col.key === 'destino_prioritario') val = trip.destino_prioritario || '';

      ctx.fillStyle = textColor;
      ctx.font = col.mono 
        ? 'bold 11px Consolas, monospace' 
        : (col.bold || isPrioUrgente || isUrgente || isRedespacho ? 'bold 11px "Segoe UI", Arial, sans-serif' : '11px "Segoe UI", Arial, sans-serif');
      ctx.textBaseline = 'middle';

      let drawX = cellX + 8;
      if (col.align === 'center') {
        ctx.textAlign = 'center';
        drawX = cellX + col.width / 2;
      } else if (col.align === 'right') {
        ctx.textAlign = 'right';
        drawX = cellX + col.width - 8;
      } else {
        ctx.textAlign = 'left';
      }

      let textToDraw = String(val);
      const maxW = col.width - 16;
      if (ctx.measureText(textToDraw).width > maxW) {
        while (textToDraw.length > 3 && ctx.measureText(textToDraw + '...').width > maxW) {
          textToDraw = textToDraw.slice(0, -1);
        }
        textToDraw += '...';
      }

      ctx.fillText(textToDraw, drawX, currentY + rowHeight / 2);
      cellX += col.width;
    });

    currentY += rowHeight;
  });

  // 4. TOTALES
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(0, currentY, totalWidth, totalRowHeight);
  ctx.strokeStyle = '#CBD5E1';
  ctx.strokeRect(0, currentY, totalWidth, totalRowHeight);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('TOTAL CARGA (m³):', 16, currentY + totalRowHeight / 2);

  ctx.textAlign = 'right';
  const totalM3Str = `${tableData?.totalM3 || '0'} m³`;
  ctx.fillText(totalM3Str, totalWidth - 24, currentY + totalRowHeight / 2);

  return canvas;
}

/**
 * Genera un canvas a partir del contenedor de la matriz, utilizando html2canvas
 * con fallback infalible de renderizado Canvas 2D nativo sin taint ni CORS.
 */
async function renderMatrixCanvas(element, tableData = null) {
  const html2canvas = getHtml2Canvas();
  if (html2canvas && element) {
    try {
      const rect = element.getBoundingClientRect();
      const scrollW = Math.max(element.scrollWidth || 0, Math.ceil(rect.width) || 1200);
      const scrollH = Math.max(element.scrollHeight || 0, Math.ceil(rect.height) || 800);

      const canvas = await html2canvas(element, {
        scale: 1.25,
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
 * Copia la matriz al portapapeles combinando el formato nativo para Excel (text/html y text/plain)
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
    // 1. Generar contenido HTML y TSV optimizado para Excel
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

    // 2. Generar imagen PNG de respaldo/rasterizada (utilizando motor dual)
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

    // 3. Escribir al portapapeles mediante Async Clipboard API
    if (navigator.clipboard && window.ClipboardItem) {
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([tsvContent], { type: 'text/plain' });

      // Intento A: paquete completo si el navegador soporta tipos múltiples (incluyendo image/png)
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

      // Intento B: text/html + text/plain (formato que Excel interpreta directamente como celdas con formato)
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

    // 4. Intento C: Fallback tradicional con document.execCommand('copy') (ideal para HTTP o PCs de red local)
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
      // Si el navegador bloquea escritura de portapapeles, descargar archivo de imagen como respaldo
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
 * Descarga la matriz completa en formato de imagen PNG (compatible con todos los computadores)
 */
export async function downloadMatrixAsImage(element, activeDate = '', tableData = null) {
  if (!element && !tableData) {
    toast.error('No se encontró el contenedor de la matriz para descargar.');
    return;
  }

  const toastId = toast.loading('Preparando descarga de imagen en formato PNG...');

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

    toast.success('¡Imagen descargada exitosamente en formato PNG!', { id: toastId });
  } catch (error) {
    console.error('Error downloading matrix image:', error);
    toast.error('Error al descargar la imagen de la matriz.', { id: toastId });
  }
}

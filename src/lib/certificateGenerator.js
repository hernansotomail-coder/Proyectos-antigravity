import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

const CORRELATIVO_STORAGE_KEY = 'keylogistics_cert_correlativo_v1';
const DEFAULT_START_CORRELATIVO = 1411;

export function getNextCorrelativo() {
  try {
    const saved = localStorage.getItem(CORRELATIVO_STORAGE_KEY);
    const parsed = saved ? parseInt(saved, 10) : NaN;
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  } catch (e) {
    // ignore storage errors
  }
  return DEFAULT_START_CORRELATIVO;
}

export function setNextCorrelativo(num) {
  const clean = Math.max(1, parseInt(num, 10) || DEFAULT_START_CORRELATIVO);
  try {
    localStorage.setItem(CORRELATIVO_STORAGE_KEY, String(clean));
  } catch (e) {
    // ignore storage errors
  }
  return clean;
}

export function formatCorrelativo(num) {
  return String(num).padStart(6, '0');
}

/**
 * Dibuja el logo de ADQUIM (dos gotas azul/verde + texto ADQUIM®) en un canvas
 * para incrustarlo con máxima nitidez en el PDF.
 */
function createAdquimLogoDataUrl() {
  const canvas = document.createElement('canvas');
  canvas.width = 520;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');

  // Fondo blanco transparente
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Gota azul izquierda
  ctx.save();
  ctx.strokeStyle = '#14428C';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(42, 16);
  ctx.bezierCurveTo(42, 16, 14, 52, 14, 72);
  ctx.arc(42, 72, 28, Math.PI, 0, true);
  ctx.bezierCurveTo(70, 52, 42, 16, 42, 16);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Gota verde superpuesta derecha
  ctx.save();
  ctx.strokeStyle = '#009E59';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(74, 34);
  ctx.bezierCurveTo(74, 34, 48, 66, 48, 82);
  ctx.arc(74, 82, 26, Math.PI, 0, true);
  ctx.bezierCurveTo(100, 66, 74, 34, 74, 34);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Texto ADQUIM
  ctx.fillStyle = '#14428C';
  ctx.font = 'bold 68px Arial, Helvetica, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('ADQUIM', 120, 66);

  // Símbolo ®
  ctx.font = 'bold 20px Arial, Helvetica, sans-serif';
  ctx.fillText('®', 402, 38);

  return canvas.toDataURL('image/png');
}

/**
 * Genera el PDF del Certificado de Tratamiento Realizado ADQUIM
 * y solicita al usuario la carpeta/ruta donde desea guardarlo.
 *
 * @returns {Promise<{ saved: boolean, cancelled?: boolean, correlativoStr: string, fileName: string }>}
 */
export async function generateAndSaveCertificatePdf({
  correlativoNum,
  plate,
  internalNumber,
  treatmentStartDateDmy,
  emissionDateDmy,
  expirationDateDmy
}) {
  const correlativoStr = formatCorrelativo(correlativoNum);
  const safePlate = (plate || internalNumber || 'SIN_PATENTE').toUpperCase().trim();
  const safeInternal = (internalNumber || '').toUpperCase().trim();
  const fileName = `Certificado_ADQUIM_${correlativoStr}_${safeInternal ? safeInternal + '_' : ''}${safePlate}.pdf`;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // ~215.9mm
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2;
  let y = 16;

  // --- 1. ENCABEZADO: LOGO ADQUIM + CERTIFICADO Nº ---
  try {
    const logoDataUrl = createAdquimLogoDataUrl();
    doc.addImage(logoDataUrl, 'PNG', marginX, y, 66, 15.2);
  } catch (e) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(20, 66, 140);
    doc.text('ADQUIM', marginX, y + 11);
  }

  // Caja CERTIFICADO Nº a la derecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text('CERTIFICADO Nº', pageWidth - marginX - 38, y + 6);

  doc.setDrawColor(148, 163, 184);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(pageWidth - marginX - 38, y + 8, 38, 9, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(180, 20, 20);
  doc.text(correlativoStr, pageWidth - marginX - 19, y + 14.3, { align: 'center' });

  y += 19;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('ADQUIM SPA  76.264.437-1', marginX, y);
  doc.text('Av. Vitacura 7900, oficina 904', marginX, y + 4);
  doc.setTextColor(20, 66, 140);
  doc.text('www.adquim.com', marginX, y + 8);

  y += 14;
  // Línea divisoria
  doc.setDrawColor(20, 66, 140);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, pageWidth - marginX, y);

  // --- 2. TÍTULO PRINCIPAL ---
  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(20, 66, 140);
  doc.text('Certificado de Tratamiento Realizado', pageWidth / 2, y, { align: 'center' });

  // --- 3. DATOS CLIENTE ---
  y += 8;
  doc.setFillColor(20, 66, 140);
  doc.rect(marginX, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('Datos Cliente', marginX + 3, y + 4.8);

  y += 7;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(marginX, y, contentWidth, 24);

  const clientRows = [
    ['Razón Social:', 'KEYLOGISTICS CHILE S.A'],
    ['RUT:', '96.930.440-6'],
    ['Fono:', '22305300'],
    ['Dirección:', 'Lago Riñihue 02319 San Bernardo']
  ];
  clientRows.forEach(([label, val], idx) => {
    const rowY = y + 5 + idx * 5.2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(label, marginX + 3, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(val, marginX + 36, rowY);
  });

  // --- 4. DIRECCIÓN TRATAMIENTO ---
  y += 30;
  doc.setFillColor(20, 66, 140);
  doc.rect(marginX, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('Dirección Tratamiento', marginX + 3, y + 4.8);

  y += 7;
  doc.setDrawColor(203, 213, 225);
  doc.rect(marginX, y, contentWidth, 25);

  // Fila 1: Camión Patente + Fecha de inic. Tratamiento
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Camión Patente:', marginX + 3, y + 6.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(safePlate, marginX + 38, y + 6.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Fecha de inic. Tratamiento:', marginX + 90, y + 6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(treatmentStartDateDmy || '—', marginX + 140, y + 6.5);

  // Fila 2: Emisión certificada + Vencimiento certificado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Emisión certificada:', marginX + 3, y + 17);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(emissionDateDmy, marginX + 42, y + 17);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Vencimiento certificado:', marginX + 90, y + 17);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(expirationDateDmy, marginX + 136, y + 17);

  // --- 5. TRATAMIENTO APLICADO ---
  y += 31;
  doc.setFillColor(20, 66, 140);
  doc.rect(marginX, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('Tratamiento Aplicado', marginX + 3, y + 4.8);

  y += 7;
  doc.setDrawColor(203, 213, 225);
  doc.rect(marginX, y, contentWidth, 48);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(20, 66, 140);
  doc.text('AD ULTRA Solución desinfectante 0,3% (Dilución 1:10)', marginX + 3, y + 6);

  const treatmentRows = [
    ['Registro ISP:', 'D-1317/21'],
    ['Principio activo:', 'Ácido Hipocloroso'],
    ['Apariencia:', 'Líquido Incoloro'],
    ['pH de la solución al 100%:', '8 – 9,5'],
    ['Olor:', 'Característico'],
    ['Densidad Específica a 20°C:', '0,98 – 1,02 g/cm2'],
    ['Detalle Áreas Tratadas:', 'Interior Camiones Refrigerados']
  ];
  treatmentRows.forEach(([label, val], idx) => {
    const rowY = y + 12 + idx * 5.1;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(label, marginX + 3, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(val, marginX + 55, rowY);
  });

  // --- 6. RECOMENDACIONES ---
  y += 54;
  doc.setFillColor(20, 66, 140);
  doc.rect(marginX, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('Recomendaciones', marginX + 3, y + 4.8);

  y += 7;
  doc.setDrawColor(203, 213, 225);
  doc.rect(marginX, y, contentWidth, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  const recText =
    'Contactar Adquim en caso de sospecha o evidencia de brote. No usar productos de PH superior a 11 en superficies tratadas. No Lijar, Pintar o cubrir superficies.';
  const splitRec = doc.splitTextToSize(recText, contentWidth - 6);
  doc.text(splitRec, marginX + 3, y + 6);

  // --- 7. QR + FIRMA ---
  y += 23;
  try {
    const qrDataUrl = await QRCode.toDataURL('https://www.adquim.com', {
      width: 240,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    });
    doc.addImage(qrDataUrl, 'PNG', marginX + 4, y, 28, 28);
  } catch (e) {
    // ignore QR error
  }

  // Firma derecha
  const sigX = pageWidth - marginX - 58;
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.4);
  doc.line(sigX, y + 18, sigX + 52, y + 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Encargado Adquim', sigX + 26, y + 23, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Resolución ISP.', sigX + 26, y + 27.5, { align: 'center' });
  doc.setTextColor(20, 66, 140);
  doc.text('www.adquim.com', sigX + 26, y + 32, { align: 'center' });

  // --- 8. PIE DE PÁGINA SEREMI ---
  const footerY = doc.internal.pageSize.getHeight() - 18;
  doc.setDrawColor(203, 213, 225);
  doc.line(marginX, footerY - 4, pageWidth - marginX, footerY - 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const footerText =
    'ESTE CERTIFICADO SE EXTIENDE AL INTERESADO PARA LOS FINES QUE ESTIME CONVENIENTE Y TIENE REGISTRO DE LA SECRETARIA REGIONAL DE SALUD SEREMI DE SALUD N°2589';
  const splitFooter = doc.splitTextToSize(footerText, contentWidth);
  doc.text(splitFooter, pageWidth / 2, footerY + 1, { align: 'center' });

  // --- 9. GUARDAR PREGUNTANDO CARPETA (File System Access API o descarga) ---
  const pdfBlob = doc.output('blob');

  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'Certificado PDF',
            accept: { 'application/pdf': ['.pdf'] }
          }
        ]
      });
      const writable = await fileHandle.createWritable();
      await writable.write(pdfBlob);
      await writable.close();
      return { saved: true, correlativoStr, fileName };
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return { saved: false, cancelled: true, correlativoStr, fileName };
      }
      // Si falla por seguridad/iframe, fallback a descarga tradicional
      doc.save(fileName);
      return { saved: true, correlativoStr, fileName };
    }
  } else {
    doc.save(fileName);
    return { saved: true, correlativoStr, fileName };
  }
}

import { toast } from 'sonner';
import getHtml2Canvas from './html2canvasWrapper';

/**
 * Genera un canvas a partir del contenedor de la matriz, utilizando html2canvas
 * con fallback a SVG foreignObject si ocurre algún error de renderizado.
 */
async function renderMatrixCanvas(element) {
  const html2canvas = getHtml2Canvas();
  if (html2canvas) {
    try {
      const canvas = await html2canvas(element, {
        scale: 1.25,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        scrollX: 0,
        scrollY: 0
      });
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        return canvas;
      }
    } catch (h2cError) {
      console.warn('html2canvas capture warning, intentando fallback de rasterización:', h2cError);
    }
  }

  // Fallback rasterizer mediante SVG ForeignObject
  const rect = element.getBoundingClientRect();
  const width = Math.max(element.scrollWidth || 0, Math.ceil(rect.width) || 1200);
  const height = Math.max(element.scrollHeight || 0, Math.ceil(rect.height) || 800);

  const clone = element.cloneNode(true);
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.backgroundColor = '#ffffff';

  const wrapper = document.createElement('div');
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  wrapper.appendChild(clone);

  const xml = new XMLSerializer().serializeToString(wrapper);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * 1.25);
      canvas.height = Math.round(height * 1.25);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(1.25, 1.25);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo generar la imagen de la matriz.'));
    };
    img.src = url;
  });
}

/**
 * Copia la matriz visible como imagen PNG al portapapeles para poder pegarla directamente en Excel
 */
export async function copyMatrixAsImage(element, activeDate = '') {
  if (!element) {
    toast.error('No se encontró el contenedor de la matriz para copiar.');
    return;
  }

  const toastId = toast.loading('Generando imagen de la matriz para portapapeles...');

  try {
    const canvas = await renderMatrixCanvas(element);

    canvas.toBlob(async (blob) => {
      try {
        if (!blob) throw new Error('No se pudo generar el archivo de imagen.');

        let copied = false;

        if (navigator.clipboard && window.ClipboardItem) {
          try {
            const clipboardItem = new ClipboardItem({
              'image/png': blob
            });
            await navigator.clipboard.write([clipboardItem]);
            copied = true;
          } catch (clipErr) {
            console.warn('Direct image clipboard write failed:', clipErr);
          }
        }

        if (copied) {
          toast.success('¡Imagen copiada al portapapeles! Puedes pegarla directamente en Excel (Ctrl + V).', { id: toastId });
        } else {
          // Si el navegador bloquea escritura de imagen binaria en el portapapeles, descargar automáticamente como respaldo
          const link = document.createElement('a');
          link.download = `Matriz_Ruteo_${activeDate || 'Despacho'}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          toast.info('Se descargó la imagen PNG para pegarla en Excel.', { id: toastId });
        }
      } catch (err) {
        console.error('Error processing image blob for clipboard:', err);
        toast.error('Error al procesar la imagen para el portapapeles', { id: toastId });
      }
    }, 'image/png');
  } catch (error) {
    console.error('Error generating matrix image:', error);
    toast.error('Error al capturar la matriz como imagen.', { id: toastId });
  }
}

/**
 * Descarga la matriz completa en formato de imagen PNG
 */
export async function downloadMatrixAsImage(element, activeDate = '') {
  if (!element) {
    toast.error('No se encontró el contenedor de la matriz para descargar.');
    return;
  }

  const toastId = toast.loading('Preparando descarga de imagen en formato PNG...');

  try {
    const canvas = await renderMatrixCanvas(element);
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `Matriz_Ruteo_${activeDate || 'Despacho'}.png`;
    link.href = dataUrl;
    link.click();
    toast.success('¡Imagen descargada exitosamente en formato PNG!', { id: toastId });
  } catch (error) {
    console.error('Error downloading matrix image:', error);
    toast.error('Error al descargar la imagen de la matriz.', { id: toastId });
  }
}

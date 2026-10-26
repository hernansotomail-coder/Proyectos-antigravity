import { toast } from 'sonner';
import getHtml2Canvas from './html2canvasWrapper';

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
    const html2canvas = getHtml2Canvas();
    if (!html2canvas) {
      throw new Error('El motor de renderizado de imagen no está disponible.');
    }

    const canvas = await html2canvas(element, {
      scale: 1.25,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0
    });

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
            console.warn('Direct image clipboard failed:', clipErr);
          }
        }

        if (copied) {
          toast.success('¡Imagen copiada al portapapeles! Puedes pegarla directamente en Excel (Ctrl + V).', { id: toastId });
        } else {
          // Si el navegador bloquea escritura de imagen binaria, descargar automáticamente como respaldo
          const link = document.createElement('a');
          link.download = `Matriz_Ruteo_${activeDate || 'Despacho'}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          toast.info('Se descargó la imagen PNG para pegarla en Excel.', { id: toastId });
        }
      } catch (err) {
        console.error('Error copying blob:', err);
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
    const html2canvas = getHtml2Canvas();
    if (!html2canvas) {
      throw new Error('El motor de renderizado de imagen no está disponible.');
    }

    const canvas = await html2canvas(element, {
      scale: 1.25,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0
    });

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

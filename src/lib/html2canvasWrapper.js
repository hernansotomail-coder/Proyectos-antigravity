import html2canvasInstance from './html2canvas.min.js';

export function getHtml2Canvas() {
  if (html2canvasInstance) {
    return html2canvasInstance;
  }
  if (typeof window !== 'undefined' && window.html2canvas) {
    return window.html2canvas;
  }
  if (typeof globalThis !== 'undefined' && globalThis.html2canvas) {
    return globalThis.html2canvas;
  }
  return null;
}

export default getHtml2Canvas;

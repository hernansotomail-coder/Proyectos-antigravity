import './html2canvas.min.js';

export function getHtml2Canvas() {
  if (typeof window !== 'undefined' && window.html2canvas) {
    return window.html2canvas;
  }
  return null;
}

export default getHtml2Canvas;

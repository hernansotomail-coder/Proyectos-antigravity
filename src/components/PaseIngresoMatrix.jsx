import React, { useState, useEffect, useRef } from 'react';
import { Download, Copy, X, Check, Phone, ArrowLeft, Image as ImageIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Button } from './ui/Button';
import getHtml2Canvas from '../lib/html2canvasWrapper';

/**
 * Matriz "Pase de Ingreso" para Juan Valdez y Newrest
 * Diseño corporativo oficial en verde oscuro (#0a5c43), logos de cliente y Key Logistics,
 * columnas requeridas y campo celular editable persistente.
 */
export default function PaseIngresoMatrix({
  clientName = 'Juan Valdez',
  activeDate = '',
  assignments = [],
  fleetList = [],
  staffList = [],
  onClose
}) {
  const containerRef = useRef(null);
  const matrixTableRef = useRef(null);

  // Almacenamiento local de teléfonos editados por usuario (persistente)
  const [phones, setPhones] = useState(() => {
    try {
      const saved = localStorage.getItem('keylogistics_pases_ingreso_phones');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handlePhoneChange = (key, val) => {
    setPhones(prev => {
      const updated = { ...prev, [key]: val };
      try {
        localStorage.setItem('keylogistics_pases_ingreso_phones', JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving phones to localStorage:', e);
      }
      return updated;
    });
  };

  // Normalizar datos de filas para la matriz de Pases de Ingreso
  const rows = React.useMemo(() => {
    // Filtrar rutas que correspondan al cliente
    const isClientRoute = (r) => {
      const combined = [
        r.cliente,
        r.operacion,
        r.Operacion,
        r.nombreRuta,
        r.denominacion,
        r.servicio
      ].filter(Boolean).join(' ').toLowerCase();

      const target = clientName.toLowerCase();
      if (target.includes('juan') || target.includes('valdez')) {
        return combined.includes('juan') || combined.includes('valdez');
      }
      if (target.includes('newrest')) {
        return combined.includes('newrest');
      }
      return combined.includes(target);
    };

    const clientAssignments = (assignments || []).filter(isClientRoute);

    return clientAssignments.map((r, idx) => {
      const cName = (r.conductor_name || '').trim();
      const aName = (r.aux1_name || r.aux2_name || '').trim();

      // Buscar RUT y teléfono en staffList
      const condStaff = (staffList || []).find(
        s => s && s.name && s.name.trim().toLowerCase() === cName.toLowerCase()
      );
      const auxStaff = (staffList || []).find(
        s => s && s.name && s.name.trim().toLowerCase() === aName.toLowerCase()
      );

      // Resolver Código interno y PPU (Patente)
      let cod = '';
      let ppu = (r.patente || '').trim().toUpperCase();

      if (r.camion && !r.camion.toLowerCase().includes('sin cami')) {
        const raw = r.camion.trim();
        const match = raw.match(/^([^(]+)(?:\(([^)]+)\))?/);
        if (match) {
          cod = match[1].trim();
          if (!ppu && match[2]) ppu = match[2].trim().toUpperCase();
        } else {
          cod = raw;
        }
      }

      // Buscar en fleetList para código oficial
      const foundF = (fleetList || []).find(f => {
        const fCode = (f.internal_number || '').trim().toLowerCase();
        const fPlate = (f.plate || '').trim().toLowerCase();
        if (cod && fCode && fCode === cod.toLowerCase()) return true;
        if (ppu && fPlate && fPlate === ppu.toLowerCase()) return true;
        return false;
      });

      if (foundF) {
        cod = foundF.internal_number || cod;
        ppu = foundF.plate || ppu;
      }

      // Destino: Buscar en paradas la comuna/destino más lejano o tomar destino de la ruta
      let destino = (r.destino || '').trim();
      if (r.paradas && r.paradas.length > 0) {
        const lastP = r.paradas[r.paradas.length - 1];
        destino = lastP.comuna || lastP.destino || destino;
      }
      if (!destino && r.nombreRuta) {
        destino = r.nombreRuta;
      }
      if (!destino) {
        destino = 'SANTIAGO';
      }

      // Llave única para persistencia del teléfono
      const phoneKey = `${activeDate}_${r.ruta}_${cName || idx}`;
      const defaultPhone = phones[phoneKey] !== undefined ? phones[phoneKey] : (condStaff?.phone || '');

      return {
        id: r.id || `${r.ruta}_${idx}`,
        fecha: activeDate,
        ruta: r.ruta || `R-${idx + 1}`,
        destino: String(destino).toUpperCase().trim(),
        cod: cod || '-',
        ppu: ppu || '-',
        conductorNombre: cName ? cName.toUpperCase() : 'SIN CONDUCTOR',
        conductorRut: condStaff?.rut || r.conductor_rut || '-',
        auxiliarNombre: aName ? aName.toUpperCase() : '-',
        auxiliarRut: auxStaff?.rut || r.aux1_rut || '-',
        phoneKey,
        celular: defaultPhone
      };
    });
  }, [assignments, clientName, activeDate, fleetList, staffList, phones]);

  const isNewrest = clientName.toLowerCase().includes('newrest');
  const clientLogoUrl = isNewrest ? '/logos/newrest.png' : '/logos/juanvaldez.png';
  const clientDisplayName = isNewrest ? 'NEWREST' : 'JUAN VALDEZ';

  // Copiar Pase de Ingreso como Imagen / Tabla para pegar en WhatsApp o Excel
  const handleCopyImage = async () => {
    const toastId = toast.loading('Generando imagen del Pase de Ingreso...');
    try {
      const node = containerRef.current;
      if (!node) throw new Error('Contenedor no disponible');

      const html2canvas = await getHtml2Canvas();
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('No se pudo generar el archivo PNG');

      let copied = false;
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          copied = true;
        } catch (clipErr) {
          console.warn('Clipboard write error:', clipErr);
        }
      }

      if (copied) {
        toast.success(`¡Pase de Ingreso ${clientDisplayName} copiado como imagen! Listo para pegar con Ctrl+V.`, { id: toastId });
      } else {
        // Fallback: descargar
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Pases_Ingreso_${clientDisplayName}_${activeDate}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.info('Se descargó la imagen del Pase de Ingreso.', { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al generar imagen del Pase de Ingreso', { id: toastId });
    }
  };

  // Descargar Imagen PNG
  const handleDownloadImage = async () => {
    const toastId = toast.loading('Descargando imagen del Pase de Ingreso...');
    try {
      const node = containerRef.current;
      if (!node) throw new Error('Contenedor no disponible');

      const html2canvas = await getHtml2Canvas();
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Error al procesar canvas');

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Pases_Ingreso_${clientDisplayName}_${activeDate}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('¡Imagen descargada exitosamente!', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Error al descargar la imagen', { id: toastId });
    }
  };

  // Exportar Excel
  const handleExportExcel = () => {
    try {
      const exportData = rows.map(r => ({
        'Fecha': r.fecha,
        'Ruta': r.ruta,
        'Destino': r.destino,
        'Cod': r.cod,
        'PPU': r.ppu,
        'Nombre conductor': r.conductorNombre,
        'RUT conductor': r.conductorRut,
        'Nombre auxiliar': r.auxiliarNombre,
        'RUT auxiliar': r.auxiliarRut,
        'Celular': phones[r.phoneKey] || r.celular || ''
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Pase ${clientDisplayName}`);
      XLSX.writeFile(wb, `Pases_Ingreso_${clientDisplayName}_${activeDate}.xlsx`);
      toast.success('Pase de Ingreso exportado a Excel.');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar a Excel');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden flex flex-col space-y-3 p-4 shrink-0 transition-all animate-fadeIn">
      {/* Barra superior de herramientas del Pase de Ingreso */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 font-black text-xs">
            🎫
          </span>
          <div>
            <h3 className="text-sm font-black text-slate-800 tracking-wide flex items-center gap-2">
              Matriz de Pase de Ingreso · {clientDisplayName}
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {rows.length} camiones
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Despacho {activeDate} · Edita el número de celular directamente en cada fila
            </p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleCopyImage}
            className="flex items-center gap-1.5 text-xs font-bold h-8 px-3 bg-[#0a5c43] hover:bg-[#084935] text-white shadow-xs rounded-xl cursor-pointer"
            title="Copiar imagen del Pase de Ingreso para pegar en WhatsApp o Excel"
          >
            <Copy size={13} className="text-yellow-300" />
            <span>Copiar imagen</span>
          </Button>

          <Button
            onClick={handleDownloadImage}
            variant="outline"
            className="flex items-center gap-1.5 text-xs font-bold h-8 px-3 border-emerald-600/40 text-emerald-800 hover:bg-emerald-50 rounded-xl cursor-pointer"
            title="Descargar imagen PNG"
          >
            <Download size={13} />
            <span>Descargar imagen</span>
          </Button>

          <Button
            onClick={handleExportExcel}
            variant="outline"
            className="flex items-center gap-1.5 text-xs font-bold h-8 px-3 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl cursor-pointer"
            title="Exportar a Excel"
          >
            <Download size={13} />
            <span>Exportar Excel</span>
          </Button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer ml-1"
              title="Cerrar Pase de Ingreso"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Contenedor oficial renderizable (para exportar y ver) */}
      <div 
        ref={containerRef} 
        className="bg-white rounded-xl overflow-hidden border border-[#0a5c43]/30 shadow-sm"
      >
        {/* ENCABEZADO OFICIAL VERDE OSCURO (#0a5c43) */}
        <div className="bg-[#0a5c43] text-white px-5 py-3.5 flex items-center justify-between gap-4 select-none">
          {/* Logo Key Logistics Blanco a la izquierda */}
          <div className="flex items-center gap-2 shrink-0">
            <img 
              src="/logos/keylogistics-white.png" 
              alt="Key Logistics" 
              className="h-9 w-auto object-contain filter drop-shadow-xs"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="text-lg font-black tracking-wider text-white">
              Key <span className="font-light text-xs block -mt-1 tracking-widest text-emerald-200">logistics</span>
            </span>
          </div>

          {/* Título Central */}
          <div className="text-center flex-1">
            <h2 className="text-base sm:text-lg font-black tracking-widest text-white uppercase drop-shadow-xs">
              PASES DE INGRESO · {clientDisplayName}
            </h2>
          </div>

          {/* Logo Cliente + Fecha de Despacho a la derecha */}
          <div className="flex items-center gap-3 shrink-0">
            <img 
              src={clientLogoUrl} 
              alt={clientDisplayName} 
              className="h-9 w-auto object-contain bg-white/10 rounded-md p-0.5 filter drop-shadow-xs"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="h-6 w-px bg-emerald-400/50 hidden sm:block" />
            <div className="text-right">
              <span className="text-[11px] font-bold text-white tracking-wide block">
                Despacho {activeDate}
              </span>
            </div>
          </div>
        </div>

        {/* TABLA DE PASES DE INGRESO */}
        <div className="overflow-x-auto">
          <table ref={matrixTableRef} className="w-full text-xs text-left border-collapse whitespace-nowrap">
            <thead className="bg-[#0b5c3d] text-white font-bold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2.5 border-r border-emerald-700/60 text-center min-w-[85px]">Fecha</th>
                <th className="px-3 py-2.5 border-r border-emerald-700/60 text-center min-w-[70px]">Ruta</th>
                <th className="px-3.5 py-2.5 border-r border-emerald-700/60 text-left min-w-[120px]">Destino</th>
                <th className="px-3 py-2.5 border-r border-emerald-700/60 text-center min-w-[65px]">Cod</th>
                <th className="px-3 py-2.5 border-r border-emerald-700/60 text-center min-w-[85px]">PPU</th>
                <th className="px-4 py-2.5 border-r border-emerald-700/60 text-left min-w-[190px]">Nombre conductor</th>
                <th className="px-3 py-2.5 border-r border-emerald-700/60 text-center min-w-[110px]">RUT conductor</th>
                <th className="px-4 py-2.5 border-r border-emerald-700/60 text-left min-w-[190px]">Nombre auxiliar</th>
                <th className="px-3 py-2.5 border-r border-emerald-700/60 text-center min-w-[110px]">RUT auxiliar</th>
                <th className="px-3.5 py-2.5 text-left min-w-[140px]">Celular</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-emerald-100 text-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-10 text-center text-slate-400 bg-emerald-50/20">
                    <p className="font-semibold text-xs">
                      No hay rutas asignadas para {clientDisplayName} en la fecha {activeDate}
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => {
                  const isZebra = idx % 2 === 1;
                  const rowBg = isZebra ? 'bg-[#f0f9f4]' : 'bg-white';

                  return (
                    <tr key={r.id} className={`${rowBg} hover:bg-emerald-100/50 transition-colors`}>
                      {/* Fecha */}
                      <td className="px-3 py-2.5 text-center font-mono border-r border-emerald-100 text-slate-700 font-semibold">
                        {r.fecha}
                      </td>

                      {/* Ruta */}
                      <td className="px-3 py-2.5 text-center font-mono font-black border-r border-emerald-100 text-emerald-900 bg-emerald-50/40">
                        {r.ruta}
                      </td>

                      {/* Destino */}
                      <td className="px-3.5 py-2.5 font-bold uppercase border-r border-emerald-100 text-slate-900 tracking-wide">
                        {r.destino}
                      </td>

                      {/* Cod (N° Interno en gestión flota) */}
                      <td className="px-3 py-2.5 text-center font-mono font-black border-r border-emerald-100 text-slate-900">
                        {r.cod}
                      </td>

                      {/* PPU (Patente en gestión flota) */}
                      <td className="px-3 py-2.5 text-center font-mono font-bold uppercase border-r border-emerald-100 text-slate-800">
                        {r.ppu}
                      </td>

                      {/* Nombre conductor */}
                      <td className="px-4 py-2.5 font-semibold uppercase border-r border-emerald-100 text-slate-900">
                        {r.conductorNombre}
                      </td>

                      {/* RUT conductor */}
                      <td className="px-3 py-2.5 text-center font-mono font-medium border-r border-emerald-100 text-slate-700">
                        {r.conductorRut}
                      </td>

                      {/* Nombre auxiliar */}
                      <td className="px-4 py-2.5 font-semibold uppercase border-r border-emerald-100 text-slate-900">
                        {r.auxiliarNombre}
                      </td>

                      {/* RUT auxiliar */}
                      <td className="px-3 py-2.5 text-center font-mono font-medium border-r border-emerald-100 text-slate-700">
                        {r.auxiliarRut}
                      </td>

                      {/* Celular (editable de momento) */}
                      <td className="px-3.5 py-1.5 text-left">
                        <div className="flex items-center gap-1.5 bg-white/80 border border-emerald-200/80 rounded-lg px-2 py-1 focus-within:ring-2 focus-within:ring-emerald-400 focus-within:border-emerald-500 shadow-2xs">
                          <Phone size={11} className="text-emerald-600 shrink-0" />
                          <input
                            type="text"
                            value={phones[r.phoneKey] !== undefined ? phones[r.phoneKey] : r.celular}
                            onChange={(e) => handlePhoneChange(r.phoneKey, e.target.value)}
                            placeholder="+56 9..."
                            className="bg-transparent text-xs font-mono font-semibold text-slate-800 w-full outline-none"
                            title="Editar número de celular"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PIE DE TABLA OFICIAL */}
        <div className="bg-slate-50 border-t border-emerald-100 px-5 py-2.5 flex items-center justify-between text-xs text-slate-600 font-semibold">
          <span>{rows.length} camión(es) con pase de ingreso</span>
          <span className="text-slate-400 font-medium">Keylogistics · Planificación</span>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Download, Copy, X, Check, Phone, ArrowLeft, Image as ImageIcon, 
  Plus, Trash2, Search, RotateCcw, Truck, User, CheckSquare, Square
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Button } from './ui/Button';
import getHtml2Canvas from '../lib/html2canvasWrapper';

/**
 * Rutas oficiales asignadas a Pase de Ingreso Newrest:
 * 4126, 4127, 4128, 5033, 7561, 5080, 5061, 4112, 4113, 
 * 4100 al 4111, 4200 al 4202, 7513
 */
export const NEWREST_PASE_ROUTES = new Set([
  '4126', '4127', '4128',
  '5033',
  '7561',
  '5080', '5061',
  '4112', '4113',
  '4100', '4101', '4102', '4103', '4104', '4105', '4106', '4107', '4108', '4109', '4110', '4111',
  '4200', '4201', '4202',
  '7513'
]);

/**
 * Rutas oficiales asignadas a Pase de Ingreso Juan Valdez:
 * 3200 al 3230
 * 6301 al 6352
 * 6355 al 6358
 */
export const JUAN_VALDEZ_PASE_ROUTES = new Set([
  // 3200 al 3230
  '3200', '3201', '3202', '3203', '3204', '3205', '3206', '3207', '3208', '3209', '3210',
  '3211', '3212', '3213', '3214', '3215', '3216', '3217', '3218', '3219', '3220',
  '3221', '3222', '3223', '3224', '3225', '3226', '3227', '3228', '3229', '3230',
  // 6301 al 6352
  '6301', '6302', '6303', '6304', '6305', '6306', '6307', '6308', '6309', '6310',
  '6311', '6312', '6313', '6314', '6315', '6316', '6317', '6318', '6319', '6320',
  '6321', '6322', '6323', '6324', '6325', '6326', '6327', '6328', '6329', '6330',
  '6331', '6332', '6333', '6334', '6335', '6336', '6337', '6338', '6339', '6340',
  '6341', '6342', '6343', '6344', '6345', '6346', '6347', '6348', '6349', '6350',
  '6351', '6352',
  // 6355 al 6358
  '6355', '6356', '6357', '6358'
]);

// Helper para comparar ruta con sets tolerando ceros a la izquierda
const matchRuta = (set, raw) => {
  if (!raw) return false;
  const s = String(raw).trim();
  if (set.has(s)) return true;
  const noZero = s.replace(/^0+/, '');
  if (noZero && set.has(noZero)) return true;
  return false;
};

/**
 * Matriz "Pase de Ingreso" para Juan Valdez y Newrest
 * Soporta personalización dinámica (agregar o quitar rutas disponibilizadas) con persistencia local.
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

  // Clave de almacenamiento para rutas agregadas/quitadas manualmente del Pase de Ingreso
  const clientKey = clientName.toLowerCase().includes('newrest') ? 'newrest' : 'juanvaldez';
  const customRoutesKey = `keylogistics_pase_custom_routes_${clientKey}_${activeDate}`;

  const [customRouteMods, setCustomRouteMods] = useState(() => {
    try {
      const saved = localStorage.getItem(customRoutesKey);
      return saved ? JSON.parse(saved) : { added: [], removed: [] };
    } catch {
      return { added: [], removed: [] };
    }
  });

  // Guardar modificaciones en localStorage
  const updateCustomMods = (newMods) => {
    setCustomRouteMods(newMods);
    try {
      localStorage.setItem(customRoutesKey, JSON.stringify(newMods));
    } catch (e) {
      console.error('Error saving custom routes:', e);
    }
  };

  // Estado del modal para agregar rutas
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addSearchTerm, setAddSearchTerm] = useState('');
  const [selectedToAddRutas, setSelectedToAddRutas] = useState([]);

  // Normalizar datos de filas para la matriz de Pases de Ingreso
  const rows = useMemo(() => {
    const isNewrest = clientName.toLowerCase().includes('newrest');
    const isJV = clientName.toLowerCase().includes('juan') || clientName.toLowerCase().includes('valdez');

    // Determinar si una ruta pertenece por defecto al cliente según el listado oficial
    const isDefaultClientRoute = (r) => {
      const rutaRaw = String(r.ruta || '').trim();
      const combined = [
        r.cliente,
        r.operacion,
        r.Operacion,
        r.nombreRuta,
        r.denominacion,
        r.servicio
      ].filter(Boolean).join(' ').toLowerCase();

      if (isNewrest) {
        if (matchRuta(NEWREST_PASE_ROUTES, rutaRaw)) return true;
        return combined.includes('newrest');
      }
      if (isJV) {
        if (matchRuta(JUAN_VALDEZ_PASE_ROUTES, rutaRaw)) return true;
        return combined.includes('juan') || combined.includes('valdez');
      }
      return combined.includes(clientName.toLowerCase());
    };

    // Filtrar rutas de assignments considerando agregadas y quitadas
    const clientAssignments = (assignments || []).filter(r => {
      const rutaStr = String(r.ruta || '').trim();
      const rId = String(r.id || rutaStr);

      // Si fue agregada manualmente por el usuario
      if ((customRouteMods.added || []).includes(rId) || (customRouteMods.added || []).includes(rutaStr)) {
        return true;
      }
      // Si fue quitada manualmente por el usuario
      if ((customRouteMods.removed || []).includes(rId) || (customRouteMods.removed || []).includes(rutaStr)) {
        return false;
      }
      // Por defecto según la lista oficial
      return isDefaultClientRoute(r);
    });

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
        celular: defaultPhone,
        rawRoute: r
      };
    });
  }, [assignments, clientName, activeDate, fleetList, staffList, phones, customRouteMods]);

  // Quitar una ruta del pase
  const handleRemoveRoute = (rutaStr, rowId) => {
    const rKey = String(rutaStr || rowId).trim();
    const idKey = String(rowId || '').trim();
    const updated = {
      added: (customRouteMods.added || []).filter(k => k !== rKey && k !== idKey),
      removed: Array.from(new Set([...(customRouteMods.removed || []), rKey, ...(idKey ? [idKey] : [])]))
    };
    updateCustomMods(updated);
    toast.info(`Ruta ${rKey} quitada del Pase de Ingreso`);
  };

  // Rutas disponibles para agregar: todas las rutas disponibilizadas de la fecha que NO estén en el pase actual
  const currentRutaSet = useMemo(() => {
    return new Set(rows.map(r => String(r.ruta).trim()));
  }, [rows]);

  const availableToAdd = useMemo(() => {
    return (assignments || []).filter(r => {
      const rutaStr = String(r.ruta || '').trim();
      return rutaStr && !currentRutaSet.has(rutaStr);
    });
  }, [assignments, currentRutaSet]);

  const filteredAvailableToAdd = useMemo(() => {
    if (!addSearchTerm.trim()) return availableToAdd;
    const term = addSearchTerm.toLowerCase();
    return availableToAdd.filter(r => {
      const text = [
        r.ruta, 
        r.cliente, 
        r.operacion, 
        r.conductor_name, 
        r.camion, 
        r.patente, 
        r.destino, 
        r.nombreRuta
      ].filter(Boolean).join(' ').toLowerCase();
      return text.includes(term);
    });
  }, [availableToAdd, addSearchTerm]);

  // Confirmar agregar rutas seleccionadas
  const handleConfirmAddRoutes = () => {
    if (selectedToAddRutas.length === 0) return;
    const updated = {
      removed: (customRouteMods.removed || []).filter(k => !selectedToAddRutas.includes(k)),
      added: Array.from(new Set([...(customRouteMods.added || []), ...selectedToAddRutas]))
    };
    updateCustomMods(updated);
    toast.success(`${selectedToAddRutas.length} ruta(s) agregada(s) al Pase de Ingreso`);
    setSelectedToAddRutas([]);
    setIsAddModalOpen(false);
    setAddSearchTerm('');
  };

  // Agregar una ruta individualmente
  const handleAddSingleRoute = (rutaStr) => {
    const updated = {
      removed: (customRouteMods.removed || []).filter(k => k !== rutaStr),
      added: Array.from(new Set([...(customRouteMods.added || []), rutaStr]))
    };
    updateCustomMods(updated);
    toast.success(`Ruta ${rutaStr} agregada al Pase de Ingreso`);
  };

  // Restablecer a las rutas por defecto
  const handleResetRoutes = () => {
    updateCustomMods({ added: [], removed: [] });
    toast.info('Se restablecieron las rutas predeterminadas del Pase de Ingreso');
  };

  const isNewrest = clientName.toLowerCase().includes('newrest');
  const clientLogoUrl = isNewrest ? '/logos/newrest.png' : '/logos/juanvaldez.png';
  const clientDisplayName = isNewrest ? 'NEWREST' : 'JUAN VALDEZ';

  // Copiar Pase de Ingreso como Imagen (omitiendo controles de acción mediante clase .no-export)
  const handleCopyImage = async () => {
    const toastId = toast.loading('Generando imagen del Pase de Ingreso...');
    try {
      const node = containerRef.current;
      if (!node) throw new Error('Contenedor no disponible');

      const html2canvas = await getHtml2Canvas();
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        ignoreElements: (element) => element?.classList?.contains('no-export')
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
        backgroundColor: '#ffffff',
        ignoreElements: (element) => element?.classList?.contains('no-export')
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

  const hasModifications = (customRouteMods.added || []).length > 0 || (customRouteMods.removed || []).length > 0;

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
          {/* Botón Agregar Rutas Disponibilizadas */}
          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs rounded-xl cursor-pointer"
            title="Agregar rutas ya disponibilizadas a este Pase de Ingreso"
          >
            <Plus size={13} className="text-yellow-300" />
            <span>Agregar Rutas ({availableToAdd.length})</span>
          </Button>

          {/* Botón Restablecer si hay modificaciones */}
          {hasModifications && (
            <button
              type="button"
              onClick={handleResetRoutes}
              className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 hover:text-red-700 bg-emerald-50 hover:bg-red-50 border border-emerald-300/80 px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
              title="Restablecer rutas por defecto del cliente"
            >
              <RotateCcw size={11} />
              <span>Restablecer</span>
            </button>
          )}

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
                <th className="px-2 py-2.5 text-center min-w-[50px] no-export border-l border-emerald-700/60">Quitar</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-emerald-100 text-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-400 bg-emerald-50/20">
                    <p className="font-semibold text-xs">
                      No hay rutas asignadas para {clientDisplayName} en la fecha {activeDate}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Usa el botón "+ Agregar Rutas" para incorporar rutas disponibilizadas a este pase.
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

                      {/* Celular (editable persistente) */}
                      <td className="px-3.5 py-1.5 text-left border-r border-emerald-100">
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

                      {/* Acción Quitar (no visible en exportaciones) */}
                      <td className="px-2 py-1.5 text-center no-export">
                        <button
                          type="button"
                          onClick={() => handleRemoveRoute(r.ruta, r.id)}
                          className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title={`Quitar ruta ${r.ruta} del Pase de Ingreso`}
                        >
                          <Trash2 size={13} />
                        </button>
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

      {/* MODAL: Agregar Rutas Disponibilizadas al Pase de Ingreso */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full flex flex-col max-h-[85vh] overflow-hidden">
            {/* Cabecera del modal */}
            <div className="bg-[#0a5c43] text-white p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                  <Plus size={18} className="text-yellow-300" />
                </div>
                <div>
                  <h3 className="font-black text-sm uppercase tracking-wide">
                    Agregar Rutas al Pase · {clientDisplayName}
                  </h3>
                  <p className="text-[11px] text-emerald-100">
                    Selecciona rutas ya disponibilizadas para el {activeDate} ({availableToAdd.length} disponibles)
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setSelectedToAddRutas([]);
                  setAddSearchTerm('');
                }}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Barra de búsqueda y selección rápida */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por ruta, conductor, camión, destino..."
                  value={addSearchTerm}
                  onChange={(e) => setAddSearchTerm(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedToAddRutas(filteredAvailableToAdd.map(r => String(r.ruta || r.id).trim()))}
                  className="text-emerald-700 hover:underline font-bold text-[11px]"
                >
                  Seleccionar todas ({filteredAvailableToAdd.length})
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedToAddRutas([])}
                  className="text-slate-400 hover:text-red-600 hover:underline text-[11px]"
                >
                  Limpiar
                </button>
              </div>
            </div>

            {/* Lista de rutas */}
            <div className="flex-1 overflow-auto p-3">
              {filteredAvailableToAdd.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <p className="text-xs font-semibold">
                    {availableToAdd.length === 0 
                      ? 'Todas las rutas disponibilizadas ya están en el Pase de Ingreso' 
                      : 'No se encontraron rutas con el filtro de búsqueda'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredAvailableToAdd.map((r, idx) => {
                    const rKey = String(r.ruta || r.id).trim();
                    const isSelected = selectedToAddRutas.includes(rKey);
                    return (
                      <div
                        key={r.id || `${r.ruta}_${idx}`}
                        onClick={() => {
                          setSelectedToAddRutas(prev => 
                            prev.includes(rKey) ? prev.filter(k => k !== rKey) : [...prev, rKey]
                          );
                        }}
                        className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-emerald-50/80 border-emerald-300 shadow-2xs' 
                            : 'bg-white hover:bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // controlado por el contenedor
                            className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                          />
                          <span className="font-mono font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md text-xs shrink-0">
                            {r.ruta}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 truncate text-[11px]">
                              {r.conductor_name || 'Sin conductor'}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">
                              Camión: <span className="font-semibold text-slate-600">{r.camion || r.patente || '-'}</span> · Destino: <span className="font-medium text-slate-600">{r.destino || r.nombreRuta || '-'}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            {r.cliente || r.operacion || 'Sin cliente'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddSingleRoute(rKey);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            + Agregar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer del modal */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 font-medium">
                {selectedToAddRutas.length} ruta(s) seleccionada(s)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setSelectedToAddRutas([]);
                  }}
                  className="text-xs h-8 px-3"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmAddRoutes}
                  disabled={selectedToAddRutas.length === 0}
                  className="bg-[#0a5c43] hover:bg-[#084935] text-white font-bold text-xs h-8 px-3.5 disabled:opacity-50"
                >
                  Agregar seleccionadas ({selectedToAddRutas.length})
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

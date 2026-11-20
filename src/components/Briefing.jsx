import React, { useState, useMemo, useRef } from 'react';
import { 
  Calendar, Download, Search, Filter, Layers, Truck, 
  Package, Scale, Snowflake, Thermometer, Wind, 
  MapPin, AlertCircle, FileSpreadsheet, Building2, Copy,
  Edit3, RotateCcw, X, Check, ChevronDown, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { usePlanningStore, normalizeDate, sortDatesDescending, getMostRecentDate } from '../store/planningStore';
import { useFleetStore, isVehicleExternal } from '../store/fleetStore';
import { useStaffStore, isStaffExternal } from '../store/staffStore';
import { 
  findOperationForRoute, 
  getOperacionName, 
  ALL_OPERACIONES, 
  canonicalizeOperation,
  isFiveDigitRoute,
  isAramarkFixedRoute,
  resolveOperationByTransportistaAndOwner,
  PETROLERAS_TRANSPORTISTAS,
  PETROLERAS_SUBCATEGORIES,
  TRANSPORTISTA_MASTER_INFO
} from '../data/operacionesMaster';
import { Button } from './ui/Button';
import { copyBriefingAsImage } from '../lib/matrixImageExporter';
import PaseIngresoMatrix, { NEWREST_PASE_ROUTES, JUAN_VALDEZ_PASE_ROUTES } from './PaseIngresoMatrix';
import DriveTimeMachineButton from './DriveTimeMachineButton';

// Limpia de la operación la denominación "RUTA ENVÍOS" más el número y conectores sobrantes
export const cleanBriefingOperationName = (name) => {
  if (!name) return '';
  let str = String(name);
  // Elimina "RUTA ENVÍOS", "RUTA ENVIOS", "RUTA ENVÍO", "RUTA ENVIO" más números opcionales
  str = str.replace(/RUTA\s+ENV[ÍI]OS?\s*\d*/gi, '');
  // Limpia conectores sueltos al inicio o final (guiones, barras, espacios múltiples)
  str = str.replace(/^\s*[-–—/:]+\s*/, '')
           .replace(/\s*[-–—/:]+\s*$/, '')
           .replace(/\s{2,}/g, ' ')
           .trim();
  return str;
};

// Verifica si la fila o servicio corresponde a "Traspaso" sin considerar "Aramark" o "Centralizado"
export const isTraspasoExcluded = (route) => {
  if (!route) return false;
  const combined = [
    route.cliente,
    route.servicio,
    route.operacion,
    route.Operacion,
    route.nombreRuta,
    route.denominacion,
    route.ruta
  ].filter(Boolean).join(' ').toLowerCase();

  const hasTraspaso = combined.includes('traspaso');
  const hasAramarkOrCentralizado = combined.includes('aramark') || combined.includes('centralizado') || combined.includes('megafrio');

  // Si contiene Traspaso y NO contiene Aramark ni Centralizado, se excluye
  if (hasTraspaso && !hasAramarkOrCentralizado) {
    return true;
  }
  return false;
};

// Normalizador de Operación / Cliente para agrupar exactamente como en el Briefing oficial
export const getBriefingOperation = (route) => {
  if (!route) return 'Otros';
  const rawClient = String(route.cliente || route.servicio || route.Operacion || '').trim();
  const rawRuta = String(route.ruta || '').trim();
  const rawDenom = String(route.denominacion || route.nombreRuta || '').trim();
  const rawOp = String(route.operacion || '').trim();
  const rawOwner = String(route.owner || '').trim().toUpperCase();
  const rawTransp = String(route.codigo_transportista || route.transportista || '').trim().toUpperCase();

  // 1. Aramark tiene ruta fija 8360 y 1962 -> se considera como Centralizado en Briefing
  if (isAramarkFixedRoute(rawRuta) || rawTransp === 'T503') {
    return 'Centralizado';
  }
  const anyCentralizado = [rawRuta, rawClient, rawDenom, rawOp].some(val => {
    const s = String(val || '').trim().toUpperCase();
    return s.includes('ARAMARK') || s.includes('CENTRALIZADO') || s.includes('MEGAFRIO');
  });
  if (anyCentralizado) return 'Centralizado';

  // 2. Juan Valdez: Owner C31274 (si es reparto es T313 y centralizado T604, ambos son Juan Valdez en Briefing)
  const cleanRutaStr = rawRuta.replace(/^0+/, '');
  const baseRuta = cleanRutaStr.split(/[-_]/)[0];
  if (
    rawOwner === 'C31274' ||
    rawTransp === 'T313' ||
    JUAN_VALDEZ_PASE_ROUTES.has(rawRuta) ||
    (cleanRutaStr && JUAN_VALDEZ_PASE_ROUTES.has(cleanRutaStr)) ||
    /^(32|63)\d{2}$/.test(baseRuta)
  ) {
    return 'Juan Valdez';
  }
  const anyJuanValdez = [rawClient, rawDenom, rawOp].some(val => {
    const s = String(val || '').trim().toUpperCase();
    return s.includes('JUAN VALDEZ') || s.includes('CAFEXPRESS');
  });
  if (anyJuanValdez) return 'Juan Valdez';

  // 3. Sbarro Copec (T311)
  if (rawTransp === 'T311') return 'Sbarro';
  const anySbarro = [rawRuta, rawClient, rawDenom, rawOp].some(val => {
    const s = String(val || '').trim().toUpperCase();
    return s.includes('SBARRO');
  });
  if (anySbarro) return 'Sbarro';

  // 4. SPID explícito (debe evaluarse antes que T300 por defecto de ensureRowTransportista)
  if (rawClient.toUpperCase().includes('SPID') || rawRuta.toUpperCase().includes('SPID') || rawOp.toUpperCase().includes('SPID')) {
    return 'SPID';
  }

  // 5. Petroleras: considera T300, T302 y T312
  const transpCodes = rawTransp.match(/T\d{3}/g) || [];
  if (transpCodes.length > 0 && transpCodes.every(c => PETROLERAS_TRANSPORTISTAS.includes(c))) {
    return 'PETROLERAS';
  }
  const anyPetroleras = [rawRuta, rawClient, rawDenom, rawOp].some(val => {
    const s = String(val || '').trim().toUpperCase();
    return s.startsWith('RUTA FAST FOOD') || s.startsWith('FAST FOOD') || s.includes('FAST FOOD') ||
           s.includes('PETROLER') || s.includes('ENEX') ||
           s.includes('FRANQUICIA COPEC') || s.includes('COPEC');
  });
  if (anyPetroleras) return 'PETROLERAS';

  // 6. Las rutas que comienzan con "ESPECIALES CARLS " dentro de "Carls Jr"
  if (rawTransp === 'T305') return 'Carls Jr';
  const anyCarls = [rawRuta, rawClient, rawDenom, rawOp].some(val => {
    const s = String(val || '').trim().toUpperCase();
    return s.startsWith('ESPECIALES CARLS') || s.startsWith('ESPECIAL CARLS') || s.includes('ESPECIALES CARLS') || s.includes('CARLS');
  });
  if (anyCarls) return 'Carls Jr';

  // 7. Las rutas que parten con "SBW " dentro de "Subway"
  if (rawTransp === 'T310') return 'Subway';
  const anySbw = [rawRuta, rawClient, rawDenom, rawOp].some(val => {
    const s = String(val || '').trim().toUpperCase();
    return s.startsWith('SBW') || s.includes('SBW REDESPACHO') || s.startsWith('SUBWAY') || s.includes('SUBWAY');
  });
  if (anySbw) return 'Subway';

  // 8. Las rutas que parten con 1500 a 1549 o T400 son consideradas con el cliente "El Golfo"
  const rutaNum = parseInt(rawRuta.replace(/\D/g, ''), 10);
  if (rawTransp === 'T400' || (!isNaN(rutaNum) && rutaNum >= 1500 && rutaNum <= 1549)) {
    return 'El Golfo';
  }

  // 8b. Pedidos Ya: rutas 3901 a 3910 o transportista T411
  if (rawTransp === 'T411' || (!isNaN(rutaNum) && rutaNum >= 3901 && rutaNum <= 3910)) {
    return 'Pedidos Ya';
  }
  const anyPedidosYa = [rawRuta, rawClient, rawDenom, rawOp].some(val => {
    return String(val || '').trim().toUpperCase().includes('PEDIDOS YA');
  });
  if (anyPedidosYa) return 'Pedidos Ya';

  // 9. Rutas explícitas de Newrest para Pase de Ingreso y Briefing
  if (NEWREST_PASE_ROUTES.has(rawRuta) || (cleanRutaStr && NEWREST_PASE_ROUTES.has(cleanRutaStr)) || rawTransp === 'T502') {
    return 'Newrest ByI';
  }

  // 10. Si tiene transportista único en catálogo maestro
  if (transpCodes.length === 1 && TRANSPORTISTA_MASTER_INFO[transpCodes[0]]) {
    return TRANSPORTISTA_MASTER_INFO[transpCodes[0]].operacion;
  }

  let op = '';
  // Si la ruta ya tiene operacion oficial asignada (y no es genérica MULTIRUTA)
  if (route.operacion && route.operacion !== 'Sin Operación' && !/MULTIRUTA/i.test(route.operacion)) {
    op = cleanBriefingOperationName(route.operacion);
  }

  // Buscar en el catálogo maestro por número de ruta
  if (!op && rawRuta) {
    const master = findOperationForRoute(rawRuta);
    if (master && master.operacion && master.operacion !== 'Sin Operación') {
      op = cleanBriefingOperationName(master.operacion);
    }
  }

  if (!op) {
    const candidate = route.denominacion || route.nombreRuta || rawClient || '';
    if (!/MULTIRUTA/i.test(candidate)) {
      const cleanedCandidate = cleanBriefingOperationName(candidate);
      op = getOperacionName(rawRuta, cleanedCandidate || candidate || 'Otros', rawTransp, rawOwner);
      op = cleanBriefingOperationName(op);
    }
  }

  return op || 'Otros';
};

// Clasifica una parada individual para el Briefing (y detecta sub-categoría T300, T302 o T312 en Petroleras)
export const classifyParadaForBriefing = (parada, parentRoute = {}) => {
  const rawRuta = String(parentRoute?.ruta || '').trim();
  const cleanRutaStr = rawRuta.replace(/^0+/, '');
  const baseRuta = cleanRutaStr.split(/[-_]/)[0];
  const pTransp = String(parada?.transportista || '').trim().toUpperCase();
  const pOwner = String(parada?.owner || parentRoute?.owner || '').trim().toUpperCase();

  // 1. Aramark rutas fijas 8360 y 1962 o T503 -> Centralizado
  if (isAramarkFixedRoute(rawRuta) || pTransp === 'T503') {
    return { operacion: 'Centralizado', subCatCode: null };
  }

  // 1b. SPID explícito (prioritario sobre T300 por defecto)
  const parentClient = String(parentRoute?.cliente || parentRoute?.servicio || parentRoute?.operacion || '').toUpperCase();
  if (parentClient.includes('SPID') || rawRuta.toUpperCase().includes('SPID')) {
    return { operacion: 'SPID', subCatCode: null };
  }

  // 1c. Si el destino de la parada indica explícitamente Streat Burger (aunque venga con T313/C31274)
  if (String(parada?.destino || '').toUpperCase().includes('STREAT')) {
    return { operacion: 'Streat Burguer', subCatCode: null };
  }

  // 2. Juan Valdez: Owner C31274 (reparto T313 o centralizado T604) o T313 directo
  if (pOwner === 'C31274' && (pTransp === 'T313' || pTransp === 'T604' || !pTransp)) {
    return { operacion: 'Juan Valdez', subCatCode: null };
  }
  if (pTransp === 'T313') {
    return { operacion: 'Juan Valdez', subCatCode: null };
  }
  if (pTransp === 'T604') {
    const combinedText = [
      parentRoute?.cliente,
      parentRoute?.operacion,
      parentRoute?.nombreRuta,
      parentRoute?.denominacion,
      parada?.destino
    ].filter(Boolean).join(' ').toUpperCase();

    if (
      pOwner === 'C31274' ||
      /^(32|63)\d{2}$/.test(baseRuta) ||
      JUAN_VALDEZ_PASE_ROUTES.has(rawRuta) ||
      (cleanRutaStr && JUAN_VALDEZ_PASE_ROUTES.has(cleanRutaStr)) ||
      combinedText.includes('JUAN VALDEZ') ||
      combinedText.includes('CAFEXPRESS')
    ) {
      return { operacion: 'Juan Valdez', subCatCode: null };
    }
    return { operacion: 'Centralizado', subCatCode: null };
  }

  // 3. Petroleras desglosado en T300, T302 y T312
  if (PETROLERAS_TRANSPORTISTAS.includes(pTransp)) {
    return { operacion: 'PETROLERAS', subCatCode: pTransp };
  }

  // 4. Sbarro Copec (T311)
  if (pTransp === 'T311') {
    return { operacion: 'Sbarro', subCatCode: null };
  }

  // 5. Resto de transportistas del catálogo maestro (T301, T305, T306, T307, T310, T400, T404, T405, T408, T411, T500, T501, T502, T505)
  if (TRANSPORTISTA_MASTER_INFO[pTransp]) {
    return { operacion: TRANSPORTISTA_MASTER_INFO[pTransp].operacion, subCatCode: null };
  }

  // 6. Fallback a nivel de ruta si la parada no trae Txxx
  const routeOp = getBriefingOperation(parentRoute);
  if (routeOp === 'PETROLERAS') {
    const rCodes = String(parentRoute?.codigo_transportista || parentRoute?.transportista || '').toUpperCase().match(/T\d{3}/g) || [];
    const matchedSub = rCodes.find(c => PETROLERAS_TRANSPORTISTAS.includes(c)) || 'T300';
    return { operacion: 'PETROLERAS', subCatCode: matchedSub };
  }
  return { operacion: routeOp, subCatCode: null };
};

export const normalizeClientForBriefing = (rawName) => {
  if (!rawName) return 'OTROS';
  const upper = String(rawName).toUpperCase().trim();
  if (upper === '8360' || upper === '1962' || upper.includes('ARAMARK') || upper.includes('CENTRALIZADO') || upper.includes('MEGAFRIO')) return 'Centralizado';
  if (upper.includes('SBARRO')) return 'Sbarro';
  if (upper.startsWith('RUTA FAST FOOD') || upper.startsWith('FAST FOOD') || upper.includes('FAST FOOD') || upper.includes('PETROLER') || upper.includes('ENEX') || upper.includes('FRANQUICIA COPEC') || upper.includes('COPEC')) return 'PETROLERAS';
  if (upper.startsWith('ESPECIALES CARLS') || upper.startsWith('ESPECIAL CARLS') || upper.includes('ESPECIALES CARLS')) return 'Carls Jr';
  if (upper.startsWith('SBW') || upper.includes('SBW REDESPACHO') || upper.startsWith('SUBWAY')) return 'Subway';
  if (upper.includes('SPID')) return 'SPID';
  if (upper.includes('PEDIDOS YA')) return 'Pedidos Ya';
  const cleaned = cleanBriefingOperationName(rawName);
  return getOperacionName('', cleaned || rawName);
};

// Determina si una asignación corresponde a Flota Externa / Terceros
// Prioridad:
// 1. Si la dotación (conductor o auxiliares) es externa -> Terceros (independiente del camión).
// 2. Si el camión en fleetList es externo -> Terceros.
// 3. Si tanto camión como dotación están confirmados como propios en los catálogos -> Propia (ignora empresa_externa residual).
// 4. Fallbacks por prefijo de código externo, tipo_flota/empresa_externa y transportista.
export const isAssignmentExternal = (r, fleetList = [], staffList = []) => {
  if (!r) return false;

  // 1. Conductor y Auxiliares por RUT o etiquetas explícitas
  const condRut = String(r.conductor_rut || '').trim().toUpperCase();
  const aux1Rut = String(r.aux1_rut || '').trim().toUpperCase();
  const aux2Rut = String(r.aux2_rut || '').trim().toUpperCase();
  if (condRut.startsWith('EXT-') || aux1Rut.startsWith('EXT-') || aux2Rut.startsWith('EXT-')) {
    return true;
  }

  const condName = (r.conductor_name || '').trim();
  if (condName && /\[EXT-|\(EXT-|EXTERNO/i.test(condName)) return true;
  const aux1Name = (r.aux1_name || '').trim();
  if (aux1Name && /\[EXT-|\(EXT-|EXTERNO/i.test(aux1Name)) return true;
  const aux2Name = (r.aux2_name || '').trim();
  if (aux2Name && /\[EXT-|\(EXT-|EXTERNO/i.test(aux2Name)) return true;

  // 2. Conductor / Auxiliares en catálogo de staffList (si alguno es externo -> Terceros)
  let foundStaffCond = null;
  if (condName && staffList && staffList.length > 0) {
    foundStaffCond = staffList.find(s => s.name && s.name.trim().toLowerCase() === condName.toLowerCase());
    if (foundStaffCond && isStaffExternal(foundStaffCond)) return true;
  }
  let foundAux1 = null;
  if (aux1Name && staffList && staffList.length > 0) {
    foundAux1 = staffList.find(s => s.name && s.name.trim().toLowerCase() === aux1Name.toLowerCase());
    if (foundAux1 && isStaffExternal(foundAux1)) return true;
  }
  let foundAux2 = null;
  if (aux2Name && staffList && staffList.length > 0) {
    foundAux2 = staffList.find(s => s.name && s.name.trim().toLowerCase() === aux2Name.toLowerCase());
    if (foundAux2 && isStaffExternal(foundAux2)) return true;
  }

  // 3. Camión en catálogo de fleetList
  const camion = (r.camion || '').trim();
  const matchParen = camion.match(/^([^(]+)(?:\(([^)]+)\))?/);
  const cCode = (matchParen ? matchParen[1] : camion).trim().toLowerCase();
  const cPlate = (matchParen && matchParen[2] ? matchParen[2] : (r.patente || '')).trim().toLowerCase();

  let foundTruck = null;
  if (fleetList && fleetList.length > 0 && (cCode || cPlate)) {
    foundTruck = fleetList.find(f => {
      const fCode = (f.internal_number || '').trim().toLowerCase();
      const fPlate = (f.plate || '').trim().toLowerCase();
      if (cCode && fCode && (fCode === cCode || cCode.startsWith(fCode) || fCode.startsWith(cCode))) return true;
      if (cPlate && fPlate && fPlate === cPlate) return true;
      return false;
    });
    if (foundTruck) {
      if (isVehicleExternal(foundTruck)) return true;
      // Camión confirmado como Propio y dotación no es externa -> Flota Propia (Key)
      return false;
    }
  }

  // 4. Prefijos de códigos internos de vehículos externos conocidos (TL, FG, TF, TC, VL, CS, EM, EXT)
  if (/^(TL|FG|TF|TC|VL|CS|EM|EXT)\d+/i.test(cCode)) {
    return true;
  }

  // 5. Fallback a flags directos de la fila solo si el camión no fue confirmado como Propio en fleetList
  if (r.tipo_flota === 'Externa') return true;
  if (r.empresa_externa && String(r.empresa_externa).trim() !== '' && !foundStaffCond) return true;

  // 6. Transportista externo (no código interno T100..T604 ni Sin Transportista ni Key)
  const transp = (r.transportista || '').trim();
  if (transp && !/^T\d+$/i.test(transp) && transp.toLowerCase() !== 'sin transportista' && transp.toLowerCase() !== 'key') {
    if (foundStaffCond && !isStaffExternal(foundStaffCond)) {
      return false;
    }
    return true;
  }

  return false;
};

// Formateadores numéricos de estilo chileno
const formatInt = (num) => {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '';
  return Math.round(num).toLocaleString('de-DE');
};

const formatIntAlways = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Math.round(num).toLocaleString('de-DE');
};

const formatDecimal = (num) => {
  if (num === null || num === undefined || isNaN(num) || Math.abs(num) < 0.0001) return '';
  return Number(num).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDecimalAlways = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0,00';
  return Number(num).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Modal para Editar Datos Operacionales de SPID (Requisito 3)
function SpidEditModal({ isOpen, onClose, activeDate, currentData, onSave, onReset }) {
  if (!isOpen) return null;

  const [form, setForm] = useState({
    propia1v: currentData?.propia1v ?? 0,
    externa1v: currentData?.externa1v ?? 0,
    propia2v: currentData?.propia2v ?? 0,
    externa2v: currentData?.externa2v ?? 0,
    sinCobertura: currentData?.sinCobertura ?? 0,
    cajas: currentData?.cajas ?? 0,
    kilos: currentData?.kilos ?? 0,
    congeladoM3: currentData?.congeladoM3 ?? 0,
    refrigeradoM3: currentData?.refrigeradoM3 ?? 0,
    secoM3: currentData?.secoM3 ?? 0,
    volumenM3: currentData?.volumenM3 ?? 0,
    numDestinos: currentData?.numDestinos ?? 0,
  });

  React.useEffect(() => {
    if (isOpen) {
      setForm({
        propia1v: currentData?.propia1v ?? 0,
        externa1v: currentData?.externa1v ?? 0,
        propia2v: currentData?.propia2v ?? 0,
        externa2v: currentData?.externa2v ?? 0,
        sinCobertura: currentData?.sinCobertura ?? 0,
        cajas: currentData?.cajas ?? 0,
        kilos: currentData?.kilos ?? 0,
        congeladoM3: currentData?.congeladoM3 ?? 0,
        refrigeradoM3: currentData?.refrigeradoM3 ?? 0,
        secoM3: currentData?.secoM3 ?? 0,
        volumenM3: currentData?.volumenM3 ?? 0,
        numDestinos: currentData?.numDestinos ?? 0,
      });
    }
  }, [isOpen, currentData]);

  const handleChange = (field, val) => {
    setForm(prev => {
      const parsed = val === '' ? '' : (parseFloat(val) || 0);
      const next = { ...prev, [field]: parsed };
      if (field === 'congeladoM3' || field === 'refrigeradoM3' || field === 'secoM3') {
        const c = field === 'congeladoM3' ? (parseFloat(val) || 0) : (parseFloat(prev.congeladoM3) || 0);
        const r = field === 'refrigeradoM3' ? (parseFloat(val) || 0) : (parseFloat(prev.refrigeradoM3) || 0);
        const s = field === 'secoM3' ? (parseFloat(val) || 0) : (parseFloat(prev.secoM3) || 0);
        next.volumenM3 = Number((c + r + s).toFixed(2));
      }
      return next;
    });
  };

  const calculatedRutas = 
    (parseFloat(form.propia1v) || 0) + 
    (parseFloat(form.externa1v) || 0) + 
    (parseFloat(form.propia2v) || 0) + 
    (parseFloat(form.externa2v) || 0) + 
    (parseFloat(form.sinCobertura) || 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      propia1v: parseFloat(form.propia1v) || 0,
      externa1v: parseFloat(form.externa1v) || 0,
      propia2v: parseFloat(form.propia2v) || 0,
      externa2v: parseFloat(form.externa2v) || 0,
      sinCobertura: parseFloat(form.sinCobertura) || 0,
      numRutas: calculatedRutas,
      cajas: Math.round(parseFloat(form.cajas) || 0),
      kilos: Number((parseFloat(form.kilos) || 0).toFixed(2)),
      congeladoM3: Number((parseFloat(form.congeladoM3) || 0).toFixed(2)),
      refrigeradoM3: Number((parseFloat(form.refrigeradoM3) || 0).toFixed(2)),
      secoM3: Number((parseFloat(form.secoM3) || 0).toFixed(2)),
      volumenM3: Number((parseFloat(form.volumenM3) || 0).toFixed(2)),
      numDestinos: Math.round(parseFloat(form.numDestinos) || 0),
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-[#0B2545] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Edit3 size={18} className="text-amber-300" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide">Editar Métricas SPID</h2>
              <p className="text-[11px] text-blue-200">Fecha operativa: <span className="font-bold text-white">{activeDate}</span></p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
          {/* Sección 1: Flota y Vueltas */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-black text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Truck size={14} className="text-blue-600" />
                Flota y Vueltas
              </span>
              <span className="text-[11px] font-bold bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full">
                # Rutas: {calculatedRutas}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Real Key 1era V</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.propia1v}
                  onChange={e => handleChange('propia1v', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold font-mono text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Real Terceros 1era V</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.externa1v}
                  onChange={e => handleChange('externa1v', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold font-mono text-amber-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">2da V (Cubiertas Key)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.propia2v}
                  onChange={e => handleChange('propia2v', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold font-mono text-indigo-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">2da V (Terceros)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.externa2v}
                  onChange={e => handleChange('externa2v', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold font-mono text-amber-950 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Sin cobertura</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.sinCobertura}
                  onChange={e => handleChange('sinCobertura', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold font-mono text-red-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Sección 2: Carga y Entregas */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2.5">
            <span className="font-black text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Package size={14} className="text-emerald-600" />
              Carga y Entregas
            </span>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Cajas</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.cajas}
                  onChange={e => handleChange('cajas', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Kilos (Kg)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.kilos}
                  onChange={e => handleChange('kilos', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">N° Destinos</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.numDestinos}
                  onChange={e => handleChange('numDestinos', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Sección 3: Ambientes y Volumen */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2.5">
            <span className="font-black text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Snowflake size={14} className="text-cyan-600" />
              Ambientes y Volumen (m³)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Congelado m³</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.congeladoM3}
                  onChange={e => handleChange('congeladoM3', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold font-mono text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Refrigerado m³</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.refrigeradoM3}
                  onChange={e => handleChange('refrigeradoM3', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold font-mono text-cyan-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Seco m³</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.secoM3}
                  onChange={e => handleChange('secoM3', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold font-mono text-amber-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Volumen Total m³</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.volumenM3}
                  onChange={e => handleChange('volumenM3', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-black font-mono text-emerald-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Restablecer métricas manuales de SPID para esta fecha"
            >
              <RotateCcw size={13} />
              <span>Restablecer a cero</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-bold text-slate-600 hover:text-slate-800 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="text-xs font-bold bg-[#0B2545] hover:bg-[#133863] text-white px-4 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Check size={14} />
                <span>Guardar Datos SPID</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Briefing() {
  const { 
    transmittedAssignments, 
    savedRuteoByDate, 
    selectedDisponibilizarDate, 
    transformedRoutes,
    rawRows,
    initPlanningFromDb
  } = usePlanningStore();
  
  const { fleetList, fetchFleet } = useFleetStore();
  const { staffList, fetchStaff } = useStaffStore();

  React.useEffect(() => {
    initPlanningFromDb?.();
    fetchFleet?.();
    fetchStaff?.();
  }, [initPlanningFromDb, fetchFleet, fetchStaff]);

  // Fechas disponibles
  const availableDates = useMemo(() => {
    const dSet = new Set();
    const addDate = (d) => {
      if (!d) return;
      const normalized = normalizeDate(d);
      if (normalized && normalized !== 'Sin Fecha' && normalized !== 'undefined' && normalized !== 'null') {
        dSet.add(normalized);
      }
    };
    if (transmittedAssignments) Object.keys(transmittedAssignments).forEach(addDate);
    if (savedRuteoByDate) Object.keys(savedRuteoByDate).forEach(addDate);
    if (transformedRoutes) transformedRoutes.forEach(r => addDate(r.fecha));
    if (selectedDisponibilizarDate) addDate(selectedDisponibilizarDate);
    
    // Asegurar que la fecha operativa 28-10-2026 esté siempre disponible
    dSet.add('28-10-2026');

    return sortDatesDescending(Array.from(dSet));
  }, [transmittedAssignments, savedRuteoByDate, transformedRoutes, selectedDisponibilizarDate]);

  const [activeDate, setActiveDate] = useState(() => availableDates[0] || '28-10-2026');

  React.useEffect(() => {
    if (availableDates.length > 0 && (!activeDate || !availableDates.includes(activeDate))) {
      setActiveDate(availableDates[0]);
    }
  }, [availableDates, activeDate]);

  const [searchTerm, setSearchTerm] = useState('');
  // Multi-selección de Operaciones (Requisito 3)
  const [selectedOperations, setSelectedOperations] = useState([]);

  // Matriz de Pase de Ingreso para Juan Valdez y Newrest (Requisito 2)
  const [activePaseClient, setActivePaseClient] = useState(null);

  // Overrides manuales de SPID por fecha (Requisito 3)
  const [spidOverrides, setSpidOverrides] = useState(() => {
    try {
      const saved = localStorage.getItem('keylogistics_spid_briefing_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.warn('Error reading spidOverrides from localStorage:', e);
      return {};
    }
  });

  const [isSpidModalOpen, setIsSpidModalOpen] = useState(false);

  const handleSaveSpidData = (spidData) => {
    const norm = normalizeDate(activeDate);
    const updated = {
      ...spidOverrides,
      [norm]: {
        ...spidData,
        isEdited: true
      }
    };
    setSpidOverrides(updated);
    try {
      localStorage.setItem('keylogistics_spid_briefing_overrides', JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving spidOverrides to localStorage:', e);
    }
    toast.success(`Datos operacionales de SPID guardados para el ${norm}`);
    setIsSpidModalOpen(false);
  };

  const handleResetSpidData = () => {
    const norm = normalizeDate(activeDate);
    const updated = { ...spidOverrides };
    delete updated[norm];
    setSpidOverrides(updated);
    try {
      localStorage.setItem('keylogistics_spid_briefing_overrides', JSON.stringify(updated));
    } catch (e) {
      console.error('Error resetting spidOverrides:', e);
    }
    toast.info(`Datos manuales de SPID restablecidos para el ${norm}`);
    setIsSpidModalOpen(false);
  };

  const toggleOperation = (op) => {
    const isJv = op.toLowerCase().includes('juan') || op.toLowerCase().includes('valdez');
    const isNew = op.toLowerCase().includes('newrest');
    if (isJv) {
      setActivePaseClient(prev => prev === 'Juan Valdez' ? null : 'Juan Valdez');
    } else if (isNew) {
      setActivePaseClient(prev => prev === 'Newrest' ? null : 'Newrest');
    }

    const canonOp = canonicalizeOperation(op) || op;
    setSelectedOperations(prev => {
      const exists = prev.some(item => (canonicalizeOperation(item) || item).toLowerCase() === canonOp.toLowerCase());
      if (exists) {
        return prev.filter(item => (canonicalizeOperation(item) || item).toLowerCase() !== canonOp.toLowerCase());
      } else {
        return [...prev, canonOp];
      }
    });
  };

  const clearOperationFilter = () => {
    setSelectedOperations([]);
    setActivePaseClient(null);
  };

  // Estado para expandir/contraer sub-categorías de Petroleras (T300, T302, T312) — expandido por defecto
  const [isPetrolerasSubExpanded, setIsPetrolerasSubExpanded] = useState(true);

  // Filas del día seleccionado (Disponibilización / Ruteo)
  // Excluir todo lo que dice "Traspaso" (salvo Aramark/Centralizado) y excluir rutas de 5 dígitos
  const currentAssignedRows = useMemo(() => {
    let rows = [];
    const normDate = normalizeDate(activeDate);

    const findInObj = (obj) => {
      if (!obj) return null;
      if (obj[normDate] && obj[normDate].length > 0) return obj[normDate];
      if (obj[activeDate] && obj[activeDate].length > 0) return obj[activeDate];
      for (const k of Object.keys(obj)) {
        if (normalizeDate(k) === normDate && obj[k]?.length > 0) return obj[k];
      }
      return null;
    };

    // Priorizar siempre transmittedAssignments (sincronizado con Supabase) sobre savedRuteoByDate (caché local)
    const trans = findInObj(transmittedAssignments);
    if (trans) {
      rows = trans;
    } else {
      const saved = findInObj(savedRuteoByDate);
      if (saved) {
        rows = saved;
      } else {
        const matchedTrans = (transformedRoutes || []).filter(r => normalizeDate(r.fecha) === normDate);
        rows = matchedTrans.length > 0 ? matchedTrans : (transformedRoutes || []);
      }
    }
    const validRows = rows.filter(r => !isTraspasoExcluded(r) && !isFiveDigitRoute(r?.ruta));

    // Deduplicación estricta por número de ruta y vuelta (consistente con RuteoView.jsx)
    // Evita que filas huérfanas sin asignación (ej. duplicados al reimportar) dupliquen volumen o "Sin cobertura"
    const dedupedMap = new Map();
    validRows.forEach((r, idx) => {
      const rutaKey = String(r?.ruta || '').trim();
      const vKey = String(r?.n_vuelta || r?.vuelta || '1').trim().replace(/vuelta\s*/i, '') || '1';
      const uniqueKey = rutaKey ? `${rutaKey}:::${vKey}` : `no-ruta:::${r?.id || idx}`;

      if (!dedupedMap.has(uniqueKey)) {
        dedupedMap.set(uniqueKey, r);
        return;
      }

      const existing = dedupedMap.get(uniqueKey);
      const hasValidAssign = (item) => Boolean(
        item?.camion &&
        item.camion.trim() !== '' &&
        !item.camion.toLowerCase().includes('sin cami') &&
        item.camion.trim() !== '-' &&
        item?.conductor_name &&
        item.conductor_name.trim() !== '' &&
        !item.conductor_name.toLowerCase().includes('sin asign') &&
        !item.conductor_name.toLowerCase().includes('sin cond')
      );

      const existingHasAssign = hasValidAssign(existing);
      const newHasAssign = hasValidAssign(r);

      if (newHasAssign && !existingHasAssign) {
        dedupedMap.set(uniqueKey, r);
      } else if (newHasAssign === existingHasAssign) {
        const existingStops = existing?.paradas?.length || 0;
        const newStops = r?.paradas?.length || 0;
        if (newStops > existingStops) {
          dedupedMap.set(uniqueKey, r);
        }
      }
    });

    return Array.from(dedupedMap.values());
  }, [savedRuteoByDate, transmittedAssignments, transformedRoutes, activeDate]);

  // Construcción de la Matriz de Briefing agrupada por Camión/Viaje y asignada a una única Operación
  // Regla: si un camión/viaje atiende más de una operación (ej. Petroleras + Carls Jr + Streat Burguer),
  // se cuenta como 1 sola unidad (en # Rutas y en todas las columnas de carga/volumen/destinos)
  // y se asigna íntegramente a la operación candidata que tenga menos rutas.
  const briefingData = useMemo(() => {
    const createOpBucket = (operacion, extra = {}) => ({
      operacion,
      units: [],
      numRutas: 0,
      propia1v: 0,
      externa1v: 0,
      propia2v: 0,
      externa2v: 0,
      sinCobertura: 0,
      totalCajas: 0,
      totalKilos: 0,
      totalCongeladoM3: 0,
      totalRefrigeradoM3: 0,
      totalSecoM3: 0,
      totalVolumenM3: 0,
      totalDestinos: 0,
      ...extra
    });

    const unitsMap = new Map();

    currentAssignedRows.forEach((r, idx) => {
      const rKey = r.id || `${r.ruta}-${r.n_vuelta || 1}-${idx}`;
      const paradas = r.paradas || [];
      const routeOpDirect = getBriefingOperation(r);
      const isSpidRow = routeOpDirect.toUpperCase() === 'SPID';

      const camion = (r.camion || '').trim();
      const conductor = (r.conductor_name || '').trim();
      const aux = (r.aux1_name || '').trim();

      const hasCamion = Boolean(camion && !camion.toLowerCase().includes('sin cami') && camion !== '-');
      const hasConductor = Boolean(conductor && !conductor.toLowerCase().includes('sin cond') && conductor !== '-');
      const hasAux = Boolean(aux && !aux.toLowerCase().includes('sin aux') && aux !== '-');
      const isCovered = hasCamion || hasConductor || hasAux;

      let colKey = 'sinCobertura';
      let unitKey = `sinCobertura:::${rKey}`;

      if (isCovered) {
        const rawVuelta = String(r.n_vuelta || r.vuelta || '1').trim();
        const matchVuelta = rawVuelta.match(/\d+/);
        const vueltaNum = matchVuelta ? parseInt(matchVuelta[0], 10) : 1;
        const isExt = isAssignmentExternal(r, fleetList, staffList);
        const identifier = hasCamion ? camion : (hasConductor ? conductor : (hasAux ? aux : `ruta-${r.ruta}`));
        if (vueltaNum === 1) {
          colKey = isExt ? 'externa1v' : 'propia1v';
        } else {
          colKey = isExt ? 'externa2v' : 'propia2v';
        }
        // Mantener servicios SPID separados para no absorberlos dentro de viajes regulares del mismo camión
        unitKey = isSpidRow ? `spid:::${colKey}:::${r.ruta || rKey}` : `${colKey}:::${identifier}`;
      }

      if (!unitsMap.has(unitKey)) {
        unitsMap.set(unitKey, {
          unitKey,
          colKey,
          opsSet: new Set(),
          petSubCodesSet: new Set(),
          totalCajas: 0,
          totalKilos: 0,
          totalCongeladoM3: 0,
          totalRefrigeradoM3: 0,
          totalSecoM3: 0,
          totalVolumenM3: 0,
          destinosSet: new Set(),
          fallbackDestCount: 0,
          routeCount: 0
        });
      }

      const unit = unitsMap.get(unitKey);
      unit.routeCount++;

      const addStopCargo = (cj, kg, vol, amb, destino) => {
        unit.totalCajas += cj;
        unit.totalKilos += kg;
        unit.totalVolumenM3 += vol;
        if (amb === 'C') unit.totalCongeladoM3 += vol;
        else if (amb === 'R') unit.totalRefrigeradoM3 += vol;
        else unit.totalSecoM3 += vol;
        if (destino) unit.destinosSet.add(String(destino).trim());
      };

      if (paradas.length > 0) {
        paradas.forEach(p => {
          const { operacion: rawOp, subCatCode } = classifyParadaForBriefing(p, r);
          const clientName = rawOp || 'Otros';
          unit.opsSet.add(clientName);
          if (clientName === 'PETROLERAS') {
            unit.petSubCodesSet.add(PETROLERAS_TRANSPORTISTAS.includes(subCatCode) ? subCatCode : 'T300');
          }

          const cj = parseFloat(String(p.cantCJ || p.cajas || 0).replace(',', '.')) || 0;
          const kg = parseFloat(String(p.peso || p.kilos || 0).replace(',', '.')) || 0;
          const vol = parseFloat(String(p.volumen || p.m3 || 0).replace(',', '.')) || 0;
          const amb = String(p.ambiente || 'S').trim().toUpperCase();
          addStopCargo(cj, kg, vol, amb, p.destino);
        });
      } else {
        const { operacion: rawOp, subCatCode } = classifyParadaForBriefing(null, r);
        const clientName = rawOp || 'Otros';
        unit.opsSet.add(clientName);
        if (clientName === 'PETROLERAS') {
          unit.petSubCodesSet.add(PETROLERAS_TRANSPORTISTAS.includes(subCatCode) ? subCatCode : 'T300');
        }

        const cj = parseFloat(String(r.cantCJ || r.cajas || 0).replace(',', '.')) || 0;
        const kg = parseFloat(String(r.peso || r.kilos || 0).replace(',', '.')) || 0;
        const vol = parseFloat(String(r.volumen || r.m3 || 0).replace(',', '.')) || 0;
        const amb = String(r.ambiente || 'S').trim().toUpperCase();
        addStopCargo(cj, kg, vol, amb, r.destino);
        if (!r.destino && r.recuentoDestino) {
          unit.fallbackDestCount += r.recuentoDestino;
        }
      }
    });

    const clientsMap = new Map();
    const ensureBucket = (opName) => {
      if (!clientsMap.has(opName)) {
        clientsMap.set(opName, createOpBucket(opName));
      }
      return clientsMap.get(opName);
    };

    const assignUnitToBucket = (bucket, unit) => {
      bucket.units.push(unit);
      bucket.numRutas++;
      bucket[unit.colKey]++;
      bucket.totalCajas += unit.totalCajas;
      bucket.totalKilos += unit.totalKilos;
      bucket.totalCongeladoM3 += unit.totalCongeladoM3;
      bucket.totalRefrigeradoM3 += unit.totalRefrigeradoM3;
      bucket.totalSecoM3 += unit.totalSecoM3;
      bucket.totalVolumenM3 += unit.totalVolumenM3;
      const unitDest = unit.destinosSet.size || unit.fallbackDestCount || (unit.routeCount > 0 && !unit.opsSet.has('SPID') ? unit.routeCount : 0);
      bucket.totalDestinos += unitDest;
    };

    // Paso 1: Asignar camiones exclusivos de una sola operación
    const sharedUnits = [];
    unitsMap.forEach(unit => {
      if (unit.opsSet.size === 1) {
        const onlyOp = Array.from(unit.opsSet)[0] || 'Otros';
        assignUnitToBucket(ensureBucket(onlyOp), unit);
      } else {
        sharedUnits.push(unit);
      }
    });

    // Paso 2: Asignar camiones compartidos íntegramente a la operación candidata con menos rutas
    sharedUnits.sort((a, b) => a.opsSet.size - b.opsSet.size);
    sharedUnits.forEach(unit => {
      const candidates = Array.from(unit.opsSet);
      candidates.sort((opA, opB) => {
        const countA = ensureBucket(opA).numRutas;
        const countB = ensureBucket(opB).numRutas;
        if (countA !== countB) return countA - countB;
        return opA.localeCompare(opB);
      });
      const chosenOp = candidates[0] || 'Otros';
      assignUnitToBucket(ensureBucket(chosenOp), unit);
    });

    const formatBucketToRow = (bucket) => ({
      operacion: bucket.operacion,
      subCode: bucket.subCode || null,
      isSubRow: !!bucket.isSubRow,
      parentOp: bucket.parentOp || null,
      numRutas: bucket.numRutas,
      propia1v: bucket.propia1v,
      externa1v: bucket.externa1v,
      propia2v: bucket.propia2v,
      externa2v: bucket.externa2v,
      sinCobertura: bucket.sinCobertura,
      cajas: Math.round(bucket.totalCajas),
      kilos: Number(bucket.totalKilos.toFixed(2)),
      congeladoM3: Number(bucket.totalCongeladoM3.toFixed(2)),
      refrigeradoM3: Number(bucket.totalRefrigeradoM3.toFixed(2)),
      secoM3: Number(bucket.totalSecoM3.toFixed(2)),
      volumenM3: Number(bucket.totalVolumenM3.toFixed(2)),
      numDestinos: bucket.totalDestinos
    });

    // Construir filas principales y sub-categorías de Petroleras (T300, T302, T312)
    // distribuyendo únicamente los camiones asignados a PETROLERAS para que sumen 100% en todas las columnas
    const rows = Array.from(clientsMap.values()).map(bucket => {
      const baseRow = formatBucketToRow(bucket);

      if (baseRow.operacion === 'PETROLERAS') {
        const subBucketsMap = new Map();
        PETROLERAS_SUBCATEGORIES.forEach(sub => {
          subBucketsMap.set(sub.code, createOpBucket(sub.label, {
            subCode: sub.code,
            isSubRow: true,
            parentOp: 'PETROLERAS'
          }));
        });

        const sharedSubUnits = [];
        bucket.units.forEach(unit => {
          const codes = unit.petSubCodesSet.size > 0 ? Array.from(unit.petSubCodesSet) : ['T300'];
          if (codes.length === 1) {
            assignUnitToBucket(subBucketsMap.get(codes[0]) || subBucketsMap.get('T300'), unit);
          } else {
            sharedSubUnits.push({ unit, codes });
          }
        });

        sharedSubUnits.sort((a, b) => a.codes.length - b.codes.length);
        sharedSubUnits.forEach(({ unit, codes }) => {
          codes.sort((cA, cB) => {
            const diff = subBucketsMap.get(cA).numRutas - subBucketsMap.get(cB).numRutas;
            if (diff !== 0) return diff;
            return PETROLERAS_TRANSPORTISTAS.indexOf(cA) - PETROLERAS_TRANSPORTISTAS.indexOf(cB);
          });
          const chosenCode = codes[0] || 'T300';
          assignUnitToBucket(subBucketsMap.get(chosenCode), unit);
        });

        const subRows = PETROLERAS_SUBCATEGORIES.map(sub => formatBucketToRow(subBucketsMap.get(sub.code)));

        return {
          ...baseRow,
          hasPetrolerasSubcategories: true,
          subRows
        };
      }

      return baseRow;
    });

    // Requisito 3: SPID siempre debe aparecer en el Briefing
    const spidRowIndex = rows.findIndex(r => r.operacion.toUpperCase() === 'SPID');
    const activeDateNorm = normalizeDate(activeDate);
    const spidOverride = spidOverrides[activeDateNorm];

    if (spidRowIndex === -1) {
      rows.push({
        operacion: 'SPID',
        numRutas: 0,
        propia1v: 0,
        externa1v: 0,
        propia2v: 0,
        externa2v: 0,
        sinCobertura: 0,
        cajas: 0,
        kilos: 0,
        congeladoM3: 0,
        refrigeradoM3: 0,
        secoM3: 0,
        volumenM3: 0,
        numDestinos: 0,
        isSpid: true,
        hasRealRoutes: false,
        isManualOverride: !!spidOverride
      });
    } else {
      rows[spidRowIndex].isSpid = true;
      rows[spidRowIndex].hasRealRoutes = true;
    }

    if (spidOverride) {
      const targetSpid = rows.find(r => r.operacion.toUpperCase() === 'SPID');
      if (targetSpid) {
        targetSpid.propia1v = spidOverride.propia1v !== undefined ? Number(spidOverride.propia1v) : targetSpid.propia1v;
        targetSpid.externa1v = spidOverride.externa1v !== undefined ? Number(spidOverride.externa1v) : targetSpid.externa1v;
        targetSpid.propia2v = spidOverride.propia2v !== undefined ? Number(spidOverride.propia2v) : targetSpid.propia2v;
        targetSpid.externa2v = spidOverride.externa2v !== undefined ? Number(spidOverride.externa2v) : targetSpid.externa2v;
        targetSpid.sinCobertura = spidOverride.sinCobertura !== undefined ? Number(spidOverride.sinCobertura) : targetSpid.sinCobertura;
        
        targetSpid.numRutas = targetSpid.propia1v + targetSpid.externa1v + targetSpid.propia2v + targetSpid.externa2v + targetSpid.sinCobertura;
        
        targetSpid.cajas = spidOverride.cajas !== undefined ? Math.round(Number(spidOverride.cajas)) : targetSpid.cajas;
        targetSpid.kilos = spidOverride.kilos !== undefined ? Number(Number(spidOverride.kilos).toFixed(2)) : targetSpid.kilos;
        targetSpid.congeladoM3 = spidOverride.congeladoM3 !== undefined ? Number(Number(spidOverride.congeladoM3).toFixed(2)) : targetSpid.congeladoM3;
        targetSpid.refrigeradoM3 = spidOverride.refrigeradoM3 !== undefined ? Number(Number(spidOverride.refrigeradoM3).toFixed(2)) : targetSpid.refrigeradoM3;
        targetSpid.secoM3 = spidOverride.secoM3 !== undefined ? Number(Number(spidOverride.secoM3).toFixed(2)) : targetSpid.secoM3;
        targetSpid.volumenM3 = spidOverride.volumenM3 !== undefined ? Number(Number(spidOverride.volumenM3).toFixed(2)) : targetSpid.volumenM3;
        targetSpid.numDestinos = spidOverride.numDestinos !== undefined ? Number(spidOverride.numDestinos) : targetSpid.numDestinos;
        targetSpid.isManualOverride = true;
      }
    }

    // Ordenar filas: primero las operaciones que tienen servicios registrados (numRutas > 0 o cajas > 0 o volumenM3 > 0), luego las que no
    rows.sort((a, b) => {
      const hasServicesA = (a.numRutas > 0 || a.cajas > 0 || a.volumenM3 > 0) ? 1 : 0;
      const hasServicesB = (b.numRutas > 0 || b.cajas > 0 || b.volumenM3 > 0) ? 1 : 0;
      if (hasServicesA !== hasServicesB) {
        return hasServicesB - hasServicesA;
      }
      if (a.numRutas !== b.numRutas) {
        return b.numRutas - a.numRutas;
      }
      return a.operacion.localeCompare(b.operacion);
    });

    // Totales Generales
    const totals = {
      operacion: 'Total general',
      numRutas: rows.reduce((acc, r) => acc + r.numRutas, 0),
      propia1v: rows.reduce((acc, r) => acc + r.propia1v, 0),
      externa1v: rows.reduce((acc, r) => acc + r.externa1v, 0),
      propia2v: rows.reduce((acc, r) => acc + r.propia2v, 0),
      externa2v: rows.reduce((acc, r) => acc + r.externa2v, 0),
      sinCobertura: rows.reduce((acc, r) => acc + r.sinCobertura, 0),
      cajas: rows.reduce((acc, r) => acc + r.cajas, 0),
      kilos: Number(rows.reduce((acc, r) => acc + r.kilos, 0).toFixed(2)),
      congeladoM3: Number(rows.reduce((acc, r) => acc + r.congeladoM3, 0).toFixed(2)),
      refrigeradoM3: Number(rows.reduce((acc, r) => acc + r.refrigeradoM3, 0).toFixed(2)),
      secoM3: Number(rows.reduce((acc, r) => acc + r.secoM3, 0).toFixed(2)),
      volumenM3: Number(rows.reduce((acc, r) => acc + r.volumenM3, 0).toFixed(2)),
      numDestinos: rows.reduce((acc, r) => acc + r.numDestinos, 0)
    };

    return { rows, totals };
  }, [currentAssignedRows, fleetList, staffList, spidOverrides, activeDate]);

  // Mini-etiquetas de todas las operaciones disponibles (Requisito 3)
  // Al comienzo van todas las tarjetas que tienen servicios registrados y al final las que no tienen servicios
  const operationsList = useMemo(() => {
    const presentOps = new Set();
    
    // 1. Agregar operaciones reales del briefing canónicas
    briefingData.rows.forEach(r => {
      const canon = canonicalizeOperation(r.operacion) || r.operacion;
      if (canon) presentOps.add(canon);
    });

    // 2. Agregar catálogo maestro de operaciones canonicalizadas
    ALL_OPERACIONES.forEach(op => {
      const clean = cleanBriefingOperationName(op);
      const canon = canonicalizeOperation(clean) || clean;
      const lower = canon.toLowerCase();
      // Excluir Traspaso a excepción de lo que dice Aramark
      if (lower.includes('traspaso') && !lower.includes('aramark')) {
        return;
      }
      if (canon) presentOps.add(canon);
    });

    const opsArray = Array.from(presentOps);
    const opCountMap = new Map();
    briefingData.rows.forEach(r => {
      const canon = (canonicalizeOperation(r.operacion) || r.operacion).toLowerCase();
      const existing = opCountMap.get(canon) || { count: 0, hasServices: false };
      opCountMap.set(canon, {
        count: existing.count + (r.numRutas || 0),
        hasServices: existing.hasServices || (r.numRutas > 0 || r.cajas > 0 || r.volumenM3 > 0)
      });
    });

    return opsArray.sort((a, b) => {
      const infoA = opCountMap.get((canonicalizeOperation(a) || a).toLowerCase()) || { count: 0, hasServices: false };
      const infoB = opCountMap.get((canonicalizeOperation(b) || b).toLowerCase()) || { count: 0, hasServices: false };

      const hasServicesA = infoA.hasServices ? 1 : 0;
      const hasServicesB = infoB.hasServices ? 1 : 0;

      // 1. Tarjetas con servicios registrados al comienzo, sin servicios al final
      if (hasServicesA !== hasServicesB) {
        return hasServicesB - hasServicesA;
      }
      // 2. Si ambas tienen servicios, ordenar por mayor número de rutas/camiones
      if (infoA.count !== infoB.count) {
        return infoB.count - infoA.count;
      }
      // 3. Fallback alfabético
      return a.localeCompare(b);
    });
  }, [briefingData.rows]);

  // Filtro de búsqueda y multi-etiquetas de operación (Requisito 3)
  const displayedRows = useMemo(() => {
    let list = briefingData.rows;
    if (selectedOperations.length > 0) {
      const lowerSelected = new Set(selectedOperations.map(o => (canonicalizeOperation(o) || o).toLowerCase()));
      list = list.filter(r => {
        const rowOp = (canonicalizeOperation(r.operacion) || r.operacion).toLowerCase();
        return lowerSelected.has(rowOp) || lowerSelected.has(r.operacion.toLowerCase());
      });
    }
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      list = list.filter(r => {
        const rowOp = (canonicalizeOperation(r.operacion) || r.operacion).toLowerCase();
        return rowOp.includes(lower) || r.operacion.toLowerCase().includes(lower);
      });
    }
    return list;
  }, [briefingData.rows, selectedOperations, searchTerm]);

  // Totales dinámicos calculados sobre las filas mostradas (para tarjetas, pie de tabla y exportación)
  // Como cada camión/viaje ya está asignado a una única operación sin duplicar, la suma de las filas cuadra 100% en todas las columnas
  const displayedTotals = useMemo(() => {
    return {
      operacion: selectedOperations.length > 0 ? `Subtotal (${selectedOperations.length} ops)` : 'Total general',
      numRutas: displayedRows.reduce((acc, r) => acc + (r.numRutas || 0), 0),
      propia1v: displayedRows.reduce((acc, r) => acc + (r.propia1v || 0), 0),
      externa1v: displayedRows.reduce((acc, r) => acc + (r.externa1v || 0), 0),
      propia2v: displayedRows.reduce((acc, r) => acc + (r.propia2v || 0), 0),
      externa2v: displayedRows.reduce((acc, r) => acc + (r.externa2v || 0), 0),
      sinCobertura: displayedRows.reduce((acc, r) => acc + (r.sinCobertura || 0), 0),
      cajas: displayedRows.reduce((acc, r) => acc + (r.cajas || 0), 0),
      kilos: Number(displayedRows.reduce((acc, r) => acc + (r.kilos || 0), 0).toFixed(2)),
      congeladoM3: Number(displayedRows.reduce((acc, r) => acc + (r.congeladoM3 || 0), 0).toFixed(2)),
      refrigeradoM3: Number(displayedRows.reduce((acc, r) => acc + (r.refrigeradoM3 || 0), 0).toFixed(2)),
      secoM3: Number(displayedRows.reduce((acc, r) => acc + (r.secoM3 || 0), 0).toFixed(2)),
      volumenM3: Number(displayedRows.reduce((acc, r) => acc + (r.volumenM3 || 0), 0).toFixed(2)),
      numDestinos: displayedRows.reduce((acc, r) => acc + (r.numDestinos || 0), 0)
    };
  }, [displayedRows, selectedOperations]);

  // Exportar a Excel exactamente con las columnas solicitadas (incluyendo desglose de sub-categorías en Petroleras)
  const handleExportExcel = () => {
    const exportData = [];
    briefingData.rows.forEach(r => {
      exportData.push({
        'Operación': r.operacion,
        '# Rutas': r.numRutas || 0,
        'Real Key 1era V': r.propia1v || 0,
        'Real Terceros 1era V': r.externa1v || 0,
        '2da V (Cubiertas Key)': r.propia2v || 0,
        '2da V (Terceros)': r.externa2v || 0,
        'Sin cobertura': r.sinCobertura || 0,
        'Cajas': r.cajas || 0,
        'Kilos': `${r.kilos.toFixed(2)} Kg`,
        'Congelado m3': r.congeladoM3 || 0,
        'Refrigerado m3': r.refrigeradoM3 || 0,
        'Seco m3': r.secoM3 || 0,
        'Volumen': `${r.volumenM3.toFixed(2)} m3`,
        'N° Destinos': r.numDestinos || 0
      });

      if (r.hasPetrolerasSubcategories && Array.isArray(r.subRows)) {
        r.subRows.forEach(sub => {
          exportData.push({
            'Operación': `   ↳ ${sub.operacion}`,
            '# Rutas': sub.numRutas || 0,
            'Real Key 1era V': sub.propia1v || 0,
            'Real Terceros 1era V': sub.externa1v || 0,
            '2da V (Cubiertas Key)': sub.propia2v || 0,
            '2da V (Terceros)': sub.externa2v || 0,
            'Sin cobertura': sub.sinCobertura || 0,
            'Cajas': sub.cajas || 0,
            'Kilos': `${sub.kilos.toFixed(2)} Kg`,
            'Congelado m3': sub.congeladoM3 || 0,
            'Refrigerado m3': sub.refrigeradoM3 || 0,
            'Seco m3': sub.secoM3 || 0,
            'Volumen': `${sub.volumenM3.toFixed(2)} m3`,
            'N° Destinos': sub.numDestinos || 0
          });
        });
      }
    });

    // Fila Total General (usando totales deduplicados de displayedTotals cuando no hay filtros, o briefingData.totals)
    const exportTotals = selectedOperations.length === 0 && !searchTerm.trim() ? displayedTotals : briefingData.totals;
    exportData.push({
      'Operación': 'Total general',
      '# Rutas': exportTotals.numRutas,
      'Real Key 1era V': exportTotals.propia1v,
      'Real Terceros 1era V': exportTotals.externa1v,
      '2da V (Cubiertas Key)': exportTotals.propia2v,
      '2da V (Terceros)': exportTotals.externa2v,
      'Sin cobertura': exportTotals.sinCobertura,
      'Cajas': exportTotals.cajas,
      'Kilos': `${exportTotals.kilos.toFixed(2)} Kg`,
      'Congelado m3': exportTotals.congeladoM3,
      'Refrigerado m3': exportTotals.refrigeradoM3,
      'Seco m3': exportTotals.secoM3,
      'Volumen': `${exportTotals.volumenM3.toFixed(2)} m3`,
      'N° Destinos': exportTotals.numDestinos
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Briefing");
    XLSX.writeFile(workbook, `Resumen_Briefing_${activeDate}.xlsx`);
  };

  const briefingContainerRef = useRef(null);

  // Copiar Briefing al portapapeles combinando celdas de Excel con formato nativo (Requisito 4)
  const handleCopyBriefing = async () => {
    await copyBriefingAsImage(briefingContainerRef.current, activeDate, {
      rows: displayedRows,
      totals: displayedTotals,
      activeDate
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 sm:p-6 gap-4 overflow-y-auto">
      
      {/* 1. Header Ejecutivo idéntico a la plantilla oficial con Logo Key Logistics (Requisito 4) */}
      <div className="bg-[#0B2545] text-white rounded-2xl shadow-md p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="flex items-center pr-3.5 border-r border-blue-400/30">
            <img 
              src="/keylogistics-logo.jpg" 
              alt="Key Logistics" 
              className="h-11 w-auto object-contain rounded-lg shadow-xs bg-white/10 p-0.5 border border-white/20"
            />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-black tracking-wide uppercase text-white">
              RESUMEN DE ASIGNACIÓN · BRIEFING
            </h1>
            <p className="text-[11px] text-blue-200">
              Control operacional y balance de flota, cajas, kilos y ambientes por cliente.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Selector de Fecha */}
          <div className="flex items-center gap-2 bg-[#133863] border border-blue-400/30 px-3 py-1.5 rounded-xl">
            <Calendar size={16} className="text-blue-300" />
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-blue-200 uppercase tracking-wider">
                Despacho
              </span>
              <select
                value={normalizeDate(activeDate)}
                onChange={(e) => setActiveDate(normalizeDate(e.target.value))}
                className="text-xs font-bold text-white bg-transparent outline-none cursor-pointer"
              >
                {availableDates.map(d => (
                  <option key={d} value={d} className="bg-slate-900 text-white">{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Botón Consulta Temporal (Google Drive) */}
          <DriveTimeMachineButton
            currentMenu="Briefing"
            activeDate={activeDate}
            onSelectDate={(loadedFecha) => setActiveDate(normalizeDate(loadedFecha))}
          />

          {/* Botones Acceso Rápido Pase de Ingreso (Requisito 2) */}
          <button
            type="button"
            onClick={() => setActivePaseClient(prev => prev === 'Juan Valdez' ? null : 'Juan Valdez')}
            className={`flex items-center gap-1.5 text-xs font-bold h-9 px-3 rounded-xl transition-all cursor-pointer ${
              activePaseClient === 'Juan Valdez'
                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                : 'bg-[#0f4a34] hover:bg-[#0a3827] text-emerald-100 border border-emerald-500/30'
            }`}
            title="Abrir / ocultar Matriz Pase de Ingreso Juan Valdez"
          >
            <span>🎫 Pase Juan Valdez</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePaseClient(prev => prev === 'Newrest' ? null : 'Newrest')}
            className={`flex items-center gap-1.5 text-xs font-bold h-9 px-3 rounded-xl transition-all cursor-pointer ${
              activePaseClient === 'Newrest'
                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                : 'bg-[#0f4a34] hover:bg-[#0a3827] text-emerald-100 border border-emerald-500/30'
            }`}
            title="Abrir / ocultar Matriz Pase de Ingreso Newrest"
          >
            <span>🎫 Pase Newrest</span>
          </button>

          {/* Botón Editar SPID (Requisito 3) */}
          <button
            type="button"
            onClick={() => setIsSpidModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold h-9 px-3 rounded-xl transition-all cursor-pointer bg-[#173e6b] hover:bg-[#123154] text-blue-100 border border-blue-400/40"
            title="Editar métricas operacionales de SPID para la fecha activa"
          >
            <Edit3 size={14} className="text-amber-300" />
            <span>Editar SPID</span>
          </button>

          {/* Botón Copiar imagen para Excel (Requisito 4) */}
          <Button
            onClick={handleCopyBriefing}
            className="flex items-center gap-1.5 text-xs font-bold h-9 bg-blue-700 hover:bg-blue-600 text-white shadow-sm border border-blue-400/40"
            title="Copiar briefing para Excel (se combina en celdas con formato al presionar Ctrl + V)"
          >
            <Copy size={14} className="text-yellow-300" />
            <span>Copiar imagen</span>
          </Button>

          <Button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 text-xs font-bold h-9 bg-blue-600 hover:bg-blue-500 text-white shadow-sm border border-blue-400/30"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Exportar Excel</span>
          </Button>
        </div>
      </div>

      {/* 2. Tarjetas KPI de Resumen Rápido (Calculadas dinámicamente según filtros aplicados) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Total # Rutas</span>
          <p className="text-2xl font-black text-slate-800 mt-1">{displayedTotals.numRutas}</p>
          <span className="text-[10px] text-slate-500 mt-0.5">Camiones deduplicados</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Flota Propia 1V</span>
          <p className="text-2xl font-black text-blue-600 mt-1">{displayedTotals.propia1v}</p>
          <span className="text-[10px] text-slate-500 mt-0.5">Real Key 1era Vuelta</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Flota Externa 1V</span>
          <p className="text-2xl font-black text-amber-600 mt-1">{displayedTotals.externa1v}</p>
          <span className="text-[10px] text-slate-500 mt-0.5">Real Terceros 1era Vuelta</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Segundas Vueltas</span>
          <p className="text-2xl font-black text-indigo-600 mt-1">{displayedTotals.propia2v + displayedTotals.externa2v}</p>
          <span className="text-[10px] text-slate-500 mt-0.5">{displayedTotals.propia2v} Key • {displayedTotals.externa2v} Terceros</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Total Kilos</span>
          <p className="text-xl font-black text-slate-800 mt-1">{formatDecimalAlways(displayedTotals.kilos)} <span className="text-xs font-bold text-slate-500">Kg</span></p>
          <span className="text-[10px] text-slate-500 mt-0.5">{formatIntAlways(displayedTotals.cajas)} Cajas totales</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Volumen Total</span>
          <p className="text-xl font-black text-emerald-600 mt-1">{formatDecimalAlways(displayedTotals.volumenM3)} <span className="text-xs font-bold text-slate-500">m³</span></p>
          <span className="text-[10px] text-slate-500 mt-0.5">{displayedTotals.numDestinos} Destinos únicos</span>
        </div>
      </div>

      {/* 3. Filtro por Mini-Etiquetas de Operación Multi-selección (Requisito 3) */}
      <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 p-3.5 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-blue-600" />
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Filtrar por Operación (Multi-selección):
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedOperations.length > 0 && (
              <button
                type="button"
                onClick={clearOperationFilter}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-all cursor-pointer"
              >
                Limpiar filtros ({selectedOperations.length} seleccionadas)
              </button>
            )}
            <span className="text-[11px] text-slate-500 font-semibold">
              {displayedRows.length} de {briefingData.rows.length} operaciones mostradas
            </span>
          </div>
        </div>

        {/* Mini etiquetas desplazables con scroll horizontal */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
          <button
            type="button"
            onClick={clearOperationFilter}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              selectedOperations.length === 0
                ? 'bg-blue-600 text-white shadow-xs scale-102 ring-2 ring-blue-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <span>🌐 Vista general</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              selectedOperations.length === 0 ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {briefingData.rows.length}
            </span>
          </button>

          {operationsList.map(op => {
            const canonOp = canonicalizeOperation(op) || op;
            const isSelected = selectedOperations.some(item => (canonicalizeOperation(item) || item).toLowerCase() === canonOp.toLowerCase());
            const rowData = briefingData.rows.find(r => (canonicalizeOperation(r.operacion) || r.operacion).toLowerCase() === canonOp.toLowerCase());
            const countInDay = rowData?.numRutas || 0;
            const hasServices = !!(rowData && (rowData.numRutas > 0 || rowData.cajas > 0 || rowData.volumenM3 > 0));

            return (
              <button
                key={op}
                type="button"
                onClick={() => toggleOperation(op)}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                    : hasServices
                    ? 'bg-blue-50/90 hover:bg-blue-100 text-blue-900 border border-blue-200'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-400 border border-slate-200 opacity-60'
                }`}
                title={hasServices ? `${op}: ${countInDay} camiones asignados hoy (con servicios)` : `${op} (Sin servicios registrados hoy)`}
              >
                {isSelected && <span className="text-[11px] font-black">✓</span>}
                <span>{op}</span>
                {hasServices && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-blue-200 text-blue-900'
                  }`}>
                    {countInDay}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Buscador de texto */}
        <div className="relative w-full max-w-sm pt-0.5">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Buscar operación o cliente en la lista..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 h-8 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
          />
        </div>
      </div>

      {/* 3.1. Matriz Extra: Pases de Ingreso para Juan Valdez y Newrest (Requisito 2) */}
      {activePaseClient && (
        <PaseIngresoMatrix
          clientName={activePaseClient}
          activeDate={normalizeDate(activeDate)}
          assignments={currentAssignedRows}
          fleetList={fleetList}
          staffList={staffList}
          onClose={() => setActivePaseClient(null)}
        />
      )}

      {/* 4. Matriz Principal de Briefing */}
      <div ref={briefingContainerRef} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col shrink-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
            {/* Encabezados Azules Oficiales */}
            <thead className="bg-[#0e2a47] text-white font-bold text-[11px] uppercase tracking-wider sticky top-0 shadow-sm">
              <tr>
                <th className="px-3.5 py-3.5 border-r border-blue-900/40 text-left min-w-[150px]">Operación</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-center min-w-[70px]"># Rutas</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-center min-w-[100px]">Real Key 1era V</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-center min-w-[110px]">Real Terceros 1era V</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-center min-w-[120px]">2da V (Cubiertas Key)</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-center min-w-[110px]">2da V (Terceros)</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-center min-w-[90px]">Sin cobertura</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-right min-w-[75px]">Cajas</th>
                <th className="px-3.5 py-3.5 border-r border-blue-900/40 text-right min-w-[110px]">Kilos</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-right min-w-[85px]">Congelado m3</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-right min-w-[90px]">Refrigerado m3</th>
                <th className="px-3 py-3.5 border-r border-blue-900/40 text-right min-w-[85px]">Seco m3</th>
                <th className="px-3.5 py-3.5 border-r border-blue-900/40 text-right min-w-[95px]">Volumen</th>
                <th className="px-3 py-3.5 text-center min-w-[85px]">N° Destinos</th>
              </tr>
            </thead>

            {/* Cuerpo con Zebra Striping */}
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan="14" className="py-12 text-center text-slate-400">
                    <FileSpreadsheet size={36} className="mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-sm">No hay servicios registrados para la fecha {activeDate}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Carga o transmite rutas desde Asignación Diaria / Disponibilización.</p>
                  </td>
                </tr>
              ) : (
                displayedRows.map((r, idx) => {
                  const isZebra = idx % 2 === 1;
                  const rowBg = isZebra ? 'bg-[#f4f7fb]/70' : 'bg-white';
                  const isJvOrNewrest = r.operacion.toLowerCase().includes('juan') || r.operacion.toLowerCase().includes('newrest');
                  const isSpid = r.isSpid || r.operacion.toUpperCase() === 'SPID';
                  const isPetroleras = r.hasPetrolerasSubcategories || r.operacion.toUpperCase() === 'PETROLERAS';
                  const isClickable = isJvOrNewrest || isSpid || isPetroleras;
                  return (
                    <React.Fragment key={r.operacion}>
                      <tr 
                        onClick={() => {
                          if (r.operacion.toLowerCase().includes('juan') || r.operacion.toLowerCase().includes('valdez')) {
                            setActivePaseClient(prev => prev === 'Juan Valdez' ? null : 'Juan Valdez');
                          } else if (r.operacion.toLowerCase().includes('newrest')) {
                            setActivePaseClient(prev => prev === 'Newrest' ? null : 'Newrest');
                          } else if (isSpid) {
                            setIsSpidModalOpen(true);
                          } else if (isPetroleras) {
                            setIsPetrolerasSubExpanded(prev => !prev);
                          }
                        }}
                        className={`${rowBg} hover:bg-blue-50/60 transition-colors ${isClickable ? 'cursor-pointer' : ''}`}
                      >
                        {/* Operación */}
                        <td className="px-3.5 py-2.5 font-black uppercase text-slate-900 border-r border-slate-200/80 tracking-wide">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              {isPetroleras && (
                                <span className="text-blue-600 flex items-center" title="Clic para mostrar/ocultar sub-categorías T300, T302 y T312">
                                  {isPetrolerasSubExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </span>
                              )}
                              <span>{r.operacion}</span>
                              {isPetroleras && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 border border-blue-200 normal-case">
                                  T300 + T302 + T312
                                </span>
                              )}
                              {r.isManualOverride && (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                  Manual
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {isJvOrNewrest && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const client = r.operacion.toLowerCase().includes('juan') ? 'Juan Valdez' : 'Newrest';
                                    setActivePaseClient(prev => prev === client ? null : client);
                                  }}
                                  className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border transition-all cursor-pointer ${
                                    (activePaseClient === 'Juan Valdez' && r.operacion.toLowerCase().includes('juan')) || (activePaseClient === 'Newrest' && r.operacion.toLowerCase().includes('newrest'))
                                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-2xs'
                                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                                  }`}
                                  title={`Abrir Pase de Ingreso para ${r.operacion}`}
                                >
                                  🎫 Pase
                                </button>
                              )}
                              {isSpid && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsSpidModalOpen(true);
                                  }}
                                  className="text-[9px] font-bold px-2 py-0.5 rounded-md border transition-all cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200 flex items-center gap-1 shadow-2xs"
                                  title="Editar métricas operacionales de SPID"
                                >
                                  <Edit3 size={10} />
                                  <span>Editar</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* # Rutas */}
                        <td className="px-3 py-2.5 text-center font-black font-mono border-r border-slate-200/80 text-slate-900 bg-blue-50/30">
                          {r.numRutas || ''}
                        </td>

                        {/* Real Key 1era V */}
                        <td className="px-3 py-2.5 text-center font-bold font-mono border-r border-slate-200/80 text-blue-900">
                          {formatInt(r.propia1v)}
                        </td>

                        {/* Real Terceros 1era V */}
                        <td className="px-3 py-2.5 text-center font-bold font-mono border-r border-slate-200/80 text-amber-900">
                          {formatInt(r.externa1v)}
                        </td>

                        {/* 2da V (Cubiertas Key) */}
                        <td className="px-3 py-2.5 text-center font-bold font-mono border-r border-slate-200/80 text-indigo-900">
                          {formatInt(r.propia2v)}
                        </td>

                        {/* 2da V (Terceros) */}
                        <td className="px-3 py-2.5 text-center font-bold font-mono border-r border-slate-200/80 text-amber-950">
                          {formatInt(r.externa2v)}
                        </td>

                        {/* Sin cobertura */}
                        <td className="px-3 py-2.5 text-center font-bold font-mono border-r border-slate-200/80 text-red-600">
                          {formatInt(r.sinCobertura)}
                        </td>

                        {/* Cajas */}
                        <td className="px-3 py-2.5 text-right font-mono font-medium border-r border-slate-200/80">
                          {formatInt(r.cajas)}
                        </td>

                        {/* Kilos */}
                        <td className="px-3.5 py-2.5 text-right font-mono font-medium border-r border-slate-200/80">
                          {r.kilos > 0 ? `${formatDecimalAlways(r.kilos)} Kg` : '0,00 Kg'}
                        </td>

                        {/* Congelado m3 */}
                        <td className="px-3 py-2.5 text-right font-mono font-medium border-r border-slate-200/80 text-blue-700">
                          {formatDecimal(r.congeladoM3)}
                        </td>

                        {/* Refrigerado m3 */}
                        <td className="px-3 py-2.5 text-right font-mono font-medium border-r border-slate-200/80 text-cyan-700">
                          {formatDecimal(r.refrigeradoM3)}
                        </td>

                        {/* Seco m3 */}
                        <td className="px-3 py-2.5 text-right font-mono font-medium border-r border-slate-200/80 text-amber-700">
                          {formatDecimal(r.secoM3)}
                        </td>

                        {/* Volumen */}
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900 border-r border-slate-200/80">
                          {formatDecimalAlways(r.volumenM3)} m3
                        </td>

                        {/* N° Destinos */}
                        <td className="px-3 py-2.5 text-center font-mono font-semibold text-slate-700">
                          {r.numDestinos}
                        </td>
                      </tr>

                      {/* Desglose por cada sub-categoría de Petroleras (T300, T302 y T312) en el Briefing */}
                      {isPetroleras && isPetrolerasSubExpanded && Array.isArray(r.subRows) && r.subRows.map((sub) => (
                        <tr
                          key={`sub-${sub.subCode || sub.operacion}`}
                          className="bg-amber-50/40 hover:bg-amber-50/80 text-slate-700 text-[11px] transition-colors border-l-4 border-l-blue-500"
                        >
                          <td className="pl-7 pr-3.5 py-1.5 font-bold text-slate-700 border-r border-slate-200/80">
                            <div className="flex items-center gap-1.5">
                              <span className="text-blue-600 font-black">↳</span>
                              <span className="bg-blue-100 text-blue-900 font-mono font-black px-1.5 py-0.2 rounded text-[10px]">
                                {sub.subCode}
                              </span>
                              <span className="font-semibold text-slate-700">
                                {sub.operacion.replace(/^T\d{3}\s*-\s*/i, '')}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-center font-bold font-mono border-r border-slate-200/80 text-slate-600 bg-slate-50/60">
                            {sub.numRutas || ''}
                          </td>
                          <td className="px-3 py-1.5 text-center font-mono border-r border-slate-200/80 text-blue-800">
                            {formatInt(sub.propia1v)}
                          </td>
                          <td className="px-3 py-1.5 text-center font-mono border-r border-slate-200/80 text-amber-800">
                            {formatInt(sub.externa1v)}
                          </td>
                          <td className="px-3 py-1.5 text-center font-mono border-r border-slate-200/80 text-indigo-800">
                            {formatInt(sub.propia2v)}
                          </td>
                          <td className="px-3 py-1.5 text-center font-mono border-r border-slate-200/80 text-amber-900">
                            {formatInt(sub.externa2v)}
                          </td>
                          <td className="px-3 py-1.5 text-center font-mono border-r border-slate-200/80 text-red-600">
                            {formatInt(sub.sinCobertura)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono border-r border-slate-200/80 text-slate-700">
                            {formatInt(sub.cajas)}
                          </td>
                          <td className="px-3.5 py-1.5 text-right font-mono border-r border-slate-200/80 text-slate-700">
                            {sub.kilos > 0 ? `${formatDecimalAlways(sub.kilos)} Kg` : '0,00 Kg'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono border-r border-slate-200/80 text-blue-700">
                            {formatDecimal(sub.congeladoM3)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono border-r border-slate-200/80 text-cyan-700">
                            {formatDecimal(sub.refrigeradoM3)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono border-r border-slate-200/80 text-amber-700">
                            {formatDecimal(sub.secoM3)}
                          </td>
                          <td className="px-3.5 py-1.5 text-right font-mono font-bold text-slate-800 border-r border-slate-200/80">
                            {formatDecimalAlways(sub.volumenM3)} m3
                          </td>
                          <td className="px-3 py-1.5 text-center font-mono font-semibold text-slate-600">
                            {sub.numDestinos}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>

            {/* Fila Total General o Subtotal según filtro activo */}
            <tfoot className="bg-[#0e2a47] text-white font-black text-xs border-t-2 border-blue-900 tracking-wide">
              <tr>
                <td className="px-3.5 py-3 uppercase border-r border-blue-900/40">
                  {displayedTotals.operacion}
                </td>
                <td className="px-3 py-3 text-center font-mono border-r border-blue-900/40">
                  {displayedTotals.numRutas}
                </td>
                <td className="px-3 py-3 text-center font-mono border-r border-blue-900/40 text-blue-200">
                  {displayedTotals.propia1v}
                </td>
                <td className="px-3 py-3 text-center font-mono border-r border-blue-900/40 text-amber-200">
                  {displayedTotals.externa1v}
                </td>
                <td className="px-3 py-3 text-center font-mono border-r border-blue-900/40 text-indigo-200">
                  {displayedTotals.propia2v}
                </td>
                <td className="px-3 py-3 text-center font-mono border-r border-blue-900/40 text-amber-300">
                  {displayedTotals.externa2v}
                </td>
                <td className="px-3 py-3 text-center font-mono border-r border-blue-900/40 text-red-300">
                  {displayedTotals.sinCobertura || ''}
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-blue-900/40">
                  {formatIntAlways(displayedTotals.cajas)}
                </td>
                <td className="px-3.5 py-3 text-right font-mono border-r border-blue-900/40">
                  {formatDecimalAlways(displayedTotals.kilos)} Kg
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-blue-900/40 text-blue-200">
                  {formatDecimalAlways(displayedTotals.congeladoM3)}
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-blue-900/40 text-cyan-200">
                  {formatDecimalAlways(displayedTotals.refrigeradoM3)}
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-blue-900/40 text-amber-200">
                  {formatDecimalAlways(displayedTotals.secoM3)}
                </td>
                <td className="px-3.5 py-3 text-right font-mono border-r border-blue-900/40 text-emerald-300">
                  {formatDecimalAlways(displayedTotals.volumenM3)} m3
                </td>
                <td className="px-3 py-3 text-center font-mono">
                  {displayedTotals.numDestinos}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal para editar métricas de SPID (Requisito 3) */}
      <SpidEditModal
        isOpen={isSpidModalOpen}
        onClose={() => setIsSpidModalOpen(false)}
        activeDate={normalizeDate(activeDate)}
        currentData={briefingData.rows.find(r => r.operacion.toUpperCase() === 'SPID')}
        onSave={handleSaveSpidData}
        onReset={handleResetSpidData}
      />

    </div>
  );
}

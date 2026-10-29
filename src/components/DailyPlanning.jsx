import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  Upload, FileSpreadsheet, Sparkles, Send, CheckCircle2, 
  ChevronRight, ChevronDown, Search, ArrowRight, Table, 
  Layers, Package, MapPin, Calendar, Clock, AlertCircle,
  GitFork, Scissors, Plus, X, CheckSquare, Square, CornerDownRight, User, Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlanningStore, normalizeDate } from '../store/planningStore';
import { useAuthStore } from '../store/authStore';
import { Button } from './ui/Button';

// Componente de Badge para columna Ambiente (Requisitos 2 y 3)
export function AmbienteBadge({ ambiente }) {
  const amb = String(ambiente || 'S').trim().toUpperCase();
  if (amb === 'C') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded font-black text-[10px] bg-sky-100 text-sky-800 border border-sky-300 shadow-2xs" title="Congelado (C)">
        C
      </span>
    );
  }
  if (amb === 'R') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded font-black text-[10px] bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs" title="Refrigerado (R)">
        R
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded font-black text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs" title="Seco (S)">
      S
    </span>
  );
}

// Extractor inteligente de datos desde cualquier hoja de Excel (soporta títulos en fila 1, cabeceras en fila 3, saltos de filas, etc.)
export const extractDataFromWorkbook = (wb) => {
  let bestSheetName = '';
  let bestRows = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) continue;

    const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!sheetData || sheetData.length === 0) continue;

    let headerIdx = -1;
    for (let i = 0; i < Math.min(sheetData.length, 35); i++) {
      const row = sheetData[i];
      if (!Array.isArray(row)) continue;
      const lower = row.map(c => String(c || '').trim().toLowerCase());
      const hasRuta = lower.some(c => c === 'ruta' || c === 'n° ruta' || c === 'n*interno' || c === 'rutaid');
      const hasDestino = lower.some(c => c === 'destino' || c === 'nombre ruta' || c === 'cliente' || c === 'secuencia');
      if (hasRuta && hasDestino) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx >= 0) {
      const header = sheetData[headerIdx].map(h => String(h || '').trim());
      const parsedRows = [];
      let currentRuta = '';
      let currentNombreRuta = '';
      let currentFecha = '';

      for (let i = headerIdx + 1; i < sheetData.length; i++) {
        const row = sheetData[i];
        if (!row || row.every(cell => cell === '' || cell === null || cell === undefined)) continue;
        const firstCell = String(row[0] || '').trim().toLowerCase();
        if (firstCell.startsWith('total') || firstCell.startsWith('etiquetas de fila')) {
          currentRuta = '';
          currentNombreRuta = '';
          currentFecha = '';
          continue;
        }

        const obj = {};
        header.forEach((colName, colIdx) => {
          if (colName) {
            obj[colName] = row[colIdx] !== undefined ? row[colIdx] : '';
          }
        });

        let rVal = String(obj.Ruta || obj.ruta || obj['N° Ruta'] || obj.RutaId || '').trim();
        const nrVal = String(obj['Nombre Ruta'] || obj.nombre_ruta || obj.NombreRuta || obj.Cliente || '').trim();
        const fVal = String(obj.Fecha || obj.fecha || '').trim();

        if (rVal && !rVal.toLowerCase().startsWith('total')) {
          currentRuta = rVal;
          if (nrVal) currentNombreRuta = nrVal;
          if (fVal) currentFecha = fVal;
        } else if (!rVal && currentRuta) {
          // Si rVal viene vacío pero la fila tiene detalle de parada/local (formato agrupado/esquema Excel), heredamos la ruta
          const hasStopInfo = Boolean(
            obj.Destino || obj.destino || 
            obj.Secuencia || obj.secuencia || obj['Secuencia Parada'] || 
            obj.Direccion || obj['Dirección'] || obj.direccion || 
            obj.Comuna || obj.comuna || 
            obj.Local || obj.local || 
            obj.Peso || obj.peso || 
            obj.Volumen || obj.volumen || 
            obj.CantCJ || obj.cantCJ
          );
          if (hasStopInfo) {
            obj.Ruta = currentRuta;
            rVal = currentRuta;
            if (!obj['Nombre Ruta'] && currentNombreRuta) obj['Nombre Ruta'] = currentNombreRuta;
            if (!obj.Fecha && currentFecha) obj.Fecha = currentFecha;
          }
        }

        if (rVal && !rVal.toLowerCase().startsWith('total')) {
          if (!obj.Ruta && !obj.ruta && !obj['N° Ruta'] && !obj.RutaId) {
            obj.Ruta = rVal;
          }
          parsedRows.push(obj);
        }
      }

      if (parsedRows.length > bestRows.length) {
        bestRows = parsedRows;
        bestSheetName = name;
      }
    }
  }

  // Fallback si no se encontró con cabecera inteligente
  if (bestRows.length === 0) {
    const fallbackSheetName = wb.SheetNames.find(s => s.toLowerCase() === 'sheet1') || wb.SheetNames[0];
    const ws = wb.Sheets[fallbackSheetName];
    const fallbackData = ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : [];
    return { sheetName: fallbackSheetName, rows: fallbackData };
  }

  return { sheetName: bestSheetName, rows: bestRows };
};

export default function DailyPlanning() {
  const navigate = useNavigate();
  const { 
    rawRows, 
    fileName, 
    transformedRoutes, 
    isTransformed, 
    setRawRows, 
    transformRawRows, 
    transmitToDisponibilizacion,
    aperturarRuta,
    transmitSpecificRoutesToDisponibilizacion,
    transmittedAssignments,
    transmitSpecialRoutes,
    selectedDisponibilizarDate
  } = usePlanningStore();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState(isTransformed ? 'ruteo' : 'carga'); // 'carga' | 'ruteo'
  const [expandedRoute, setExpandedRoute] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [routeTypeFilter, setRouteTypeFilter] = useState('all'); // 'all' | 'standard' | 'special'
  const [selectedRouteIds, setSelectedRouteIds] = useState([]);

  // Estados para Modal de Rutas Especiales
  const [isSpecialModalOpen, setIsSpecialModalOpen] = useState(false);
  const [specialDate, setSpecialDate] = useState(selectedDisponibilizarDate || '28-10-2026');
  const [specialCompareDate, setSpecialCompareDate] = useState('auto'); // 'auto' | 'specialDate' | specific date | 'all'
  const [detectedFileDate, setDetectedFileDate] = useState('');
  const [specialRawRows, setSpecialRawRows] = useState([]);
  const [specialFileName, setSpecialFileName] = useState('');
  const [isAnalyzingSpecial, setIsAnalyzingSpecial] = useState(false);
  const [specialAnalysisResult, setSpecialAnalysisResult] = useState(null);
  const [selectedSpecialRouteIds, setSelectedSpecialRouteIds] = useState([]);
  const [expandedSpecialRouteId, setExpandedSpecialRouteId] = useState(null);
  const [specialTipoFilter, setSpecialTipoFilter] = useState('all'); // 'all' | 'nueva' | 'destinos' | '4digitos' | 'sin_ruteo'

  // Filtrar Rutas Especiales por Tipo en el modal (Requisito 2)
  const { filteredSpecialRoutes, specialCounts } = useMemo(() => {
    const list = specialAnalysisResult?.specialRoutes || [];
    const counts = {
      all: list.length,
      nueva: list.filter(r => r.isNewRoute).length,
      destinos: list.filter(r => !r.isNewRoute && r.hasNewDestinos).length,
      cuatroDigitos: list.filter(r => /^[1-9]\d{3}$/.test(String(r.ruta).trim())).length,
      sinRuteo: list.filter(r => !/^[1-9]\d{3}$/.test(String(r.ruta).trim())).length,
    };

    let filtered = list;
    if (specialTipoFilter === 'nueva') {
      filtered = list.filter(r => r.isNewRoute);
    } else if (specialTipoFilter === 'destinos') {
      filtered = list.filter(r => !r.isNewRoute && r.hasNewDestinos);
    } else if (specialTipoFilter === '4digitos') {
      filtered = list.filter(r => /^[1-9]\d{3}$/.test(String(r.ruta).trim()));
    } else if (specialTipoFilter === 'sin_ruteo') {
      filtered = list.filter(r => !/^[1-9]\d{3}$/.test(String(r.ruta).trim()));
    }

    return { filteredSpecialRoutes: filtered, specialCounts: counts };
  }, [specialAnalysisResult, specialTipoFilter]);

  // Mantener seleccionadas por defecto las rutas cargadas
  React.useEffect(() => {
    if (transformedRoutes.length > 0) {
      setSelectedRouteIds(transformedRoutes.map(r => r.id));
    } else {
      setSelectedRouteIds([]);
    }
  }, [transformedRoutes]);

  // Pop-up modal de Confirmación y Alerta de Transmisión a Disponibilización (Requisito 3)
  const [isTransmitModalOpen, setIsTransmitModalOpen] = useState(false);
  const [transmitModalData, setTransmitModalData] = useState({
    type: 'all', // 'all' | 'specific' | 'modified'
    routeIds: [],
    routes: [],
    fecha: ''
  });

  // Handle Excel file upload (usa extractor inteligente de cabeceras)
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const { sheetName, rows } = extractDataFromWorkbook(wb);

        if (!rows || rows.length === 0) {
          toast.error('El archivo Excel no contiene filas o está vacío.');
          setIsLoading(false);
          return;
        }

        // Requisito 1: Aceptar todas las rutas válidas (incluyendo >4 dígitos y las que parten con 0)
        const validRows = rows.filter(row => {
          const rutaRaw = row.Ruta || row.ruta || row['N° Ruta'] || row.RutaId || '';
          return String(rutaRaw).trim().length > 0;
        });

        if (validRows.length === 0) {
          toast.error('No se encontraron filas con número o nombre de ruta en el archivo.');
          setIsLoading(false);
          return;
        }

        setRawRows(validRows, file.name);
        toast.success(`Archivo cargado: ${validRows.length} filas leídas de "${sheetName}"`);
        setActiveTab('carga');
      } catch (err) {
        console.error('Error al leer Excel:', err);
        toast.error('No se pudo procesar el archivo Excel. Verifica el formato.');
      } finally {
        setIsLoading(false);
      }
    };

    reader.onerror = () => {
      toast.error('Error al leer el archivo en el navegador.');
      setIsLoading(false);
    };

    reader.readAsBinaryString(file);
    e.target.value = ''; // reset input
  };

  // Motor de Análisis y Detección de Rutas Especiales (Requisito 3)
  const analyzeSpecialRoutes = (rows, targetDate, compareMode = specialCompareDate) => {
    if (!rows || rows.length === 0) return;

    // Detectar fechas presentes en el archivo
    const fileDates = Array.from(new Set(rows.map(r => normalizeDate(r.Fecha || r.fecha)).filter(Boolean)));
    if (fileDates.length > 0) {
      setDetectedFileDate(fileDates[0]);
    }

    // Determinar la fecha/conjunto contra el cual comparar destinos
    let effectiveCompareDate = compareMode;
    if (effectiveCompareDate === 'auto') {
      if ((transmittedAssignments[targetDate] || []).length > 0) {
        effectiveCompareDate = targetDate;
      } else {
        const otherWithRoutes = Object.keys(transmittedAssignments || {}).find(
          d => (transmittedAssignments[d] || []).length > 0
        );
        effectiveCompareDate = otherWithRoutes || targetDate;
      }
    }

    const transmittedDestinos = new Set();
    const transmittedRouteNumbers = new Set();
    let baselineRoutes = [];

    if (effectiveCompareDate === 'all') {
      Object.values(transmittedAssignments || {}).forEach(arr => {
        (arr || []).forEach(r => {
          baselineRoutes.push(r);
          if (r.ruta) transmittedRouteNumbers.add(String(r.ruta).trim().toUpperCase());
          (r.paradas || []).forEach(p => {
            const d = String(p.destino || '').trim().toUpperCase();
            if (d) transmittedDestinos.add(d);
          });
        });
      });
    } else {
      baselineRoutes = transmittedAssignments[effectiveCompareDate] || [];
      baselineRoutes.forEach(r => {
        if (r.ruta) transmittedRouteNumbers.add(String(r.ruta).trim().toUpperCase());
        (r.paradas || []).forEach(p => {
          const d = String(p.destino || '').trim().toUpperCase();
          if (d) transmittedDestinos.add(d);
        });
      });
    }

    // Agrupar filas del Excel en rutas candidatas para targetDate (¡Sin descartar filas por fecha!)
    const groups = new Map();
    rows.forEach((row, idx) => {
      const rutaRaw = row.Ruta || row.ruta || row['N° Ruta'] || row.RutaId || '';
      const ruta = String(rutaRaw).trim();
      if (!ruta) return;

      const nombreRuta = String(row['Nombre Ruta'] || row.nombre_ruta || row.NombreRuta || row.Cliente || '').trim();
      const destino = String(row.Destino || row.destino || '').trim();
      const direccion = String(row.Direccion || row.Dirección || row.direccion || '').trim();
      const comuna = String(row.Comuna || row.comuna || '').trim();
      const volumen = parseFloat(String(row.Volumen || row.volumen || 0).replace(',', '.')) || 0;
      const peso = parseFloat(String(row.Peso || row.peso || 0).replace(',', '.')) || 0;
      const cantCJ = parseFloat(String(row.cantCJ || row.cantcj || row.CantCJ || row.Cajas || 0).replace(',', '.')) || 0;
      const secuencia = row.Secuencia || row.secuencia || idx + 1;
      const ambiente = String(row.Ambiente || row.ambiente || row.Amb || 'S').trim().toUpperCase() || 'S';
      const horaIni = row.HoraIni || row.hora_ini || '';
      const horaFin = row.HoraFin || row.hora_fin || '';
      const transportista = String(row.Transportista || row.transportista || row.Transp || '').trim();

      const groupKey = `${ruta}:::${nombreRuta || 'Sin Nombre'}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: `special-${ruta}-${Date.now()}-${idx}`,
          ruta,
          nombreRuta: nombreRuta || `Ruta ${ruta}`,
          fecha: targetDate,
          transportistasSet: new Set(),
          destinosSet: new Set(),
          sumaVolumen: 0,
          sumaPeso: 0,
          sumaCantCJ: 0,
          paradasMap: new Map()
        });
      }

      const g = groups.get(groupKey);
      if (destino) g.destinosSet.add(destino);
      if (transportista) g.transportistasSet.add(transportista);
      g.sumaVolumen += volumen;
      g.sumaPeso += peso;
      g.sumaCantCJ += cantCJ;

      const paradaKey = `${secuencia}:::${ambiente}`;
      if (g.paradasMap.has(paradaKey)) {
        const p = g.paradasMap.get(paradaKey);
        p.volumen = Number((p.volumen + volumen).toFixed(4));
        p.peso = Number((p.peso + peso).toFixed(2));
        p.cantCJ = Math.round(p.cantCJ + cantCJ);
        if (!p.destino && destino) p.destino = destino;
        if (!p.direccion && direccion) p.direccion = direccion;
        if (!p.comuna && comuna) p.comuna = comuna;
      } else {
        const isNewDest = destino ? !transmittedDestinos.has(destino.toUpperCase()) : true;
        g.paradasMap.set(paradaKey, {
          id: `sp-${ruta}-s${secuencia}-${ambiente}-${g.paradasMap.size}`,
          secuencia,
          ambiente,
          destino,
          direccion,
          comuna,
          horaIni,
          horaFin,
          cantCJ: Math.round(cantCJ),
          peso: Number(peso.toFixed(2)),
          volumen: Number(volumen.toFixed(4)),
          transportista,
          isNewDestino: isNewDest
        });
      }
    });

    // Rutas candidatas
    const candidateRoutes = Array.from(groups.values()).map(g => {
      const paradas = Array.from(g.paradasMap.values());
      const newParadas = paradas.filter(p => p.isNewDestino);
      const distinctNewDestinos = new Set(newParadas.map(p => p.destino).filter(Boolean));
      const isNewRoute = !transmittedRouteNumbers.has(String(g.ruta).trim().toUpperCase());

      return {
        id: g.id,
        ruta: g.ruta,
        nombreRuta: g.nombreRuta,
        fecha: targetDate,
        transportista: Array.from(g.transportistasSet).filter(Boolean).join(', ') || 'Sin Transportista',
        recuentoDestino: g.destinosSet.size || paradas.length || 1,
        sumaVolumen: Number(g.sumaVolumen.toFixed(4)),
        sumaPeso: Number(g.sumaPeso.toFixed(2)),
        sumaCantCJ: Math.round(g.sumaCantCJ),
        paradas,
        newParadas,
        newDestinosCount: distinctNewDestinos.size,
        isNewRoute,
        hasNewDestinos: distinctNewDestinos.size > 0
      };
    });

    // Rutas especiales: nuevas o con destinos nuevos no transmitidos previamente
    const specialRoutes = candidateRoutes.filter(r => r.isNewRoute || r.hasNewDestinos);

    setSpecialAnalysisResult({
      targetDate,
      compareDate: effectiveCompareDate,
      totalParsedRoutes: candidateRoutes.length,
      specialRoutes,
      transmittedRoutesCount: baselineRoutes.length,
      transmittedDestinosCount: transmittedDestinos.size
    });

    setSelectedSpecialRouteIds(specialRoutes.map(r => r.id));

    if (specialRoutes.length > 0) {
      toast.success(`Se encontraron ${specialRoutes.length} rutas especiales con destinos no transmitidos.`);
    } else {
      toast.info(`No se encontraron diferencias. Todos los destinos ya coinciden con las rutas de ${effectiveCompareDate}.`);
    }
  };

  // Carga y procesamiento del archivo de Rutas Especiales
  const handleSpecialFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingSpecial(true);
    setSpecialFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const { sheetName, rows } = extractDataFromWorkbook(wb);

        if (!rows || rows.length === 0) {
          toast.error('El archivo Excel no contiene filas o está vacío.');
          setIsAnalyzingSpecial(false);
          return;
        }

        const validRows = rows.filter(row => {
          const rutaRaw = row.Ruta || row.ruta || row['N° Ruta'] || row.RutaId || '';
          return String(rutaRaw).trim().length > 0;
        });

        if (validRows.length === 0) {
          toast.error('No se encontraron filas con número de ruta en el archivo.');
          setIsAnalyzingSpecial(false);
          return;
        }

        setSpecialRawRows(validRows);
        analyzeSpecialRoutes(validRows, specialDate, specialCompareDate);
      } catch (err) {
        console.error('Error procesando rutas especiales:', err);
        toast.error('Error al analizar archivo para rutas especiales.');
      } finally {
        setIsAnalyzingSpecial(false);
      }
    };

    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleConfirmTransmitSpecialRoutes = () => {
    if (!specialAnalysisResult || !specialAnalysisResult.specialRoutes) return;
    const targetRoutes = specialAnalysisResult.specialRoutes.filter(r => 
      selectedSpecialRouteIds.includes(r.id)
    );

    if (targetRoutes.length === 0) {
      toast.warning('Selecciona al menos una ruta especial para transmitir.');
      return;
    }

    const ok = transmitSpecialRoutes(specialDate, targetRoutes);
    if (ok) {
      setIsSpecialModalOpen(false);
      setSpecialAnalysisResult(null);
      setSpecialFileName('');
      setSpecialRawRows([]);
      toast.success('Rutas Especiales transmitidas con éxito.', {
        action: {
          label: 'Ver Disponibilización',
          onClick: () => navigate('/assignment')
        }
      });
    }
  };

  // Run transformation
  const handleTransform = () => {
    const ok = transformRawRows();
    if (ok) {
      setActiveTab('ruteo');
    }
  };

  // Manejadores de selección de rutas (Requisito 1)
  const handleSelectAllRoutes = () => {
    setSelectedRouteIds(transformedRoutes.map(r => r.id));
  };

  const handleSelectStandardRoutes = () => {
    const stdIds = transformedRoutes
      .filter(r => /^[1-9]\d{3}$/.test(String(r.ruta).trim()))
      .map(r => r.id);
    setSelectedRouteIds(stdIds);
  };

  const handleSelectSpecialRoutes = () => {
    const specIds = transformedRoutes
      .filter(r => !/^[1-9]\d{3}$/.test(String(r.ruta).trim()))
      .map(r => r.id);
    setSelectedRouteIds(specIds);
  };

  const handleClearRouteSelection = () => {
    setSelectedRouteIds([]);
  };

  const toggleSelectRoute = (routeId) => {
    setSelectedRouteIds(prev => 
      prev.includes(routeId) ? prev.filter(id => id !== routeId) : [...prev, routeId]
    );
  };

  // Abrir Modal de Confirmación para Transmitir Seleccionadas (Requisito 1)
  const promptTransmitSelected = () => {
    if (!transformedRoutes || transformedRoutes.length === 0) {
      toast.error('No hay rutas transformadas para transmitir.');
      return;
    }
    const idsToTransmit = selectedRouteIds.length > 0 ? selectedRouteIds : transformedRoutes.map(r => r.id);
    const targetRoutes = transformedRoutes.filter(r => idsToTransmit.includes(r.id));
    
    if (targetRoutes.length === 0) {
      toast.warning('Selecciona al menos una ruta para transmitir.');
      return;
    }

    setTransmitModalData({
      type: idsToTransmit.length === transformedRoutes.length ? 'all' : 'specific',
      routeIds: idsToTransmit,
      routes: targetRoutes,
      fecha: targetRoutes[0]?.fecha || '28-10-2026'
    });
    setIsTransmitModalOpen(true);
  };

  // Abrir Modal de Confirmación para Transmitir Todo (Requisito 3)
  const promptTransmitAll = () => {
    if (!transformedRoutes || transformedRoutes.length === 0) {
      toast.error('No hay rutas transformadas para transmitir.');
      return;
    }
    setTransmitModalData({
      type: 'all',
      routeIds: transformedRoutes.map(r => r.id),
      routes: transformedRoutes,
      fecha: transformedRoutes[0]?.fecha || '28-10-2026'
    });
    setIsTransmitModalOpen(true);
  };

  // Abrir Modal de Confirmación para Transmitir Modificadas (Requisito 3)
  const promptTransmitModified = () => {
    const modified = transformedRoutes.filter(r => r.isModified);
    if (modified.length === 0) {
      toast.info('No hay rutas modificadas o aperturadas pendientes de transmitir.');
      return;
    }
    setTransmitModalData({
      type: 'modified',
      routeIds: modified.map(r => r.id),
      routes: modified,
      fecha: modified[0]?.fecha || '28-10-2026'
    });
    setIsTransmitModalOpen(true);
  };

  // Abrir Modal de Confirmación para Transmitir una ruta específica (Requisito 3)
  const promptTransmitSpecific = (routeIds) => {
    const targetRoutes = transformedRoutes.filter(r => routeIds.includes(r.id));
    if (targetRoutes.length === 0) {
      toast.error('No se encontraron las rutas seleccionadas.');
      return;
    }
    setTransmitModalData({
      type: 'specific',
      routeIds,
      routes: targetRoutes,
      fecha: targetRoutes[0]?.fecha || '28-10-2026'
    });
    setIsTransmitModalOpen(true);
  };

  // Acción confirmada dentro de la ventana flotante
  const confirmTransmitAction = () => {
    setIsTransmitModalOpen(false);
    if (transmitModalData.type === 'all') {
      const ok = transmitToDisponibilizacion();
      if (ok) {
        toast.success('Rutas transmitidas a Disponibilización exitosamente.', {
          action: {
            label: 'Ver Disponibilización',
            onClick: () => navigate('/assignment')
          }
        });
      }
    } else {
      const ok = transmitSpecificRoutesToDisponibilizacion(transmitModalData.routeIds);
      if (ok) {
        toast.success(`Transmitido a Disponibilización: ${transmitModalData.routes.length} ruta(s). El resto se mantuvo intacto.`, {
          action: {
            label: 'Ver Disponibilización',
            onClick: () => navigate('/assignment')
          }
        });
      }
    }
  };

  // Filter transformed routes (soporte para filtro estándar vs especiales)
  const filteredRoutes = useMemo(() => {
    return transformedRoutes.filter(r => {
      const isStandard = /^[1-9]\d{3}$/.test(String(r.ruta).trim());
      if (routeTypeFilter === 'standard' && !isStandard) return false;
      if (routeTypeFilter === 'special' && isStandard) return false;

      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        const matchRuta = String(r.ruta).toLowerCase().includes(lower);
        const matchNombre = String(r.nombreRuta || '').toLowerCase().includes(lower);
        const matchFecha = String(r.fecha || '').toLowerCase().includes(lower);
        if (!matchRuta && !matchNombre && !matchFecha) return false;
      }
      return true;
    });
  }, [transformedRoutes, routeTypeFilter, searchTerm]);

  // Conteo de rutas estándar vs especiales (Requisito 1)
  const standardRoutesCount = useMemo(() => {
    return transformedRoutes.filter(r => /^[1-9]\d{3}$/.test(String(r.ruta).trim())).length;
  }, [transformedRoutes]);
  const specialRoutesCount = transformedRoutes.length - standardRoutesCount;

  // Aggregated KPI numbers for Ruteo (Requisito 7: TOTAL LOCALES = suma de todos los "Recuento distinto de destino" cargados)
  const totalRutas = transformedRoutes.length;
  const totalLocales = useMemo(() => {
    return transformedRoutes.reduce((acc, r) => {
      const count = (r.recuentoDestino !== undefined && r.recuentoDestino !== null)
        ? Number(r.recuentoDestino)
        : (new Set((r.paradas || []).map(p => p.destino).filter(Boolean)).size || 1);
      return acc + (isNaN(count) ? 0 : count);
    }, 0);
  }, [transformedRoutes]);
  const totalVolumen = transformedRoutes.reduce((acc, r) => acc + (parseFloat(r.sumaVolumen) || 0), 0).toFixed(2);
  const totalCajas = transformedRoutes.reduce((acc, r) => acc + (parseInt(r.sumaCantCJ, 10) || 0), 0);
  const countModified = transformedRoutes.filter(r => r.isModified).length;

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 gap-4 overflow-hidden">
      
      {/* Header Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 font-bold px-2.5 py-0.5 rounded-full text-xs">
              Planificación
            </span>
            <h1 className="text-xl font-bold text-slate-800">Asignación Diaria</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Importa el archivo de ruteo Sheet1, transforma en tabla dinámica y transmite a Disponibilización.
          </p>
        </div>

        {/* Action Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('carga')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'carga'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload size={15} />
              1. Importar Sheet1
              {rawRows.length > 0 && (
                <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {rawRows.length}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                if (!isTransformed && rawRows.length > 0) {
                  transformRawRows();
                }
                setActiveTab('ruteo');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'ruteo'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={15} />
              2. Ruteo (Tabla Dinámica)
              {transformedRoutes.length > 0 && (
                <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {transformedRoutes.length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'carga' && rawRows.length > 0 && (
            <Button 
              onClick={handleTransform}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm text-xs font-bold px-4 py-2"
            >
              <Sparkles size={16} />
              Transformar
            </Button>
          )}

          {activeTab === 'ruteo' && transformedRoutes.length > 0 && (
            <Button 
              onClick={promptTransmitAll}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-sm text-xs font-bold px-4 py-2"
            >
              <Send size={15} />
              Transmitir a Disponibilización
            </Button>
          )}

          {/* Botón Rutas Especiales (Requisito 3) */}
          <Button
            onClick={() => {
              setSpecialDate(selectedDisponibilizarDate || '28-10-2026');
              setIsSpecialModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-sm transition-all"
            title="Cargar archivo Sheet1 y detectar rutas con destinos no transmitidos previamente"
          >
            <Sparkles size={14} />
            Rutas Especiales
          </Button>
        </div>
      </div>

      {/* Main Content Body */}
      {activeTab === 'carga' && (
        <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
          
          {/* Upload Area */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <FileSpreadsheet size={32} />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              {fileName ? `Archivo: ${fileName}` : 'Carga Masiva de Planificación (Sheet1)'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
              Arrastra o selecciona un archivo Excel (.xlsx, .xls) que contenga la hoja <span className="font-semibold text-slate-700">Sheet1</span> con las columnas de ruta, destinos, secuencia, volumen y fecha.
            </p>

            <div className="flex items-center gap-3">
              <label className="cursor-pointer">
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
                <span className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-sm">
                  <Upload size={16} />
                  {rawRows.length > 0 ? 'Reemplazar Archivo Excel' : 'Seleccionar Archivo Excel'}
                </span>
              </label>

              {rawRows.length > 0 && (
                <Button 
                  onClick={handleTransform}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm"
                >
                  <Sparkles size={16} />
                  Transformar a Ruteo Dinámico
                  <ArrowRight size={14} />
                </Button>
              )}
            </div>
          </div>

          {/* Raw Rows Preview */}
          {rawRows.length > 0 && (
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Table size={16} className="text-blue-600" />
                  <h4 className="font-bold text-xs text-slate-800">
                    Vista Previa de Filas Importadas ({rawRows.length} registros)
                  </h4>
                </div>
                <span className="text-[11px] text-slate-500">
                  Listo para transformar en tabla dinámica tipo Hoja1
                </span>
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-3 py-2 border-b">#</th>
                      <th className="px-3 py-2 border-b">Fecha</th>
                      <th className="px-3 py-2 border-b">Ruta</th>
                      <th className="px-3 py-2 border-b">Nombre Ruta</th>
                      <th className="px-3 py-2 border-b">Secuencia</th>
                      <th className="px-3 py-2 border-b">Destino</th>
                      <th className="px-3 py-2 border-b">Dirección</th>
                      <th className="px-3 py-2 border-b">Comuna</th>
                      <th className="px-3 py-2 border-b text-right">Volumen (m³)</th>
                      <th className="px-3 py-2 border-b text-right">Peso (kg)</th>
                      <th className="px-3 py-2 border-b text-right">Cant CJ</th>
                      <th className="px-3 py-2 border-b">Transportista</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {rawRows.slice(0, 100).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-blue-700">{normalizeDate(row.Fecha || row.fecha)}</td>
                        <td className="px-3 py-2 font-bold text-slate-800">{row.Ruta || row.ruta}</td>
                        <td className="px-3 py-2 text-slate-700">{row['Nombre Ruta'] || row.nombre_ruta}</td>
                        <td className="px-3 py-2 text-slate-500">{row.Secuencia || row.secuencia}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{row.Destino || row.destino}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate">{row.Direccion || row.direccion}</td>
                        <td className="px-3 py-2 text-slate-600">{row.Comuna || row.comuna}</td>
                        <td className="px-3 py-2 text-right font-mono">{row.Volumen || row.volumen || '-'}</td>
                        <td className="px-3 py-2 text-right font-mono">{row.Peso || row.peso || '-'}</td>
                        <td className="px-3 py-2 text-right font-mono">{row.cantCJ || row.cantcj || '-'}</td>
                        <td className="px-3 py-2 text-slate-500">{row.Transportista || row.transportista || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rawRows.length > 100 && (
                <div className="p-2 text-center text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
                  Mostrando las primeras 100 filas de {rawRows.length}. Presiona "Transformar" para agrupar todas las rutas.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ruteo Tab (Dynamic Pivot Table) */}
      {activeTab === 'ruteo' && (
        <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
          
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Rutas</p>
                <p className="text-2xl font-black text-slate-800">{totalRutas}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Layers size={20} />
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Locales</p>
                <p className="text-2xl font-black text-indigo-700">{totalLocales}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <MapPin size={20} />
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Metros Cúbicos (m³)</p>
                <p className="text-2xl font-black text-emerald-700">{totalVolumen}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Package size={20} />
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Cajas</p>
                <p className="text-2xl font-black text-purple-700">{totalCajas}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <Table size={20} />
              </div>
            </div>
          </div>

          {/* Ruteo Pivot Table */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                  <input 
                    type="text" 
                    placeholder="Filtrar por Ruta o Nombre..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 w-52 bg-white"
                  />
                </div>

                {/* Filtro por Tipo de Ruta (Requisito 1: Permitir ver y elegir rutas >4 dígitos y que parten con 0) */}
                <div className="flex items-center bg-slate-200/60 p-0.5 rounded-xl text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setRouteTypeFilter('all')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      routeTypeFilter === 'all'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todas ({transformedRoutes.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRouteTypeFilter('standard')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      routeTypeFilter === 'standard'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    4 Dígitos ({standardRoutesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRouteTypeFilter('special')}
                    className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                      routeTypeFilter === 'special'
                        ? 'bg-amber-50 text-amber-900 border border-amber-300 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Rutas con más de 4 dígitos o que inician con 0 (Sin ruteo)"
                  >
                    Sin ruteo ({specialRoutesCount})
                  </button>
                </div>

                {/* Acciones de selección rápida */}
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {selectedRouteIds.length} sel.
                  </span>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={handleSelectAllRoutes}
                    className="text-blue-600 hover:underline font-bold"
                  >
                    Todas
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={handleSelectStandardRoutes}
                    className="text-slate-600 hover:text-blue-700 hover:underline"
                    title="Marcar solo rutas estándar de 4 dígitos"
                  >
                    Solo 4 Díg.
                  </button>
                  {specialRoutesCount > 0 && (
                    <>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={handleSelectSpecialRoutes}
                        className="text-amber-700 hover:underline font-bold"
                        title="Marcar solo rutas con >4 dígitos o que inicien con 0"
                      >
                        Solo Espec.
                      </button>
                    </>
                  )}
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={handleClearRouteSelection}
                    className="text-slate-400 hover:text-red-600 hover:underline"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Botón Transmitir Modificadas */}
                {countModified > 0 && (
                  <Button 
                    onClick={promptTransmitModified}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-sm animate-pulse"
                    title="Transmite solo las rutas que fueron aperturadas o modificadas"
                  >
                    <Sparkles size={13} />
                    Modificadas ({countModified})
                  </Button>
                )}

                {/* Botón Transmitir Seleccionadas (Requisito 1: elegir cuáles transmitir) */}
                <Button 
                  onClick={promptTransmitSelected}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-sm"
                  title="Transmite las rutas que estén seleccionadas mediante las casillas"
                >
                  <Send size={13} />
                  Transmitir a Disponibilización ({selectedRouteIds.length})
                </Button>

                <Button 
                  variant="outline" 
                  onClick={() => navigate('/assignment')}
                  className="flex items-center gap-1 text-xs text-slate-600 hover:text-blue-700 py-1.5"
                >
                  Ver Disponibilización <ArrowRight size={13} />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 z-10 shadow-sm border-b border-slate-200">
                  <tr>
                    <th className="px-2 py-2.5 w-8 text-center">
                      <input 
                        type="checkbox" 
                        checked={transformedRoutes.length > 0 && selectedRouteIds.length === transformedRoutes.length}
                        onChange={(e) => e.target.checked ? handleSelectAllRoutes() : handleClearRouteSelection()}
                        className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                        title="Seleccionar / deseleccionar todas las rutas"
                      />
                    </th>
                    <th className="px-2 py-2.5 w-8 text-center"></th>
                    <th className="px-3 py-2.5">Fecha</th>
                    <th className="px-3 py-2.5">Ruta</th>
                    <th className="px-4 py-2.5">Nombre Ruta (Cliente)</th>
                    <th className="px-4 py-2.5 text-center">Recuento distinto de Destino</th>
                    <th className="px-4 py-2.5 text-right">Suma de Volumen (m³)</th>
                    <th className="px-4 py-2.5 text-right">Suma de Peso (kg)</th>
                    <th className="px-4 py-2.5 text-right">Suma de cantCJ</th>
                    <th className="px-3 py-2.5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRoutes.map((route) => {
                    const isExpanded = expandedRoute === route.id;
                    const isSelected = selectedRouteIds.includes(route.id);
                    const isSpecial = !/^[1-9]\d{3}$/.test(String(route.ruta).trim());

                    return (
                      <React.Fragment key={route.id}>
                        <tr 
                          onClick={() => setExpandedRoute(isExpanded ? null : route.id)}
                          className={`hover:bg-blue-50/40 cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50/20' : ''
                          }`}
                        >
                          <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => toggleSelectRoute(route.id)}
                              className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                              title={isSelected ? "Deseleccionar ruta para no transmitirla" : "Seleccionar ruta para transmitirla"}
                            />
                          </td>
                          <td className="px-2 py-2 text-center text-slate-400">
                            {isExpanded ? <ChevronDown size={15} className="text-blue-600" /> : <ChevronRight size={15} />}
                          </td>
                          <td className="px-3 py-2 font-medium text-blue-700">{route.fecha}</td>
                          <td className="px-3 py-2 font-black text-slate-800 text-sm">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{route.ruta}</span>
                              {isSpecial && (
                                <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-black px-1.5 py-0.2 rounded" title="Ruta especial: más de 4 dígitos o inicia en 0">
                                  {String(route.ruta).trim().startsWith('0') ? 'Inicia en 0' : '>4 Dígitos'}
                                </span>
                              )}
                              {route.isAperturada && (
                                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2 rounded-full" title={`Aperturada desde Ruta ${route.parentRuta || ''}`}>
                                  Aperturada
                                </span>
                              )}
                              {route.isModified && !route.isAperturada && (
                                <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.2 rounded-full" title="Ruta con paradas modificadas">
                                  Modificada
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 font-semibold text-slate-700">{route.nombreRuta}</td>
                          <td className="px-4 py-2 text-center font-bold">
                            <span className="inline-block bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-full text-xs">
                              {route.recuentoDestino || (new Set(route.paradas.map(p => p.destino)).size)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-emerald-700">{route.sumaVolumen}</td>
                          <td className="px-4 py-2 text-right font-mono text-slate-600">{route.sumaPeso}</td>
                          <td className="px-4 py-2 text-right font-mono text-slate-600">{route.sumaCantCJ}</td>
                          <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => promptTransmitSpecific([route.id])}
                                className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg border border-emerald-200 transition-colors shadow-2xs"
                                title="Transmitir solo esta ruta a Disponibilización manteniendo el resto intacto"
                              >
                                <Send size={11} />
                                Transmitir
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Paradas Detail Accordion (Requisito 6: en "Paradas" considerar el mismo número que en "Recuento distinto de destino") */}
                        {isExpanded && (
                          <tr className="bg-slate-50/80">
                            <td colSpan="10" className="p-3 pl-12">
                              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-inner">
                                <div className="flex items-center justify-between mb-2">
                                  <h5 className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                                    <MapPin size={14} className="text-red-500" />
                                    Detalle de Destinos / Paradas de Ruta {route.ruta} ({route.recuentoDestino || (new Set(route.paradas.map(p => p.destino)).size)} {Number(route.recuentoDestino || (new Set(route.paradas.map(p => p.destino)).size)) === 1 ? 'parada' : 'paradas'}):
                                  </h5>
                                </div>
                                <div className="max-h-60 overflow-auto">
                                  <table className="w-full text-left text-[11px] whitespace-nowrap">
                                    <thead className="bg-slate-100 text-slate-600">
                                      <tr>
                                        <th className="px-2.5 py-1.5">Sec</th>
                                        <th className="px-2.5 py-1.5 text-center">Ambiente</th>
                                        <th className="px-2.5 py-1.5">Destino</th>
                                        <th className="px-2.5 py-1.5">Dirección</th>
                                        <th className="px-2.5 py-1.5">Comuna</th>
                                        <th className="px-2.5 py-1.5">Horario</th>
                                        <th className="px-2.5 py-1.5 text-right">m³</th>
                                        <th className="px-2.5 py-1.5 text-right">Peso</th>
                                        <th className="px-2.5 py-1.5 text-right">CJ</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {route.paradas.map((p, pIdx) => (
                                        <tr key={p.id || pIdx} className="hover:bg-slate-50">
                                          <td className="px-2.5 py-1 font-bold text-slate-500">{p.secuencia}</td>
                                          <td className="px-2.5 py-1 text-center">
                                            <AmbienteBadge ambiente={p.ambiente} />
                                          </td>
                                          <td className="px-2.5 py-1 font-semibold text-slate-800">{p.destino}</td>
                                          <td className="px-2.5 py-1 text-slate-500">{p.direccion}</td>
                                          <td className="px-2.5 py-1 text-slate-600">{p.comuna}</td>
                                          <td className="px-2.5 py-1 text-slate-500 font-mono">
                                            {p.horaIni || p.horaFin ? `${p.horaIni} - ${p.horaFin}` : '-'}
                                          </td>
                                          <td className="px-2.5 py-1 text-right font-mono">{p.volumen}</td>
                                          <td className="px-2.5 py-1 text-right font-mono">{p.peso}</td>
                                          <td className="px-2.5 py-1 text-right font-mono">{p.cantCJ}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {filteredRoutes.length === 0 && (
                    <tr>
                      <td colSpan="10" className="px-4 py-12 text-center text-slate-500">
                        {transformedRoutes.length === 0 
                          ? 'No se han transformado rutas aún. Ve a "1. Importar Sheet1" y haz clic en "Transformar".' 
                          : 'No se encontraron rutas con el filtro ingresado.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL FLOTANTE DE ALERTA DE TRANSMISIÓN A DISPONIBILIZACIÓN (Requisito 3) */}
      {isTransmitModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-5 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Send size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 leading-tight">
                    Confirmar Transmisión a Disponibilización — Planificación
                  </h3>
                  <p className="text-xs text-slate-500">
                    Revisa las rutas consolidadas antes de transmitirlas a Disponibilización de Transporte.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsTransmitModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Metadatos */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 shrink-0">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Usuario</span>
                <span className="text-xs font-black text-slate-800 flex items-center gap-1 mt-0.5 truncate">
                  <User size={13} className="text-blue-600 shrink-0" />
                  {user?.name || user?.username || 'Hernán Soto'}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fecha Planif.</span>
                <span className="text-xs font-black text-blue-700 flex items-center gap-1 mt-0.5">
                  <Calendar size={13} className="shrink-0" />
                  {transmitModalData.fecha || '28-10-2026'}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Rutas a Cargar</span>
                <span className="text-xs font-black text-indigo-700 block mt-0.5">
                  {transmitModalData.routes.length} ruta(s)
                </span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Volumen Total</span>
                <span className="text-xs font-mono font-bold text-emerald-800 block mt-0.5">
                  {transmitModalData.routes.reduce((acc, r) => acc + (parseFloat(r.sumaVolumen) || 0), 0).toFixed(4)} m³
                </span>
              </div>
            </div>

            {/* Tabla resumen de rutas a transmitir */}
            <div className="flex-1 overflow-hidden border border-slate-200 rounded-xl flex flex-col min-h-0 bg-white shadow-inner">
              <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between text-xs text-slate-700 font-bold shrink-0">
                <span>Rutas Seleccionadas ({transmitModalData.routes.length})</span>
                <span className="text-[11px] font-normal text-slate-500">
                  {transmitModalData.type === 'all' ? 'Transmisión completa' : 'Transmisión parcial'}
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 z-10 text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Ruta</th>
                      <th className="px-3 py-2">Cliente / Nombre Ruta</th>
                      <th className="px-3 py-2">Transportista</th>
                      <th className="px-3 py-2 text-center">Ambientes</th>
                      <th className="px-3 py-2 text-center">Destinos</th>
                      <th className="px-3 py-2 text-right">m³</th>
                      <th className="px-3 py-2 text-right">Peso (kg)</th>
                      <th className="px-3 py-2 text-right">Cajas (CJ)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {transmitModalData.routes.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono font-black text-slate-900">
                          <span className="bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">{r.ruta}</span>
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-700 max-w-[200px] truncate" title={r.nombreRuta}>
                          {r.nombreRuta}
                        </td>
                        <td className="px-3 py-2 text-slate-600 font-bold">{r.transportista || 'T300'}</td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {(r.ambientes || []).map(amb => (
                              <AmbienteBadge key={amb} ambiente={amb} />
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-slate-700">{r.recuentoDestino}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{r.sumaVolumen}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600">{r.sumaPeso}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600">{r.sumaCantCJ}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0 mt-3">
              <span className="text-[11px] text-slate-500">
                Al confirmar, las rutas se cargarán en <strong className="text-slate-700">Disponibilización</strong> y podrás asignar choferes y camiones.
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsTransmitModalOpen(false)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={confirmTransmitAction}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Send size={14} />
                  Confirmar y Transmitir a Disponibilización
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CARGAR RUTAS ESPECIALES (Requisito 3) */}
      {isSpecialModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col p-6 animate-in fade-in zoom-in-95 overflow-hidden">
            
            {/* Header del modal */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    Cargar Rutas Especiales
                    <span className="bg-purple-100 text-purple-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-purple-200">
                      Hoja Sheet1
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Selecciona la fecha y carga el Excel para identificar automáticamente rutas diferentes con destinos no transmitidos previamente.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsSpecialModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Configuración de Fecha y Carga de Archivo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-4 border-b border-slate-100 shrink-0">
              
              {/* 1. Selector de Fecha de Planificación */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col justify-between gap-1.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    1. Fecha de Planificación:
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <input
                      type="text"
                      value={specialDate}
                      onChange={(e) => {
                        const newD = e.target.value;
                        setSpecialDate(newD);
                        if (specialRawRows.length > 0) analyzeSpecialRoutes(specialRawRows, newD, specialCompareDate);
                      }}
                      placeholder="DD-MM-YYYY"
                      className="px-2.5 py-1 text-xs font-bold border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 w-32 font-mono"
                    />
                    {Object.keys(transmittedAssignments || {}).slice(0, 2).map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          setSpecialDate(d);
                          if (specialRawRows.length > 0) analyzeSpecialRoutes(specialRawRows, d, specialCompareDate);
                        }}
                        className={`text-[10px] px-2 py-1 rounded-lg font-bold transition-all ${
                          specialDate === d
                            ? 'bg-purple-600 text-white shadow-2xs'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>

                  {/* Banner si el archivo tiene fecha distinta */}
                  {detectedFileDate && detectedFileDate !== specialDate && (
                    <div className="flex items-center justify-between gap-1 mt-1.5 bg-purple-100/90 border border-purple-200 px-2 py-1 rounded-lg text-[10px] text-purple-900">
                      <span>Archivo trae: <strong>{detectedFileDate}</strong></span>
                      <button
                        type="button"
                        onClick={() => {
                          setSpecialDate(detectedFileDate);
                          if (specialRawRows.length > 0) analyzeSpecialRoutes(specialRawRows, detectedFileDate, specialCompareDate);
                        }}
                        className="text-purple-700 underline font-bold hover:text-purple-950"
                      >
                        Usar fecha archivo
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                  <span>Rutas actuales en {specialDate}: <strong className="text-slate-700">{(transmittedAssignments[specialDate] || []).length}</strong></span>
                </div>
              </div>

              {/* 2. Selector de Comparación de Destinos */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col justify-between gap-1.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    2. Comparar destinos contra:
                  </label>
                  <select
                    value={specialCompareDate}
                    onChange={(e) => {
                      const mode = e.target.value;
                      setSpecialCompareDate(mode);
                      if (specialRawRows.length > 0) analyzeSpecialRoutes(specialRawRows, specialDate, mode);
                    }}
                    className="text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white w-full focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  >
                    <option value="auto">Automático (Recomendado)</option>
                    <option value={specialDate}>Fecha Planificación: {specialDate} ({(transmittedAssignments[specialDate] || []).length} rutas)</option>
                    {Object.keys(transmittedAssignments || {})
                      .filter(d => d !== specialDate && (transmittedAssignments[d] || []).length > 0)
                      .map(d => (
                        <option key={d} value={d}>Fecha {d} ({(transmittedAssignments[d] || []).length} rutas)</option>
                      ))
                    }
                    <option value="all">Todas las fechas transmitidas (Global)</option>
                  </select>
                </div>
                <div className="text-[10px] text-slate-500 leading-tight">
                  {specialAnalysisResult?.compareDate ? (
                    <span>
                      Comparando con: <strong className="text-purple-700 font-bold">{specialAnalysisResult.compareDate === 'all' ? 'Todas las fechas' : specialAnalysisResult.compareDate}</strong> ({specialAnalysisResult.transmittedRoutesCount} rutas base)
                    </span>
                  ) : (
                    <span>Compara destinos para detectar paradas o rutas que no existían.</span>
                  )}
                </div>
              </div>

              {/* 3. Selector de Archivo Excel */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col justify-between gap-1.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    3. Archivo Excel (Sheet1):
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all shadow-2xs">
                      <Upload size={13} />
                      {specialFileName ? 'Cambiar' : 'Subir Excel'}
                      <input 
                        type="file" 
                        accept=".xlsx, .xls, .csv" 
                        onChange={handleSpecialFileUpload} 
                        className="hidden" 
                      />
                    </label>
                    {specialFileName && (
                      <span className="text-[11px] font-medium text-slate-700 truncate max-w-[130px]" title={specialFileName}>
                        {specialFileName}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  {specialRawRows.length > 0 
                    ? `✓ ${specialRawRows.length} filas leídas exitosamente` 
                    : 'Excel con columnas de Ruta, Destino, Secuencia'}
                </p>
              </div>

            </div>

            {/* Área de Resultados y Análisis */}
            <div className="flex-1 flex flex-col min-h-0 py-3 overflow-hidden">
              {isAnalyzingSpecial ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500 gap-3">
                  <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs font-semibold">Analizando archivo y comparando con destinos transmitidos...</p>
                </div>
              ) : !specialAnalysisResult ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-400 flex items-center justify-center mb-2">
                    <FileSpreadsheet size={24} />
                  </div>
                  <h4 className="text-xs font-bold text-slate-600">Selecciona la fecha y sube el archivo Excel</h4>
                  <p className="text-[11px] text-slate-400 max-w-sm mt-1">
                    El sistema comparará cada ruta y destino del archivo contra lo que ya fue transmitido a Disponibilización para esa fecha.
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0 gap-3 overflow-hidden">
                  {/* Resumen KPIs del Análisis */}
                  <div className="grid grid-cols-4 gap-2 shrink-0">
                    <div className="bg-purple-50 border border-purple-200 p-2.5 rounded-xl">
                      <p className="text-[10px] font-bold text-purple-700 uppercase">Rutas Especiales</p>
                      <p className="text-xl font-black text-purple-900">{specialAnalysisResult.specialRoutes.length}</p>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-200 p-2.5 rounded-xl">
                      <p className="text-[10px] font-bold text-indigo-700 uppercase">Destinos Nuevos</p>
                      <p className="text-xl font-black text-indigo-900">
                        {specialAnalysisResult.specialRoutes.reduce((acc, r) => acc + (r.newDestinosCount || 0), 0)}
                      </p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                      <p className="text-[10px] font-bold text-emerald-700 uppercase">Volumen Total (m³)</p>
                      <p className="text-xl font-black text-emerald-900">
                        {specialAnalysisResult.specialRoutes.reduce((acc, r) => acc + (parseFloat(r.sumaVolumen) || 0), 0).toFixed(3)}
                      </p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
                      <p className="text-[10px] font-bold text-amber-700 uppercase">Peso Total (kg)</p>
                      <p className="text-xl font-black text-amber-900">
                        {specialAnalysisResult.specialRoutes.reduce((acc, r) => acc + (parseFloat(r.sumaPeso) || 0), 0).toFixed(1)}
                      </p>
                    </div>
                  </div>

                  {/* Acciones de selección rápida y Filtro por Tipo */}
                  <div className="flex items-center justify-between text-xs text-slate-500 px-1 shrink-0 flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Desplegable de Tipo (Requisito 2) */}
                      <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                        <Filter size={12} className="text-purple-600 shrink-0" />
                        <span className="text-[11px] font-bold text-slate-600">Tipo:</span>
                        <select
                          value={specialTipoFilter}
                          onChange={(e) => setSpecialTipoFilter(e.target.value)}
                          className="text-[11px] font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                        >
                          <option value="all">Todos los Tipos ({specialCounts.all})</option>
                          <option value="nueva">Nuevas Rutas ({specialCounts.nueva})</option>
                          <option value="destinos">Destinos Nuevos ({specialCounts.destinos})</option>
                          <option value="4digitos">4 Dígitos ({specialCounts.cuatroDigitos})</option>
                          <option value="sin_ruteo">Sin ruteo / No estándar ({specialCounts.sinRuteo})</option>
                        </select>
                      </div>

                      <span className="font-bold text-slate-700">
                        {selectedSpecialRouteIds.length} seleccionada(s) {specialTipoFilter !== 'all' ? `(${filteredSpecialRoutes.length} filtradas)` : `de ${specialAnalysisResult.specialRoutes.length}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const idsToSelect = filteredSpecialRoutes.map(r => r.id);
                          setSelectedSpecialRouteIds(prev => Array.from(new Set([...prev, ...idsToSelect])));
                        }}
                        className="text-purple-600 hover:underline font-bold text-[11px]"
                      >
                        Seleccionar {specialTipoFilter === 'all' ? 'todas' : 'filtradas'}
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedSpecialRouteIds([])}
                        className="text-slate-400 hover:text-red-600 hover:underline text-[11px]"
                      >
                        Limpiar
                      </button>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Comparado con {specialAnalysisResult.transmittedRoutesCount} rutas previas ({specialAnalysisResult.transmittedDestinosCount} destinos conocidos)
                    </span>
                  </div>

                  {/* Listado de Rutas Especiales Detectadas */}
                  {filteredSpecialRoutes.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                      <CheckCircle2 size={32} className="text-emerald-500 mb-2" />
                      <h4 className="text-sm font-bold text-slate-700">
                        {specialAnalysisResult.specialRoutes.length === 0 ? 'No hay destinos nuevos' : 'No hay rutas para este tipo seleccionado'}
                      </h4>
                      <p className="text-xs text-slate-500 max-w-sm mt-1">
                        {specialAnalysisResult.specialRoutes.length === 0 
                          ? `Todos los destinos de las ${specialAnalysisResult.totalParsedRoutes} rutas leídas del archivo ya coinciden con las rutas transmitidas de ${specialAnalysisResult.compareDate === 'all' ? 'todas las fechas' : specialAnalysisResult.compareDate}.`
                          : 'Prueba cambiando el filtro de Tipo en el menú desplegable superior.'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 text-[11px]">
                          <tr>
                            <th className="px-3 py-2 text-center w-8">
                              <input 
                                type="checkbox" 
                                checked={filteredSpecialRoutes.length > 0 && filteredSpecialRoutes.every(r => selectedSpecialRouteIds.includes(r.id))}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const idsToSelect = filteredSpecialRoutes.map(r => r.id);
                                    setSelectedSpecialRouteIds(prev => Array.from(new Set([...prev, ...idsToSelect])));
                                  } else {
                                    const filteredIdsSet = new Set(filteredSpecialRoutes.map(r => r.id));
                                    setSelectedSpecialRouteIds(prev => prev.filter(id => !filteredIdsSet.has(id)));
                                  }
                                }}
                                className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                              />
                            </th>
                            <th className="px-3 py-2 text-center">Tipo</th>
                            <th className="px-3 py-2">N° Ruta</th>
                            <th className="px-3 py-2">Cliente / Nombre Ruta</th>
                            <th className="px-3 py-2">Transportista</th>
                            <th className="px-3 py-2 text-center">Destinos Nuevos</th>
                            <th className="px-3 py-2 text-center">Total Locales</th>
                            <th className="px-3 py-2 text-right">Volumen (m³)</th>
                            <th className="px-3 py-2 text-right">Peso (kg)</th>
                            <th className="px-3 py-2 text-center w-16">Detalle</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {filteredSpecialRoutes.map((route) => {
                            const isSelected = selectedSpecialRouteIds.includes(route.id);
                            const isExpanded = expandedSpecialRouteId === route.id;

                            return (
                              <React.Fragment key={route.id}>
                                <tr className={`transition-colors ${isSelected ? 'bg-purple-50/60' : 'hover:bg-slate-50'}`}>
                                  <td className="px-3 py-2 text-center">
                                    <input 
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {
                                        setSelectedSpecialRouteIds(prev => 
                                          prev.includes(route.id) ? prev.filter(id => id !== route.id) : [...prev, route.id]
                                        );
                                      }}
                                      className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {route.isNewRoute ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                                        NUEVA RUTA
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                                        DESTINOS NUEVOS
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-mono font-bold text-slate-800">
                                    {route.ruta}
                                  </td>
                                  <td className="px-3 py-2 font-semibold text-slate-700 max-w-[200px] truncate">
                                    {route.nombreRuta}
                                  </td>
                                  <td className="px-3 py-2 text-slate-500 text-[11px]">
                                    {route.transportista || '—'}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span className="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full text-[11px]">
                                      +{route.newDestinosCount}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-center font-bold text-slate-700">
                                    {route.recuentoDestino}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                                    {route.sumaVolumen}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                                    {route.sumaPeso}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedSpecialRouteId(isExpanded ? null : route.id)}
                                      className="text-purple-600 hover:text-purple-800 text-[11px] font-bold p-1 rounded hover:bg-purple-50 transition-colors"
                                      title="Ver paradas de la ruta"
                                    >
                                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                  </td>
                                </tr>

                                {/* Fila expandida con detalle de paradas */}
                                {isExpanded && (
                                  <tr className="bg-slate-50/70">
                                    <td colSpan="10" className="p-3 pl-12 border-y border-purple-100">
                                      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                                        <h5 className="font-bold text-xs text-slate-700 mb-2 flex items-center gap-2">
                                          <span>Paradas de la Ruta {route.ruta} ({route.paradas.length} total):</span>
                                          <span className="text-purple-700 font-semibold text-[11px]">
                                            • {route.newParadas.length} parada(s) no transmitida(s) previamente
                                          </span>
                                        </h5>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-auto">
                                          {route.paradas.map((p, pIdx) => (
                                            <div 
                                              key={p.id || pIdx}
                                              className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                                                p.isNewDestino 
                                                  ? 'bg-purple-50/80 border-purple-300 font-medium' 
                                                  : 'bg-slate-50 border-slate-200 text-slate-500'
                                              }`}
                                            >
                                              <div className="flex items-center gap-1.5 truncate">
                                                <span className="font-mono text-slate-400 text-[11px]">#{p.secuencia}</span>
                                                <span className="truncate font-bold text-slate-800">{p.destino}</span>
                                                {p.comuna && (
                                                  <span className="text-slate-400 text-[10px]">({p.comuna})</span>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-[10px] text-slate-600">{p.volumen} m³</span>
                                                {p.isNewDestino ? (
                                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-purple-600 text-white uppercase">
                                                    Nuevo
                                                  </span>
                                                ) : (
                                                  <span className="text-[9px] text-slate-400 italic">
                                                    Ya existía
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer del Modal */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 shrink-0">
              <span className="text-[11px] text-slate-500">
                Se agregarán o actualizarán en Disponibilización para el <strong className="text-slate-800">{specialDate}</strong>.
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsSpecialModalOpen(false)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleConfirmTransmitSpecialRoutes}
                  disabled={!specialAnalysisResult || selectedSpecialRouteIds.length === 0}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Send size={14} />
                  Transmitir Rutas Especiales ({selectedSpecialRouteIds.length})
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

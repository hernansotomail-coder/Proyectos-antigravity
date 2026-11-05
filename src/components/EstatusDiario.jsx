import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { toBlob, toPng } from 'html-to-image';
import { 
  FileSpreadsheet, UploadCloud, Calendar, Download, RefreshCw, 
  CheckCircle2, AlertTriangle, Building2, Fuel, TrendingUp, Layers, 
  Search, Copy, Check, Info, FileText, ArrowUpRight, BarChart3,
  Truck, ShieldCheck, XCircle, X, Eye, Clock, LayoutDashboard,
  Camera, Image as ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/Button';
import { usePlanningStore, normalizeDate } from '../store/planningStore';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';

// Hojas oficiales a procesar
export const HOJAS_OBJETIVO = [
  'Oxxo', 'Subway', 'Cantabria', 'Newrest', 'Juan Valdez',
  'Keyfoods', 'El Golfo', 'Petrolera', 'Carls jr', 'Streat Burguer', 'Sbarro'
];

// Matriz de estados prioritarios / base
export const COLUMNAS_ESTADO_BASE = ['2DA VUELTA', 'CDC', 'EN RUTA', 'EN EL PUNTO', 'ENTREGADO'];

// Estados considerados para cálculo de avance global
export const ESTADOS_AVANCE_GLOBAL = new Set([
  'ENTREGADO', 'EN EL PUNTO', 'RECHAZADO', 'L. CERRADO', 'PARCIAL', 'NO SALIO', 'RETORNANDO'
]);

// Clasificación de Clientes Petroleras
export function clasificarClientePetrolera(destino) {
  if (!destino || typeof destino !== 'string') return 'OTROS';
  const destUpper = destino.toUpperCase();
  if (/PRONTO|BARRA|EXPRESS|USS LOS LEONES|UAI STGO|METRO PEDRO DE VALDIVIA/.test(destUpper)) {
    return 'COPEC';
  }
  if (/SHELL|UPA|UPITA/.test(destUpper)) {
    return 'ENEX';
  }
  if (/ASTOP/.test(destUpper)) {
    return 'ESMAX';
  }
  return 'OTROS';
}

// Clasificación de Formato Copec
export function clasificarFormatoCopec(destino) {
  if (!destino || typeof destino !== 'string') return null;
  const destUpper = destino.toUpperCase();
  if (/EXPRESS/.test(destUpper)) {
    return 'Express';
  }
  if (/BARRA/.test(destUpper)) {
    return 'Barra';
  }
  if (/PRONTO|USS LOS LEONES|UAI STGO|METRO PEDRO DE VALDIVIA/.test(destUpper)) {
    return 'Pronto';
  }
  return null;
}

// Función para normalizar cualquier fecha a YYYY-MM-DD y DD-MM-YYYY
export function parseDateToIso(fVal) {
  if (!fVal) return null;
  
  if (fVal instanceof Date && !isNaN(fVal.getTime())) {
    const y = fVal.getUTCFullYear();
    const m = String(fVal.getUTCMonth() + 1).padStart(2, '0');
    const d = String(fVal.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Si es número de serie de Excel (e.g. 46181)
  if (typeof fVal === 'number' && fVal > 20000 && fVal < 80000) {
    const jsDate = new Date(Math.round((fVal - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) {
      const y = jsDate.getUTCFullYear();
      const m = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(jsDate.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(fVal).trim();
  if (!str) return null;

  // Separadores comunes: - o / o .
  const parts = str.split(/[T ]/)[0].split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${y}-${m}-${d}`;
    } else {
      // DD-MM-YYYY (dayfirst=True)
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
      return `${y}-${m}-${d}`;
    }
  }

  return null;
}

export function isoToDmy(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return '';
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return isoStr;
}

export function dmyToIso(dmyStr) {
  if (!dmyStr || typeof dmyStr !== 'string') return '';
  const clean = dmyStr.trim().replace(/[/.]/g, '-');
  const parts = clean.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return clean;
}

// Retorna la fecha actual en Chile como 'YYYY-MM-DD'
export function getChileLocalDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

// Verifica si un registro guardado sigue siendo válido hoy en Chile (hasta las 23:59:59)
export function isEstatusRecordValid(record) {
  if (!record || typeof record !== 'object') return false;
  if (!record.processedData) return false;
  
  const todayChile = getChileLocalDateString(new Date());

  // 1. Si dateChile coincide con hoy en Chile
  if (record.dateChile && record.dateChile === todayChile) {
    return true;
  }

  // 2. Si savedAt fue guardado en la misma fecha local de Chile
  if (record.savedAt) {
    try {
      const savedDate = new Date(record.savedAt);
      if (!isNaN(savedDate.getTime())) {
        const savedChile = getChileLocalDateString(savedDate);
        if (savedChile === todayChile) {
          return true;
        }
      }
    } catch (e) {}
  }

  return false;
}

export default function EstatusDiario() {
  const { user } = useAuthStore();

  // Pestaña principal activa: 'matrices' (Reporte y Matrices) o 'carga' (Carga de Información)
  const [mainTab, setMainTab] = useState('matrices');

  // Estado del archivo y procesamiento
  const [file, setFile] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [availableSheets, setAvailableSheets] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [fechaCorte, setFechaCorte] = useState(''); // Formato DD-MM-YYYY
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedData, setProcessedData] = useState(null);
  const [remoteInfo, setRemoteInfo] = useState(null); // { uploadedBy, savedAt, dateChile }
  const [cachedDispMetrics, setCachedDispMetrics] = useState(null);

  // Sub-pestañas de filtro de tablas
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'rep4', 'rep2', 'rep3', 'rep1'
  const [isDragging, setIsDragging] = useState(false);

  // Estados para captura y copiado de imágenes
  const [capturingSection, setCapturingSection] = useState(null);
  const [copiedSection, setCopiedSection] = useState(null);

  // Referencias DOM para capturar las tablas y el reporte completo como imagen
  const tableRefRep4 = useRef(null);
  const tableRefRep2 = useRef(null);
  const tableRefRep3 = useRef(null);
  const tableRefRep1 = useRef(null);
  const fullReportRef = useRef(null);
  const fileInputRef = useRef(null);

  // Sincronización Realtime con Supabase y verificación de vigencia diaria (23:59 hrs Chile)
  useEffect(() => {
    let isMounted = true;

    // 1. Cargar estatus activo al montar
    const loadRemoteStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('planning_assignments')
          .select('*')
          .eq('fecha', '__estatus_diario__')
          .maybeSingle();

        if (!error && data && data.assignments && isMounted) {
          const record = data.assignments;
          if (isEstatusRecordValid(record)) {
            setProcessedData(record.processedData);
            if (record.fechaCorte) setFechaCorte(record.fechaCorte);
            if (record.dispMetrics) setCachedDispMetrics(record.dispMetrics);
            setRemoteInfo({
              uploadedBy: record.uploadedBy || 'Usuario',
              savedAt: record.savedAt,
              dateChile: record.dateChile
            });
            // Si hay datos válidos cargados, posicionarse en la pestaña de matrices
            setMainTab('matrices');
          } else {
            // El registro expiró o no es válido para hoy.
            // NOTA IMPORTANTE: No se ejecuta .delete() desde el cliente lector para evitar borrados accidentales
            setProcessedData(null);
            setRemoteInfo(null);
          }
        }
      } catch (err) {
        console.warn('Error al consultar estatus diario remoto en Supabase:', err);
      }
    };

    loadRemoteStatus();

    // 2. Suscripción en Tiempo Real para recibir cambios instantáneos desde cualquier computador
    const channel = supabase
      .channel('realtime:estatus_diario')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'planning_assignments',
        filter: 'fecha=eq.__estatus_diario__'
      }, (payload) => {
        if (!isMounted) return;
        if (payload.eventType === 'DELETE' || !payload.new || !payload.new.assignments) {
          setProcessedData(null);
          setRemoteInfo(null);
          return;
        }

        const record = payload.new.assignments;
        if (isEstatusRecordValid(record)) {
          setProcessedData(record.processedData);
          if (record.fechaCorte) setFechaCorte(record.fechaCorte);
          if (record.dispMetrics) setCachedDispMetrics(record.dispMetrics);
          setRemoteInfo({
            uploadedBy: record.uploadedBy || 'Usuario',
            savedAt: record.savedAt,
            dateChile: record.dateChile
          });
          setMainTab('matrices');
          toast.info(`Estatus diario actualizado en vivo por ${record.uploadedBy || 'otro usuario'}.`);
        } else {
          setProcessedData(null);
          setRemoteInfo(null);
        }
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // 3. Monitoreo continuo de medianoche (23:59 hrs Hora Chile) para resetear automáticamente
  useEffect(() => {
    if (!processedData) return;

    const checkMidnightExpiry = () => {
      const todayChile = getChileLocalDateString(new Date());
      if (remoteInfo?.dateChile && remoteInfo.dateChile !== todayChile) {
        setProcessedData(null);
        setRemoteInfo(null);
        setFile(null);
        setWorkbook(null);
        toast.info('Medianoche alcanzada (23:59 hrs): El estatus diario se ha reiniciado automáticamente.');
      }
    };

    const interval = setInterval(checkMidnightExpiry, 20000);
    return () => clearInterval(interval);
  }, [processedData, remoteInfo]);

  // Función para reiniciar / limpiar el estatus manualmente si se desea cambiar antes de 23:59
  const handleResetStatus = async () => {
    if (!window.confirm('¿Deseas reiniciar y limpiar el estatus diario para todos los computadores?')) return;
    try {
      setProcessedData(null);
      setRemoteInfo(null);
      setCachedDispMetrics(null);
      setFile(null);
      setWorkbook(null);
      await supabase.from('planning_assignments').delete().eq('fecha', '__estatus_diario__');
      toast.success('Estatus diario reiniciado exitosamente.');
    } catch (e) {
      toast.error('Error al reiniciar: ' + e.message);
    }
  };

  // Integración con Disponibilización
  const { transmittedAssignments, savedRuteoByDate, initPlanningFromDb } = usePlanningStore();
  const [dispRowsFromDb, setDispRowsFromDb] = useState(null);
  const [isLoadingDisp, setIsLoadingDisp] = useState(false);
  const [showUncoveredModal, setShowUncoveredModal] = useState(false);

  useEffect(() => {
    initPlanningFromDb?.();
  }, [initPlanningFromDb]);

  // Cargar disponibilización de Supabase si la fecha activa cambia
  useEffect(() => {
    if (!fechaCorte) {
      setDispRowsFromDb(null);
      return;
    }
    const cleanF = normalizeDate(fechaCorte) || fechaCorte;
    let isMounted = true;
    const fetchDisp = async () => {
      setIsLoadingDisp(true);
      try {
        const { data, error } = await supabase
          .from('planning_assignments')
          .select('*')
          .or(`fecha.eq.${cleanF},fecha.eq.${fechaCorte}`);
        if (!error && data && data.length > 0 && isMounted) {
          const found = data.find(d => Array.isArray(d.assignments) && d.assignments.length > 0);
          if (found) {
            setDispRowsFromDb(found.assignments);
          }
        }
      } catch (e) {
        console.warn('Error al consultar Disponibilización en Supabase:', e);
      } finally {
        if (isMounted) setIsLoadingDisp(false);
      }
    };
    fetchDisp();
    return () => { isMounted = false; };
  }, [fechaCorte]);

  // Obtener filas de disponibilización activas para la fecha
  const activeDispRows = useMemo(() => {
    if (!fechaCorte) return [];
    const cleanF = normalizeDate(fechaCorte) || fechaCorte;
    
    if (dispRowsFromDb && dispRowsFromDb.length > 0) return dispRowsFromDb;
    
    if (transmittedAssignments) {
      if (transmittedAssignments[cleanF]?.length > 0) return transmittedAssignments[cleanF];
      if (transmittedAssignments[fechaCorte]?.length > 0) return transmittedAssignments[fechaCorte];
      const match = Object.keys(transmittedAssignments).find(k => normalizeDate(k) === cleanF);
      if (match && transmittedAssignments[match]?.length > 0) return transmittedAssignments[match];
    }
    
    if (savedRuteoByDate) {
      if (savedRuteoByDate[cleanF]?.length > 0) return savedRuteoByDate[cleanF];
      if (savedRuteoByDate[fechaCorte]?.length > 0) return savedRuteoByDate[fechaCorte];
    }
    
    return [];
  }, [fechaCorte, dispRowsFromDb, transmittedAssignments, savedRuteoByDate]);

  // Métricas de Rutas Cubiertas vs No Cubiertas calculadas localmente
  const dispMetrics = useMemo(() => {
    if (!activeDispRows || activeDispRows.length === 0) {
      return {
        total: 0,
        cubiertas: 0,
        noCubiertas: 0,
        pctCubiertas: 0,
        rutasCubiertas: [],
        rutasNoCubiertas: [],
        hasData: false
      };
    }

    const cubiertas = [];
    const noCubiertas = [];

    activeDispRows.forEach(r => {
      const cond = String(r.conductor_name || r.conductor || '').trim();
      const hasCond = cond !== '' && cond.toLowerCase() !== 'sin asignar';
      
      const cam = String(r.camion || r.patente || '').trim();
      const hasCam = cam !== '' && cam.toLowerCase() !== 'sin asignar';

      if (hasCond && hasCam) {
        cubiertas.push(r);
      } else {
        noCubiertas.push({
          ...r,
          missingCond: !hasCond,
          missingCam: !hasCam
        });
      }
    });

    const total = activeDispRows.length;
    const pct = total > 0 ? (cubiertas.length / total) * 100 : 0;

    return {
      total,
      cubiertas: cubiertas.length,
      noCubiertas: noCubiertas.length,
      pctCubiertas: pct,
      rutasCubiertas: cubiertas,
      rutasNoCubiertas: noCubiertas,
      hasData: true
    };
  }, [activeDispRows]);

  // Métricas efectivas: si el equipo actual ya calculó métricas las usa; si no, utiliza las cacheadas desde Supabase
  const effectiveDisp = useMemo(() => {
    if (dispMetrics.hasData) return dispMetrics;
    if (cachedDispMetrics && cachedDispMetrics.hasData) return cachedDispMetrics;
    return dispMetrics;
  }, [dispMetrics, cachedDispMetrics]);

  // Manejo de carga de archivo Excel
  const handleFileUpload = (selectedFile) => {
    if (!selectedFile) return;

    const fileExt = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'xlsm'].includes(fileExt)) {
      toast.error('Por favor selecciona un archivo Excel válido (.xlsx, .xls)');
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        setWorkbook(wb);

        // Detectar hojas presentes coincidentes
        const found = wb.SheetNames.filter(name => 
          HOJAS_OBJETIVO.some(h => h.toLowerCase() === name.trim().toLowerCase())
        );
        setAvailableSheets(found);

        // Escanear fechas disponibles en el archivo para sugerirlas al usuario
        const datesSet = new Set();
        found.forEach(sName => {
          const ws = wb.Sheets[sName];
          if (!ws) return;
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (rows.length < 2) return;
          const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
          const fIdx = headers.findIndex(h => h === 'fecha');
          if (fIdx === -1) return;

          for (let i = 1; i < rows.length; i++) {
            const val = rows[i][fIdx];
            const iso = parseDateToIso(val);
            if (iso && iso.startsWith('20')) {
              datesSet.add(iso);
            }
          }
        });

        const sortedDates = Array.from(datesSet).sort().reverse();
        setAvailableDates(sortedDates);

        if (sortedDates.length > 0) {
          const mostRecentDmy = isoToDmy(sortedDates[0]);
          setFechaCorte(mostRecentDmy);
          toast.success(`Archivo cargado con éxito. Se detectaron ${found.length} hojas operativas y ${sortedDates.length} fechas.`);
        } else {
          toast.info(`Archivo cargado. Hojas encontradas: ${found.length}`);
        }
      } catch (err) {
        console.error(err);
        toast.error('Error al procesar el archivo Excel: ' + err.message);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Procesamiento de las 4 tablas pivote
  const procesarReporte = async () => {
    if (!workbook) {
      toast.error('Por favor carga primero un archivo Excel de operaciones.');
      return;
    }
    if (!fechaCorte || !fechaCorte.trim()) {
      toast.error('Por favor ingresa o selecciona la fecha de corte (DD-MM-YYYY).');
      return;
    }

    const isoTarget = dmyToIso(fechaCorte);
    if (!isoTarget || isoTarget.length < 8) {
      toast.error('Formato de fecha inválido. Ingrese una fecha en formato DD-MM-YYYY.');
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Extracción y Limpieza de Hojas a consolidar
      const allRows = [];

      HOJAS_OBJETIVO.forEach(targetName => {
        const realSheetName = workbook.SheetNames.find(
          name => name.trim().toLowerCase() === targetName.toLowerCase()
        );
        if (!realSheetName) return;

        const ws = workbook.Sheets[realSheetName];
        if (!ws) return;

        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (raw.length < 2) return;

        // Fila de encabezados normalizada a minúsculas
        const headers = raw[0].map(h => String(h || '').trim().toLowerCase());
        
        // Mapeo flexible de columnas clave
        const findColIdx = (aliases) => headers.findIndex(h => aliases.includes(h));
        
        const rutaIdx = findColIdx(['ruta', 'id ruta', 'n_ruta', 'n° ruta']);
        const fechaIdx = findColIdx(['fecha', 'fec', 'date']);
        const estadoIdx = findColIdx(['estado', 'status', 'estatus']);
        const destinoIdx = findColIdx(['destino', 'cliente', 'local', 'nombre punto']);

        if (rutaIdx === -1 || fechaIdx === -1 || estadoIdx === -1) {
          return;
        }

        // Lógica forward-fill (ffill) para la columna 'Ruta'
        let lastRuta = '';

        for (let i = 1; i < raw.length; i++) {
          const row = raw[i];
          
          // Ruta con ffill
          const currentRuta = String(row[rutaIdx] || '').trim();
          if (currentRuta !== '') {
            lastRuta = currentRuta;
          }
          const rutaFinal = lastRuta;

          // Fecha: normalización con lógica dayfirst=True
          const fechaVal = row[fechaIdx];
          const rowIso = parseDateToIso(fechaVal);

          // Filtrar estrictamente por la fecha seleccionada
          if (rowIso !== isoTarget) {
            continue;
          }

          // Estado: strip().upper()
          const estado = String(row[estadoIdx] || '').trim().toUpperCase();
          if (!estado) continue;

          // Destino para reglas de Petrolera
          const destino = destinoIdx !== -1 ? String(row[destinoIdx] || '').trim() : '';

          // Clasificaciones especiales para Petrolera
          let clientePetrolera = 'OTROS';
          let formatoCopec = null;
          if (targetName.toLowerCase() === 'petrolera') {
            clientePetrolera = clasificarClientePetrolera(destino);
            formatoCopec = clasificarFormatoCopec(destino);
          }

          allRows.push({
            Cuenta: targetName,
            Ruta: rutaFinal,
            FechaIso: rowIso,
            Estado: estado,
            Destino: destino,
            Clientes_Petroleras: clientePetrolera,
            Formato_Copec: formatoCopec
          });
        }
      });

      // Si no hay registros, advertir y detener la ejecución
      if (allRows.length === 0) {
        toast.warning(`No se encontraron registros para la fecha ${fechaCorte}. Verifique que la fecha coincida con los datos del archivo.`);
        setIsProcessing(false);
        return;
      }

      // Helper para construir tablas pivote
      const buildPivotTable = (rows, rowKey, calcAvance = false) => {
        const rowVals = Array.from(new Set(rows.map(r => r[rowKey]))).filter(Boolean).sort();
        const foundStates = Array.from(new Set(rows.map(r => r.Estado))).filter(Boolean);

        // Columnas base prioritarias siempre al inicio, luego los estados adicionales ordenados
        const otherStates = foundStates.filter(s => !COLUMNAS_ESTADO_BASE.includes(s)).sort();
        const stateCols = [...COLUMNAS_ESTADO_BASE, ...otherStates];

        const matrix = [];
        const colTotals = {};
        stateCols.forEach(c => (colTotals[c] = 0));
        let grandTotal = 0;

        rowVals.forEach(val => {
          const rowItems = rows.filter(r => r[rowKey] === val);
          const rowObj = { [rowKey]: val };
          let rowSum = 0;

          stateCols.forEach(st => {
            const cnt = rowItems.filter(r => r.Estado === st).length;
            rowObj[st] = cnt;
            rowSum += cnt;
            colTotals[st] += cnt;
          });

          rowObj['Total general'] = rowSum;
          grandTotal += rowSum;

          if (calcAvance) {
            const entregado = rowObj['ENTREGADO'] || 0;
            const enPunto = rowObj['EN EL PUNTO'] || 0;
            const avanceNum = rowSum > 0 ? ((entregado + enPunto) / rowSum) * 100 : 0;
            rowObj['Avance'] = `${avanceNum.toFixed(2)}%`;
            rowObj['_avanceNum'] = avanceNum;
          }

          matrix.push(rowObj);
        });

        // Fila Total General
        const totalRow = { [rowKey]: 'Total general' };
        stateCols.forEach(c => (totalRow[c] = colTotals[c]));
        totalRow['Total general'] = grandTotal;

        if (calcAvance) {
          const entregado = totalRow['ENTREGADO'] || 0;
          const enPunto = totalRow['EN EL PUNTO'] || 0;
          const avanceNum = grandTotal > 0 ? ((entregado + enPunto) / grandTotal) * 100 : 0;
          totalRow['Avance'] = `${avanceNum.toFixed(2)}%`;
          totalRow['_avanceNum'] = avanceNum;
        }

        matrix.push(totalRow);

        return { matrix, stateCols };
      };

      // 1. Reporte 1 (General): Filas por 'Cuenta', columnas estados + 'Total general'
      const rep1 = buildPivotTable(allRows, 'Cuenta', false);

      // 2. Reporte 2 (Clientes Petroleras): Filtrar Petrolera excluyendo 'OTROS'. Filas por 'Clientes_Petroleras' + 'Avance'
      const rowsPetrolera = allRows.filter(
        r => r.Cuenta.toLowerCase() === 'petrolera' && r.Clientes_Petroleras !== 'OTROS'
      );
      const rep2 = buildPivotTable(rowsPetrolera, 'Clientes_Petroleras', true);

      // 3. Reporte 3 (Formatos Copec): Filtrar registros Petrolera con formato no nulo + 'Avance'
      const rowsCopec = allRows.filter(
        r => r.Cuenta.toLowerCase() === 'petrolera' && r.Formato_Copec !== null
      );
      const rep3 = buildPivotTable(rowsCopec, 'Formato_Copec', true);

      // 4. Reporte 4 (Resumen de Avance por Cuenta): ['Cuenta de Destino', 'Registros Exitosos', 'Total General', 'Avance']
      const cuentasUnicas = Array.from(new Set(allRows.map(r => r.Cuenta))).sort();
      const rep4Rows = [];
      let grandExitosos = 0;
      let grandTotalRep4 = 0;

      cuentasUnicas.forEach(cta => {
        const ctaItems = allRows.filter(r => r.Cuenta === cta);
        const exitosos = ctaItems.filter(r => ESTADOS_AVANCE_GLOBAL.has(r.Estado)).length;
        const tot = ctaItems.length;
        grandExitosos += exitosos;
        grandTotalRep4 += tot;
        const pct = tot > 0 ? (exitosos / tot) * 100 : 0;

        rep4Rows.push({
          'Cuenta de Destino': cta,
          'Registros Exitosos': exitosos,
          'Total General': tot,
          'Avance': `${pct.toFixed(2)}%`,
          _avanceNum: pct
        });
      });

      const pctGlobal = grandTotalRep4 > 0 ? (grandExitosos / grandTotalRep4) * 100 : 0;
      rep4Rows.push({
        'Cuenta de Destino': 'Total general',
        'Registros Exitosos': grandExitosos,
        'Total General': grandTotalRep4,
        'Avance': `${pctGlobal.toFixed(2)}%`,
        _avanceNum: pctGlobal
      });

      const dataToSave = {
        fechaCorteDmy: isoToDmy(isoTarget),
        fechaIso: isoTarget,
        totalRegistros: allRows.length,
        totalCuentas: cuentasUnicas.length,
        grandExitosos,
        pctGlobal,
        rep1,
        rep2,
        rep3,
        rep4: rep4Rows
      };

      setProcessedData(dataToSave);
      const todayChile = getChileLocalDateString(new Date());

      // Calcular métricas de disponibilización actuales para persistirlas junto con el reporte
      let metricsToSave = dispMetrics.hasData ? dispMetrics : null;

      // Si no estaban calculadas aún, intentar obtenerlas de activeDispRows o de Supabase directamente
      if (!metricsToSave) {
        try {
          const cleanF = normalizeDate(isoToDmy(isoTarget)) || isoToDmy(isoTarget);
          const { data: dData } = await supabase
            .from('planning_assignments')
            .select('*')
            .or(`fecha.eq.${cleanF},fecha.eq.${isoToDmy(isoTarget)}`);
          if (dData && dData.length > 0) {
            const found = dData.find(d => Array.isArray(d.assignments) && d.assignments.length > 0);
            if (found && found.assignments.length > 0) {
              const cubiertas = [];
              const noCubiertas = [];
              found.assignments.forEach(r => {
                const cond = String(r.conductor_name || r.conductor || '').trim();
                const hasCond = cond !== '' && cond.toLowerCase() !== 'sin asignar';
                const cam = String(r.camion || r.patente || '').trim();
                const hasCam = cam !== '' && cam.toLowerCase() !== 'sin asignar';
                if (hasCond && hasCam) {
                  cubiertas.push(r);
                } else {
                  noCubiertas.push({ ...r, missingCond: !hasCond, missingCam: !hasCam });
                }
              });
              metricsToSave = {
                total: found.assignments.length,
                cubiertas: cubiertas.length,
                noCubiertas: noCubiertas.length,
                pctCubiertas: (cubiertas.length / found.assignments.length) * 100,
                rutasCubiertas: cubiertas,
                rutasNoCubiertas: noCubiertas,
                hasData: true
              };
            }
          }
        } catch (mErr) {
          console.warn('Error al computar metricsToSave:', mErr);
        }
      }

      if (metricsToSave) {
        setCachedDispMetrics(metricsToSave);
      }

      const payload = {
        processedData: dataToSave,
        dispMetrics: metricsToSave,
        fechaCorte: isoToDmy(isoTarget),
        dateChile: todayChile,
        savedAt: new Date().toISOString(),
        uploadedBy: user?.name || user?.username || 'Usuario'
      };

      setRemoteInfo({
        uploadedBy: payload.uploadedBy,
        savedAt: payload.savedAt,
        dateChile: todayChile
      });

      try {
        await supabase
          .from('planning_assignments')
          .upsert({
            fecha: '__estatus_diario__',
            assignments: payload,
            updated_at: new Date().toISOString()
          }, { onConflict: 'fecha' });
        toast.success(`Estatus diario generado y sincronizado en tiempo real para todos los computadores.`);
      } catch (dbErr) {
        console.warn('Error al persistir estatus diario en Supabase:', dbErr);
        toast.success(`Reporte generado localmente con ${allRows.length} registros para el día ${isoToDmy(isoTarget)}.`);
      }

      // Cambiar automáticamente a la pestaña de Matrices
      setMainTab('matrices');
    } catch (err) {
      console.error(err);
      toast.error('Error durante la generación de tablas: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Descarga directa a Excel con formato Resumen Operativo
  const handleExportExcel = () => {
    if (!processedData) {
      toast.error('No hay datos procesados para exportar.');
      return;
    }

    try {
      const { rep1, rep2, rep3, rep4, fechaCorteDmy } = processedData;
      const aoa = [];

      // Título
      aoa.push([`REPORTE GENERAL DE DISTRIBUCIÓN — FECHA: ${fechaCorteDmy}`]);
      aoa.push([]);

      // 1. Reporte 1 (General)
      aoa.push(['1. Consolidado por Cuentas de Destino']);
      const rep1Headers = ['Cuenta', ...rep1.stateCols, 'Total general'];
      aoa.push(rep1Headers);
      rep1.matrix.forEach(row => {
        const rArr = [row['Cuenta']];
        rep1.stateCols.forEach(c => rArr.push(row[c] || 0));
        rArr.push(row['Total general'] || 0);
        aoa.push(rArr);
      });
      aoa.push([]);
      aoa.push([]);

      // 2. Reporte 2 (Clientes Petroleras)
      aoa.push(['2. Consolidado por Clientes Petroleras']);
      const rep2Headers = ['Clientes_Petroleras', ...rep2.stateCols, 'Total general', 'Avance'];
      aoa.push(rep2Headers);
      rep2.matrix.forEach(row => {
        const rArr = [row['Clientes_Petroleras']];
        rep2.stateCols.forEach(c => rArr.push(row[c] || 0));
        rArr.push(row['Total general'] || 0);
        rArr.push(row['Avance'] || '0.00%');
        aoa.push(rArr);
      });
      aoa.push([]);
      aoa.push([]);

      // 3. Reporte 3 (Formatos Copec)
      aoa.push(['3. Consolidado por Formatos (Copec)']);
      const rep3Headers = ['Formato_Copec', ...rep3.stateCols, 'Total general', 'Avance'];
      aoa.push(rep3Headers);
      rep3.matrix.forEach(row => {
        const rArr = [row['Formato_Copec']];
        rep3.stateCols.forEach(c => rArr.push(row[c] || 0));
        rArr.push(row['Total general'] || 0);
        rArr.push(row['Avance'] || '0.00%');
        aoa.push(rArr);
      });
      aoa.push([]);
      aoa.push([]);

      // 4. Reporte 4 (Resumen Avance)
      aoa.push(['4. Resumen de Avance por Cuenta de Destino']);
      aoa.push(['Cuenta de Destino', 'Registros Exitosos', 'Total General', 'Avance']);
      rep4.forEach(row => {
        aoa.push([
          row['Cuenta de Destino'],
          row['Registros Exitosos'],
          row['Total General'],
          row['Avance']
        ]);
      });

      // Crear Libro de Trabajo
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // Anchos de columna automáticos
      const colWidths = [{ wch: 28 }];
      for (let i = 1; i < 20; i++) {
        colWidths.push({ wch: 14 });
      }
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Resumen Operativo');

      const fileName = `Reporte_Distribucion_${fechaCorteDmy}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Archivo descargado con éxito: ${fileName}`);
    } catch (err) {
      console.error(err);
      toast.error('Error al generar el archivo Excel: ' + err.message);
    }
  };

  // =========================================================================
  // COPIAR / DESCARGAR EN FORMATO IMAGEN (PNG ALTA DEFINICIÓN)
  // =========================================================================

  // Función para copiar un elemento al portapapeles en formato imagen PNG
  const handleCopyElementAsImage = async (elementRef, filenamePrefix, sectionKey) => {
    if (!elementRef || !elementRef.current) {
      toast.error('No se pudo encontrar el contenedor de la tabla.');
      return;
    }

    setCapturingSection(sectionKey);

    try {
      const el = elementRef.current;
      const scrollWidth = el.scrollWidth;
      const scrollHeight = el.scrollHeight;

      const blob = await toBlob(el, {
        backgroundColor: '#ffffff',
        pixelRatio: 2, // Alta definición para pantallas Retina y zoom nítido
        cacheBust: true,
        width: Math.max(scrollWidth, el.clientWidth),
        height: Math.max(scrollHeight, el.clientHeight),
        style: {
          overflow: 'visible',
          maxWidth: 'none',
          borderRadius: '16px'
        },
        filter: (node) => {
          // Ocultar los botones de acción para que no aparezcan dentro de la imagen copiada
          if (node.classList && node.classList.contains('no-export')) {
            return false;
          }
          return true;
        }
      });

      if (!blob) {
        throw new Error('No se pudo generar la imagen de la tabla.');
      }

      // Intentar copiar directamente al portapapeles como image/png
      let copiedViaClipboard = false;
      if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
        try {
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          copiedViaClipboard = true;
          setCopiedSection(sectionKey);
          toast.success('¡Imagen de la tabla copiada al portapapeles! Lista para pegar (Ctrl+V) en WhatsApp, Teams o correo.');
          setTimeout(() => setCopiedSection(null), 3000);
        } catch (clipErr) {
          console.warn('El navegador no permitió copiar directamente la imagen al portapapeles:', clipErr);
        }
      }

      // Si no se pudo copiar directamente al portapapeles (por restricciones del navegador), descargar como PNG
      if (!copiedViaClipboard) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filenamePrefix}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setCopiedSection(sectionKey);
        toast.info(`Imagen descargada como ${a.download} (puedes pegarla o adjuntarla directamente).`);
        setTimeout(() => setCopiedSection(null), 3000);
      }
    } catch (err) {
      console.error('Error al generar imagen de la tabla:', err);
      toast.error('Error al generar imagen: ' + err.message);
    } finally {
      setCapturingSection(null);
    }
  };

  // Función para descargar un elemento directamente como imagen PNG
  const handleDownloadElementAsImage = async (elementRef, filenamePrefix, sectionKey) => {
    if (!elementRef || !elementRef.current) return;
    setCapturingSection(sectionKey);
    try {
      const el = elementRef.current;
      const scrollWidth = el.scrollWidth;
      const scrollHeight = el.scrollHeight;

      const dataUrl = await toPng(el, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
        width: Math.max(scrollWidth, el.clientWidth),
        height: Math.max(scrollHeight, el.clientHeight),
        style: {
          overflow: 'visible',
          maxWidth: 'none',
          borderRadius: '16px'
        },
        filter: (node) => !node.classList?.contains('no-export')
      });

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${filenamePrefix}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`Imagen descargada con éxito: ${a.download}`);
    } catch (err) {
      console.error(err);
      toast.error('Error al descargar imagen: ' + err.message);
    } finally {
      setCapturingSection(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 w-full">
      
      {/* 1. Aviso informativo de vigencia diaria hasta las 23:59 hrs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-amber-50/80 border border-amber-200/90 text-amber-950 shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Clock size={15} className="text-amber-700 shrink-0" />
          <span>
            Esta información estará disponible hasta las <strong className="font-black text-amber-900">23:59 horas</strong> (hora local Chile) y al día siguiente se eliminará automáticamente.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white border border-amber-200 text-[11px] font-bold text-amber-800 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Sincronización multi-equipo en vivo
          </span>
          {processedData && (
            <button
              onClick={handleResetStatus}
              className="text-[11px] text-amber-800 hover:text-rose-600 font-bold underline transition-colors"
              title="Limpiar la información y seleccionar otra fecha"
            >
              Reiniciar ahora
            </button>
          )}
        </div>
      </div>

      {/* 2. Pestañas de Navegación Principal: Reporte y Matrices vs Carga de Información */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 pt-2.5 rounded-2xl shadow-xs">
        <button
          type="button"
          onClick={() => setMainTab('matrices')}
          className={`flex items-center gap-2 px-5 py-3 font-bold text-xs rounded-xl transition-all ${
            mainTab === 'matrices'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <BarChart3 size={16} />
          <span>Reporte y Matrices</span>
          {processedData && (
            <span className="w-2 h-2 rounded-full bg-emerald-400" title="Estatus activo disponible" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setMainTab('carga')}
          className={`flex items-center gap-2 px-5 py-3 font-bold text-xs rounded-xl transition-all ${
            mainTab === 'carga'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <UploadCloud size={16} />
          <span>Carga de Información</span>
          {file && (
            <span className="w-2 h-2 rounded-full bg-emerald-400" title="Archivo cargado" />
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* PESTAÑA 1: REPORTE Y MATRICES (Solo Tarjetas y Matrices)                  */}
      {/* ========================================================================= */}
      {mainTab === 'matrices' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          
          {/* Encabezado de la Pestaña Matrices */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <BarChart3 size={22} />
                </div>
                <div>
                  <h1 className="text-xl font-black text-slate-800 tracking-tight">Estatus Diario de Distribución</h1>
                  <p className="text-xs text-slate-500 font-medium">
                    {processedData 
                      ? `Consolidado operativo para el día ${processedData.fechaCorteDmy} con ${processedData.totalRegistros} registros`
                      : 'Consolidación automática, segmentación y matrices pivote de avance por cuenta'}
                  </p>
                </div>
              </div>
            </div>

            {processedData ? (
              <div className="flex flex-wrap items-center gap-2">
                {remoteInfo && (
                  <div className="text-xs bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-slate-600">
                    Cargado por: <strong className="font-bold text-slate-800">{remoteInfo.uploadedBy}</strong>
                  </div>
                )}

                {/* Botón para copiar el reporte completo en imagen */}
                <Button
                  onClick={() => handleCopyElementAsImage(fullReportRef, `Estatus_Diario_${processedData.fechaCorteDmy}`, 'full_report')}
                  disabled={capturingSection === 'full_report'}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 shadow-xs transition-all text-xs"
                  title="Copiar todas las tarjetas y matrices como una sola imagen con diseño"
                >
                  {capturingSection === 'full_report' ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Generando imagen...</span>
                    </>
                  ) : copiedSection === 'full_report' ? (
                    <>
                      <Check size={14} />
                      <span>¡Reporte copiado!</span>
                    </>
                  ) : (
                    <>
                      <Camera size={14} />
                      <span>Copiar Reporte Completo</span>
                    </>
                  )}
                </Button>

                {/* Botón Descargar Excel */}
                <Button
                  onClick={handleExportExcel}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-2 shadow-xs transition-all text-xs"
                >
                  <Download size={15} />
                  <span>Descargar Reporte Excel</span>
                </Button>

                {/* Botón Limpiar */}
                <Button
                  onClick={handleResetStatus}
                  variant="outline"
                  className="border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-xs flex items-center gap-1.5 transition-all"
                  title="Limpiar y preparar para otra fecha"
                >
                  <RefreshCw size={13} />
                  <span>Limpiar</span>
                </Button>
              </div>
            ) : (
              <div>
                <Button
                  onClick={() => setMainTab('carga')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <UploadCloud size={15} />
                  <span>Cargar Archivo de Operaciones</span>
                </Button>
              </div>
            )}
          </div>

          {/* Sub-tabs de Filtro de Vistas de Tablas */}
          {processedData && (
            <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto">
              {[
                { id: 'all', label: 'Ver Todo Consolidado' },
                { id: 'rep4', label: '1. Resumen de Avance por Cuenta' },
                { id: 'rep2', label: '2. Clientes Petroleras' },
                { id: 'rep3', label: '3. Formatos Copec' },
                { id: 'rep1', label: '4. Cuentas de Destino (General)' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* CONTENEDOR CAPTURABLE DE REPORTE Y MATRICES */}
          {processedData && (
            <div ref={fullReportRef} className="space-y-6 w-full p-2 bg-slate-50/60 rounded-2xl">
              
              {/* Tarjetas KPI de Resumen si hay datos procesados */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5 animate-in fade-in duration-300">
                
                {/* TARJETA 1: RUTAS CUBIERTAS (DISPONIBILIZACIÓN) */}
                <div className="bg-white p-3.5 rounded-xl border border-emerald-200/90 shadow-2xs bg-gradient-to-br from-emerald-50/40 to-white">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">Rutas Cubiertas</span>
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <Truck size={15} />
                    </div>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <p className="text-2xl font-black text-emerald-700">
                      {effectiveDisp.hasData ? effectiveDisp.cubiertas : (isLoadingDisp ? '...' : 0)}
                    </p>
                    {effectiveDisp.hasData && (
                      <span className="text-xs font-bold text-emerald-600">/ {effectiveDisp.total}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {effectiveDisp.hasData 
                      ? `${effectiveDisp.pctCubiertas.toFixed(1)}% cobertura flota`
                      : (isLoadingDisp ? 'Consultando disponibilización...' : 'Sin datos en disponibilización')}
                  </p>
                </div>

                {/* TARJETA 2: RUTAS NO CUBIERTAS (DISPONIBILIZACIÓN) */}
                <div className="bg-white p-3.5 rounded-xl border border-rose-200/90 shadow-2xs bg-gradient-to-br from-rose-50/40 to-white">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-rose-800 uppercase tracking-wider">Rutas No Cubiertas</span>
                    <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                      <AlertTriangle size={15} />
                    </div>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <p className="text-2xl font-black text-rose-600">
                      {effectiveDisp.hasData ? effectiveDisp.noCubiertas : (isLoadingDisp ? '...' : 0)}
                    </p>
                    {effectiveDisp.noCubiertas > 0 && (
                      <button
                        onClick={() => setShowUncoveredModal(true)}
                        className="text-[10px] font-bold text-rose-700 hover:text-rose-900 bg-rose-100/70 hover:bg-rose-100 px-2 py-0.5 rounded-md flex items-center gap-1 transition-all no-export"
                        title="Ver listado de rutas no cubiertas"
                      >
                        <Eye size={12} />
                        <span>Ver cuáles</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {effectiveDisp.hasData 
                      ? (effectiveDisp.noCubiertas === 0 ? '¡100% rutas con chofer y camión!' : `${effectiveDisp.noCubiertas} rutas pendientes`)
                      : 'Sin disponibilización para la fecha'}
                  </p>
                </div>

                {/* TARJETA 3: FECHA DE CORTE */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Fecha Corte</span>
                    <Calendar size={15} className="text-blue-500" />
                  </div>
                  <p className="text-2xl font-black text-slate-800 mt-2">{processedData.fechaCorteDmy}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">Día de corte normalizado</p>
                </div>

                {/* TARJETA 4: TOTAL REGISTROS */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Total Registros</span>
                    <Layers size={15} className="text-indigo-500" />
                  </div>
                  <p className="text-2xl font-black text-slate-800 mt-2">{processedData.totalRegistros}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">En {processedData.totalCuentas} cuentas activas</p>
                </div>

                {/* TARJETA 5: ENTREGAS EXITOSAS */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Entregas Exitosas</span>
                    <CheckCircle2 size={15} className="text-emerald-500" />
                  </div>
                  <p className="text-2xl font-black text-emerald-600 mt-2">{processedData.grandExitosos}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">Estados de avance global</p>
                </div>

                {/* TARJETA 6: AVANCE GENERAL */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Avance Global</span>
                    <TrendingUp size={15} className="text-amber-500" />
                  </div>
                  <p className="text-2xl font-black text-slate-800 mt-2">{processedData.pctGlobal.toFixed(2)}%</p>
                  <div className="w-full bg-slate-100 rounded-full h-1 mt-2 overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-1 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(processedData.pctGlobal, 100)}%` }} 
                    />
                  </div>
                </div>

              </div>

              {/* CONTENIDO DE LAS TABLAS */}
              <div className="space-y-6 w-full">
                
                {/* TABLA 1 (SUPERIOR): RESUMEN DE AVANCE POR CUENTA DE DESTINO */}
                {(activeTab === 'all' || activeTab === 'rep4') && (
                  <div 
                    ref={tableRefRep4} 
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full"
                  >
                    <div className="p-4 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-black text-amber-950 tracking-tight flex items-center gap-2">
                          <span className="w-6 h-6 rounded-md bg-amber-700 text-white flex items-center justify-center text-xs font-black">1</span>
                          Resumen de Avance por Cuenta de Destino
                        </h3>
                        <p className="text-[11px] text-amber-800 mt-0.5 font-medium">
                          Evaluado sobre estados exitosos: ENTREGADO, EN EL PUNTO, RECHAZADO, L. CERRADO, PARCIAL, NO SALIO, RETORNANDO
                        </p>
                      </div>

                      {/* Botones de Copiar / Descargar Imagen */}
                      <div className="flex items-center gap-1.5 no-export">
                        <button
                          onClick={() => handleCopyElementAsImage(tableRefRep4, `1_Resumen_Avance_${processedData.fechaCorteDmy}`, 'rep4')}
                          disabled={capturingSection === 'rep4'}
                          className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold transition-all shadow-2xs ${
                            copiedSection === 'rep4'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white hover:bg-amber-100/70 text-amber-900 border-amber-200'
                          }`}
                          title="Copiar tabla como imagen con diseño para pegar en WhatsApp, Teams o correo"
                        >
                          {capturingSection === 'rep4' ? (
                            <>
                              <RefreshCw size={13} className="animate-spin text-amber-700" />
                              <span>Generando imagen...</span>
                            </>
                          ) : copiedSection === 'rep4' ? (
                            <>
                              <Check size={13} className="text-white" />
                              <span>¡Imagen copiada!</span>
                            </>
                          ) : (
                            <>
                              <Camera size={13} className="text-amber-700" />
                              <span>Copiar imagen</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleDownloadElementAsImage(tableRefRep4, `1_Resumen_Avance_${processedData.fechaCorteDmy}`, 'rep4_dl')}
                          className="p-1.5 rounded-xl border border-amber-200 bg-white hover:bg-amber-100/70 text-amber-800 transition-all shadow-2xs"
                          title="Descargar imagen PNG de esta tabla"
                        >
                          <Download size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-amber-800 text-white font-bold text-[11px] uppercase">
                            <th className="py-2.5 px-4 border-r border-amber-700">Cuenta de Destino</th>
                            <th className="py-2.5 px-4 text-center border-r border-amber-700">Registros Exitosos</th>
                            <th className="py-2.5 px-4 text-center border-r border-amber-700">Total General</th>
                            <th className="py-2.5 px-4 text-right bg-amber-900">Avance (%)</th>
                            <th className="py-2.5 px-4 text-left bg-amber-950 w-52">Progreso Visual</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {processedData.rep4.map((row, idx) => {
                            const isTotal = row['Cuenta de Destino'] === 'Total general';
                            const pctNum = row._avanceNum || 0;
                            return (
                              <tr
                                key={idx}
                                className={isTotal 
                                  ? 'bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300' 
                                  : idx % 2 === 1 ? 'bg-slate-50/60 hover:bg-amber-50/30' : 'bg-white hover:bg-amber-50/30'
                                }
                              >
                                <td className="py-2.5 px-4 font-semibold text-slate-800 border-r border-slate-100">
                                  {row['Cuenta de Destino']}
                                </td>
                                <td className="py-2.5 px-4 text-center font-bold text-slate-700 border-r border-slate-100">
                                  {row['Registros Exitosos']}
                                </td>
                                <td className="py-2.5 px-4 text-center font-bold text-slate-700 border-r border-slate-100">
                                  {row['Total General']}
                                </td>
                                <td className="py-2.5 px-4 text-right font-black text-amber-900 bg-amber-50/30 border-r border-slate-100">
                                  {row['Avance']}
                                </td>
                                <td className="py-2.5 px-4">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                                      <div
                                        className={`h-2 rounded-full transition-all duration-500 ${
                                          pctNum >= 80 ? 'bg-emerald-500' :
                                          pctNum >= 50 ? 'bg-amber-500' : 'bg-blue-500'
                                        }`}
                                        style={{ width: `${Math.min(pctNum, 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-500 w-8 text-right">
                                      {pctNum.toFixed(0)}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* MATRIZ 2 Y MATRIZ 3: DESPLEGADAS HORIZONTALMENTE DE EXTREMO A EXTREMO */}
                {(activeTab === 'all' || activeTab === 'rep2' || activeTab === 'rep3') && (
                  <div className={`grid gap-6 w-full ${
                    activeTab === 'all' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
                  }`}>
                    
                    {/* TABLA 2: CLIENTES PETROLERAS */}
                    {(activeTab === 'all' || activeTab === 'rep2') && (
                      <div 
                        ref={tableRefRep2}
                        className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between w-full"
                      >
                        <div>
                          <div className="p-4 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between">
                            <div>
                              <h3 className="text-sm font-black text-emerald-950 tracking-tight flex items-center gap-2">
                                <span className="w-6 h-6 rounded-md bg-emerald-700 text-white flex items-center justify-center text-xs font-black">2</span>
                                Consolidado por Clientes Petroleras
                              </h3>
                              <p className="text-[11px] text-emerald-800 mt-0.5 font-medium">
                                Filtrado para cuenta Petrolera (COPEC, ENEX, ESMAX)
                              </p>
                            </div>

                            {/* Botones de Copiar / Descargar Imagen */}
                            <div className="flex items-center gap-1.5 no-export">
                              <button
                                onClick={() => handleCopyElementAsImage(tableRefRep2, `2_Clientes_Petroleras_${processedData.fechaCorteDmy}`, 'rep2')}
                                disabled={capturingSection === 'rep2'}
                                className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold transition-all shadow-2xs ${
                                  copiedSection === 'rep2'
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white hover:bg-emerald-100/70 text-emerald-900 border-emerald-200'
                                }`}
                                title="Copiar tabla como imagen con diseño para pegar en WhatsApp, Teams o correo"
                              >
                                {capturingSection === 'rep2' ? (
                                  <>
                                    <RefreshCw size={13} className="animate-spin text-emerald-700" />
                                    <span>Generando imagen...</span>
                                  </>
                                ) : copiedSection === 'rep2' ? (
                                  <>
                                    <Check size={13} className="text-white" />
                                    <span>¡Imagen copiada!</span>
                                  </>
                                ) : (
                                  <>
                                    <Camera size={13} className="text-emerald-700" />
                                    <span>Copiar imagen</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleDownloadElementAsImage(tableRefRep2, `2_Clientes_Petroleras_${processedData.fechaCorteDmy}`, 'rep2_dl')}
                                className="p-1.5 rounded-xl border border-emerald-200 bg-white hover:bg-emerald-100/70 text-emerald-800 transition-all shadow-2xs"
                                title="Descargar imagen PNG de esta tabla"
                              >
                                <Download size={13} />
                              </button>
                            </div>
                          </div>

                          <div className="overflow-x-auto w-full">
                            <table className="w-full text-xs text-left border-collapse">
                              <thead>
                                <tr className="bg-emerald-800 text-white font-bold text-[11px] uppercase">
                                  <th className="py-2.5 px-3 border-r border-emerald-700">Clientes_Petroleras</th>
                                  {processedData.rep2.stateCols.map(col => (
                                    <th key={col} className="py-2.5 px-2.5 text-center border-r border-emerald-700 whitespace-nowrap">
                                      {col}
                                    </th>
                                  ))}
                                  <th className="py-2.5 px-3 text-right bg-emerald-900 border-r border-emerald-800">Total</th>
                                  <th className="py-2.5 px-3 text-right bg-emerald-950">Avance</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {processedData.rep2.matrix.map((row, idx) => {
                                  const isTotal = row['Clientes_Petroleras'] === 'Total general';
                                  return (
                                    <tr
                                      key={idx}
                                      className={isTotal 
                                        ? 'bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300' 
                                        : 'bg-white hover:bg-emerald-50/30'
                                      }
                                    >
                                      <td className="py-2.5 px-3 font-semibold text-slate-800 border-r border-slate-100">
                                        {row['Clientes_Petroleras']}
                                      </td>
                                      {processedData.rep2.stateCols.map(col => (
                                        <td key={col} className="py-2.5 px-2.5 text-center text-slate-600 border-r border-slate-100">
                                          {row[col] > 0 ? (
                                            <span className="font-semibold text-slate-800">{row[col]}</span>
                                          ) : (
                                            <span className="text-slate-300">0</span>
                                          )}
                                        </td>
                                      ))}
                                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 bg-slate-50/50 border-r border-slate-200">
                                        {row['Total general']}
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-black text-emerald-700 bg-emerald-50/40">
                                        {row['Avance']}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="p-3 bg-emerald-50/30 border-t border-emerald-100 text-[11px] text-emerald-800 font-medium">
                          * Avance = (ENTREGADO + EN EL PUNTO) / Total general
                        </div>
                      </div>
                    )}

                    {/* TABLA 3: FORMATOS COPEC */}
                    {(activeTab === 'all' || activeTab === 'rep3') && (
                      <div 
                        ref={tableRefRep3}
                        className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between w-full"
                      >
                        <div>
                          <div className="p-4 bg-teal-50/70 border-b border-teal-100 flex items-center justify-between">
                            <div>
                              <h3 className="text-sm font-black text-teal-950 tracking-tight flex items-center gap-2">
                                <span className="w-6 h-6 rounded-md bg-teal-700 text-white flex items-center justify-center text-xs font-black">3</span>
                                Consolidado por Formatos (Copec)
                              </h3>
                              <p className="text-[11px] text-teal-800 mt-0.5 font-medium">
                                Segmentación Express, Barra y Pronto
                              </p>
                            </div>

                            {/* Botones de Copiar / Descargar Imagen */}
                            <div className="flex items-center gap-1.5 no-export">
                              <button
                                onClick={() => handleCopyElementAsImage(tableRefRep3, `3_Formatos_Copec_${processedData.fechaCorteDmy}`, 'rep3')}
                                disabled={capturingSection === 'rep3'}
                                className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold transition-all shadow-2xs ${
                                  copiedSection === 'rep3'
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white hover:bg-teal-100/70 text-teal-900 border-teal-200'
                                }`}
                                title="Copiar tabla como imagen con diseño para pegar en WhatsApp, Teams o correo"
                              >
                                {capturingSection === 'rep3' ? (
                                  <>
                                    <RefreshCw size={13} className="animate-spin text-teal-700" />
                                    <span>Generando imagen...</span>
                                  </>
                                ) : copiedSection === 'rep3' ? (
                                  <>
                                    <Check size={13} className="text-white" />
                                    <span>¡Imagen copiada!</span>
                                  </>
                                ) : (
                                  <>
                                    <Camera size={13} className="text-teal-700" />
                                    <span>Copiar imagen</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleDownloadElementAsImage(tableRefRep3, `3_Formatos_Copec_${processedData.fechaCorteDmy}`, 'rep3_dl')}
                                className="p-1.5 rounded-xl border border-teal-200 bg-white hover:bg-teal-100/70 text-teal-800 transition-all shadow-2xs"
                                title="Descargar imagen PNG de esta tabla"
                              >
                                <Download size={13} />
                              </button>
                            </div>
                          </div>

                          <div className="overflow-x-auto w-full">
                            <table className="w-full text-xs text-left border-collapse">
                              <thead>
                                <tr className="bg-teal-800 text-white font-bold text-[11px] uppercase">
                                  <th className="py-2.5 px-3 border-r border-teal-700">Formato_Copec</th>
                                  {processedData.rep3.stateCols.map(col => (
                                    <th key={col} className="py-2.5 px-2.5 text-center border-r border-teal-700 whitespace-nowrap">
                                      {col}
                                    </th>
                                  ))}
                                  <th className="py-2.5 px-3 text-right bg-teal-900 border-r border-teal-800">Total</th>
                                  <th className="py-2.5 px-3 text-right bg-teal-950">Avance</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {processedData.rep3.matrix.map((row, idx) => {
                                  const isTotal = row['Formato_Copec'] === 'Total general';
                                  return (
                                    <tr
                                      key={idx}
                                      className={isTotal 
                                        ? 'bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300' 
                                        : 'bg-white hover:bg-teal-50/30'
                                      }
                                    >
                                      <td className="py-2.5 px-3 font-semibold text-slate-800 border-r border-slate-100">
                                        {row['Formato_Copec']}
                                      </td>
                                      {processedData.rep3.stateCols.map(col => (
                                        <td key={col} className="py-2.5 px-2.5 text-center text-slate-600 border-r border-slate-100">
                                          {row[col] > 0 ? (
                                            <span className="font-semibold text-slate-800">{row[col]}</span>
                                          ) : (
                                            <span className="text-slate-300">0</span>
                                          )}
                                        </td>
                                      ))}
                                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 bg-slate-50/50 border-r border-slate-200">
                                        {row['Total general']}
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-black text-teal-700 bg-teal-50/40">
                                        {row['Avance']}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="p-3 bg-teal-50/30 border-t border-teal-100 text-[11px] text-teal-800 font-medium">
                          * Avance = (ENTREGADO + EN EL PUNTO) / Total general
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* TABLA 4 (INFERIOR): CONSOLIDADO POR CUENTAS DE DESTINO (GENERAL) */}
                {(activeTab === 'all' || activeTab === 'rep1') && (
                  <div 
                    ref={tableRefRep1}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full"
                  >
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
                          <span className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center text-xs font-black">4</span>
                          Consolidado por Cuentas de Destino (General)
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                          Filas por cuenta, matriz completa de estados operativos y suma total
                        </p>
                      </div>

                      {/* Botones de Copiar / Descargar Imagen */}
                      <div className="flex items-center gap-1.5 no-export">
                        <button
                          onClick={() => handleCopyElementAsImage(tableRefRep1, `4_Cuentas_General_${processedData.fechaCorteDmy}`, 'rep1')}
                          disabled={capturingSection === 'rep1'}
                          className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold transition-all shadow-2xs ${
                            copiedSection === 'rep1'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                          title="Copiar tabla como imagen con diseño para pegar en WhatsApp, Teams o correo"
                        >
                          {capturingSection === 'rep1' ? (
                            <>
                              <RefreshCw size={13} className="animate-spin text-blue-600" />
                              <span>Generando imagen...</span>
                            </>
                          ) : copiedSection === 'rep1' ? (
                            <>
                              <Check size={13} className="text-white" />
                              <span>¡Imagen copiada!</span>
                            </>
                          ) : (
                            <>
                              <Camera size={13} className="text-blue-600" />
                              <span>Copiar imagen</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleDownloadElementAsImage(tableRefRep1, `4_Cuentas_General_${processedData.fechaCorteDmy}`, 'rep1_dl')}
                          className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition-all shadow-2xs"
                          title="Descargar imagen PNG de esta tabla"
                        >
                          <Download size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-blue-900 text-white font-bold text-[11px] tracking-wider uppercase">
                            <th className="py-2.5 px-3 border-r border-blue-800 sticky left-0 bg-blue-900 z-10">Cuenta</th>
                            {processedData.rep1.stateCols.map(col => (
                              <th key={col} className="py-2.5 px-3 text-center border-r border-blue-800 whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                            <th className="py-2.5 px-3 text-right bg-blue-950">Total general</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {processedData.rep1.matrix.map((row, idx) => {
                            const isTotal = row['Cuenta'] === 'Total general';
                            return (
                              <tr 
                                key={idx}
                                className={isTotal 
                                  ? 'bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300' 
                                  : idx % 2 === 1 ? 'bg-slate-50/60 hover:bg-blue-50/40' : 'bg-white hover:bg-blue-50/40'
                                }
                              >
                                <td className={`py-2 px-3 font-semibold text-slate-800 border-r border-slate-200 sticky left-0 ${
                                  isTotal ? 'bg-slate-100' : idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'
                                }`}>
                                  {row['Cuenta']}
                                </td>
                                {processedData.rep1.stateCols.map(col => (
                                  <td key={col} className="py-2 px-3 text-center text-slate-600 border-r border-slate-100">
                                    {row[col] > 0 ? (
                                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                                        col === 'ENTREGADO' ? 'text-emerald-700 bg-emerald-50' :
                                        col === 'EN EL PUNTO' ? 'text-blue-700 bg-blue-50' :
                                        col === 'EN RUTA' ? 'text-amber-700 bg-amber-50' :
                                        'text-slate-700'
                                      }`}>
                                        {row[col]}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300">0</span>
                                    )}
                                  </td>
                                ))}
                                <td className="py-2 px-3 text-right font-bold text-slate-900 bg-slate-50/50">
                                  {row['Total general']}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>

            </div>
          )}

          {/* Estado vacío cuando no hay datos en la pestaña de Matrices */}
          {!processedData && !isProcessing && (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center max-w-2xl mx-auto my-6 shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
                <BarChart3 size={32} />
              </div>
              <h3 className="text-base font-black text-slate-800">No hay información de estatus disponible para hoy</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-2 leading-relaxed">
                La información se reinicia automáticamente cada día a las 23:59 horas. Puedes cargar el archivo de operaciones en la pestaña <strong className="text-slate-700 font-semibold">"Carga de Información"</strong> para generar y visualizar las matrices y tarjetas de avance.
              </p>
              <div className="mt-6 flex justify-center">
                <Button
                  onClick={() => setMainTab('carga')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-xs flex items-center gap-2 text-xs transition-all"
                >
                  <UploadCloud size={16} />
                  <span>Ir a Carga de Información</span>
                </Button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 2: CARGA DE INFORMACIÓN (Subir Excel, Fecha de Corte, Procesar)     */}
      {/* ========================================================================= */}
      {mainTab === 'carga' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          
          {/* Banner informativo si ya hay un estatus activo */}
          {processedData && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-emerald-50/90 border border-emerald-200 text-emerald-950 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-emerald-900">
                    Estatus diario activo cargado para el día {processedData.fechaCorteDmy}
                  </h4>
                  <p className="text-xs text-emerald-700">
                    {processedData.totalRegistros} registros consolidados • Publicado por <strong className="font-bold">{remoteInfo?.uploadedBy || 'Usuario'}</strong>.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setMainTab('matrices')}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2 rounded-xl shrink-0 flex items-center gap-2 shadow-xs"
              >
                <BarChart3 size={15} />
                <span>Ver Reporte y Matrices</span>
              </Button>
            </div>
          )}

          {/* Formulario de Carga y Selección */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            
            {/* 1. Selector de Archivo Excel */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <UploadCloud size={17} className="text-blue-600" />
                    1. Selección de Archivo de Origen (.xlsx, .xls)
                  </h2>
                  {file && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Archivo cargado
                    </span>
                  )}
                </div>

                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50/50 scale-[0.99]'
                      : file
                      ? 'border-emerald-300 bg-emerald-50/20 hover:bg-emerald-50/40'
                      : 'border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/30'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .xlsm"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  />

                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                      file ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      <FileSpreadsheet size={30} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {file ? file.name : 'Haz clic o arrastra aquí tu archivo de operaciones'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {file 
                          ? `${(file.size / 1024 / 1024).toFixed(2)} MB • ${availableSheets.length} hojas operativas detectadas` 
                          : 'Soporta archivos de consolidación con pestañas Oxxo, Subway, Cantabria, Petrolera, etc.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hojas detectadas badge list */}
              {availableSheets.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Pestañas identificadas en el archivo ({availableSheets.length}/{HOJAS_OBJETIVO.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {HOJAS_OBJETIVO.map(sheetName => {
                      const exists = availableSheets.some(s => s.toLowerCase() === sheetName.toLowerCase());
                      return (
                        <span
                          key={sheetName}
                          className={`text-[11px] px-2.5 py-1 rounded-lg font-medium border flex items-center gap-1.5 ${
                            exists
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold'
                              : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60'
                          }`}
                        >
                          {exists && <Check size={12} className="text-emerald-600" />}
                          {sheetName}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Selector de Fecha de Corte y Acción */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <Calendar size={17} className="text-blue-600" />
                  2. Fecha de Corte para Análisis
                </h2>

                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Fecha de análisis (Formato DD-MM-YYYY):
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="DD-MM-YYYY (ej. 13-07-2026)"
                      value={fechaCorte}
                      onChange={(e) => setFechaCorte(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 bg-white"
                    />
                    <Calendar size={16} className="absolute right-3.5 top-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Sugerencias de fechas encontradas en el archivo */}
                {availableDates.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                      Fechas recientes detectadas en el Excel:
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                      {availableDates.slice(0, 8).map(iso => {
                        const dmy = isoToDmy(iso);
                        const isSelected = fechaCorte === dmy;
                        return (
                          <button
                            key={iso}
                            onClick={() => setFechaCorte(dmy)}
                            className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all border ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                            }`}
                          >
                            {dmy}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100">
                <Button
                  onClick={procesarReporte}
                  disabled={!workbook || isProcessing || !fechaCorte}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw size={17} className="animate-spin" />
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <>
                      <BarChart3 size={17} />
                      <span>Procesar y Generar Reporte</span>
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-slate-400 text-center mt-2">
                  Al procesar, se sincronizará automáticamente para todos los computadores.
                </p>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* Modal Detalle Rutas no Cubiertas en Disponibilización */}
      {showUncoveredModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in duration-200">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    Rutas No Cubiertas en Disponibilización ({processedData?.fechaCorteDmy || fechaCorte})
                  </h3>
                  <p className="text-xs text-slate-500">
                    {effectiveDisp.noCubiertas} de {effectiveDisp.total} rutas tienen conductor o camión pendiente de asignación
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowUncoveredModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold text-[11px] uppercase">
                    <th className="py-2.5 px-3 border-b border-slate-200">Ruta</th>
                    <th className="py-2.5 px-3 border-b border-slate-200">Destino / Cliente</th>
                    <th className="py-2.5 px-3 border-b border-slate-200">Conductor</th>
                    <th className="py-2.5 px-3 border-b border-slate-200">Camión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {effectiveDisp.rutasNoCubiertas.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-800">
                        {r.ruta || `Ruta #${i + 1}`}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {r.cliente || r.servicio || '-'}
                      </td>
                      <td className="py-2.5 px-3">
                        {r.missingCond ? (
                          <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                            Sin Conductor
                          </span>
                        ) : (
                          <span className="text-slate-700 font-medium">{r.conductor_name || r.conductor}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {r.missingCam ? (
                          <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                            Sin Camión
                          </span>
                        ) : (
                          <span className="text-slate-700 font-medium">{r.camion || r.patente}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <Button
                onClick={() => setShowUncoveredModal(false)}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs px-4 py-1.5 rounded-lg"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

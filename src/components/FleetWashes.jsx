import React, { useEffect, useState, useMemo } from 'react';
import { 
  Droplets, UploadCloud, Search, Calendar, FileSpreadsheet, 
  CheckCircle2, AlertCircle, Edit2, Trash2, X, Download, 
  Check, Filter, ArrowRight, ShieldCheck, Sparkles, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useDropzone } from 'react-dropzone';
import { useFleetStore } from '../store/fleetStore';
import { Button } from './ui/Button';

// Helpers para normalizar texto
const normalizeText = (txt) => {
  return String(txt || '').toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[._\-/\s]/g, "");
};

// Formateador robusto de fechas de Excel
export const parseExcelDateValue = (val) => {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    const hh = String(val.getHours()).padStart(2, '0');
    const mm = String(val.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y}${hh !== '00' || mm !== '00' ? ` ${hh}:${mm}` : ''}`;
  }
  if (typeof val === 'number') {
    const dObj = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (isNaN(dObj.getTime())) return null;
    const y = dObj.getUTCFullYear();
    const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dObj.getUTCDate()).padStart(2, '0');
    const hh = String(dObj.getUTCHours()).padStart(2, '0');
    const mm = String(dObj.getUTCMinutes()).padStart(2, '0');
    return `${d}/${m}/${y}${hh !== '00' || mm !== '00' ? ` ${hh}:${mm}` : ''}`;
  }
  const str = String(val).trim();
  if (!str) return null;

  // DD/MM/YYYY o DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    const time = dmyMatch[4] ? ` ${dmyMatch[4]}` : '';
    return `${d}/${m}/${y}${time}`;
  }

  // YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    const time = ymdMatch[4] ? ` ${ymdMatch[4]}` : '';
    return `${d}/${m}/${y}${time}`;
  }

  return str;
};

// Extraer únicamente la parte de fecha DD/MM/YYYY para agrupar y filtrar
export const extractDateOnly = (val) => {
  if (!val) return '';
  const parsed = parseExcelDateValue(val);
  if (!parsed) return '';
  return parsed.split(' ')[0];
};

// Helper para convertir string de fecha a timestamp numérico para comparar rangos (Requisito 4)
export const parseDateStrToTime = (s) => {
  if (!s) return null;
  const clean = String(s).trim().split(' ')[0].split('T')[0];
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
    } else {
      // DD-MM-YYYY o DD/MM/YYYY
      return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
    }
  }
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d.getTime();
};

export default function FleetWashes() {
  const { fleetList, fetchFleet, updateFleetWashes, updateSingleFleetWash, isLoading } = useFleetStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [regionFilter, setRegionFilter] = useState('Todas');
  const [certFilter, setCertFilter] = useState('Todos');

  // Regiones únicas de flota (Requisito 3)
  const regions = useMemo(() => {
    const rSet = new Set(fleetList.map(f => f.region).filter(Boolean));
    return ['Todas', ...Array.from(rSet).sort()];
  }, [fleetList]);

  // ------------------------------------------------------------------
  // 1. ESTADO: CARGA EXCEL 1 - CERTIFICACIONES (con selector de hoja)
  // ------------------------------------------------------------------
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [certWorkbook, setCertWorkbook] = useState(null);
  const [certSheets, setCertSheets] = useState([]);
  const [selectedCertSheet, setSelectedCertSheet] = useState('');
  const [certColumns, setCertColumns] = useState([]);
  const [certInternalCol, setCertInternalCol] = useState('');
  const [certDateCol, setCertDateCol] = useState('');
  const [certRawRows, setCertRawRows] = useState([]);

  // ------------------------------------------------------------------
  // 2. ESTADO: CARGA EXCEL / CSV 2 - LAVADOS (Código de camión vs N° Interno)
  // ------------------------------------------------------------------
  const [isWashModalOpen, setIsWashModalOpen] = useState(false);
  const [washWorkbook, setWashWorkbook] = useState(null);
  const [washSheets, setWashSheets] = useState([]);
  const [selectedWashSheet, setSelectedWashSheet] = useState('');
  const [washColumns, setWashColumns] = useState([]);
  const [washCodeCol, setWashCodeCol] = useState('');
  const [washCreadoCol, setWashCreadoCol] = useState('');
  const [washPlateCol, setWashPlateCol] = useState('');
  const [washRawRows, setWashRawRows] = useState([]);

  // Opciones para seleccionar qué fecha o rango de "Creado" se desea cargar (Requisito 4)
  const [washDateFilterMode, setWashDateFilterMode] = useState('todas'); // 'todas', 'rango', 'especifica'
  const [selectedCreadoDate, setSelectedCreadoDate] = useState('todas');
  const [washDateRangeStart, setWashDateRangeStart] = useState('');
  const [washDateRangeEnd, setWashDateRangeEnd] = useState('');

  // Pantalla de registros no coincidentes para editar o eliminar (Requisito 2)
  const [isUnmatchedModalOpen, setIsUnmatchedModalOpen] = useState(false);
  const [unmatchedRows, setUnmatchedRows] = useState([]); // Array de items no coincidentes editables
  const [matchedWashUpdates, setMatchedWashUpdates] = useState([]); // Array de items que sí coincidieron

  // Fechas únicas disponibles en la columna "Creado" (orden descendente)
  const availableCreadoDates = useMemo(() => {
    if (!washCreadoCol || washRawRows.length === 0) return [];
    const dateCounts = {};
    washRawRows.forEach(row => {
      const d = extractDateOnly(row[washCreadoCol]);
      if (d) {
        dateCounts[d] = (dateCounts[d] || 0) + 1;
      }
    });

    return Object.entries(dateCounts).map(([date, count]) => ({
      date,
      count,
      timestamp: parseDateStrToTime(date) || 0
    })).sort((a, b) => b.timestamp - a.timestamp);
  }, [washCreadoCol, washRawRows]);

  // Fechas ordenadas cronológicamente (más antigua primero) para selectores de rango
  const chronologicalCreadoDates = useMemo(() => {
    return [...availableCreadoDates].sort((a, b) => a.timestamp - b.timestamp);
  }, [availableCreadoDates]);

  // Función para determinar si una fila de lavado cumple con el filtro de fecha
  const isRowMatchingDateFilter = (row) => {
    if (!washCreadoCol) return true;
    if (washDateFilterMode === 'todas') return true;

    const rawVal = row[washCreadoCol];
    const d = extractDateOnly(rawVal);
    if (!d) return false;

    if (washDateFilterMode === 'especifica') {
      return d === selectedCreadoDate;
    }

    if (washDateFilterMode === 'rango') {
      const rowTime = parseDateStrToTime(d);
      if (rowTime === null) return false;
      const startTime = washDateRangeStart ? parseDateStrToTime(washDateRangeStart) : null;
      const endTime = washDateRangeEnd ? parseDateStrToTime(washDateRangeEnd) : null;

      if (startTime !== null && rowTime < startTime) return false;
      if (endTime !== null && rowTime > endTime) return false;
      return true;
    }

    return true;
  };

  // Cantidad de registros filtrados según el modo y fechas seleccionadas
  const filteredWashRowsCount = useMemo(() => {
    if (!washCreadoCol || washRawRows.length === 0) return 0;
    return washRawRows.filter(isRowMatchingDateFilter).length;
  }, [washRawRows, washCreadoCol, washDateFilterMode, selectedCreadoDate, washDateRangeStart, washDateRangeEnd]);

  // Estado para Edición Manual Individual
  const [editingTruck, setEditingTruck] = useState(null);
  const [editForm, setEditForm] = useState({ ultima_certificacion: '', fecha_ultimo_lavado: '' });

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  // Lista de N° Internos existentes en flota (para selectores de vinculación rápida)
  const fleetInternalsList = useMemo(() => {
    return fleetList
      .filter(f => f.internal_number)
      .map(f => ({
        internal: String(f.internal_number).trim(),
        plate: f.plate,
        type: f.type
      }))
      .sort((a, b) => a.internal.localeCompare(b.internal));
  }, [fleetList]);

  // Filtrado de la tabla principal de Lavados
  const filteredFleet = useMemo(() => {
    return fleetList.filter(f => {
      if (typeFilter !== 'Todos') {
        const t = (f.type || '').toLowerCase();
        if (typeFilter === 'Camiones' && (t.includes('tracto') || t.includes('rampla') || t.includes('semi'))) return false;
        if (typeFilter === 'Tractos' && !t.includes('tracto')) return false;
        if (typeFilter === 'Semirremolques' && (!t.includes('rampla') && !t.includes('semi'))) return false;
      }

      // Filtro por Región (Requisito 3)
      if (regionFilter !== 'Todas' && f.region !== regionFilter) return false;

      if (certFilter === 'con_cert' && !f.ultima_certificacion) return false;
      if (certFilter === 'sin_cert' && f.ultima_certificacion) return false;
      if (certFilter === 'con_lavado' && !f.fecha_ultimo_lavado) return false;
      if (certFilter === 'sin_lavado' && f.fecha_ultimo_lavado) return false;

      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        const mInternal = f.internal_number?.toLowerCase().includes(lower);
        const mPlate = f.plate?.toLowerCase().includes(lower);
        const mBrand = f.brand?.toLowerCase().includes(lower);
        const mRegion = f.region?.toLowerCase().includes(lower);
        if (!mInternal && !mPlate && !mBrand && !mRegion) return false;
      }

      return true;
    });
  }, [fleetList, typeFilter, regionFilter, certFilter, searchTerm]);

  // ------------------------------------------------------------------
  // MANEJADORES: CARGA 1 - CERTIFICACIONES
  // ------------------------------------------------------------------
  const onDropCertExcel = (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheets = workbook.SheetNames || [];
        if (sheets.length === 0) {
          toast.error('El archivo no contiene hojas');
          return;
        }

        setCertWorkbook(workbook);
        setCertSheets(sheets);
        const initialSheet = sheets[0];
        setSelectedCertSheet(initialSheet);
        processCertSheet(workbook, initialSheet);
        toast.success(`Archivo leído: ${sheets.length} hoja(s) encontradas. Por favor selecciona la hoja a consultar.`);
      } catch (err) {
        console.error(err);
        toast.error('Error al procesar archivo de certificación');
      }
    };
    reader.readAsBinaryString(file);
  };

  const processCertSheet = (workbook, sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (json.length === 0) {
      setCertColumns([]);
      setCertRawRows([]);
      toast.warning('La hoja seleccionada está vacía');
      return;
    }

    const cols = Object.keys(json[0] || {});
    setCertColumns(cols);
    setCertRawRows(json);

    // Auto-detectar "N° Interno"
    const detectedInternal = cols.find(c => {
      const n = normalizeText(c);
      return n.includes('interno') || n === 'codigocamion' || n === 'codigo' || n === 'unidad';
    }) || cols[0] || '';
    setCertInternalCol(detectedInternal);

    // Auto-detectar lo que tenga por nombre "Ultima certificación" (Requisito 2)
    const detectedCert = cols.find(c => {
      const n = normalizeText(c);
      return n.includes('ultimacertificacion') || n.includes('certificacion') || n.includes('fechacertificacion');
    }) || cols.find(c => normalizeText(c).includes('cert')) || cols[1] || '';
    setCertDateCol(detectedCert);
  };

  const handleCertSheetChange = (sheetName) => {
    setSelectedCertSheet(sheetName);
    if (certWorkbook) {
      processCertSheet(certWorkbook, sheetName);
    }
  };

  // Previsualización y conteo de certificaciones
  const certPreviewUpdates = useMemo(() => {
    if (!certInternalCol || !certDateCol || certRawRows.length === 0) return [];

    return certRawRows.map((row, idx) => {
      const internalVal = String(row[certInternalCol] || '').trim();
      const rawDateVal = row[certDateCol];
      const parsedDate = parseExcelDateValue(rawDateVal);

      const matchedFleet = fleetList.find(f => 
        String(f.internal_number || '').trim().toLowerCase() === internalVal.toLowerCase()
      );

      return {
        rowIdx: idx + 1,
        internal_number: internalVal,
        matchedFleet,
        newCertDate: parsedDate,
        isMatched: !!matchedFleet && !!internalVal && !!parsedDate
      };
    });
  }, [certInternalCol, certDateCol, certRawRows, fleetList]);

  const certMatchedCount = useMemo(() => {
    return certPreviewUpdates.filter(u => u.isMatched).length;
  }, [certPreviewUpdates]);

  const handleApplyCertifications = async () => {
    const validUpdates = certPreviewUpdates
      .filter(u => u.isMatched)
      .map(u => ({
        internal_number: u.internal_number,
        plate: u.matchedFleet.plate,
        ultima_certificacion: u.newCertDate
      }));

    if (validUpdates.length === 0) {
      toast.warning('No se encontraron coincidencias para aplicar certificaciones');
      return;
    }

    const success = await updateFleetWashes(validUpdates);
    if (success) {
      toast.success(`Se actualizaron ${validUpdates.length} certificaciones exitosamente`);
      setIsCertModalOpen(false);
      setCertWorkbook(null);
      setCertRawRows([]);
    }
  };

  // ------------------------------------------------------------------
  // MANEJADORES: CARGA 2 - LAVADOS (Excel o CSV)
  // ------------------------------------------------------------------
  const onDropWashExcel = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // Resetear filtros de fecha de Creado
    setWashDateFilterMode('todas');
    setSelectedCreadoDate('todas');
    setWashDateRangeStart('');
    setWashDateRangeEnd('');

    const fileName = (file.name || '').toLowerCase();
    const isCsv = fileName.endsWith('.csv') || (file.type && file.type.includes('csv'));

    try {
      let workbook;
      if (isCsv) {
        // Lectura robusta de archivo CSV (Requisito 1)
        const text = await file.text();
        const firstLine = text.split(/\r?\n/)[0] || '';
        const semicolonCount = (firstLine.match(/;/g) || []).length;
        const commaCount = (firstLine.match(/,/g) || []).length;
        const tabCount = (firstLine.match(/\t/g) || []).length;

        let delimiter = ',';
        if (semicolonCount > commaCount && semicolonCount > tabCount) delimiter = ';';
        else if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t';

        workbook = XLSX.read(text, { type: 'string', FS: delimiter, cellDates: true });
      } else {
        const buffer = await file.arrayBuffer();
        workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      }

      const sheets = workbook.SheetNames || [];
      if (sheets.length === 0) {
        toast.error('El archivo no contiene hojas ni registros legibles');
        return;
      }

      setWashWorkbook(workbook);
      setWashSheets(sheets);
      const initialSheet = sheets[0];
      setSelectedWashSheet(initialSheet);
      processWashSheet(workbook, initialSheet);
      toast.success(isCsv ? 'Archivo CSV de lavados cargado correctamente' : 'Archivo Excel de lavados cargado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al procesar archivo de lavados');
    }
  };

  const processWashSheet = (workbook, sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (json.length === 0) {
      setWashColumns([]);
      setWashRawRows([]);
      toast.warning('La hoja de lavados está vacía');
      return;
    }

    const cols = Object.keys(json[0] || {});
    setWashColumns(cols);
    setWashRawRows(json);
    setWashDateFilterMode('todas');
    setSelectedCreadoDate('todas');
    setWashDateRangeStart('');
    setWashDateRangeEnd('');

    // Auto-detectar "Código de camión" (según imagen del usuario)
    const detectedCode = cols.find(c => {
      const n = normalizeText(c);
      return n.includes('codigodecamion') || n.includes('codigocamion') || n.includes('codigo') || n.includes('interno');
    }) || cols[2] || cols[0];
    setWashCodeCol(detectedCode);

    // Auto-detectar "Creado" (según imagen del usuario para "Fecha Último Lavado")
    const detectedCreado = cols.find(c => {
      const n = normalizeText(c);
      return n === 'creado' || n.includes('creado') || n.includes('fechalavado');
    }) || cols[0];
    setWashCreadoCol(detectedCreado);

    // Auto-detectar "Patente de camión"
    const detectedPlate = cols.find(c => {
      const n = normalizeText(c);
      return n.includes('patente') || n.includes('placa');
    }) || cols[3] || '';
    setWashPlateCol(detectedPlate);
  };

  const handleWashSheetChange = (sheetName) => {
    setSelectedWashSheet(sheetName);
    if (washWorkbook) {
      processWashSheet(washWorkbook, sheetName);
    }
  };

  // Procesar cruce de Código de camión con N° Interno
  const handleAnalyzeWashRecords = () => {
    if (!washCodeCol || !washCreadoCol || washRawRows.length === 0) {
      toast.warning('Por favor selecciona las columnas de Código de Camión y Creado');
      return;
    }

    // Filtrar por la fecha o rango de Creado seleccionado por el usuario (Requisito 4)
    const rowsToProcess = washRawRows.filter(isRowMatchingDateFilter);

    if (rowsToProcess.length === 0) {
      toast.warning('No hay registros en el archivo que coincidan con el filtro de fecha seleccionado');
      return;
    }

    const matched = [];
    const unmatched = [];

    // Agrupar por código de camión para conservar la fecha de Creado más reciente
    rowsToProcess.forEach((row, idx) => {
      const rawCode = String(row[washCodeCol] || '').trim();
      const rawCreado = row[washCreadoCol];
      const parsedCreado = parseExcelDateValue(rawCreado);
      const rawPlate = washPlateCol ? String(row[washPlateCol] || '').trim() : '';
      const rawServicio = row['Servicio'] || row['servicio'] || 'Lavado';

      if (!rawCode && !rawPlate) return;

      // Buscar relación con N° Interno de flota (o por Patente como alternativa)
      const foundVehicle = fleetList.find(f => {
        const fInt = String(f.internal_number || '').trim().toLowerCase();
        const fPlate = String(f.plate || '').trim().toLowerCase();
        const codeLower = rawCode.toLowerCase();
        const plateLower = rawPlate.toLowerCase();

        return (rawCode && (fInt === codeLower || fInt.includes(codeLower) || codeLower.includes(fInt))) ||
               (rawPlate && fPlate === plateLower);
      });

      const itemData = {
        id: `wash-${idx}`,
        originalIndex: idx + 1,
        truckCode: rawCode,
        plate: rawPlate,
        creadoDate: parsedCreado,
        rawCreado: String(rawCreado),
        servicio: rawServicio,
        matchedVehicle: foundVehicle || null
      };

      if (foundVehicle) {
        matched.push(itemData);
      } else {
        unmatched.push(itemData);
      }
    });

    setMatchedWashUpdates(matched);

    if (unmatched.length > 0) {
      // Requisito 2: "si no encuentras relación necesito que despliegues una pantalla en donde pueda editar o eliminar información"
      setUnmatchedRows(unmatched);
      setIsUnmatchedModalOpen(true);
      toast.info(`Se detectaron ${unmatched.length} registros sin coincidencia en Flota para revisar`);
    } else {
      // Si todos coincidieron directamente
      applyFinalWashUpdates(matched);
    }
  };

  // Guardar cambios en registros no coincidentes (editar código / vincular a vehículo existente)
  const handleUpdateUnmatchedCode = (itemId, newCode) => {
    setUnmatchedRows(prev => prev.map(item => {
      if (item.id === itemId) {
        const found = fleetList.find(f => 
          String(f.internal_number || '').trim().toLowerCase() === newCode.trim().toLowerCase()
        );
        return {
          ...item,
          truckCode: newCode,
          matchedVehicle: found || null
        };
      }
      return item;
    }));
  };

  // Eliminar registro no coincidente (Requisito 2)
  const handleDeleteUnmatchedRow = (itemId) => {
    setUnmatchedRows(prev => prev.filter(item => item.id !== itemId));
    toast.info('Registro descartado');
  };

  // Confirmar y aplicar lavados finales tras resolver o eliminar discrepancias
  const handleConfirmUnmatchedAndApply = () => {
    // Unir los que ya coincidían con los que el usuario corrigió y ahora sí coinciden
    const resolvedFromUnmatched = unmatchedRows.filter(u => u.matchedVehicle && u.creadoDate);
    const allValid = [...matchedWashUpdates, ...resolvedFromUnmatched];

    if (allValid.length === 0) {
      toast.warning('No hay registros válidos con coincidencia para aplicar');
      return;
    }

    applyFinalWashUpdates(allValid);
    setIsUnmatchedModalOpen(false);
  };

  const applyFinalWashUpdates = async (validItems) => {
    // Agrupar por vehículo para registrar la fecha más reciente de "Creado"
    const finalMap = {};

    validItems.forEach(item => {
      const internalKey = String(item.matchedVehicle.internal_number || item.matchedVehicle.plate).trim();
      // Guardar fecha de Creado en la columna "Fecha Último Lavado" (Requisito 2)
      finalMap[internalKey] = {
        internal_number: item.matchedVehicle.internal_number,
        plate: item.matchedVehicle.plate,
        fecha_ultimo_lavado: item.creadoDate
      };
    });

    const updatesArray = Object.values(finalMap);
    const success = await updateFleetWashes(updatesArray);

    if (success) {
      toast.success(`¡Fecha Último Lavado actualizada para ${updatesArray.length} vehículo(s)!`);
      setIsWashModalOpen(false);
      setWashWorkbook(null);
      setWashRawRows([]);
      setMatchedWashUpdates([]);
      setUnmatchedRows([]);
    }
  };

  // ------------------------------------------------------------------
  // EDICIÓN MANUAL INDIVIDUAL
  // ------------------------------------------------------------------
  const handleStartManualEdit = (truck) => {
    setEditingTruck(truck);
    setEditForm({
      ultima_certificacion: truck.ultima_certificacion || '',
      fecha_ultimo_lavado: truck.fecha_ultimo_lavado || ''
    });
  };

  const handleSaveManualEdit = async () => {
    if (!editingTruck) return;
    const key = editingTruck.internal_number || editingTruck.id;
    await updateSingleFleetWash(key, {
      ultima_certificacion: editForm.ultima_certificacion || null,
      fecha_ultimo_lavado: editForm.fecha_ultimo_lavado || null
    });
    setEditingTruck(null);
  };

  // Exportar a Excel
  const handleExportExcel = () => {
    const dataToExport = filteredFleet.map(f => ({
      'N° Interno': f.internal_number || '',
      'Patente': f.plate || '',
      'Tipo': f.type || '',
      'Marca': f.brand || '',
      'Región': f.region || 'Sin asignar',
      'Ultima certificación': f.ultima_certificacion || 'Sin registro',
      'Fecha Último Lavado': f.fecha_ultimo_lavado || 'Sin registro'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lavados y Certificaciones');
    XLSX.writeFile(wb, `Flota_Lavados_Certificaciones_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Excel exportado correctamente');
  };

  const { getRootProps: getCertRoot, getInputProps: getCertInput, isDragActive: isCertDrag } = useDropzone({
    onDrop: onDropCertExcel,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] },
    maxFiles: 1
  });

  const { getRootProps: getWashRoot, getInputProps: getWashInput, isDragActive: isWashDrag } = useDropzone({
    onDrop: onDropWashExcel,
    accept: { 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'application/csv': ['.csv'],
      'text/plain': ['.csv']
    },
    maxFiles: 1
  });

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-full flex flex-col gap-4">
      
      {/* 1. Header Principal */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Droplets className="text-blue-600" />
            Lavados y Certificaciones de Flota
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Gestión y seguimiento de <strong>Ultima certificación</strong> y <strong>Fecha Último Lavado</strong> cruzados por N° Interno.
          </p>
        </div>

        {/* Acciones de Carga Masiva */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botón Carga 1: Certificaciones */}
          <Button
            onClick={() => setIsCertModalOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-xs"
            title="Cargar archivo Excel con 'Ultima certificación' seleccionando la hoja"
          >
            <ShieldCheck size={15} />
            Cargar Certificaciones
          </Button>

          {/* Botón Carga 2: Lavados */}
          <Button
            onClick={() => setIsWashModalOpen(true)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-xs"
            title="Cargar archivo Excel de lavados cruzando N° Interno con Código de camión"
          >
            <Droplets size={15} />
            Cargar Lavados
          </Button>

          {/* Botón Exportar */}
          <Button
            variant="outline"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 text-xs h-9 px-3 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <Download size={14} />
            Exportar
          </Button>
        </div>
      </div>

      {/* 2. Barra de Filtros */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por N° Interno, Patente o Marca..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 h-9 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
          />
        </div>

        {/* Filtro por Región (Requisito 3) */}
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 h-9 bg-slate-50 text-slate-700 outline-none w-full sm:w-auto"
        >
          {regions.map(r => (
            <option key={r} value={r}>
              {r === 'Todas' ? 'Todas las Regiones' : `Región: ${r}`}
            </option>
          ))}
        </select>

        {/* Filtro por Tipo */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 h-9 bg-slate-50 text-slate-700 outline-none w-full sm:w-auto"
        >
          <option value="Todos">Todos los Tipos</option>
          <option value="Camiones">Camiones</option>
          <option value="Tractos">Tractos</option>
          <option value="Semirremolques">Semirremolques</option>
        </select>

        {/* Filtro por Certificación / Lavado */}
        <select
          value={certFilter}
          onChange={(e) => setCertFilter(e.target.value)}
          className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 h-9 bg-slate-50 text-slate-700 outline-none w-full sm:w-auto"
        >
          <option value="Todos">Todas las condiciones</option>
          <option value="con_cert">Con Certificación</option>
          <option value="sin_cert">Sin Certificación</option>
          <option value="con_lavado">Con Lavado Registrado</option>
          <option value="sin_lavado">Sin Lavado</option>
        </select>
      </div>

      {/* 3. Tabla Principal de Lavados */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50 shadow-2xs">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-3.5 py-2.5">N° Interno</th>
              <th className="px-3.5 py-2.5">Patente</th>
              <th className="px-3.5 py-2.5">Tipo</th>
              <th className="px-3.5 py-2.5">Marca</th>
              <th className="px-3.5 py-2.5">Región</th>
              <th className="px-3.5 py-2.5 text-blue-900 bg-blue-50/50">Ultima certificación</th>
              <th className="px-3.5 py-2.5 text-emerald-900 bg-emerald-50/50">Fecha Último Lavado</th>
              <th className="px-3.5 py-2.5 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
            {filteredFleet.length === 0 ? (
              <tr>
                <td colSpan="8" className="py-12 text-center text-slate-400">
                  <Droplets size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-sm">No se encontraron vehículos.</p>
                  <p className="text-xs text-slate-400 mt-0.5">Prueba cambiando los filtros o cargando un archivo Excel.</p>
                </td>
              </tr>
            ) : (
              filteredFleet.map((truck) => (
                <tr key={truck.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* N° Interno */}
                  <td className="px-3.5 py-2.5 font-bold font-mono text-slate-900 text-xs">
                    {truck.internal_number ? (
                      <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {truck.internal_number}
                      </span>
                    ) : (
                      <span className="text-slate-300 italic">— S/N —</span>
                    )}
                  </td>

                  {/* Patente */}
                  <td className="px-3.5 py-2.5 font-bold text-slate-800 font-mono">
                    {truck.plate}
                  </td>

                  {/* Tipo */}
                  <td className="px-3.5 py-2.5 text-slate-600">
                    {truck.type || '—'}
                  </td>

                  {/* Marca */}
                  <td className="px-3.5 py-2.5 text-slate-600">
                    {truck.brand || '—'}
                  </td>

                  {/* Región (Requisito 3) */}
                  <td className="px-3.5 py-2.5 text-slate-700 font-medium">
                    {truck.region || <span className="text-slate-400 italic text-[11px]">—</span>}
                  </td>

                  {/* Ultima certificación */}
                  <td className="px-3.5 py-2.5 font-medium bg-blue-50/20">
                    {truck.ultima_certificacion ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        <ShieldCheck size={12} className="text-blue-600" />
                        {truck.ultima_certificacion}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">— Sin certificación —</span>
                    )}
                  </td>

                  {/* Fecha Último Lavado */}
                  <td className="px-3.5 py-2.5 font-medium bg-emerald-50/20">
                    {truck.fecha_ultimo_lavado ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <Droplets size={12} className="text-emerald-600" />
                        {truck.fecha_ultimo_lavado}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">— Sin lavado —</span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="px-3.5 py-2.5 text-center">
                    <button
                      onClick={() => handleStartManualEdit(truck)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar fechas manualmente"
                    >
                      <Edit2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-400 flex items-center justify-between">
        <span>Mostrando <strong>{filteredFleet.length}</strong> de <strong>{fleetList.length}</strong> vehículos</span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 1: CARGAR CERTIFICACIONES (con selector de hoja)              */}
      {/* ------------------------------------------------------------------ */}
      {isCertModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Cargar Archivo de Certificaciones</h3>
                  <p className="text-xs text-slate-400">
                    Selecciona la hoja a consultar y se vinculará por <strong>N° Interno</strong> con la columna <strong>"Ultima certificación"</strong>.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsCertModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <div className="py-4 space-y-4 overflow-y-auto flex-1">
              {!certWorkbook ? (
                <div 
                  {...getCertRoot()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isCertDrag ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                  }`}
                >
                  <input {...getCertInput()} />
                  <FileSpreadsheet size={44} className="mx-auto text-blue-500 mb-2" />
                  <p className="text-sm font-bold text-slate-700">Arrastra tu archivo Excel de certificaciones aquí</p>
                  <p className="text-xs text-slate-400 mt-1">O haz clic para seleccionar archivo (.xlsx / .xls)</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selector de Hoja (Requisito 2) */}
                  <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl">
                    <label className="block text-xs font-bold text-blue-900 mb-1">
                      ¿En qué hoja deseas buscar la información?:
                    </label>
                    <select
                      value={selectedCertSheet}
                      onChange={(e) => handleCertSheetChange(e.target.value)}
                      className="w-full text-xs font-bold border border-blue-300 rounded-lg p-2 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {certSheets.map(sh => (
                        <option key={sh} value={sh}>{sh}</option>
                      ))}
                    </select>
                  </div>

                  {/* Columnas detectadas */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Columna de N° Interno:
                      </label>
                      <select
                        value={certInternalCol}
                        onChange={(e) => setCertInternalCol(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white"
                      >
                        {certColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-blue-800 mb-1">
                        Columna de Ultima certificación:
                      </label>
                      <select
                        value={certDateCol}
                        onChange={(e) => setCertDateCol(e.target.value)}
                        className="w-full text-xs font-bold border border-blue-300 rounded-lg p-2 bg-blue-50 text-blue-950"
                      >
                        {certColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Resumen de coincidencia */}
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center justify-between text-xs">
                    <span>Filas detectadas en hoja: <strong>{certRawRows.length}</strong></span>
                    <span className="font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                      {certMatchedCount} coinciden con vehículos de flota
                    </span>
                  </div>

                  {/* Muestra de datos */}
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 sticky top-0 text-[10px] uppercase font-bold text-slate-600">
                        <tr>
                          <th className="px-3 py-1.5">N° Interno (Excel)</th>
                          <th className="px-3 py-1.5">Vehículo en Flota</th>
                          <th className="px-3 py-1.5">Ultima certificación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {certPreviewUpdates.slice(0, 15).map((up, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 font-bold font-mono">{up.internal_number}</td>
                            <td className="px-3 py-1.5">
                              {up.matchedFleet ? (
                                <span className="text-emerald-700 font-semibold">{up.matchedFleet.plate}</span>
                              ) : (
                                <span className="text-slate-400 italic">No encontrado</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-blue-700 font-bold">{up.newCertDate || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              {certWorkbook && (
                <button 
                  onClick={() => { setCertWorkbook(null); setCertRawRows([]); }}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Cargar otro archivo
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="ghost" onClick={() => setIsCertModalOpen(false)} className="text-xs">
                  Cancelar
                </Button>
                {certWorkbook && (
                  <Button
                    onClick={handleApplyCertifications}
                    disabled={certMatchedCount === 0 || isLoading}
                    className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Confirmar {certMatchedCount} Certificaciones
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 2: CARGAR LAVADOS (Código de camión vs N° Interno)           */}
      {/* ------------------------------------------------------------------ */}
      {isWashModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Droplets size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Cargar Archivo de Lavados</h3>
                  <p className="text-xs text-slate-400">
                    Cruza <strong>N° Interno</strong> con <strong>Código de camión</strong> y registra la fecha de <strong>"Creado"</strong> como Último Lavado.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsWashModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <div className="py-4 space-y-4 overflow-y-auto flex-1">
              {!washWorkbook ? (
                <div 
                  {...getWashRoot()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isWashDrag ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50'
                  }`}
                >
                  <input {...getWashInput()} />
                  <Droplets size={44} className="mx-auto text-emerald-500 mb-2" />
                  <p className="text-sm font-bold text-slate-700">Arrastra tu archivo Excel o CSV de lavados aquí</p>
                  <p className="text-xs text-slate-400 mt-1">Formatos compatibles: .xlsx, .xls, .csv</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Detecta columnas como "Creado", "Código de camión", "Patente de camión", etc.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selector de Hoja */}
                  {washSheets.length > 1 && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Hoja del archivo Excel:
                      </label>
                      <select
                        value={selectedWashSheet}
                        onChange={(e) => handleWashSheetChange(e.target.value)}
                        className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-2 bg-white text-slate-800"
                      >
                        {washSheets.map(sh => <option key={sh} value={sh}>{sh}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Columnas de cruce */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-emerald-800 mb-1">
                        Columna Código de Camión (en Excel/CSV):
                      </label>
                      <select
                        value={washCodeCol}
                        onChange={(e) => setWashCodeCol(e.target.value)}
                        className="w-full text-xs font-bold border border-emerald-300 rounded-lg p-2 bg-emerald-50/50 text-emerald-950"
                      >
                        {washColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-emerald-800 mb-1">
                        Columna Creado (Fecha de Lavado):
                      </label>
                      <select
                        value={washCreadoCol}
                        onChange={(e) => setWashCreadoCol(e.target.value)}
                        className="w-full text-xs font-bold border border-emerald-300 rounded-lg p-2 bg-emerald-50/50 text-emerald-950"
                      >
                        {washColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Selector de Modo y Rango de Fechas de "Creado" (Requisito 4) */}
                  <div className="p-3 bg-emerald-50/80 border border-emerald-300 rounded-xl space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-emerald-950 flex items-center justify-between mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Calendar size={14} className="text-emerald-700" />
                          Filtro de fecha de "Creado" a cargar:
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          {washDateFilterMode === 'todas' && 'Todas las fechas'}
                          {washDateFilterMode === 'especifica' && `Fecha: ${selectedCreadoDate}`}
                          {washDateFilterMode === 'rango' && `Rango: ${washDateRangeStart || 'Inicio'} → ${washDateRangeEnd || 'Fin'}`}
                        </span>
                      </label>

                      {/* Botones de selección de modo */}
                      <div className="grid grid-cols-3 gap-1.5 bg-emerald-100/70 p-1 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setWashDateFilterMode('todas')}
                          className={`text-xs py-1.5 px-2 rounded-md font-bold transition-all ${
                            washDateFilterMode === 'todas'
                              ? 'bg-emerald-700 text-white shadow-xs'
                              : 'text-emerald-900 hover:bg-emerald-200/60'
                          }`}
                        >
                          Todas las fechas
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setWashDateFilterMode('rango');
                            if (!washDateRangeStart && chronologicalCreadoDates.length > 0) {
                              setWashDateRangeStart(chronologicalCreadoDates[0].date);
                            }
                            if (!washDateRangeEnd && chronologicalCreadoDates.length > 0) {
                              setWashDateRangeEnd(chronologicalCreadoDates[chronologicalCreadoDates.length - 1].date);
                            }
                          }}
                          className={`text-xs py-1.5 px-2 rounded-md font-bold transition-all ${
                            washDateFilterMode === 'rango'
                              ? 'bg-emerald-700 text-white shadow-xs'
                              : 'text-emerald-900 hover:bg-emerald-200/60'
                          }`}
                        >
                          Rango de fechas
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setWashDateFilterMode('especifica');
                            if (selectedCreadoDate === 'todas' && availableCreadoDates.length > 0) {
                              setSelectedCreadoDate(availableCreadoDates[0].date);
                            }
                          }}
                          className={`text-xs py-1.5 px-2 rounded-md font-bold transition-all ${
                            washDateFilterMode === 'especifica'
                              ? 'bg-emerald-700 text-white shadow-xs'
                              : 'text-emerald-900 hover:bg-emerald-200/60'
                          }`}
                        >
                          Fecha específica
                        </button>
                      </div>
                    </div>

                    {/* Si seleccionó Rango de Fechas (Requisito 4) */}
                    {washDateFilterMode === 'rango' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-emerald-200/70">
                        <div>
                          <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                            Fecha Desde (Inicio del rango):
                          </label>
                          <select
                            value={washDateRangeStart}
                            onChange={(e) => setWashDateRangeStart(e.target.value)}
                            className="w-full text-xs font-bold border border-emerald-300 rounded-lg p-2 bg-white text-emerald-950 focus:ring-2 focus:ring-emerald-500 shadow-xs"
                          >
                            {chronologicalCreadoDates.map(item => (
                              <option key={`start-${item.date}`} value={item.date}>
                                📅 {item.date} ({item.count} reg.)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                            Fecha Hasta (Fin del rango):
                          </label>
                          <select
                            value={washDateRangeEnd}
                            onChange={(e) => setWashDateRangeEnd(e.target.value)}
                            className="w-full text-xs font-bold border border-emerald-300 rounded-lg p-2 bg-white text-emerald-950 focus:ring-2 focus:ring-emerald-500 shadow-xs"
                          >
                            {chronologicalCreadoDates.map(item => (
                              <option key={`end-${item.date}`} value={item.date}>
                                📅 {item.date} ({item.count} reg.)
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Si seleccionó Fecha Específica */}
                    {washDateFilterMode === 'especifica' && (
                      <div className="pt-1 border-t border-emerald-200/70">
                        <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                          Selecciona la fecha exacta de "Creado":
                        </label>
                        <select
                          value={selectedCreadoDate}
                          onChange={(e) => setSelectedCreadoDate(e.target.value)}
                          className="w-full text-xs font-bold border border-emerald-300 rounded-lg p-2 bg-white text-emerald-950 focus:ring-2 focus:ring-emerald-500 shadow-xs"
                        >
                          {availableCreadoDates.map(item => (
                            <option key={`single-${item.date}`} value={item.date}>
                              📅 {item.date} — ({item.count} {item.count === 1 ? 'registro' : 'registros'})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <p className="text-[11px] text-emerald-800">
                      {washDateFilterMode === 'todas' && 'Se procesarán y cruzarán los lavados de todas las fechas registradas en el archivo.'}
                      {washDateFilterMode === 'rango' && `Se cargarán únicamente los registros con fecha de Creado entre el ${washDateRangeStart || 'inicio'} y el ${washDateRangeEnd || 'fin'}.`}
                      {washDateFilterMode === 'especifica' && `Solo se cargarán los registros cuya fecha de Creado sea exactamente ${selectedCreadoDate}.`}
                    </p>
                  </div>

                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span>
                      Registros a procesar: <strong>{filteredWashRowsCount}</strong> de {washRawRows.length} totales en archivo
                    </span>
                    <span>Validando contra <strong>{fleetList.length}</strong> vehículos de flota</span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              {washWorkbook && (
                <button 
                  onClick={() => { 
                    setWashWorkbook(null); 
                    setWashRawRows([]); 
                    setSelectedCreadoDate('todas'); 
                    setWashDateFilterMode('todas'); 
                    setWashDateRangeStart(''); 
                    setWashDateRangeEnd(''); 
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Cargar otro archivo
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="ghost" onClick={() => setIsWashModalOpen(false)} className="text-xs">
                  Cancelar
                </Button>
                {washWorkbook && (
                  <Button
                    onClick={handleAnalyzeWashRecords}
                    disabled={washRawRows.length === 0 || isLoading}
                    className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Procesar y Cruzar con Flota
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 3: PANTALLA DE REGISTROS SIN RELACIÓN (EDITAR O ELIMINAR)     */}
      {/* (Requisito 2: "si no encuentras relación necesito que despliegues   */}
      {/*  una pantalla en donde pueda editar o eliminar información")        */}
      {/* ------------------------------------------------------------------ */}
      {isUnmatchedModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">
                    Registros de Lavados sin Coincidencia ({unmatchedRows.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    {washDateFilterMode !== 'todas' && (
                      <span className="inline-block bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[11px] mr-1.5 border border-emerald-200">
                        {washDateFilterMode === 'especifica' && `Filtro Creado: ${selectedCreadoDate}`}
                        {washDateFilterMode === 'rango' && `Filtro Rango: ${washDateRangeStart} → ${washDateRangeEnd}`}
                      </span>
                    )}
                    El "Código de camión" de estas filas no se encontró en la Flota. Puedes <strong>editar</strong> el código para vincularlo a un vehículo existente o <strong>eliminar</strong> la fila.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsUnmatchedModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            {/* Listado editable de discrepancias */}
            <div className="py-4 space-y-3 overflow-y-auto flex-1">
              {unmatchedRows.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
                  <p className="font-bold text-slate-700">Todos los registros han sido resueltos o descartados.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2">Fila</th>
                        <th className="px-3 py-2">Código en Archivo</th>
                        <th className="px-3 py-2">Vincular a N° Interno de Flota</th>
                        <th className="px-3 py-2">Patente Archivo</th>
                        <th className="px-3 py-2">Fecha Creado</th>
                        <th className="px-3 py-2 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {unmatchedRows.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-400 font-mono">{item.originalIndex}</td>
                          <td className="px-3 py-2 font-mono font-bold text-amber-800 bg-amber-50/50">
                            {item.truckCode || '—'}
                          </td>
                          {/* Input / Selector editable para vincular a N° Interno */}
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <select
                                value={item.truckCode}
                                onChange={(e) => handleUpdateUnmatchedCode(item.id, e.target.value)}
                                className={`text-xs font-bold border rounded-lg px-2 py-1 max-w-[180px] ${
                                  item.matchedVehicle 
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                                    : 'bg-white border-slate-300 text-slate-700'
                                }`}
                              >
                                <option value={item.truckCode}>Seleccionar N° Interno...</option>
                                {fleetInternalsList.map(fl => (
                                  <option key={fl.internal} value={fl.internal}>
                                    {fl.internal} ({fl.plate} - {fl.type})
                                  </option>
                                ))}
                              </select>
                              {item.matchedVehicle && (
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded">
                                  ✓ Vinculado
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600">{item.plate || '—'}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{item.creadoDate || item.rawCreado}</td>
                          {/* Botón eliminar información (Requisito 2) */}
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteUnmatchedRow(item.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar esta fila del lote"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">
                Coincidencias listas para registrar: <strong>{matchedWashUpdates.length + unmatchedRows.filter(u => u.matchedVehicle).length}</strong>
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setIsUnmatchedModalOpen(false)} className="text-xs">
                  Cerrar sin guardar
                </Button>
                <Button
                  onClick={handleConfirmUnmatchedAndApply}
                  className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Confirmar y Aplicar Lavados
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 4: EDICIÓN MANUAL DE FECHAS DE UN VEHÍCULO                   */}
      {/* ------------------------------------------------------------------ */}
      {editingTruck && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-5 flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-800">
                Editar Fechas - {editingTruck.plate} (N° {editingTruck.internal_number || 'S/N'})
              </h3>
              <button onClick={() => setEditingTruck(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ultima certificación:
                </label>
                <input
                  type="text"
                  placeholder="ej: DD/MM/AAAA o AAAA-MM-DD"
                  value={editForm.ultima_certificacion}
                  onChange={(e) => setEditForm({ ...editForm, ultima_certificacion: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Fecha Último Lavado:
                </label>
                <input
                  type="text"
                  placeholder="ej: DD/MM/AAAA HH:mm"
                  value={editForm.fecha_ultimo_lavado}
                  onChange={(e) => setEditForm({ ...editForm, fecha_ultimo_lavado: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 font-mono"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditingTruck(null)} className="text-xs">
                Cancelar
              </Button>
              <Button onClick={handleSaveManualEdit} className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

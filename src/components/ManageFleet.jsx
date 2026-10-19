import React, { useEffect, useState, useMemo } from 'react';
import { 
  Edit2, Trash2, Search, X, Check, Truck, UploadCloud, 
  FileSpreadsheet, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, Layers,
  Eye, EyeOff, Table, Download, Building2
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useDropzone } from 'react-dropzone';
import { useFleetStore } from '../store/fleetStore';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { matchVehicleByCode } from '../lib/vehicleMatcher';
import { downloadFleetBulkTemplate } from '../lib/excelTemplates';

// Columnas editables y cargables de flota
export const FLEET_COLUMNS = [
  { key: 'plate', label: 'Patente' },
  { key: 'type', label: 'Tipo' },
  { key: 'tipo_flota', label: 'Tipo Flota' },
  { key: 'empresa_externa', label: 'Empresa Externa' },
  { key: 'brand', label: 'Marca' },
  { key: 'model', label: 'Modelo' },
  { key: 'year', label: 'Año' },
  { key: 'status', label: 'Estado' },
  { key: 'rt_date', label: 'RT', type: 'date' },
  { key: 'gases_date', label: 'Gases', type: 'date' },
  { key: 'pc_date', label: 'PC', type: 'date' },
  { key: 'soap_date', label: 'SOAP', type: 'date' },
  { key: 'carnes_date', label: 'Carnes', type: 'date' },
  { key: 'frio', label: 'Frío' },
  { key: 'engine_number', label: 'N° Motor' },
  { key: 'chassis_number', label: 'N° Chasis' },
  { key: 'cc', label: 'CC' },
  { key: 'tank_capacity', label: 'Carga Estanque' },
  { key: 'payload', label: 'Carga/Peso' },
  { key: 'state2', label: 'Estado 2' },
  { key: 'resolution', label: 'Resolución' },
  { key: 'type2', label: 'Tipo 2' },
  { key: 'side_doors', label: 'P. Laterales' },
  { key: 'gps', label: 'GPS' },
  { key: 'operation', label: 'Operación' },
  { key: 'insurer', label: 'Aseguradora' },
  { key: 'region', label: 'Región' },
  { key: 'tct', label: 'TCT' },
  { key: 'tct_copy', label: 'Copia TCT' },
  { key: 'neo_tac', label: 'NEO TAC' },
  { key: 'pallet_capacity', label: 'Cap. Pallet' },
  { key: 'ultima_certificacion', label: 'Última Certificación', type: 'date' },
  { key: 'fecha_ultimo_lavado', label: 'Fecha Último Lavado' }
];

export const TABLE_COLUMNS = FLEET_COLUMNS.filter(c => !['plate', 'type', 'status'].includes(c.key));

// Función para normalizar y buscar coincidencia en encabezados de Excel
const normalizeText = (txt) => {
  return String(txt || '').toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[._\-/\s]/g, "");
};

// Formatear fechas desde Excel
const formatExcelCellValue = (val, colType) => {
  if (val === null || val === undefined || val === '') return '';
  if (colType === 'date') {
    if (val instanceof Date) {
      const isUtcMidnight = val.getUTCHours() === 0 && val.getUTCMinutes() === 0 && val.getUTCSeconds() === 0;
      const y = isUtcMidnight ? val.getUTCFullYear() : val.getFullYear();
      const m = String((isUtcMidnight ? val.getUTCMonth() : val.getMonth()) + 1).padStart(2, '0');
      const d = String(isUtcMidnight ? val.getUTCDate() : val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (typeof val === 'number') {
      const dObj = new Date(Math.round((val - 25569) * 86400 * 1000));
      const y = dObj.getUTCFullYear();
      const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dObj.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const str = String(val).trim();
    const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) {
      let p1 = parseInt(dmy[1], 10);
      let p2 = parseInt(dmy[2], 10);
      let y = dmy[3];
      if (p2 > 12 && p1 <= 12) {
        return `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
      }
      return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
    const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymd) {
      return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
    }
  }
  return String(val).trim();
};

export default function ManageFleet() {
  const { fleetList, fetchFleet, updateFleet, deleteFleet, updateFleetBulkColumns, isLoading } = useFleetStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [fleetTab, setFleetTab] = useState('propia'); // 'propia' | 'externa' | 'todas'
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Conteo de flota propia y externa
  const propiaCount = useMemo(() => {
    return fleetList.filter(f => (f.tipo_flota || 'Propia') !== 'Externa' && (!f.empresa_externa || f.empresa_externa.trim() === '')).length;
  }, [fleetList]);

  const externaCount = useMemo(() => {
    return fleetList.filter(f => f.tipo_flota === 'Externa' || (f.empresa_externa && f.empresa_externa.trim() !== '')).length;
  }, [fleetList]);

  // Estado del Modal de Carga Masiva por Columnas (Requisito 1 y 3)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [excelWorkbook, setExcelWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [excelColumns, setExcelColumns] = useState([]);
  const [excelRawRows, setExcelRawRows] = useState([]);
  const [excel2DRows, setExcel2DRows] = useState([]); // Matriz 2D de filas crudas (Requisito 3)
  const [headerRowIndex, setHeaderRowIndex] = useState(0); // Fila activa de títulos (Requisito 3)
  const [showPreviewTable, setShowPreviewTable] = useState(true);
  
  // Mapeos y columnas seleccionadas por el usuario
  const [keyInternalColumn, setKeyInternalColumn] = useState('');
  const [selectedFleetColumns, setSelectedFleetColumns] = useState({}); // { [fleetKey]: excelColName }

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  const categorized = useMemo(() => {
    return fleetList.map(f => {
      let category = 'Camiones/Camionetas';
      const t = (f.type || '').toLowerCase();
      if (t.includes('tracto')) category = 'Tractos';
      else if (t.includes('rampla') || t.includes('semiremolque') || t.includes('semirremolque')) category = 'Semiremolques';
      
      return { ...f, dashboardCategory: category };
    });
  }, [fleetList]);

  const filteredFleet = categorized.filter(f => {
    // 1. Filtrado por Pestaña de Flota (Propia vs Externa vs Todas)
    const isExternal = f.tipo_flota === 'Externa' || (f.empresa_externa && f.empresa_externa.trim() !== '');
    if (fleetTab === 'propia' && isExternal) return false;
    if (fleetTab === 'externa' && !isExternal) return false;

    // 2. Filtrado por Categoría / Tipo
    if (typeFilter !== 'Todos' && f.dashboardCategory !== typeFilter) return false;
    
    // 3. Filtrado por Búsqueda (Patente, N° Interno, Marca, Empresa Externa)
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      const matchesPlate = f.plate?.toLowerCase().includes(lowerSearch);
      const matchesInternal = f.internal_number?.toLowerCase().includes(lowerSearch);
      const matchesBrand = f.brand?.toLowerCase().includes(lowerSearch);
      const matchesEmpresa = f.empresa_externa?.toLowerCase().includes(lowerSearch);
      if (!matchesPlate && !matchesInternal && !matchesBrand && !matchesEmpresa) return false;
    }
    return true;
  });

  const startEdit = (truck) => {
    setEditingId(truck.id);
    setEditForm({
      ...truck,
      tipo_flota: truck.tipo_flota || (truck.empresa_externa ? 'Externa' : 'Propia'),
      empresa_externa: truck.empresa_externa || ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async (id) => {
    if (!editForm.plate) {
      toast.error('La patente es obligatoria');
      return;
    }
    if (editForm.tipo_flota === 'Externa' && (!editForm.empresa_externa || !editForm.empresa_externa.trim())) {
      toast.error('Debe ingresar el nombre de la empresa externa para un vehículo externo');
      return;
    }
    
    const { dashboardCategory, ...dataToSave } = editForm;
    const success = await updateFleet(id, dataToSave);
    if (success) {
      setEditingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar este vehículo?')) {
      await deleteFleet(id);
    }
  };

  // ----------------------------------------------------
  // LOGICA CARGA MASIVA POR COLUMNAS (Requisito 1 y 3)
  // ----------------------------------------------------

  // Auto-detectar la mejor fila de títulos analizando las primeras 15 filas (Requisito 3)
  const autoDetectHeaderRow = (rows2D) => {
    if (!rows2D || rows2D.length === 0) return 0;
    let bestIdx = 0;
    let bestScore = -1;

    for (let i = 0; i < Math.min(rows2D.length, 15); i++) {
      const row = rows2D[i] || [];
      const validCells = row.filter(cell => {
        if (cell === null || cell === undefined || cell === '') return false;
        const str = String(cell).trim();
        return str.length > 0 && !str.startsWith('__EMPTY');
      });

      if (validCells.length < 2) continue;

      let score = validCells.length * 2;
      const rowText = row.map(c => normalizeText(String(c))).join(' ');
      if (rowText.includes('interno') || rowText.includes('codigo') || rowText.includes('unidad')) score += 15;
      if (rowText.includes('patente') || rowText.includes('placa')) score += 10;
      if (rowText.includes('marca')) score += 5;
      if (rowText.includes('tipo')) score += 5;
      if (rowText.includes('ano') || rowText.includes('modelo')) score += 4;
      if (rowText.includes('region')) score += 4;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  // Aplicar una fila específica como encabezados de columnas (Requisito 3)
  const applyHeaderRow = (rows2D, rowIdx) => {
    if (!rows2D || rows2D.length === 0 || rowIdx < 0 || rowIdx >= rows2D.length) return;

    const headerRow = rows2D[rowIdx] || [];
    const cols = [];
    const colCounts = {};

    headerRow.forEach((cell, cIdx) => {
      let name = String(cell || '').trim();
      if (!name || name.startsWith('__EMPTY')) {
        name = `Columna ${cIdx + 1}`;
      }
      if (colCounts[name]) {
        colCounts[name]++;
        name = `${name} (${colCounts[name]})`;
      } else {
        colCounts[name] = 1;
      }
      cols.push(name);
    });

    const dataRows = [];
    for (let i = rowIdx + 1; i < rows2D.length; i++) {
      const rowArr = rows2D[i];
      if (!rowArr || rowArr.length === 0) continue;
      const hasData = rowArr.some(c => c !== null && c !== undefined && String(c).trim() !== '');
      if (!hasData) continue;

      const rowObj = {};
      cols.forEach((colName, cIdx) => {
        rowObj[colName] = rowArr[cIdx] !== undefined ? rowArr[cIdx] : '';
      });
      dataRows.push(rowObj);
    }

    setExcelColumns(cols);
    setExcelRawRows(dataRows);
    setHeaderRowIndex(rowIdx);

    // Auto-detectar columna clave "N° Interno"
    let detectedKey = cols.find(c => {
      const n = normalizeText(c);
      return n.includes('interno') || n === 'codigocamion' || n === 'codigo' || n === 'unidad';
    }) || cols[0] || '';
    setKeyInternalColumn(detectedKey);

    // Auto-mapear columnas de flota que coincidan por nombre
    const autoSelected = {};
    FLEET_COLUMNS.forEach(fc => {
      const targetNorm = normalizeText(fc.label);
      const targetKeyNorm = normalizeText(fc.key);

      const matchedExcelCol = cols.find(ec => {
        const ecNorm = normalizeText(ec);
        return ecNorm === targetNorm || ecNorm === targetKeyNorm || 
               ecNorm.includes(targetNorm) || targetNorm.includes(ecNorm);
      });

      if (matchedExcelCol && matchedExcelCol !== detectedKey) {
        autoSelected[fc.key] = matchedExcelCol;
      }
    });

    setSelectedFleetColumns(autoSelected);
  };

  const onDropExcel = (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: false });
        const sheets = workbook.SheetNames || [];
        if (sheets.length === 0) {
          toast.error('El archivo no contiene hojas válidas');
          return;
        }

        setExcelWorkbook(workbook);
        setSheetNames(sheets);
        const initialSheet = sheets[0];
        setSelectedSheet(initialSheet);
        processSheetData(workbook, initialSheet);
        toast.success(`Archivo cargado: ${sheets.length} hoja(s) detectada(s)`);
      } catch (err) {
        console.error(err);
        toast.error('Error al procesar el archivo Excel');
      }
    };
    reader.readAsBinaryString(file);
  };

  const processSheetData = (workbook, sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    // Leer como matriz 2D cruda para permitir seleccionar fila de títulos (Requisito 3)
    const raw2D = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (raw2D.length === 0) {
      setExcelColumns([]);
      setExcelRawRows([]);
      setExcel2DRows([]);
      toast.warning('La hoja seleccionada está vacía');
      return;
    }

    setExcel2DRows(raw2D);
    const detectedIdx = autoDetectHeaderRow(raw2D);
    applyHeaderRow(raw2D, detectedIdx);
  };

  const handleSheetChange = (newSheet) => {
    setSelectedSheet(newSheet);
    if (excelWorkbook) {
      processSheetData(excelWorkbook, newSheet);
    }
  };

  const toggleColumnSelection = (colKey) => {
    setSelectedFleetColumns(prev => {
      const next = { ...prev };
      if (next[colKey]) {
        delete next[colKey];
      } else {
        // Encontrar columna candidata en excel
        const fc = FLEET_COLUMNS.find(c => c.key === colKey);
        const targetNorm = normalizeText(fc?.label || colKey);
        const cand = excelColumns.find(c => normalizeText(c).includes(targetNorm)) || excelColumns[0] || '';
        next[colKey] = cand;
      }
      return next;
    });
  };

  const handleSetColumnMapping = (colKey, excelCol) => {
    setSelectedFleetColumns(prev => ({
      ...prev,
      [colKey]: excelCol
    }));
  };

  // Previsualización de los datos que se van a actualizar
  const previewUpdates = useMemo(() => {
    if (!keyInternalColumn || excelRawRows.length === 0) return [];
    const activeCols = Object.entries(selectedFleetColumns);
    if (activeCols.length === 0) return [];

    return excelRawRows.map((row, idx) => {
      const rawInternal = String(row[keyInternalColumn] || '').trim();
      const existingVehicle = matchVehicleByCode(rawInternal, '', fleetList);

      const fields = {};
      activeCols.forEach(([fleetKey, excelCol]) => {
        const fc = FLEET_COLUMNS.find(c => c.key === fleetKey);
        const formattedVal = formatExcelCellValue(row[excelCol], fc?.type);
        fields[fleetKey] = formattedVal;
      });

      return {
        rowIdx: idx + 1,
        internal_number: rawInternal,
        existingVehicle,
        fields,
        isMatched: !!existingVehicle && !!rawInternal
      };
    });
  }, [keyInternalColumn, excelRawRows, selectedFleetColumns, fleetList]);

  const matchedCount = useMemo(() => {
    return previewUpdates.filter(u => u.isMatched).length;
  }, [previewUpdates]);

  // Confirmar y aplicar carga masiva por columnas
  const handleApplyBulkColumns = async () => {
    const validUpdates = previewUpdates
      .filter(u => u.isMatched && u.internal_number)
      .map(u => ({
        internal_number: u.existingVehicle?.internal_number || u.internal_number,
        ...u.fields
      }));

    if (validUpdates.length === 0) {
      toast.warning('No hay filas coincidentes con N° Interno de la flota para actualizar');
      return;
    }

    const success = await updateFleetBulkColumns(validUpdates);
    if (success) {
      setIsBulkModalOpen(false);
      setExcelWorkbook(null);
      setExcelRawRows([]);
      setSelectedFleetColumns({});
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropExcel,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1
  });

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-full flex flex-col">
      {/* Header Principal */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Truck className="text-blue-600" />
            Gestión de Flota
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Total de vehículos registrados: <strong>{fleetList.length}</strong>
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full xl:w-auto">
          {/* Botón Carga Masiva por Columnas (Requisito 1) */}
          <Button
            onClick={() => setIsBulkModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-10 px-4 rounded-xl shadow-xs shrink-0 w-full sm:w-auto justify-center"
            title="Cargar y actualizar columnas masivamente relacionando por N° Interno"
          >
            <UploadCloud size={16} />
            Carga Masiva por Columnas
          </Button>

          {/* Botón Descargar Plantilla Excel */}
          <Button
            variant="outline"
            onClick={downloadFleetBulkTemplate}
            className="flex items-center gap-1.5 border-slate-200 text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 font-bold text-xs h-10 px-3 rounded-xl shadow-xs shrink-0 w-full sm:w-auto justify-center"
            title="Descargar plantilla Excel con todos los títulos de columnas oficiales para carga rápida"
          >
            <Download size={15} />
            Plantilla Excel
          </Button>

          <Select 
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: 'Todos', label: 'Todos los Tipos' },
              { value: 'Camiones/Camionetas', label: 'Camiones/Camionetas' },
              { value: 'Tractos', label: 'Tractos' },
              { value: 'Semiremolques', label: 'Semiremolques' }
            ]}
          />
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar patente o N° interno..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 h-10 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm"
            />
          </div>
        </div>
      </div>

      {/* Pestañas de Flota: Propia vs Externa vs Toda la Flota (Requisito 2) */}
      <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setFleetTab('propia')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            fleetTab === 'propia'
              ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
          }`}
        >
          <Truck size={15} />
          <span>Flota Propia</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            fleetTab === 'propia' ? 'bg-blue-700/60 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {propiaCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFleetTab('externa')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            fleetTab === 'externa'
              ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-600/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
          }`}
        >
          <Building2 size={15} />
          <span>Flota Externa</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            fleetTab === 'externa' ? 'bg-purple-700/60 text-white' : 'bg-purple-100 text-purple-700'
          }`}>
            {externaCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFleetTab('todas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            fleetTab === 'todas'
              ? 'bg-slate-800 text-white shadow-sm ring-2 ring-slate-800/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
          }`}
        >
          <Layers size={15} />
          <span>Toda la Flota</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            fleetTab === 'todas' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {fleetList.length}
          </span>
        </button>
      </div>

      {/* Banner Informativo al estar en la Pestaña de Flota Externa */}
      {fleetTab === 'externa' && (
        <div className="mb-4 bg-purple-50/90 border border-purple-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-purple-900 animate-in fade-in">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-purple-600 shrink-0" />
            <span>
              Pestaña <strong>Flota Externa</strong>: mostrando vehículos tercerizados ({externaCount} registrados).
            </span>
          </div>
          <span className="text-[11px] text-purple-700 font-medium">
            Agrega nuevos camiones externos desde <strong>Agregar Flota</strong> (con <em>Tipo de Flota: Externa</em>).
          </span>
        </div>
      )}

      {/* Tabla de Flota */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50">
        <table className="w-full text-xs text-left whitespace-nowrap">
          <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-3 py-2 font-semibold">Estado</th>
              <th className="px-3 py-2 font-semibold">Patente</th>
              <th className="px-3 py-2 font-semibold">N° Interno</th>
              <th className="px-3 py-2 font-semibold">Tipo</th>
              <th className="px-3 py-2 font-semibold text-center sticky right-0 bg-slate-100 shadow-[-4px_0_10px_rgba(0,0,0,0.05)]">Acciones</th>
              {TABLE_COLUMNS.map(col => <th key={col.key} className="px-3 py-2 font-semibold">{col.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredFleet.length === 0 ? (
              <tr>
                <td colSpan={5 + TABLE_COLUMNS.length} className="px-4 py-8 text-center text-slate-500">
                  {fleetTab === 'externa' ? (
                    <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto py-4">
                      <Building2 size={36} className="text-purple-400" />
                      <p className="font-semibold text-slate-700">No hay vehículos registrados en Flota Externa</p>
                      <p className="text-xs text-slate-500">
                        Puedes agregar vehículos externos desde <strong>Agregar Flota</strong> seleccionando <em>Tipo de Flota: Externa</em>, o editando cualquier vehículo existente en esta tabla.
                      </p>
                    </div>
                  ) : fleetTab === 'propia' ? (
                    'No se encontraron vehículos de Flota Propia.'
                  ) : (
                    'No se encontraron vehículos.'
                  )}
                </td>
              </tr>
            ) : (
              filteredFleet.map((truck) => (
                <tr key={truck.id} className="hover:bg-slate-50 transition-colors">
                  {editingId === truck.id ? (
                    <>
                      <td className="px-2 py-1">
                        <select 
                          value={editForm.status || 'Activo'} 
                          onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                          className="h-7 text-xs border border-slate-200 rounded px-1 min-w-[120px]"
                        >
                          <option value="Activo">Activo</option>
                          <option value="Baja">Baja</option>
                          <option value="En Taller">En Taller</option>
                          <option value="Por documentación">Por documentación</option>
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input 
                          value={editForm.plate || ''} 
                          onChange={(e) => setEditForm({...editForm, plate: e.target.value.toUpperCase()})}
                          className="h-7 text-xs border border-slate-200 rounded px-2 min-w-[80px]"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input 
                          value={editForm.internal_number || ''} 
                          onChange={(e) => setEditForm({...editForm, internal_number: e.target.value})}
                          className="h-7 text-xs border border-slate-200 rounded px-2 min-w-[80px]"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input 
                          value={editForm.type || ''} 
                          onChange={(e) => setEditForm({...editForm, type: e.target.value})}
                          className="h-7 text-xs border border-slate-200 rounded px-2 min-w-[100px]"
                        />
                      </td>
                      <td className="px-3 py-1 sticky right-0 bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.05)] border-l border-slate-100">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleSave(truck.id)} disabled={isLoading} className="p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors" title="Guardar"><Check size={16} /></button>
                          <button onClick={cancelEdit} disabled={isLoading} className="p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded transition-colors" title="Cancelar"><X size={16} /></button>
                        </div>
                      </td>
                      {TABLE_COLUMNS.map(col => {
                        if (col.key === 'tipo_flota') {
                          return (
                            <td key={col.key} className="px-2 py-1">
                              <select 
                                value={editForm.tipo_flota || 'Propia'} 
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditForm({
                                    ...editForm, 
                                    tipo_flota: val,
                                    empresa_externa: val === 'Propia' ? '' : editForm.empresa_externa
                                  });
                                }}
                                className="h-7 text-xs border border-slate-200 rounded px-1 min-w-[90px] bg-white font-medium"
                              >
                                <option value="Propia">Propia</option>
                                <option value="Externa">Externa</option>
                              </select>
                            </td>
                          );
                        }
                        if (col.key === 'empresa_externa') {
                          return (
                            <td key={col.key} className="px-2 py-1">
                              <input 
                                type="text"
                                placeholder={editForm.tipo_flota === 'Externa' ? 'Empresa externa *' : 'Opcional'}
                                disabled={editForm.tipo_flota !== 'Externa'}
                                value={editForm.empresa_externa || ''} 
                                onChange={(e) => setEditForm({...editForm, empresa_externa: e.target.value})}
                                className={`h-7 text-xs border rounded px-2 min-w-[130px] ${
                                  editForm.tipo_flota === 'Externa' 
                                    ? 'border-purple-300 bg-purple-50/50 font-semibold text-purple-900' 
                                    : 'border-slate-200 bg-slate-100 text-slate-400'
                                }`}
                              />
                            </td>
                          );
                        }
                        return (
                          <td key={col.key} className="px-2 py-1">
                            <input 
                              type={col.type || 'text'}
                              value={editForm[col.key] || ''} 
                              onChange={(e) => setEditForm({...editForm, [col.key]: e.target.value})}
                              className="h-7 text-xs border border-slate-200 rounded px-2 min-w-[100px]"
                            />
                          </td>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${
                          truck.status === 'Activo' ? 'bg-green-100 text-green-700' : 
                          truck.status === 'Baja' ? 'bg-red-100 text-red-700' : 
                          truck.status === 'En Taller' ? 'bg-amber-100 text-amber-700' : 
                          truck.status === 'Por documentación' ? 'bg-orange-100 text-orange-700' : 
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {truck.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-700">{truck.plate}</td>
                      <td className="px-3 py-2 text-slate-600 font-mono font-bold">{truck.internal_number || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{truck.type}</td>
                      <td className="px-3 py-2 sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.05)] border-l border-slate-100 transition-colors">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => startEdit(truck)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors" title="Editar"><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(truck.id)} className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors" title="Eliminar"><Trash2 size={16} /></button>
                        </div>
                      </td>
                      {TABLE_COLUMNS.map(col => {
                        if (col.key === 'tipo_flota') {
                          const isExt = truck.tipo_flota === 'Externa' || (truck.empresa_externa && truck.empresa_externa.trim() !== '');
                          return (
                            <td key={col.key} className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isExt
                                  ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                  : 'bg-blue-100 text-blue-700 border border-blue-200'
                              }`}>
                                {isExt ? 'Externa' : 'Propia'}
                              </span>
                            </td>
                          );
                        }
                        if (col.key === 'empresa_externa') {
                          return (
                            <td key={col.key} className="px-3 py-2 text-slate-700">
                              {truck.empresa_externa ? (
                                <span className="font-semibold text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                                  {truck.empresa_externa}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          );
                        }
                        return (
                          <td key={col.key} className="px-3 py-2 text-slate-600">
                            {truck[col.key] || '-'}
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------- */}
      {/* MODAL: CARGA MASIVA POR COLUMNAS (Requisito 1)       */}
      {/* ---------------------------------------------------- */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
            {/* Cabecera */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                  <UploadCloud size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Carga Masiva por Columnas</h3>
                  <p className="text-xs text-slate-500">
                    Actualiza columnas seleccionadas de la flota relacionando siempre con <strong>N° Interno</strong>.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={downloadFleetBulkTemplate}
                  className="text-xs h-8 px-2.5 flex items-center gap-1.5 text-indigo-700 border-indigo-200 hover:bg-indigo-50 font-bold rounded-lg"
                  title="Descargar plantilla Excel con encabezados oficiales"
                >
                  <Download size={14} />
                  Descargar Plantilla
                </Button>
                <button 
                  onClick={() => setIsBulkModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="py-4 space-y-4 overflow-y-auto flex-1">
              {/* Paso 1: Dropzone Excel */}
              {!excelWorkbook ? (
                <div 
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
                  }`}
                >
                  <input {...getInputProps()} />
                  <div className="flex justify-center mb-3 text-slate-400">
                    <FileSpreadsheet size={48} className="text-indigo-500" />
                  </div>
                  <p className="text-slate-700 font-bold text-sm">Arrastra y suelta tu archivo Excel aquí</p>
                  <p className="text-xs text-slate-400 mt-1">O haz clic para seleccionar un archivo (.xlsx o .xls)</p>
                  
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFleetBulkTemplate();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all shadow-xs"
                      title="Descargar archivo Excel con todos los títulos para rellenar"
                    >
                      <Download size={14} />
                      Descargar Plantilla Excel con Títulos
                    </button>
                  </div>

                  <div className="mt-4 p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-left text-xs text-indigo-900 flex items-start gap-2 max-w-lg mx-auto">
                    <CheckCircle2 size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                    <span>
                      El archivo solo debe incluir una columna con el <strong>N° Interno</strong> y las columnas que deseas actualizar. Podrás seleccionar exactamente qué columnas cargar.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selector de Hoja, Fila de Títulos y Columna Clave (Requisito 3) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    {/* Selector de Hoja */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        1. Hoja del archivo Excel:
                      </label>
                      <select
                        value={selectedSheet}
                        onChange={(e) => handleSheetChange(e.target.value)}
                        className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-2 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {sheetNames.map(sh => (
                          <option key={sh} value={sh}>{sh}</option>
                        ))}
                      </select>
                    </div>

                    {/* Selector de Fila de Títulos (Requisito 3) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                        <span>2. Fila de títulos:</span>
                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-300">
                          Auto-detectada
                        </span>
                      </label>
                      <select
                        value={headerRowIndex}
                        onChange={(e) => applyHeaderRow(excel2DRows, parseInt(e.target.value, 10))}
                        className="w-full text-xs font-bold border border-slate-300 rounded-lg p-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {excel2DRows.slice(0, 10).map((row, idx) => (
                          <option key={`row-${idx}`} value={idx}>
                            Fila {idx + 1} {idx === headerRowIndex ? '✓ (Títulos activos)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Selector de Columna Clave N° Interno */}
                    <div>
                      <label className="block text-xs font-bold text-indigo-800 mb-1">
                        3. Columna N° Interno (Clave):
                      </label>
                      <select
                        value={keyInternalColumn}
                        onChange={(e) => setKeyInternalColumn(e.target.value)}
                        className="w-full text-xs font-bold border border-indigo-300 rounded-lg p-2 bg-indigo-50/50 text-indigo-950 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {excelColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Vista Previa de Primeras 5 Filas con Selección Interactiva (Requisito 3) */}
                  {excel2DRows.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                      <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Table size={14} className="text-indigo-600" />
                          <span className="text-xs font-bold text-slate-800">
                            Previsualización del archivo (Primeras 5 filas)
                          </span>
                          <span className="text-[10px] text-slate-500 hidden sm:inline">
                            — Haz clic en "Usar como títulos" en la fila donde comienzan los encabezados
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowPreviewTable(!showPreviewTable)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                        >
                          {showPreviewTable ? <EyeOff size={13} /> : <Eye size={13} />}
                          {showPreviewTable ? 'Ocultar' : 'Mostrar'}
                        </button>
                      </div>

                      {showPreviewTable && (
                        <div className="overflow-x-auto max-h-48 text-xs">
                          <table className="w-full text-left border-collapse">
                            <tbody>
                              {excel2DRows.slice(0, 5).map((row, rIdx) => {
                                const isHeader = rIdx === headerRowIndex;
                                return (
                                  <tr 
                                    key={`prev-${rIdx}`}
                                    className={`transition-colors border-b border-slate-100 ${
                                      isHeader 
                                        ? 'bg-indigo-50/90 font-bold border-l-4 border-l-indigo-600 text-indigo-950' 
                                        : 'hover:bg-slate-50/70 text-slate-700'
                                    }`}
                                  >
                                    <td className="px-2.5 py-1.5 text-center font-mono text-[11px] whitespace-nowrap bg-slate-100/70 border-r border-slate-200 w-36">
                                      <div className="flex items-center gap-2 justify-between">
                                        <span className="text-slate-500 font-bold">Fila {rIdx + 1}</span>
                                        {isHeader ? (
                                          <span className="bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-2xs">
                                            ✓ Títulos
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => applyHeaderRow(excel2DRows, rIdx)}
                                            className="text-[10px] bg-white border border-slate-300 hover:border-indigo-500 hover:text-indigo-600 px-1.5 py-0.5 rounded font-semibold text-slate-600 transition-colors shadow-2xs"
                                            title="Establecer esta fila como encabezados de columna"
                                          >
                                            Usar como títulos
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                    {row.slice(0, 8).map((cell, cIdx) => (
                                      <td 
                                        key={`cell-${rIdx}-${cIdx}`}
                                        className={`px-2.5 py-1.5 max-w-[140px] truncate border-r border-slate-100 text-[11px] ${
                                          isHeader ? 'font-black text-indigo-900 bg-indigo-100/40' : ''
                                        }`}
                                        title={String(cell || '')}
                                      >
                                        {cell !== null && cell !== undefined && String(cell).trim() !== '' ? (
                                          String(cell)
                                        ) : (
                                          <span className="text-slate-300 italic text-[10px]">—</span>
                                        )}
                                      </td>
                                    ))}
                                    {row.length > 8 && (
                                      <td className="px-2 py-1 text-slate-400 text-[10px] italic">
                                        +{row.length - 8} más...
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Paso 2: Selección de Columnas a Cargar */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                        Selecciona las columnas que deseas cargar masivamente:
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            // Seleccionar todas las que tengan coincidencia
                            const all = {};
                            FLEET_COLUMNS.forEach(fc => {
                              const match = excelColumns.find(ec => 
                                normalizeText(ec) === normalizeText(fc.label) || 
                                normalizeText(ec) === normalizeText(fc.key)
                              );
                              if (match && match !== keyInternalColumn) {
                                all[fc.key] = match;
                              }
                            });
                            setSelectedFleetColumns(all);
                          }}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          Auto-seleccionar detectadas
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedFleetColumns({})}
                          className="text-xs font-semibold text-slate-500 hover:text-red-600"
                        >
                          Limpiar selección
                        </button>
                      </div>
                    </div>

                    {/* Grid de checkboxes de columnas de flota */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50/50">
                      {FLEET_COLUMNS.map(col => {
                        const isSelected = !!selectedFleetColumns[col.key];
                        return (
                          <div 
                            key={col.key}
                            className={`p-2 rounded-lg border text-xs transition-all ${
                              isSelected 
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-bold shadow-2xs' 
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleColumnSelection(col.key)}
                                className="rounded text-indigo-600 cursor-pointer"
                              />
                              <span className="truncate">{col.label}</span>
                            </label>

                            {/* Dropdown de mapeo si está seleccionada */}
                            {isSelected && (
                              <div className="mt-1.5 pt-1 border-t border-indigo-200/60">
                                <span className="block text-[10px] text-indigo-700 font-normal">Columna en Excel:</span>
                                <select
                                  value={selectedFleetColumns[col.key] || ''}
                                  onChange={(e) => handleSetColumnMapping(col.key, e.target.value)}
                                  className="w-full text-[11px] font-medium border border-indigo-200 rounded p-1 bg-white text-slate-800 focus:outline-none"
                                >
                                  {excelColumns.map(ec => (
                                    <option key={ec} value={ec}>{ec}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Paso 3: Vista Previa de los Cambios */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-800">
                        Vista previa ({excelRawRows.length} filas en archivo)
                      </span>
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                        {matchedCount} vehículo(s) coinciden en flota
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-48">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b border-slate-200 font-bold text-[11px]">
                          <tr>
                            <th className="px-3 py-2">Fila</th>
                            <th className="px-3 py-2">N° Interno (Excel)</th>
                            <th className="px-3 py-2">Vehículo en Flota</th>
                            {Object.keys(selectedFleetColumns).map(fKey => {
                              const fc = FLEET_COLUMNS.find(c => c.key === fKey);
                              return (
                                <th key={fKey} className="px-3 py-2 text-indigo-900 bg-indigo-50/50">
                                  {fc?.label || fKey} (Nuevo)
                                </th>
                              );
                            })}
                            <th className="px-3 py-2 text-center">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {previewUpdates.slice(0, 30).map((up, uIdx) => (
                            <tr key={uIdx} className={up.isMatched ? 'hover:bg-slate-50' : 'bg-red-50/20'}>
                              <td className="px-3 py-1.5 text-slate-400 font-mono text-[10px]">{up.rowIdx}</td>
                              <td className="px-3 py-1.5 font-bold font-mono text-slate-900">{up.internal_number || '-'}</td>
                              <td className="px-3 py-1.5">
                                {up.existingVehicle ? (
                                  <span className="text-slate-800 font-semibold">
                                    {up.existingVehicle.plate} ({up.existingVehicle.type || 'S/T'})
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">No existe en flota</span>
                                )}
                              </td>
                              {Object.keys(selectedFleetColumns).map(fKey => (
                                <td key={fKey} className="px-3 py-1.5 font-medium text-indigo-950 bg-indigo-50/20">
                                  {up.fields[fKey] || <span className="text-slate-300 italic">—</span>}
                                </td>
                              ))}
                              <td className="px-3 py-1.5 text-center">
                                {up.isMatched ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                    <CheckCircle2 size={12} /> Coincide
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                                    <AlertCircle size={12} /> Sin relación
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {previewUpdates.length > 30 && (
                      <p className="text-[11px] text-slate-400 text-center mt-1">
                        ... mostrando primeras 30 de {previewUpdates.length} filas del archivo.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Acciones del Modal */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              {excelWorkbook && (
                <button
                  type="button"
                  onClick={() => {
                    setExcelWorkbook(null);
                    setExcelRawRows([]);
                    setSelectedFleetColumns({});
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Cargar otro archivo
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button
                  variant="ghost"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                {excelWorkbook && (
                  <Button
                    onClick={handleApplyBulkColumns}
                    disabled={matchedCount === 0 || isLoading}
                    className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                  >
                    Confirmar y Actualizar {matchedCount} Vehículo(s)
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

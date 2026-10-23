import React, { useState, useMemo, useRef } from 'react';
import { useTiendasCriticasStore } from '../store/tiendasCriticasStore';
import { Button } from './ui/Button';
import { 
  Store, Search, Plus, UploadCloud, Download, RefreshCw, 
  Trash2, Edit2, X, Check, AlertTriangle, Clock, MapPin, 
  FileSpreadsheet, ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const CONSIDERACIONES_OPTIONS = [
  'URGENTE POR CLIENTE',
  'URGENTE CON PRIORIDAD',
  'RESTRICCION HORARIA',
  'DIFICULTAD DE ACCESO',
  'UNIVERSIDAD',
  'TIPO DE EQUIPO',
  'REDESPACHO'
];

export default function MantenedorTiendasCriticasModal({ isOpen, onClose }) {
  const { 
    tiendas, 
    addTiendaCritica, 
    updateTiendaCritica, 
    deleteTiendaCritica, 
    uploadExcelTiendasCriticas,
    resetToDefaults
  } = useTiendasCriticasStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCliente, setSelectedCliente] = useState('Todos');
  const [selectedConsideracion, setSelectedConsideracion] = useState('Todas');
  
  // Modal de Crear / Editar
  const [formMode, setFormMode] = useState(null); // 'create' | 'edit' | null
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    cliente: '',
    consideracion: 'URGENTE CON PRIORIDAD',
    destino: '',
    direccion: '',
    comuna: '',
    region: '013',
    transportista: '',
    ipr: '',
    ventanaHoraria: '',
    ventanaHoraria2: '',
    observaciones: ''
  });

  const fileInputRef = useRef(null);

  // Lista de clientes únicos para filtro
  const clientesList = useMemo(() => {
    const setC = new Set(tiendas.map(t => t.cliente).filter(Boolean));
    return ['Todos', ...Array.from(setC).sort()];
  }, [tiendas]);

  // Lista de consideraciones únicas para filtro
  const consideracionesList = useMemo(() => {
    const setCons = new Set(tiendas.map(t => t.consideracion).filter(Boolean));
    return ['Todas', ...Array.from(setCons).sort()];
  }, [tiendas]);

  // Tiendas filtradas
  const filteredTiendas = useMemo(() => {
    return tiendas.filter(t => {
      if (selectedCliente !== 'Todos' && t.cliente !== selectedCliente) return false;
      if (selectedConsideracion !== 'Todas' && t.consideracion !== selectedConsideracion) return false;
      
      if (searchTerm.trim()) {
        const lower = searchTerm.toLowerCase();
        const mDest = (t.destino || '').toLowerCase().includes(lower);
        const mCli = (t.cliente || '').toLowerCase().includes(lower);
        const mCom = (t.comuna || '').toLowerCase().includes(lower);
        const mCons = (t.consideracion || '').toLowerCase().includes(lower);
        const mObs = (t.observaciones || '').toLowerCase().includes(lower);
        if (!mDest && !mCli && !mCom && !mCons && !mObs) return false;
      }
      return true;
    });
  }, [tiendas, selectedCliente, selectedConsideracion, searchTerm]);

  if (!isOpen) return null;

  const handleOpenCreate = () => {
    setFormData({
      cliente: '',
      consideracion: 'URGENTE CON PRIORIDAD',
      destino: '',
      direccion: '',
      comuna: '',
      region: '013',
      transportista: '',
      ipr: '',
      ventanaHoraria: '',
      ventanaHoraria2: '',
      observaciones: ''
    });
    setEditingItem(null);
    setFormMode('create');
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setFormData({
      cliente: item.cliente || '',
      consideracion: item.consideracion || 'URGENTE CON PRIORIDAD',
      destino: item.destino || '',
      direccion: item.direccion || '',
      comuna: item.comuna || '',
      region: item.region || '',
      transportista: item.transportista || '',
      ipr: item.ipr || '',
      ventanaHoraria: item.ventanaHoraria || '',
      ventanaHoraria2: item.ventanaHoraria2 || '',
      observaciones: item.observaciones || ''
    });
    setFormMode('edit');
  };

  const handleSubmitForm = (e) => {
    e.preventDefault();
    if (!formData.destino.trim()) {
      toast.error('El campo Destino es obligatorio');
      return;
    }

    if (formMode === 'create') {
      const ok = addTiendaCritica(formData);
      if (ok) setFormMode(null);
    } else if (formMode === 'edit' && editingItem) {
      const ok = updateTiendaCritica(editingItem.id, formData);
      if (ok) setFormMode(null);
    }
  };

  const handleDelete = (item) => {
    if (window.confirm(`¿Estás seguro de eliminar la tienda crítica "${item.destino}"?`)) {
      deleteTiendaCritica(item.id);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadExcelTiendasCriticas(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExportExcel = () => {
    const dataToExport = tiendas.map(t => ({
      'Cliente': t.cliente || '',
      'Consideracion': t.consideracion || '',
      'Destino': t.destino || '',
      'Direccion': t.direccion || '',
      'Comuna': t.comuna || '',
      'Región': t.region || '',
      'Transportista': t.transportista || '',
      'IPR': t.ipr || '',
      'Ventana Horaria': t.ventanaHoraria || '',
      'Ventana Horaria 2': t.ventanaHoraria2 || '',
      'OBSERVACIONES': t.observaciones || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tiendas Críticas");
    XLSX.writeFile(workbook, `Tiendas_Criticas_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getConsideracionBadge = (cons) => {
    const upper = (cons || '').toUpperCase();
    if (upper.includes('URGENTE POR CLIENTE')) {
      return 'bg-red-100 text-red-800 border-red-200';
    }
    if (upper.includes('URGENTE CON PRIORIDAD')) {
      return 'bg-orange-100 text-orange-800 border-orange-200';
    }
    if (upper.includes('RESTRICCION')) {
      return 'bg-amber-100 text-amber-800 border-amber-200';
    }
    if (upper.includes('ACCESO')) {
      return 'bg-purple-100 text-purple-800 border-purple-200';
    }
    if (upper.includes('UNIVERSIDAD')) {
      return 'bg-blue-100 text-blue-800 border-blue-200';
    }
    if (upper.includes('EQUIPO')) {
      return 'bg-teal-100 text-teal-800 border-teal-200';
    }
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 overflow-hidden">
        
        {/* 1. Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Store size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Mantenedor de Tiendas Críticas
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                  {tiendas.length} Registradas
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Los destinos aquí registrados se marcarán automáticamente como <strong>Destino Prioritario</strong> al cruzarse con el Ruteo.
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-200/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 2. Barra de Herramientas y Filtros */}
        <div className="p-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Buscador */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
              <input
                type="text"
                placeholder="Buscar destino, cliente, comuna..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 h-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
            </div>

            {/* Filtro Cliente */}
            <select
              value={selectedCliente}
              onChange={(e) => setSelectedCliente(e.target.value)}
              className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 h-9 bg-slate-50 text-slate-700 outline-none cursor-pointer"
            >
              {clientesList.map(c => (
                <option key={c} value={c}>
                  {c === 'Todos' ? 'Todos los Clientes' : c}
                </option>
              ))}
            </select>

            {/* Filtro Consideración */}
            <select
              value={selectedConsideracion}
              onChange={(e) => setSelectedConsideracion(e.target.value)}
              className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 h-9 bg-slate-50 text-slate-700 outline-none cursor-pointer"
            >
              {consideracionesList.map(cons => (
                <option key={cons} value={cons}>
                  {cons === 'Todas' ? 'Todas las Consideraciones' : cons}
                </option>
              ))}
            </select>

            {(searchTerm || selectedCliente !== 'Todos' || selectedConsideracion !== 'Todas') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCliente('Todos');
                  setSelectedConsideracion('Todas');
                }}
                className="text-xs font-bold text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                × Limpiar
              </button>
            )}
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />

            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs h-9"
              title="Cargar archivo Excel con encabezados en la fila 3"
            >
              <UploadCloud size={15} />
              <span>Subir Excel</span>
            </Button>

            <Button
              variant="outline"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 text-xs h-9"
              title="Exportar listado actual a Excel"
            >
              <Download size={15} />
              <span className="hidden sm:inline">Exportar</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm('¿Deseas restablecer el listado a las 110 tiendas críticas predeterminadas?')) {
                  resetToDefaults();
                }
              }}
              className="flex items-center gap-1.5 text-xs h-9 text-slate-600 hover:text-red-700"
              title="Restablecer base original de 110 tiendas"
            >
              <RefreshCw size={14} />
            </Button>

            <Button
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 text-xs h-9 bg-red-600 hover:bg-red-700 text-white font-bold shadow-xs"
            >
              <Plus size={16} />
              <span>Agregar Tienda</span>
            </Button>
          </div>
        </div>

        {/* 3. Tabla de Tiendas Críticas */}
        <div className="flex-1 overflow-auto bg-slate-50/50">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider shadow-2xs">
              <tr>
                <th className="px-3.5 py-3 border-r border-slate-200">Cliente</th>
                <th className="px-3.5 py-3 border-r border-slate-200">Destino (Local)</th>
                <th className="px-3.5 py-3 border-r border-slate-200">Consideración / Prioridad</th>
                <th className="px-3.5 py-3 border-r border-slate-200">Dirección</th>
                <th className="px-3.5 py-3 border-r border-slate-200">Comuna / Región</th>
                <th className="px-3.5 py-3 border-r border-slate-200">Ventana Horaria</th>
                <th className="px-3.5 py-3 border-r border-slate-200">Observaciones</th>
                <th className="px-3.5 py-3 text-center w-20">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredTiendas.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-400">
                    <Store size={36} className="mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-sm">No se encontraron tiendas críticas</p>
                    <p className="text-xs text-slate-400 mt-0.5">Prueba cambiando los filtros o sube un archivo Excel.</p>
                  </td>
                </tr>
              ) : (
                filteredTiendas.map((t, idx) => (
                  <tr key={t.id || idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3.5 py-2.5 font-bold text-slate-800 border-r border-slate-100">
                      {t.cliente || <span className="text-slate-400 italic">Sin cliente</span>}
                    </td>
                    <td className="px-3.5 py-2.5 font-bold text-slate-900 border-r border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                        <span className="font-mono text-xs">{t.destino}</span>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 border-r border-slate-100">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${getConsideracionBadge(t.consideracion)}`}>
                        {t.consideracion}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600 border-r border-slate-100 max-w-[200px] truncate" title={t.direccion}>
                      {t.direccion || '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-700 font-medium border-r border-slate-100 whitespace-nowrap">
                      <span>{t.comuna || '-'}</span>
                      {t.region && <span className="text-slate-400 text-[10px] ml-1">({t.region})</span>}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-700 border-r border-slate-100 whitespace-nowrap">
                      {t.ventanaHoraria ? (
                        <div className="flex items-center gap-1 text-slate-700 font-semibold">
                          <Clock size={12} className="text-slate-400" />
                          <span>{t.ventanaHoraria}</span>
                          {t.ventanaHoraria2 && <span className="text-slate-400">/ {t.ventanaHoraria2}</span>}
                        </div>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600 border-r border-slate-100 max-w-[220px] truncate" title={t.observaciones}>
                      {t.observaciones || <span className="text-slate-300 italic">-</span>}
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(t)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Editar tienda crítica"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(t)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Eliminar tienda crítica"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 4. Footer con resumen */}
        <div className="p-3 sm:p-4 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div>
            Mostrando <strong>{filteredTiendas.length}</strong> de <strong>{tiendas.length}</strong> tiendas críticas.
          </div>
          <Button variant="outline" onClick={onClose} className="text-xs h-8">
            Cerrar
          </Button>
        </div>

        {/* 5. Sub-Modal de Formulario (Crear / Editar) */}
        {formMode && (
          <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <Store className="text-red-600" size={18} />
                  {formMode === 'create' ? 'Agregar Nueva Tienda Crítica' : 'Editar Tienda Crítica'}
                </h3>
                <button
                  type="button"
                  onClick={() => setFormMode(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitForm} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Destino (Local) <span className="text-red-500">*</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: 369-MALL PASEO VINA"
                      value={formData.destino}
                      onChange={(e) => setFormData({ ...formData, destino: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Cliente:</label>
                    <input
                      type="text"
                      placeholder="Ej: Oxxo, Subway, Cantabria..."
                      value={formData.cliente}
                      onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Consideración / Prioridad:</label>
                    <select
                      value={formData.consideracion}
                      onChange={(e) => setFormData({ ...formData, consideracion: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-semibold cursor-pointer bg-white"
                    >
                      {CONSIDERACIONES_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Comuna:</label>
                    <input
                      type="text"
                      placeholder="Ej: VIÑA DEL MAR, LAS CONDES..."
                      value={formData.comuna}
                      onChange={(e) => setFormData({ ...formData, comuna: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">Dirección:</label>
                    <input
                      type="text"
                      placeholder="Ej: AV VALPARAISO 1070 LOCAL 3012"
                      value={formData.direccion}
                      onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Región:</label>
                    <input
                      type="text"
                      placeholder="Ej: 013, 005..."
                      value={formData.region}
                      onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Ventana Horaria 1:</label>
                    <input
                      type="text"
                      placeholder="Ej: 700 - 1000"
                      value={formData.ventanaHoraria}
                      onChange={(e) => setFormData({ ...formData, ventanaHoraria: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Ventana Horaria 2:</label>
                    <input
                      type="text"
                      placeholder="Ej: 2000 - 2030"
                      value={formData.ventanaHoraria2}
                      onChange={(e) => setFormData({ ...formData, ventanaHoraria2: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Observaciones Operacionales:</label>
                  <textarea
                    rows={2}
                    placeholder="Instrucciones para el ruteo o consideraciones especiales..."
                    value={formData.observaciones}
                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFormMode(null)}
                    className="text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold"
                  >
                    Guardar
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

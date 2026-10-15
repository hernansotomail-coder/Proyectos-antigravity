import React, { useState, useMemo, useEffect } from 'react';
import { 
  MessageSquare, Send, Copy, Check, Search, Calendar, 
  Users, Truck, Layers, Filter, Eye, Phone, 
  Sparkles, ExternalLink, CheckCircle2, AlertCircle, X, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlanningStore } from '../store/planningStore';
import { Button } from './ui/Button';

// Persistencia local para teléfonos de conductores (para agilizar envíos por WhatsApp Personal)
const loadPersistedPhones = () => {
  try {
    const saved = localStorage.getItem('keylogistics_conductor_phones');
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
};

const persistConductorPhones = (map) => {
  try {
    localStorage.setItem('keylogistics_conductor_phones', JSON.stringify(map));
  } catch (e) {
    console.error('Error saving phones:', e);
  }
};

// Formateador de mensaje individual para WhatsApp
export const buildSingleRouteWhatsAppMessage = (row, fecha) => {
  const conductor = row.conductor_name?.trim() || 'Sin Conductor asignado';
  const auxiliar = row.aux1_name?.trim() || 'Sin Auxiliar';
  const aux2 = row.aux2_name?.trim();
  const vuelta = row.n_vuelta || '1';
  const ruta = row.ruta || 'S/N';
  const cliente = row.cliente || 'Centralizado';
  const locales = row.locales || (row.paradas && row.paradas.length) || 1;
  const m3 = (parseFloat(row.m3) || 0).toFixed(3);
  const camion = row.camion?.trim() || '';

  let msg = `🚛 *ASIGNACIÓN DE RUTA* - ${fecha}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🛣️ *N° Ruta:* ${ruta}\n`;
  msg += `🔄 *N° Vuelta:* ${vuelta}\n`;
  msg += `🏢 *Cliente:* ${cliente}\n`;
  msg += `\n`;
  msg += `👥 *Tripulación Asignada:*\n`;
  msg += `• *Conductor:* ${conductor}\n`;
  msg += `• *Auxiliar:* ${auxiliar}\n`;
  if (aux2) msg += `• *Auxiliar 2:* ${aux2}\n`;
  if (camion) msg += `🚚 *Camión:* ${camion}\n`;
  msg += `\n`;
  msg += `📍 *Locales / Paradas:* ${locales}\n`;
  msg += `📦 *Carga:* ${m3} m³\n`;

  // Detalle de paradas si existen
  if (row.paradas && row.paradas.length > 0) {
    msg += `\n📋 *Detalle de Paradas (${row.paradas.length}):*\n`;
    row.paradas.slice(0, 10).forEach((p, idx) => {
      const sec = p.secuencia || (idx + 1);
      const dest = p.destino || 'Destino';
      const com = p.comuna ? ` (${p.comuna})` : '';
      msg += `  ${sec}. ${dest}${com}\n`;
    });
    if (row.paradas.length > 10) {
      msg += `  ... y ${row.paradas.length - 10} paradas más\n`;
    }
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Favor confirmar recepción del servicio._`;
  return msg;
};

// Formateador de mensaje consolidado para un Conductor / Dupla (todas sus rutas en un solo mensaje)
export const buildConductorGroupWhatsAppMessage = (conductorName, auxName, rows, fecha) => {
  let msg = `🚛 *PROGRAMACIÓN DE RUTAS* - ${fecha}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👤 *Conductor:* ${conductorName}\n`;
  msg += `👥 *Auxiliar:* ${auxName || 'Sin Auxiliar'}\n`;
  
  const camion = rows.find(r => r.camion)?.camion;
  if (camion) msg += `🚚 *Camión:* ${camion}\n`;
  
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📋 *Rutas Asignadas (${rows.length}):*\n\n`;

  let totalLocales = 0;
  let totalM3 = 0;

  rows.forEach((r, idx) => {
    const vuelta = r.n_vuelta || '1';
    const ruta = r.ruta || 'S/N';
    const cliente = r.cliente || 'Centralizado';
    const loc = r.locales || (r.paradas && r.paradas.length) || 1;
    const m3Val = parseFloat(r.m3) || 0;

    totalLocales += Number(loc);
    totalM3 += m3Val;

    msg += `🔹 *${idx + 1}. Vuelta ${vuelta} - Ruta ${ruta}*\n`;
    msg += `   • Cliente: ${cliente}\n`;
    msg += `   • Locales: ${loc} | Volumen: ${m3Val.toFixed(3)} m³\n`;
    if (r.rampla) msg += `   • Rampla: ${r.rampla}\n`;
    msg += `\n`;
  });

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 *Totales de la Jornada:*\n`;
  msg += `• Total Locales: *${totalLocales}*\n`;
  msg += `• Total Volumen: *${totalM3.toFixed(3)} m³*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Favor confirmar recepción del itinerario._`;

  return msg;
};

// Formateador de resumen completo para grupo de operaciones
export const buildDailySummaryWhatsAppMessage = (rows, fecha) => {
  let msg = `🚛 *DISPONIBILIZACIÓN GENERAL* - ${fecha}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  
  const totalRutas = rows.length;
  const totalM3 = rows.reduce((acc, r) => acc + (parseFloat(r.m3) || 0), 0).toFixed(3);
  const totalLoc = rows.reduce((acc, r) => acc + (parseInt(r.locales, 10) || (r.paradas?.length || 1)), 0);

  msg += `📊 *Total Rutas:* ${totalRutas} | *Locales:* ${totalLoc} | *Carga:* ${totalM3} m³\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  rows.forEach((r, idx) => {
    const cond = r.conductor_name || 'Sin asignar';
    const aux = r.aux1_name || 'Sin aux';
    const vuelta = r.n_vuelta ? `(V.${r.n_vuelta})` : '';
    const m3 = (parseFloat(r.m3) || 0).toFixed(2);
    const loc = r.locales || (r.paradas?.length || 1);

    msg += `${idx + 1}️⃣ *Ruta ${r.ruta}* ${vuelta} - ${r.cliente}\n`;
    msg += `   👤 Cond: *${cond}*\n`;
    msg += `   👥 Aux: *${aux}*\n`;
    msg += `   📍 Locales: ${loc} | 📦 ${m3} m³\n\n`;
  });

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Generado desde Sistema de Logística y Transporte_`;
  return msg;
};

export default function RouteDispatch() {
  const { savedHistoryList, savedRuteoByDate, transmittedAssignments } = usePlanningStore();

  // Fechas disponibles
  const availableDates = useMemo(() => {
    const set = new Set();
    (savedHistoryList || []).forEach(h => set.add(h.fecha));
    Object.keys(savedRuteoByDate || {}).forEach(f => set.add(f));
    Object.keys(transmittedAssignments || {}).forEach(f => set.add(f));
    const arr = Array.from(set).sort().reverse();
    return arr.length > 0 ? arr : ['14-10-2026'];
  }, [savedHistoryList, savedRuteoByDate, transmittedAssignments]);

  const [selectedDate, setSelectedDate] = useState(availableDates[0] || '14-10-2026');
  const [searchTerm, setSearchTerm] = useState('');
  const [vueltaFilter, setVueltaFilter] = useState('Todas');
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  // Teléfonos persistidos localmente
  const [phoneMap, setPhoneMap] = useState(loadPersistedPhones);

  // Estado del modal de Vista Previa / Edición de Mensaje
  const [previewModal, setPreviewModal] = useState({
    isOpen: false,
    title: '',
    recipientPhone: '',
    messageText: '',
    rowId: null
  });

  // Estado del modal de "Mensajes por Conductor / Dupla"
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  // Actualizar fecha si no está en la lista
  useEffect(() => {
    if (availableDates.length > 0 && !availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate]);

  // Entrada de historial guardada al presionar "Guardar Disponibilización"
  const currentHistoryEntry = useMemo(() => {
    return (savedHistoryList || []).find(h => h.fecha === selectedDate);
  }, [savedHistoryList, selectedDate]);

  // Obtener las filas de datos con información que fue guardada al presionar "Guardar Disponibilización"
  const rawRows = useMemo(() => {
    if (currentHistoryEntry && currentHistoryEntry.rows && currentHistoryEntry.rows.length > 0) {
      return currentHistoryEntry.rows;
    }
    if (savedRuteoByDate && savedRuteoByDate[selectedDate] && savedRuteoByDate[selectedDate].length > 0) {
      return savedRuteoByDate[selectedDate];
    }
    return transmittedAssignments[selectedDate] || [];
  }, [currentHistoryEntry, savedRuteoByDate, transmittedAssignments, selectedDate]);

  // Filtrado de filas
  const filteredRows = useMemo(() => {
    let list = rawRows;

    if (vueltaFilter !== 'Todas') {
      list = list.filter(r => String(r.n_vuelta || '1') === String(vueltaFilter));
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(r => 
        (r.conductor_name || '').toLowerCase().includes(term) ||
        (r.aux1_name || '').toLowerCase().includes(term) ||
        (r.ruta || '').toLowerCase().includes(term) ||
        (r.cliente || '').toLowerCase().includes(term) ||
        (r.camion || '').toLowerCase().includes(term)
      );
    }

    return list;
  }, [rawRows, vueltaFilter, searchTerm]);

  // Agrupación por Conductor (dupla)
  const groupedByConductor = useMemo(() => {
    const groups = {};
    filteredRows.forEach(row => {
      const condName = row.conductor_name?.trim() || 'Sin Conductor Asignado';
      if (!groups[condName]) {
        groups[condName] = {
          conductor: condName,
          auxiliar: row.aux1_name?.trim() || '',
          rut: row.conductor_rut || '',
          rows: []
        };
      }
      // Si otra fila tiene auxiliar y la primera no, enriquecer
      if (!groups[condName].auxiliar && row.aux1_name) {
        groups[condName].auxiliar = row.aux1_name.trim();
      }
      groups[condName].rows.push(row);
    });
    return Object.values(groups);
  }, [filteredRows]);

  // Guardar teléfono de un conductor
  const handleUpdatePhone = (conductorName, newPhone) => {
    const updated = { ...phoneMap, [conductorName]: newPhone };
    setPhoneMap(updated);
    persistConductorPhones(updated);
  };

  // Abrir WhatsApp en Personal
  const handleOpenWhatsApp = (phone, text) => {
    const encoded = encodeURIComponent(text);
    let url = '';
    if (phone && phone.trim()) {
      const cleanPhone = phone.replace(/\D/g, '');
      url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${encoded}`;
    }
    window.open(url, '_blank');
  };

  // Copiar al portapapeles
  const handleCopyText = (text, id = null) => {
    navigator.clipboard.writeText(text);
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    }
    toast.success('¡Mensaje copiado al portapapeles para WhatsApp!');
  };

  // Previsualizar mensaje individual
  const handlePreviewSingle = (row) => {
    const conductor = row.conductor_name?.trim() || '';
    const phone = phoneMap[conductor] || '';
    const msg = buildSingleRouteWhatsAppMessage(row, selectedDate);
    setPreviewModal({
      isOpen: true,
      title: `Ruta ${row.ruta} - ${conductor || 'Sin Asignar'}`,
      recipientPhone: phone,
      messageText: msg,
      rowId: row.id
    });
  };

  // Previsualizar mensaje por conductor
  const handlePreviewConductorGroup = (group) => {
    const phone = phoneMap[group.conductor] || '';
    const msg = buildConductorGroupWhatsAppMessage(group.conductor, group.auxiliar, group.rows, selectedDate);
    setPreviewModal({
      isOpen: true,
      title: `Tripulación: ${group.conductor}`,
      recipientPhone: phone,
      messageText: msg,
      rowId: group.conductor
    });
  };

  // Resumen completo del día
  const handleCopyDailySummary = () => {
    if (rawRows.length === 0) {
      toast.warning('No hay rutas guardadas para generar el resumen.');
      return;
    }
    const msg = buildDailySummaryWhatsAppMessage(rawRows, selectedDate);
    handleCopyText(msg);
  };

  const handleSendDailySummaryWhatsApp = () => {
    if (rawRows.length === 0) {
      toast.warning('No hay rutas guardadas para enviar.');
      return;
    }
    const msg = buildDailySummaryWhatsAppMessage(rawRows, selectedDate);
    handleOpenWhatsApp('', msg);
  };

  // Selección de filas
  const toggleSelectRow = (id) => {
    setSelectedRowIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedRowIds.length === filteredRows.length) {
      setSelectedRowIds([]);
    } else {
      setSelectedRowIds(filteredRows.map(r => r.id));
    }
  };

  const handleCopySelected = () => {
    const selected = filteredRows.filter(r => selectedRowIds.includes(r.id));
    if (selected.length === 0) {
      toast.warning('Selecciona al menos una ruta para copiar.');
      return;
    }
    const msg = buildDailySummaryWhatsAppMessage(selected, selectedDate);
    handleCopyText(msg);
  };

  // Métricas
  const totalRutas = rawRows.length;
  const totalConductores = useMemo(() => {
    const set = new Set();
    rawRows.forEach(r => {
      if (r.conductor_name) set.add(r.conductor_name);
    });
    return set.size;
  }, [rawRows]);

  const totalLocales = useMemo(() => {
    return rawRows.reduce((acc, r) => acc + (parseInt(r.locales, 10) || (r.paradas?.length || 1)), 0);
  }, [rawRows]);

  const totalM3 = useMemo(() => {
    return rawRows.reduce((acc, r) => acc + (parseFloat(r.m3) || 0), 0).toFixed(3);
  }, [rawRows]);

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 gap-3 overflow-hidden">
      
      {/* 1. Header Principal */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full text-xs flex items-center gap-1">
              <Send size={12} />
              Transporte
            </span>
            <h1 className="text-xl font-bold text-slate-800">Envío de Rutas</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Información guardada desde Disponibilización formateada para envío por WhatsApp personal (Conductor y Auxiliar consolidados).
          </p>
        </div>

        {/* Acciones de Cabecera: Selector de Fecha y Botones Globales */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de Fecha */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <Calendar size={14} className="text-slate-500 ml-1.5" />
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none pr-2 py-1 cursor-pointer"
            >
              {availableDates.map(f => (
                <option key={f} value={f}>
                  {f} {savedHistoryList?.some(h => h.fecha === f) ? '✓ (Guardado)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Botón: Ver por Conductor / Dupla */}
          <Button
            variant="outline"
            onClick={() => setIsGroupModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            title="Ver rutas agrupadas por Conductor y enviar en un solo mensaje"
          >
            <Users size={14} className="text-indigo-600" />
            Por Conductor ({groupedByConductor.length})
          </Button>

          {/* Botón: Enviar / Copiar Resumen General */}
          <Button
            variant="outline"
            onClick={handleCopyDailySummary}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            title="Copiar todas las rutas del día en formato resumen para WhatsApp"
          >
            <Copy size={14} />
            Copiar Resumen General
          </Button>

          <Button
            onClick={handleSendDailySummaryWhatsApp}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
            title="Abrir WhatsApp con el resumen completo del día"
          >
            <MessageSquare size={14} />
            Enviar WhatsApp General
          </Button>
        </div>
      </div>

      {/* 2. Banner de Estado del Guardado */}
      {currentHistoryEntry ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs text-emerald-800 shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>
              <strong>Disponibilización confirmada:</strong> Datos guardados el <strong>{currentHistoryEntry.savedAt}</strong> ({currentHistoryEntry.totalServicios} rutas consolidadas).
            </span>
          </div>
          <span className="text-[11px] font-mono text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded">
            ID: {currentHistoryEntry.id}
          </span>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs text-amber-800 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600 shrink-0" />
            <span>
              <strong>Aviso:</strong> No se ha detectado guardado en histórico para la fecha <strong>{selectedDate}</strong>. Mostrando asignación actual en Disponibilización. Presiona "Guardar Disponibilización" en el menú de Transporte para oficializarla.
            </span>
          </div>
        </div>
      )}

      {/* 3. Tarjetas de Métricas Rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
        <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Rutas</span>
            <p className="text-lg font-black text-slate-800">{totalRutas}</p>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Truck size={18} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Conductores / Duplas</span>
            <p className="text-lg font-black text-indigo-700">{totalConductores}</p>
          </div>
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Users size={18} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Locales</span>
            <p className="text-lg font-black text-amber-700">{totalLocales}</p>
          </div>
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
            <Layers size={18} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Volumen Total</span>
            <p className="text-lg font-black text-emerald-700">{totalM3} m³</p>
          </div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
            <Sparkles size={18} />
          </div>
        </div>
      </div>

      {/* 4. Barra de Filtros y Acciones en Lote */}
      <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[260px]">
          {/* Buscador */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Buscar por Conductor, Auxiliar, Ruta o Cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 focus:bg-white"
            />
          </div>

          {/* Filtro por Vuelta */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400 font-bold text-[11px]">Vuelta:</span>
            <select
              value={vueltaFilter}
              onChange={(e) => setVueltaFilter(e.target.value)}
              className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 text-slate-700 outline-none"
            >
              <option value="Todas">Todas</option>
              <option value="1">Vuelta 1</option>
              <option value="2">Vuelta 2</option>
              <option value="3">Vuelta 3</option>
            </select>
          </div>
        </div>

        {/* Acciones en lote de selección */}
        {selectedRowIds.length > 0 && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg">
            <span className="text-xs font-bold text-blue-800">
              {selectedRowIds.length} seleccionada(s)
            </span>
            <button
              onClick={handleCopySelected}
              className="flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-300"
            >
              <Copy size={12} />
              Copiar seleccionadas
            </button>
            <button
              onClick={() => setSelectedRowIds([])}
              className="text-slate-400 hover:text-slate-600 text-xs"
              title="Deseleccionar todas"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* 5. Tabla Principal de Envíos */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col min-h-0 shadow-2xs">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10 border-b border-slate-200 select-none">
              <tr>
                <th className="py-2.5 px-3 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={filteredRows.length > 0 && selectedRowIds.length === filteredRows.length}
                    onChange={handleSelectAll}
                    className="rounded text-blue-600 cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-slate-700">Conductor</th>
                <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-slate-700">Auxiliar</th>
                <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-center text-slate-700">N° Vuelta</th>
                <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-center text-slate-700">N° Ruta</th>
                <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-slate-700">Cliente</th>
                <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-center text-slate-700">Locales</th>
                <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-right text-slate-700">m³</th>
                <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-center text-slate-700">Acción WhatsApp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-slate-400">
                    <Truck size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="font-medium text-sm">No hay rutas registradas para esta fecha y filtros.</p>
                    <p className="text-xs text-slate-400 mt-0.5">Verifica si la disponibilización fue guardada o selecciona otra fecha.</p>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => {
                  const isSelected = selectedRowIds.includes(row.id);
                  const conductor = row.conductor_name?.trim();
                  const auxiliar = row.aux1_name?.trim();
                  const condPhone = phoneMap[conductor] || '';
                  const msgText = buildSingleRouteWhatsAppMessage(row, selectedDate);
                  const isCopied = copiedId === row.id;

                  return (
                    <tr 
                      key={row.id || index}
                      className={`hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-blue-50/40' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(row.id)}
                          className="rounded text-blue-600 cursor-pointer"
                        />
                      </td>

                      {/* 1. Conductor */}
                      <td className="py-2.5 px-3">
                        {conductor ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{conductor}</span>
                            {row.conductor_rut && (
                              <span className="text-[10px] text-slate-400 font-mono">({row.conductor_rut})</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">— Sin asignar —</span>
                        )}
                      </td>

                      {/* 2. Auxiliar (mismo renglón que Conductor, nunca en filas separadas) */}
                      <td className="py-2.5 px-3">
                        {auxiliar ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-indigo-900">{auxiliar}</span>
                            {row.aux2_name && (
                              <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.2 rounded" title={`Auxiliar 2: ${row.aux2_name}`}>
                                +1 Aux
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">— Sin auxiliar —</span>
                        )}
                      </td>

                      {/* 3. N° Vuelta */}
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          V.{row.n_vuelta || '1'}
                        </span>
                      </td>

                      {/* 4. N° Ruta */}
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-md text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                          {row.ruta || '—'}
                        </span>
                      </td>

                      {/* 5. Cliente */}
                      <td className="py-2.5 px-3 max-w-[200px] truncate" title={row.cliente}>
                        <span className="font-semibold text-slate-800">{row.cliente || 'Centralizado'}</span>
                        {row.camion && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Truck size={10} />
                            <span>{row.camion}</span>
                          </div>
                        )}
                      </td>

                      {/* 6. Locales */}
                      <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full text-[11px]">
                          {row.locales || (row.paradas && row.paradas.length) || 1}
                        </span>
                      </td>

                      {/* 7. m³ */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {(parseFloat(row.m3) || 0).toFixed(3)}
                      </td>

                      {/* 8. Acción WhatsApp */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Botón WhatsApp Directo */}
                          <button
                            type="button"
                            onClick={() => handleOpenWhatsApp(condPhone, msgText)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all active:scale-95"
                            title={`Enviar por WhatsApp a ${conductor || 'este viaje'}`}
                          >
                            <MessageSquare size={12} />
                            <span>WhatsApp</span>
                          </button>

                          {/* Botón Copiar Texto */}
                          <button
                            type="button"
                            onClick={() => handleCopyText(msgText, row.id)}
                            className={`p-1.5 rounded-lg border transition-all ${
                              isCopied 
                                ? 'bg-green-100 border-green-300 text-green-700' 
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                            title="Copiar texto del mensaje para pegar en WhatsApp"
                          >
                            {isCopied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                          </button>

                          {/* Botón Previsualizar y Editar */}
                          <button
                            type="button"
                            onClick={() => handlePreviewSingle(row)}
                            className="p-1.5 rounded-lg border bg-white border-slate-200 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                            title="Ver vista previa del mensaje de WhatsApp"
                          >
                            <Eye size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer con conteo */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Mostrando <strong>{filteredRows.length}</strong> de <strong>{rawRows.length}</strong> rutas guardadas</span>
          <span>Fecha activa: <strong>{selectedDate}</strong></span>
        </div>
      </div>

      {/* MODAL 1: Vista Previa y Edición de Mensaje */}
      {previewModal.isOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-5 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">Vista Previa Mensaje WhatsApp</h3>
                  <p className="text-[11px] text-slate-400">{previewModal.title}</p>
                </div>
              </div>
              <button 
                onClick={() => setPreviewModal(prev => ({ ...prev, isOpen: false }))} 
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-3 space-y-3 overflow-y-auto flex-1">
              {/* Teléfono opcional */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Número de WhatsApp (Opcional - ej: 56912345678):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Sin teléfono (WhatsApp te pedirá elegir el contacto)"
                    value={previewModal.recipientPhone}
                    onChange={(e) => setPreviewModal(prev => ({ ...prev, recipientPhone: e.target.value }))}
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
                  />
                  {previewModal.rowId && (
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdatePhone(previewModal.rowId, previewModal.recipientPhone);
                        toast.success('Número guardado para futuros envíos');
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                      title="Guardar este número para el conductor"
                    >
                      Guardar
                    </button>
                  )}
                </div>
              </div>

              {/* Burbuja simulada de WhatsApp */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Texto del Mensaje (puedes editar antes de enviar):
                </label>
                <div className="bg-[#e5ddd5] p-3 rounded-xl border border-slate-300">
                  <textarea
                    rows={12}
                    value={previewModal.messageText}
                    onChange={(e) => setPreviewModal(prev => ({ ...prev, messageText: e.target.value }))}
                    className="w-full text-xs font-mono bg-[#dcf8c6] text-slate-900 p-3 rounded-lg border border-emerald-300 shadow-xs focus:outline-none resize-none leading-relaxed"
                  />
                </div>
              </div>
            </div>

            {/* Acciones del Modal */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <Button
                variant="ghost"
                onClick={() => setPreviewModal(prev => ({ ...prev, isOpen: false }))}
                className="text-xs"
              >
                Cerrar
              </Button>
              <Button
                variant="outline"
                onClick={() => handleCopyText(previewModal.messageText)}
                className="text-xs font-bold"
              >
                <Copy size={13} className="mr-1" />
                Copiar Texto
              </Button>
              <Button
                onClick={() => {
                  handleOpenWhatsApp(previewModal.recipientPhone, previewModal.messageText);
                }}
                className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                <Send size={13} className="mr-1" />
                Abrir en WhatsApp
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Rutas Agrupadas por Conductor / Dupla */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-5 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">Envíos por Conductor / Dupla ({selectedDate})</h3>
                  <p className="text-[11px] text-slate-400">
                    Todas las vueltas de cada conductor en un solo mensaje para no separar conductor ni auxiliar.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsGroupModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-3 space-y-3 overflow-y-auto flex-1">
              {groupedByConductor.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  No hay conductores registrados para esta fecha.
                </div>
              ) : (
                groupedByConductor.map((group, idx) => {
                  const phone = phoneMap[group.conductor] || '';
                  const groupMsg = buildConductorGroupWhatsAppMessage(
                    group.conductor, 
                    group.auxiliar, 
                    group.rows, 
                    selectedDate
                  );
                  const isCopied = copiedId === `grp-${group.conductor}`;

                  return (
                    <div 
                      key={idx}
                      className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 hover:bg-white hover:border-indigo-300 transition-all space-y-2 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-900 text-sm">{group.conductor}</h4>
                            <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full">
                              {group.rows.length} {group.rows.length === 1 ? 'ruta' : 'rutas'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>👥 Auxiliar: <strong className="text-indigo-900">{group.auxiliar || 'Sin Auxiliar'}</strong></span>
                            {group.rut && <span className="font-mono text-[10px] text-slate-400">({group.rut})</span>}
                          </div>
                        </div>

                        {/* Botones de acción directa */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyText(groupMsg, `grp-${group.conductor}`)}
                            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                              isCopied 
                                ? 'bg-green-100 border-green-300 text-green-700' 
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                            title="Copiar mensaje consolidado"
                          >
                            {isCopied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                            <span>{isCopied ? 'Copiado' : 'Copiar'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenWhatsApp(phone, groupMsg)}
                            className="flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all active:scale-95"
                            title={`Enviar WhatsApp a ${group.conductor}`}
                          >
                            <MessageSquare size={12} />
                            <span>Enviar WhatsApp</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handlePreviewConductorGroup(group)}
                            className="p-1 text-slate-400 hover:text-blue-600"
                            title="Ver vista previa de este mensaje"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Teléfono y Rutas asignadas */}
                      <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs gap-3">
                        {/* Teléfono */}
                        <div className="flex items-center gap-1.5">
                          <Phone size={12} className="text-slate-400" />
                          <input
                            type="text"
                            placeholder="N° Teléfono (ej: 56912345678)"
                            value={phone}
                            onChange={(e) => handleUpdatePhone(group.conductor, e.target.value)}
                            className="text-[11px] px-2 py-0.5 border border-slate-200 rounded bg-white w-48 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                          />
                        </div>

                        {/* Listado de rutas asignadas en chips */}
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {group.rows.map((r, rIdx) => (
                            <span 
                              key={rIdx} 
                              className="text-[10px] font-bold bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-700"
                            >
                              V.{r.n_vuelta || '1'}: {r.ruta} ({r.locales || (r.paradas?.length || 1)} loc)
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-400">
                Se encontraron {groupedByConductor.length} tripulaciones en {selectedDate}
              </span>
              <Button
                variant="ghost"
                onClick={() => setIsGroupModalOpen(false)}
                className="text-xs"
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

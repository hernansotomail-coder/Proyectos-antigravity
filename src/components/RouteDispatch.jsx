import React, { useState, useMemo, useEffect } from 'react';
import { 
  MessageSquare, Send, Copy, Check, Search, Calendar, 
  Users, Truck, Layers, Filter, Eye, Phone, 
  Sparkles, ExternalLink, CheckCircle2, AlertCircle, X, ChevronDown, ChevronRight, ChevronUp,
  Download, Smartphone, Save, UserCheck, RefreshCw, PhoneCall, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { usePlanningStore, sortDatesDescending, getMostRecentDate } from '../store/planningStore';
import { useStaffStore } from '../store/staffStore';
import { useFleetStore } from '../store/fleetStore';
import { findFarthestComunaForRoute, getComunaDistance } from './RuteoView';
import { matchVehicleByCode } from '../lib/vehicleMatcher';
import { Button } from './ui/Button';

// Persistencia local para teléfonos de conductores (para compatibilidad de envíos por WhatsApp Personal)
const loadPersistedPhones = () => {
  try {
    const saved = localStorage.getItem('keylogistics_staff_phones');
    const legacy = localStorage.getItem('keylogistics_conductor_phones');
    const legacyMap = legacy ? JSON.parse(legacy) : {};
    const staffMap = saved ? JSON.parse(saved) : {};
    return { ...legacyMap, ...staffMap };
  } catch (e) {
    return {};
  }
};

const persistConductorPhones = (map) => {
  try {
    localStorage.setItem('keylogistics_conductor_phones', JSON.stringify(map));
    localStorage.setItem('keylogistics_staff_phones', JSON.stringify(map));
  } catch (e) {
    console.error('Error saving phones:', e);
  }
};

// Helper para obtener paradas únicas deduplicadas por destino y comuna (evita duplicados por multi-ambiente C/R/S)
export const getUniqueParadas = (paradas) => {
  if (!paradas || !Array.isArray(paradas)) return [];
  const seen = new Set();
  const unique = [];
  paradas.forEach((p) => {
    const dest = String(p.destino || '').trim();
    const com = String(p.comuna || '').trim();
    const key = `${dest.toLowerCase()}:::${com.toLowerCase()}`;
    if (!key || key === ':::') {
      unique.push(p);
      return;
    }
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  });
  return unique;
};

// Helper para formatear código de camión junto a su patente (Ej: "C281 (WBGK44)")
export const formatCamionWithPlate = (rawCamion, fleetList = []) => {
  if (!rawCamion) return '';
  const str = String(rawCamion).trim();
  if (!str) return '';
  if (/\([A-Z0-9-]+\)/i.test(str)) {
    return str;
  }
  if (!fleetList || !Array.isArray(fleetList) || fleetList.length === 0) {
    return str;
  }
  const match = matchVehicleByCode(str, '', fleetList);
  if (match && match.plate) {
    const internal = match.internal_number || str;
    return `${internal} (${match.plate.toUpperCase()})`;
  }
  return str;
};

// Helper para encontrar la comuna más lejana de un viaje considerando Lago Riñihue 02319, San Bernardo
export const findFarthestComunaForTrip = (viajeRows = []) => {
  let maxDist = -1;
  let farthest = '';

  (viajeRows || []).forEach(r => {
    const paradas = r.paradas || [];
    paradas.forEach(p => {
      const com = (p.comuna || '').trim();
      if (com) {
        const d = getComunaDistance(com);
        if (d > maxDist) {
          maxDist = d;
          farthest = com.toUpperCase();
        }
      }
    });
    if (!farthest && r.comuna) {
      const d = getComunaDistance(r.comuna);
      if (d > maxDist) {
        maxDist = d;
        farthest = String(r.comuna).trim().toUpperCase();
      }
    }
  });

  return farthest || 'SANTIAGO';
};

// Helper para restar minutos a una hora en formato HH:MM (Requisito 6: Citar con anticipación)
export const subtractMinutesFromTime = (timeStr, minutesToSubtract) => {
  if (!timeStr || !minutesToSubtract) return timeStr || '';
  const clean = String(timeStr).trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return clean;

  let hours = parseInt(match[1], 10);
  let minutes = parseInt(match[2], 10);

  let totalMinutes = hours * 60 + minutes - minutesToSubtract;
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60; // día anterior si cruza medianoche
  }

  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;

  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
};

// Formateador de mensaje individual para WhatsApp
export const buildSingleRouteWhatsAppMessage = (row, fecha, fleetList = [], anticipacionMinutos = 0) => {
  let formattedDate = fecha;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split('-');
    formattedDate = `${d}-${m}-${y}`;
  }

  const conductor = row.conductor_name?.trim() || 'Sin Conductor asignado';
  const auxiliar = row.aux1_name?.trim() || 'Sin Auxiliar';
  const rawVuelta = String(row.n_vuelta || '1').trim();
  const matchV = rawVuelta.match(/\d+/);
  const vueltaNum = matchV ? parseInt(matchV[0], 10) : 1;
  const ruta = row.ruta || 'S/N';
  const cliente = (row.cliente || 'Centralizado').trim();
  const uniqueParadas = getUniqueParadas(row.paradas);
  const locales = parseInt(row.locales, 10) || (uniqueParadas.length > 0 ? uniqueParadas.length : 1);
  const localesWord = locales === 1 ? 'local' : 'locales';
  const m3Val = (parseFloat(row.m3) || 0).toFixed(3);
  const camionText = formatCamionWithPlate(row.camion, fleetList) || 'Sin camión';
  const farthestComuna = findFarthestComunaForTrip([row]);

  // Hora Cita en el apartado general (Requisito 1: solo aparece en la cabecera general)
  const rawCita = (row.hora_cita || '').trim();
  let citaGeneralHeader = '';
  if (rawCita) {
    if (anticipacionMinutos > 0) {
      citaGeneralHeader = subtractMinutesFromTime(rawCita, anticipacionMinutos);
    } else {
      citaGeneralHeader = rawCita;
    }
  }

  // Requisito 2: El icono 📦 debe aparecer en cada Viaje planificado
  const tripIcon = '   📦';

  let msg = `🚛 *PROGRAMACIÓN DE RUTAS* - ${formattedDate}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👤 *Conductor:* ${conductor}\n`;
  msg += `👥 *Auxiliar:* ${auxiliar}\n`;
  msg += `🚚 *Camión:* ${camionText}\n`;
  if (citaGeneralHeader) {
    msg += `⏰ *Hora Cita / Presentación:* ${citaGeneralHeader}\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `${tripIcon} *VIAJE ${vueltaNum} (VUELTA ${vueltaNum})* [${farthestComuna}]\n`;
  msg += `   ▫️ *Ruta ${ruta}* (${cliente}): ${locales} ${localesWord} | ${m3Val} m³`;
  if (row.prioridad && row.prioridad !== 'Normal') msg += ` | 🚨 ${row.prioridad.toUpperCase()}`;
  msg += `\n`;
  if (row.destino_prioritario) {
    msg += `      ⭐ *Prioritario:* ${row.destino_prioritario}\n`;
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Favor confirmar recepción del itinerario._`;

  return msg.trim();
};

// Formateador de mensaje consolidado para un Conductor / Dupla (agrupado por N° Vuelta / Viaje)
export const buildConductorGroupWhatsAppMessage = (conductorName, auxName, rows, fecha, fleetList = [], anticipacionMinutos = 0) => {
  let formattedDate = fecha;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split('-');
    formattedDate = `${d}-${m}-${y}`;
  }

  // Camión con patente según flota
  const rawCamiones = Array.from(new Set(rows.map(r => r.camion?.trim()).filter(Boolean)));
  const camionesFormatted = rawCamiones.map(c => formatCamionWithPlate(c, fleetList)).filter(Boolean);
  const camionText = camionesFormatted.join(', ') || 'Sin camión';

  // Hora Cita en el apartado general recopilada de las rutas (solo hora modificada según anticipación)
  const rawHorasCita = rows.map(r => r.hora_cita?.trim()).filter(Boolean);
  const distinctCitas = Array.from(new Set(rawHorasCita));
  let citasGeneralText = '';
  if (distinctCitas.length > 0) {
    if (anticipacionMinutos > 0) {
      const adjustedList = distinctCitas.map(c => subtractMinutesFromTime(c, anticipacionMinutos));
      const distinctAdjusted = Array.from(new Set(adjustedList));
      citasGeneralText = distinctAdjusted.join(' / ');
    } else {
      citasGeneralText = distinctCitas.join(' / ');
    }
  }

  let msg = `🚛 *PROGRAMACIÓN DE RUTAS* - ${formattedDate}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👤 *Conductor:* ${conductorName || 'Sin Conductor'}\n`;
  msg += `👥 *Auxiliar:* ${auxName || 'Sin Auxiliar'}\n`;
  msg += `🚚 *Camión:* ${camionText}\n`;
  if (citasGeneralText) {
    msg += `⏰ *Hora Cita / Presentación:* ${citasGeneralText}\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

  // Agrupar filas por N° Vuelta (cada N° Vuelta representa UN SOLO VIAJE)
  const vueltasMap = new Map();
  rows.forEach(r => {
    const rawVuelta = String(r.n_vuelta || '1').trim();
    const match = rawVuelta.match(/\d+/);
    const num = match ? parseInt(match[0], 10) : 1;
    const key = num;
    
    if (!vueltasMap.has(key)) {
      vueltasMap.set(key, {
        vueltaNum: num,
        rows: []
      });
    }
    vueltasMap.get(key).rows.push(r);
  });

  // Ordenar viajes por número de vuelta ascendente (1, 2, 3...)
  const sortedViajes = Array.from(vueltasMap.values()).sort((a, b) => a.vueltaNum - b.vueltaNum);

  sortedViajes.forEach((viaje, idx) => {
    const viajeIndex = idx + 1;
    const viajeRows = viaje.rows;
    const farthestComuna = findFarthestComunaForTrip(viajeRows);

    // Requisito 2: El icono 📦 debe aparecer en cada Viaje planificado
    const tripIcon = '   📦';

    msg += `${tripIcon} *VIAJE ${viajeIndex} (VUELTA ${viaje.vueltaNum})* [${farthestComuna}]\n`;

    // Desglose de cada ruta incluida en este viaje (Requisito 1: solo en cabecera general)
    viajeRows.forEach(r => {
      const uParadas = getUniqueParadas(r.paradas);
      const locales = parseInt(r.locales, 10) || (uParadas.length > 0 ? uParadas.length : 1);
      const localesWord = locales === 1 ? 'local' : 'locales';
      const m3Val = (parseFloat(r.m3) || 0).toFixed(3);
      const clienteName = (r.cliente || 'Centralizado').trim();
      const rutaNum = r.ruta || 'S/N';

      msg += `   ▫️ *Ruta ${rutaNum}* (${clienteName}): ${locales} ${localesWord} | ${m3Val} m³`;
      if (r.prioridad && r.prioridad !== 'Normal') msg += ` | 🚨 ${r.prioridad.toUpperCase()}`;
      msg += `\n`;
      if (r.destino_prioritario) {
        msg += `      ⭐ *Prioritario:* ${r.destino_prioritario}\n`;
      }
    });

    msg += `\n`;
  });

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Favor confirmar recepción del itinerario._`;

  return msg.trim();
};

// Formateador de resumen completo para grupo de operaciones
export const buildDailySummaryWhatsAppMessage = (rows, fecha, anticipacionMinutos = 0) => {
  let msg = `🚛 *DISPONIBILIZACIÓN GENERAL* - ${fecha}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  
  const totalRutas = rows.length;
  const totalM3 = rows.reduce((acc, r) => acc + (parseFloat(r.m3) || 0), 0).toFixed(3);
  const totalLoc = rows.reduce((acc, r) => acc + (parseInt(r.locales, 10) || (getUniqueParadas(r.paradas).length || 1)), 0);

  msg += `📊 *Total Rutas:* ${totalRutas} | *Locales:* ${totalLoc} | *Carga:* ${totalM3} m³\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  rows.forEach((r, idx) => {
    const cond = r.conductor_name || 'Sin asignar';
    const aux = r.aux1_name || 'Sin aux';
    const vuelta = r.n_vuelta ? `(V.${r.n_vuelta})` : '';
    const m3 = (parseFloat(r.m3) || 0).toFixed(2);
    const loc = r.locales || (getUniqueParadas(r.paradas).length || 1);
    const prioTag = r.prioridad && r.prioridad !== 'Normal' ? ` [${r.prioridad.toUpperCase()}]` : '';
    
    const turnoTag = r.turno ? ` | 🕐 T.${r.turno}` : '';
    const prioDest = r.destino_prioritario ? `\n   ⭐ Destino Prioritario: ${r.destino_prioritario}` : '';

    msg += `${idx + 1}️⃣ *Ruta ${r.ruta}* ${vuelta} - ${r.cliente}${prioTag}\n`;
    msg += `   👤 Cond: *${cond}* | 👥 Aux: *${aux}*\n`;
    if (turnoTag) msg += `  ${turnoTag}\n`;
    if (prioDest) msg += `${prioDest}\n`;
    msg += `   📍 Locales: ${loc} | 📦 ${m3} m³\n\n`;
  });

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Generado desde Sistema de Logística y Transporte_`;
  return msg;
};

export default function RouteDispatch() {
  const { fleetList } = useFleetStore();
  const { savedHistoryList, savedRuteoByDate, transmittedAssignments, ruteoOverrides, initPlanningFromDb } = usePlanningStore();
  const { staffList, fetchStaff, updateStaffPhone } = useStaffStore();

  useEffect(() => {
    fetchStaff();
    initPlanningFromDb?.();
  }, [fetchStaff, initPlanningFromDb]);

  // Fechas disponibles (ordenadas cronológicamente de más reciente a más antigua)
  const availableDates = useMemo(() => {
    const set = new Set();
    (savedHistoryList || []).forEach(h => set.add(h.fecha));
    Object.keys(savedRuteoByDate || {}).forEach(f => set.add(f));
    Object.keys(transmittedAssignments || {}).forEach(f => set.add(f));
    const sorted = sortDatesDescending(Array.from(set));
    return sorted.length > 0 ? sorted : ['28-10-2026'];
  }, [savedHistoryList, savedRuteoByDate, transmittedAssignments]);

  const [selectedDate, setSelectedDate] = useState(() => availableDates[0] || '28-10-2026');

  useEffect(() => {
    if (availableDates.length > 0 && (!selectedDate || !availableDates.includes(selectedDate) || selectedDate === '14-10-2026')) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate]);
  const [searchTerm, setSearchTerm] = useState('');
  const [vueltaFilter, setVueltaFilter] = useState('Todas');
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  // Selector de Anticipación de Citación (Requisito 6: 0, 15, 30, 40 min, 1 hora)
  const [anticipacionMinutos, setAnticipacionMinutos] = useState(() => {
    try {
      const saved = localStorage.getItem('keylogistics_anticipacion_minutos');
      return saved !== null ? parseInt(saved, 10) : 0;
    } catch (e) {
      return 0;
    }
  });

  const handleSetAnticipacion = (val) => {
    setAnticipacionMinutos(val);
    try {
      localStorage.setItem('keylogistics_anticipacion_minutos', String(val));
    } catch (e) {
      console.error('Error saving anticipacion:', e);
    }
    if (val > 0) {
      toast.info(`Citación configurada ${val} minutos antes para todas las rutas`);
    } else {
      toast.info('Citación restablecida al horario exacto de cita');
    }
  };

  // Teléfonos persistidos localmente
  const [phoneMap, setPhoneMap] = useState(loadPersistedPhones);

  // Estado del modal de Vista Previa / Edición de Mensaje
  const [previewModal, setPreviewModal] = useState({
    isOpen: false,
    title: '',
    recipientPhone: '',
    messageText: '',
    rowId: null,
    conductorName: '',
    conductorRut: ''
  });

  // Estado del modal de "Mensajes por Conductor / Dupla"
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  // Estado del Mantenedor de Números de Celular (Dotación)
  const [isStaffPhoneModalOpen, setIsStaffPhoneModalOpen] = useState(false);
  const [phoneSearchTerm, setPhoneSearchTerm] = useState('');
  const [phoneFilterRole, setPhoneFilterRole] = useState('Todos');
  const [phoneFilterStatus, setPhoneFilterStatus] = useState('Todos');
  const [editingPhoneMap, setEditingPhoneMap] = useState({});
  const [savedPhoneFeedback, setSavedPhoneFeedback] = useState({});

  // Resolver teléfono de un colaborador (Dotación o phoneMap)
  const resolveStaffPhone = (name, rut = null) => {
    if (!name && !rut) return '';
    const trimmed = name?.trim() || '';
    const norm = trimmed.toLowerCase();

    // 1. Buscar en Dotación oficial de staffStore
    const found = (staffList || []).find(s => 
      (rut && s.rut && s.rut === rut) || 
      (norm && s.name && s.name.trim().toLowerCase() === norm)
    );
    if (found && found.phone && found.phone.trim()) {
      return found.phone.trim();
    }

    // 2. Fallback a phoneMap local/legacy
    if (trimmed && phoneMap[trimmed]) return phoneMap[trimmed];
    if (norm && phoneMap[norm]) return phoneMap[norm];
    if (rut && phoneMap[rut]) return phoneMap[rut];

    return '';
  };

  // Guardar teléfono de un colaborador en Dotación y sinc local
  const handleSaveStaffPhone = async (staffId, newPhone, rut = null, name = null) => {
    const cleanPhone = (newPhone || '').trim();
    
    // Actualizar staffStore y backend/localStorage
    if (updateStaffPhone) {
      await updateStaffPhone(staffId, cleanPhone, rut, name);
    }

    // Actualizar estado local reactivo
    setPhoneMap(prev => {
      const updated = { ...prev };
      if (staffId) updated[staffId] = cleanPhone;
      if (rut) updated[rut] = cleanPhone;
      if (name) {
        updated[name.trim()] = cleanPhone;
        updated[name.trim().toLowerCase()] = cleanPhone;
      }
      persistConductorPhones(updated);
      return updated;
    });

    const targetKey = staffId || rut || name;
    if (targetKey) {
      setSavedPhoneFeedback(prev => ({ ...prev, [targetKey]: true }));
      setTimeout(() => {
        setSavedPhoneFeedback(prev => ({ ...prev, [targetKey]: false }));
      }, 2000);
    }
  };

  // Descargar Directorio Telefónico de la Dotación en Excel
  const handleExportPhoneDirectory = () => {
    try {
      const exportRows = staffList.map(s => {
        const ph = s.phone || resolveStaffPhone(s.name, s.rut);
        return {
          'RUT': s.rut || '',
          'Nombre Completo': s.name || '',
          'Cargo': s.role || '',
          'Tipo Dotación': s.tipo_dotacion || 'Propia',
          'Teléfono Celular': ph || '',
          'Estado': s.status || 'Activo'
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const colWidths = [
        { wch: 14 },
        { wch: 32 },
        { wch: 22 },
        { wch: 16 },
        { wch: 20 },
        { wch: 12 }
      ];
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Directorio Telefónico');
      const nowStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `Directorio_Telefonico_Dotacion_${nowStr}.xlsx`);
      toast.success('Directorio telefónico descargado exitosamente');
    } catch (err) {
      console.error('Error exportando directorio telefónico:', err);
      toast.error('Error al descargar el archivo Excel');
    }
  };

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

  // Obtener las filas de datos con información que fue guardada al presionar "Guardar Disponibilización", enriquecida con metadatos de Ruteo
  const rawRows = useMemo(() => {
    let rows = [];
    if (currentHistoryEntry && currentHistoryEntry.rows && currentHistoryEntry.rows.length > 0) {
      rows = currentHistoryEntry.rows;
    } else if (savedRuteoByDate && savedRuteoByDate[selectedDate] && savedRuteoByDate[selectedDate].length > 0) {
      rows = savedRuteoByDate[selectedDate];
    } else {
      rows = transmittedAssignments[selectedDate] || [];
    }

    const dateOverrides = ruteoOverrides?.[selectedDate] || {};
    return rows.map(r => {
      const vueltaKey = r.n_vuelta ? String(r.n_vuelta).trim() : '1';
      const hasAssignment = !!(r.camion && r.conductor_name);
      const tripKey = hasAssignment
        ? `${r.camion.trim()}:::${r.conductor_name.trim()}:::${vueltaKey}`
        : `single:::${r.ruta}:::${r.id}`;
      const ov = dateOverrides[tripKey] || {};
      return {
        ...r,
        turno: ov.turno !== undefined ? ov.turno : (r.turno || ''),
        hora_cita: ov.hora_cita !== undefined ? ov.hora_cita : (r.hora_cita || ''),
        prioridad: ov.prioridad !== undefined ? ov.prioridad : (r.prioridad || 'Normal'),
        destino_prioritario: ov.destino_prioritario !== undefined ? ov.destino_prioritario : (r.destino_prioritario || '')
      };
    });
  }, [currentHistoryEntry, savedRuteoByDate, transmittedAssignments, selectedDate, ruteoOverrides]);

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

  // Agrupación consolidada por Conductor (Requisito 2)
  const groupedByConductor = useMemo(() => {
    const groups = {};
    filteredRows.forEach(row => {
      const condName = row.conductor_name?.trim() || 'Sin Conductor Asignado';
      if (!groups[condName]) {
        groups[condName] = {
          conductor: condName,
          auxiliar: row.aux1_name?.trim() || '',
          rut: row.conductor_rut || '',
          auxRut: row.aux1_rut || '',
          camiones: new Set(),
          totalLocales: 0,
          totalM3: 0,
          rows: []
        };
      }
      if (!groups[condName].auxiliar && row.aux1_name) {
        groups[condName].auxiliar = row.aux1_name.trim();
        groups[condName].auxRut = row.aux1_rut || '';
      }
      if (row.camion?.trim()) {
        groups[condName].camiones.add(row.camion.trim());
      }
      const uniqueParadas = getUniqueParadas(row.paradas);
      const loc = parseInt(row.locales, 10) || (uniqueParadas.length > 0 ? uniqueParadas.length : 1);
      groups[condName].totalLocales += loc;
      groups[condName].totalM3 += parseFloat(row.m3) || 0;
      groups[condName].rows.push(row);
    });

    return Object.values(groups).map(g => {
      // Ordenar vueltas ascendentemente V.1, V.2, V.3...
      const sorted = g.rows.sort((a, b) => {
        const vA = parseInt(String(a.n_vuelta || '1').replace(/\D/g, ''), 10) || 1;
        const vB = parseInt(String(b.n_vuelta || '1').replace(/\D/g, ''), 10) || 1;
        return vA - vB;
      });

      // Calcular cantidad de viajes únicos (vueltas únicas consolidadas)
      const uniqueVueltasSet = new Set(
        sorted.map(r => {
          const match = String(r.n_vuelta || '1').match(/\d+/);
          return match ? match[0] : String(r.n_vuelta || '1');
        })
      );

      return {
        ...g,
        camionStr: Array.from(g.camiones).join(', ') || 'Sin Camión Asignado',
        totalM3Formatted: g.totalM3.toFixed(3),
        totalViajes: uniqueVueltasSet.size,
        rows: sorted
      };
    });
  }, [filteredRows]);

  // Estado para colapsar/expandir el detalle de rutas por conductor (Requisito 1)
  const [collapsedConductorMap, setCollapsedConductorMap] = useState({});
  // Estado para expandir paradas en filas específicas
  const [expandedParadasRowId, setExpandedParadasRowId] = useState({});

  const isConductorCollapsed = (conductorName) => !!collapsedConductorMap[conductorName];

  const toggleConductorCollapse = (conductorName) => {
    setCollapsedConductorMap(prev => ({
      ...prev,
      [conductorName]: !prev[conductorName]
    }));
  };

  const handleExpandAll = () => {
    setCollapsedConductorMap({});
  };

  const handleCollapseAll = () => {
    const map = {};
    groupedByConductor.forEach(g => {
      map[g.conductor] = true;
    });
    setCollapsedConductorMap(map);
  };

  const toggleParadasRow = (rowKey) => {
    setExpandedParadasRowId(prev => ({
      ...prev,
      [rowKey]: !prev[rowKey]
    }));
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
    const phone = resolveStaffPhone(conductor, row.conductor_rut);
    const msg = buildSingleRouteWhatsAppMessage(row, selectedDate, fleetList, anticipacionMinutos);
    setPreviewModal({
      isOpen: true,
      title: `Ruta ${row.ruta} - ${conductor || 'Sin Asignar'}`,
      recipientPhone: phone,
      messageText: msg,
      rowId: row.id,
      conductorName: conductor,
      conductorRut: row.conductor_rut || ''
    });
  };

  // Previsualizar mensaje por conductor
  const handlePreviewConductorGroup = (group) => {
    const phone = resolveStaffPhone(group.conductor, group.rut);
    const msg = buildConductorGroupWhatsAppMessage(group.conductor, group.auxiliar, group.rows, selectedDate, fleetList, anticipacionMinutos);
    setPreviewModal({
      isOpen: true,
      title: `Tripulación: ${group.conductor}`,
      recipientPhone: phone,
      messageText: msg,
      rowId: group.conductor,
      conductorName: group.conductor,
      conductorRut: group.rut || ''
    });
  };

  // Resumen completo del día
  const handleCopyDailySummary = () => {
    if (rawRows.length === 0) {
      toast.warning('No hay rutas guardadas para generar el resumen.');
      return;
    }
    const msg = buildDailySummaryWhatsAppMessage(rawRows, selectedDate, anticipacionMinutos);
    handleCopyText(msg);
  };

  const handleSendDailySummaryWhatsApp = () => {
    if (rawRows.length === 0) {
      toast.warning('No hay rutas guardadas para enviar.');
      return;
    }
    const msg = buildDailySummaryWhatsAppMessage(rawRows, selectedDate, anticipacionMinutos);
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
    const msg = buildDailySummaryWhatsAppMessage(selected, selectedDate, anticipacionMinutos);
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
    return rawRows.reduce((acc, r) => acc + (parseInt(r.locales, 10) || (getUniqueParadas(r.paradas).length || 1)), 0);
  }, [rawRows]);

  const totalM3 = useMemo(() => {
    return rawRows.reduce((acc, r) => acc + (parseFloat(r.m3) || 0), 0).toFixed(3);
  }, [rawRows]);

  // Filtros del Mantenedor de Celulares
  const filteredStaffForPhoneModal = useMemo(() => {
    return staffList.filter(staff => {
      // Filtro por Rol / Cargo
      if (phoneFilterRole === 'Conductores') {
        const isCond = (staff.role || '').toLowerCase().includes('conductor');
        if (!isCond) return false;
      } else if (phoneFilterRole === 'Auxiliares') {
        const isAux = (staff.role || '').toLowerCase().includes('auxiliar');
        if (!isAux) return false;
      } else if (phoneFilterRole === 'Otros') {
        const role = (staff.role || '').toLowerCase();
        if (role.includes('conductor') || role.includes('auxiliar')) return false;
      }

      // Filtro por Estado de Teléfono
      const ph = editingPhoneMap[staff.id] !== undefined ? editingPhoneMap[staff.id] : (staff.phone || resolveStaffPhone(staff.name, staff.rut));
      const hasPhone = !!(ph && ph.trim());
      if (phoneFilterStatus === 'Con Celular' && !hasPhone) return false;
      if (phoneFilterStatus === 'Sin Celular' && hasPhone) return false;

      // Filtro por Búsqueda
      if (phoneSearchTerm) {
        const term = phoneSearchTerm.toLowerCase();
        const matchesName = (staff.name || '').toLowerCase().includes(term);
        const matchesRut = (staff.rut || '').toLowerCase().includes(term);
        const matchesRole = (staff.role || '').toLowerCase().includes(term);
        const matchesPhone = (ph || '').toLowerCase().includes(term);
        if (!matchesName && !matchesRut && !matchesRole && !matchesPhone) return false;
      }

      return true;
    });
  }, [staffList, phoneFilterRole, phoneFilterStatus, phoneSearchTerm, editingPhoneMap, phoneMap]);

  // Contadores para el modal de teléfonos
  const totalStaffCount = staffList.length;
  const staffWithPhoneCount = useMemo(() => {
    return staffList.filter(s => {
      const ph = s.phone || resolveStaffPhone(s.name, s.rut);
      return !!(ph && ph.trim());
    }).length;
  }, [staffList, phoneMap]);
  const staffWithoutPhoneCount = totalStaffCount - staffWithPhoneCount;

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

          {/* Botón: Mantenedor de Números de Celular enlazado con Dotación */}
          <Button
            variant="outline"
            onClick={() => setIsStaffPhoneModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold border-indigo-200 text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100 transition-all shadow-xs"
            title="Abrir el mantenedor de números de celular enlazado con la Dotación"
          >
            <Smartphone size={14} className="text-indigo-600" />
            <span>Mantenedor de Celulares</span>
            <span className="bg-indigo-200 text-indigo-900 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
              {staffWithPhoneCount}/{totalStaffCount}
            </span>
          </Button>

          {/* Botón: Ver por Conductor / Dupla */}
          <Button
            variant="outline"
            onClick={() => setIsGroupModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-100"
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

      {/* Selector de Anticipación de Citación (Requisito 6: 15, 30, 40 min, 1 hora) */}
      <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl shrink-0">
            <Clock size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-800">Citar con Anticipación (Todas las Rutas):</span>
              {anticipacionMinutos > 0 ? (
                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <span>⏰ Citando {anticipacionMinutos === 60 ? '1 hora' : `${anticipacionMinutos} min`} antes de la Hora Cita base</span>
                </span>
              ) : (
                <span className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  Sin anticipación (Horario de cita oficial)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Calcula y ajusta automáticamente la hora de presentación en el mensaje de WhatsApp y en la tabla para todas las rutas.
            </p>
          </div>
        </div>

        {/* Botones selectores de rango */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { label: 'Hora Exacta (0m)', val: 0 },
            { label: '15 min antes', val: 15 },
            { label: '30 min antes', val: 30 },
            { label: '40 min antes', val: 40 },
            { label: '1 hora antes', val: 60 },
          ].map(opt => {
            const isSelected = anticipacionMinutos === opt.val;
            return (
              <button
                key={opt.val}
                type="button"
                onClick={() => handleSetAnticipacion(opt.val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  isSelected
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
                title={opt.val === 0 ? 'Citar a la hora exacta estipulada en Ruteo' : `Citar ${opt.label} respecto a la hora de cita de Ruteo`}
              >
                {opt.label}
              </button>
            );
          })}
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

          {/* Botones globales Expandir Todo / Contraer Todo (Requisito 1) */}
          <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
            <button
              type="button"
              onClick={handleCollapseAll}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg border border-slate-200 transition-colors"
              title="Contraer todas las tablas de detalle de rutas"
            >
              <ChevronRight size={13} />
              Contraer todo
            </button>
            <button
              type="button"
              onClick={handleExpandAll}
              className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg border border-indigo-200 transition-colors"
              title="Expandir todas las tablas de detalle de rutas"
            >
              <ChevronDown size={13} />
              Expandir todo
            </button>
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

      {/* 5. Vista Principal: AGRUPADO SOLO POR CONDUCTOR (Requisito 2) */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 min-h-0">
        {groupedByConductor.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-2xs">
            <Truck size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">No hay rutas o conductores registrados para esta fecha y filtros.</p>
            <p className="text-xs text-slate-400 mt-1">Verifica si la disponibilización fue guardada o selecciona otra fecha.</p>
          </div>
        ) : (
          groupedByConductor.map((group, gIdx) => {
            const condPhone = resolveStaffPhone(group.conductor, group.rut);
            const auxPhone = resolveStaffPhone(group.auxiliar, group.auxRut);
            const groupMsg = buildConductorGroupWhatsAppMessage(
              group.conductor,
              group.auxiliar,
              group.rows,
              selectedDate,
              fleetList,
              anticipacionMinutos
            );
            const isGroupCopied = copiedId === `grp-${group.conductor}`;
            const isCollapsed = isConductorCollapsed(group.conductor);

            return (
              <div 
                key={group.conductor || gIdx}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-indigo-300 flex flex-col"
              >
                {/* Encabezado del Conductor */}
                <div className="bg-slate-50/90 border-b border-slate-200/80 p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5 flex-wrap">
                    {/* Viñeta para expandir / contraer al lado del conductor */}
                    <button
                      type="button"
                      onClick={() => toggleConductorCollapse(group.conductor)}
                      className={`p-1.5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                        isCollapsed
                          ? 'bg-slate-100 border-slate-300 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'
                          : 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100'
                      }`}
                      title={isCollapsed ? "Clic para expandir el detalle de rutas" : "Clic para contraer el detalle de rutas"}
                    >
                      <ChevronDown
                        size={15}
                        className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                      />
                    </button>

                    {/* Conductor & Celular */}
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span 
                          onClick={() => toggleConductorCollapse(group.conductor)}
                          className="font-black text-slate-900 text-sm cursor-pointer hover:text-indigo-600 transition-colors"
                          title="Clic para expandir/contraer"
                        >
                          {group.conductor}
                        </span>
                        {group.rut && (
                          <span className="text-[10px] text-slate-400 font-mono">({group.rut})</span>
                        )}
                        <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          {group.totalViajes} {group.totalViajes === 1 ? 'viaje' : 'viajes'}
                          {group.rows.length !== group.totalViajes && ` (${group.rows.length} rutas)`}
                        </span>
                      </div>

                      {/* Teléfono Conductor con edición / enlace directo a Dotación */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <Phone size={11} className={condPhone ? "text-emerald-600 shrink-0" : "text-amber-500 shrink-0"} />
                        {condPhone ? (
                          <div className="flex items-center gap-1 text-xs font-mono font-bold text-emerald-700">
                            <span>{condPhone}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setPhoneSearchTerm(group.conductor);
                                setIsStaffPhoneModalOpen(true);
                              }}
                              className="text-[10px] text-slate-400 hover:text-indigo-600 underline font-normal ml-1"
                              title="Editar celular en Mantenedor de Dotación"
                            >
                              cambiar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPhoneSearchTerm(group.conductor);
                              setIsStaffPhoneModalOpen(true);
                            }}
                            className="text-[10px] text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded inline-flex items-center gap-1 font-bold transition-colors"
                            title="Asignar celular en Dotación"
                          >
                            <Phone size={9} />
                            + Asignar Celular
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Auxiliar */}
                    <div className="pl-3.5 border-l border-slate-200 text-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Auxiliar</span>
                      <span className="font-semibold text-indigo-900">{group.auxiliar || '— Sin Auxiliar —'}</span>
                      {auxPhone && (
                        <span className="text-[10px] text-slate-500 font-mono block">({auxPhone})</span>
                      )}
                    </div>

                    {/* Camión Destacado (Requisito 1) */}
                    <div className="pl-3.5 border-l border-slate-200 text-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Camión</span>
                      <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-900 font-black px-2.5 py-0.5 rounded-lg text-xs shadow-2xs">
                        <Truck size={13} className="text-blue-700 shrink-0" />
                        <span>{group.camionStr}</span>
                      </div>
                    </div>

                    {/* Métricas del Conductor */}
                    <div className="pl-3.5 border-l border-slate-200 text-xs hidden sm:flex items-center gap-2">
                      <span className="bg-amber-50 text-amber-900 border border-amber-200 font-bold px-2 py-0.5 rounded text-[11px]">
                        📍 {group.totalLocales} LC
                      </span>
                      <span className="bg-emerald-50 text-emerald-900 border border-emerald-200 font-mono font-bold px-2 py-0.5 rounded text-[11px]">
                        📦 {group.totalM3Formatted} m³
                      </span>
                    </div>
                  </div>

                  {/* Acciones WhatsApp consolidadas para este conductor */}
                  <div className="flex items-center gap-2">
                    {/* Botón Viñeta Expandir/Contraer Detalle */}
                    <button
                      type="button"
                      onClick={() => toggleConductorCollapse(group.conductor)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                        isCollapsed
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs'
                      }`}
                      title={isCollapsed ? "Expandir el detalle de rutas" : "Contraer el detalle de rutas"}
                    >
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90 text-indigo-500' : 'rotate-0 text-slate-500'}`}
                      />
                      <span>{isCollapsed ? `Ver Detalle (${group.rows.length})` : 'Contraer Detalle'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyText(groupMsg, `grp-${group.conductor}`)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                        isGroupCopied 
                          ? 'bg-green-100 border-green-300 text-green-700' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-2xs'
                      }`}
                      title="Copiar itinerario completo agrupado por viaje para WhatsApp"
                    >
                      {isGroupCopied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                      <span>{isGroupCopied ? '¡Copiado!' : 'Copiar Itinerario'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenWhatsApp(condPhone, groupMsg)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all active:scale-95"
                      title={condPhone ? `Enviar itinerario completo por WhatsApp a ${group.conductor} (${condPhone})` : 'Abrir WhatsApp'}
                    >
                      <MessageSquare size={13} />
                      <span>Enviar WhatsApp ({group.totalViajes} {group.totalViajes === 1 ? 'Viaje' : 'Viajes'})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePreviewConductorGroup(group)}
                      className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                      title="Ver vista previa del mensaje consolidado"
                    >
                      <Eye size={14} />
                    </button>
                  </div>
                </div>

                {/* Detalle de Rutas (Expandible/Colapsable - Requisito 1) */}
                {isCollapsed ? (
                  <div
                    onClick={() => toggleConductorCollapse(group.conductor)}
                    className="px-4 py-2.5 bg-slate-50/60 hover:bg-indigo-50/30 border-t border-slate-100 flex items-center justify-between cursor-pointer text-xs text-slate-600 transition-colors group/collapsed"
                    title="Clic para expandir el detalle completo de las rutas"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-400">Rutas en este viaje:</span>
                      {group.rows.map((r, i) => {
                        const isPrioUrg = r.prioridad === 'Prioridad urgente';
                        const isUrg = r.prioridad === 'Urgente';
                        const isRed = r.prioridad === 'Redespacho';
                        let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
                        if (isPrioUrg) badgeColor = 'bg-[#ffd6d6] text-[#7f1d1d] border-[#fca5a5]';
                        else if (isUrg) badgeColor = 'bg-[#ffedd5] text-[#7c2d12] border-[#fdba74]';
                        else if (isRed) badgeColor = 'bg-[#fef9c3] text-[#713f12] border-[#fde047]';

                        return (
                          <span
                            key={i}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border shadow-2xs ${badgeColor}`}
                          >
                            <span className="text-[10px] font-extrabold uppercase opacity-80">V.{r.n_vuelta || '1'}</span>
                            <span className="font-mono">Ruta {r.ruta || 'S/N'}</span>
                            <span className="font-normal opacity-85 text-[11px]">— {r.cliente || 'Centralizado'}</span>
                            {r.destino_prioritario && (
                              <span className="text-[10px] text-red-700 bg-white/90 px-1 py-0.2 rounded font-bold">
                                ⭐ {r.destino_prioritario}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-1 text-indigo-600 font-bold text-xs group-hover/collapsed:translate-x-0.5 transition-transform shrink-0 ml-3">
                      <span>Expandir detalle</span>
                      <ChevronDown size={14} className="-rotate-90" />
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100/70 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-bold tracking-wider select-none">
                        <tr>
                          <th className="py-2 px-3 text-center w-20">N° Vuelta</th>
                          <th className="py-2 px-3 text-center w-20 font-mono">N° Ruta</th>
                          <th className="py-2 px-3 w-32">Camión</th>
                          <th className="py-2 px-3 min-w-[150px]">Cliente</th>
                          <th className="py-2 px-3 text-center w-20">Turno</th>
                          <th className="py-2 px-3 text-center w-28">
                            <span>Hora Cita</span>
                            {anticipacionMinutos > 0 && (
                              <span className="block text-[9px] text-amber-700 font-extrabold normal-case">
                                (-{anticipacionMinutos}m)
                              </span>
                            )}
                          </th>
                          <th className="py-2 px-3 text-center w-32">Prioridad</th>
                          <th className="py-2 px-3 text-center w-16">Locales</th>
                          <th className="py-2 px-3 text-right w-20">m³</th>
                          <th className="py-2 px-3 min-w-[200px]">Paradas / Destinos</th>
                          <th className="py-2 px-3 text-center w-28">Acción Ruta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {group.rows.map((row, rIdx) => {
                          const isPrioUrgente = row.prioridad === 'Prioridad urgente';
                          const isUrgente = row.prioridad === 'Urgente';
                          const isRedespacho = row.prioridad === 'Redespacho';
                          const uniqueParadas = getUniqueParadas(row.paradas);
                          const singleMsg = buildSingleRouteWhatsAppMessage(row, selectedDate, fleetList, anticipacionMinutos);
                          const isSingleCopied = copiedId === row.id;
                          const rowKey = row.id || `${row.ruta}-${rIdx}`;
                          const isParadasExpanded = !!expandedParadasRowId[rowKey];

                          let rowBgClass = 'hover:bg-slate-50/80';
                          if (isPrioUrgente) {
                            rowBgClass = 'bg-[#ffd6d6]/70 hover:bg-[#fecaca] text-[#7f1d1d] font-semibold border-l-4 border-l-[#fca5a5]';
                          } else if (isUrgente) {
                            rowBgClass = 'bg-[#fef9c3]/80 hover:bg-[#fef08a] text-[#713f12] font-semibold border-l-4 border-l-[#fde047]';
                          } else if (isRedespacho) {
                            rowBgClass = 'bg-[#334155] hover:bg-[#1e293b] text-[#f8fafc] font-semibold border-l-4 border-l-[#0f172a]';
                          }

                          return (
                            <tr key={row.id || rIdx} className={`transition-colors ${rowBgClass}`}>
                              {/* N° Vuelta */}
                              <td className="py-2 px-3 text-center">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-200/80 text-slate-800">
                                  V.{row.n_vuelta || '1'}
                                </span>
                              </td>

                              {/* N° Ruta */}
                              <td className="py-2 px-3 text-center font-mono font-black text-blue-700">
                                <span className="bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                  {row.ruta || '—'}
                                </span>
                              </td>

                              {/* Camión (Requisito 1) */}
                              <td className="py-2 px-3 font-semibold text-slate-800">
                                <div className="flex items-center gap-1">
                                  <Truck size={12} className="text-slate-400 shrink-0" />
                                  <span>{row.camion || 'Sin asignar'}</span>
                                </div>
                              </td>

                              {/* Cliente */}
                              <td className="py-2 px-3">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-slate-800">{row.cliente || 'Centralizado'}</span>
                                  {row.destino_prioritario && (
                                    <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 border border-red-300 font-bold text-[10px] px-1.5 py-0.2 rounded w-fit mt-0.5">
                                      ⭐ {row.destino_prioritario}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Turno */}
                              <td className="py-2 px-3 text-center">
                                {row.turno ? (
                                  <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                    {row.turno}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">—</span>
                                )}
                              </td>

                              {/* Hora Cita */}
                              <td className="py-2 px-3 text-center">
                                {row.hora_cita ? (
                                  <div className="flex flex-col items-center">
                                    {anticipacionMinutos > 0 ? (
                                      <>
                                        <span className="inline-block px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                          {subtractMinutesFromTime(row.hora_cita, anticipacionMinutos)}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                                          Base: {row.hora_cita} (-{anticipacionMinutos}m)
                                        </span>
                                      </>
                                    ) : (
                                      <span className="inline-block px-2 py-0.5 rounded text-xs font-mono font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                        {row.hora_cita}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">—</span>
                                )}
                              </td>

                              {/* Prioridad con Colores Pastel */}
                              <td className="py-2 px-3 text-center">
                                {row.prioridad && row.prioridad !== 'Normal' ? (
                                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-black border ${
                                    isPrioUrgente
                                      ? 'bg-[#ffd6d6] text-[#7f1d1d] border-[#fca5a5]'
                                      : isUrgente
                                      ? 'bg-[#fef9c3] text-[#713f12] border-[#fde047]'
                                      : isRedespacho
                                      ? 'bg-[#334155] text-white border-slate-600'
                                      : 'bg-slate-100 text-slate-700 border-slate-300'
                                  }`}>
                                    {row.prioridad}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">Normal</span>
                                )}
                              </td>

                              {/* Locales */}
                              <td className="py-2 px-3 text-center font-bold text-slate-800">
                                <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full text-[11px]">
                                  {row.locales || uniqueParadas.length || 1}
                                </span>
                              </td>

                              {/* m³ */}
                              <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                {(parseFloat(row.m3) || 0).toFixed(3)}
                              </td>

                              {/* Paradas / Destinos con expandir/contraer paradas */}
                              <td className="py-2 px-3 text-[11px] text-slate-600 max-w-[280px]">
                                {uniqueParadas && uniqueParadas.length > 0 ? (
                                  <div>
                                    <div className="flex flex-wrap gap-1">
                                      {(isParadasExpanded ? uniqueParadas : uniqueParadas.slice(0, 3)).map((p, pI) => {
                                        const isDestPrio = row.destino_prioritario && p.destino?.toLowerCase().includes(row.destino_prioritario.toLowerCase());
                                        return (
                                          <span
                                            key={pI}
                                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] border ${
                                              isDestPrio
                                                ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                                                : 'bg-slate-100 text-slate-700 border-slate-200'
                                            }`}
                                          >
                                            {p.destino}{p.comuna ? ` (${p.comuna})` : ''}
                                          </span>
                                        );
                                      })}
                                    </div>
                                    {uniqueParadas.length > 3 && (
                                      <button
                                        type="button"
                                        onClick={() => toggleParadasRow(rowKey)}
                                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline mt-1 block"
                                      >
                                        {isParadasExpanded ? '▲ Ver menos' : `▼ +${uniqueParadas.length - 3} paradas más`}
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic">—</span>
                                )}
                              </td>

                              {/* Acción Ruta Individual */}
                              <td className="py-2 px-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(singleMsg, row.id)}
                                    className={`p-1 rounded border transition-all ${
                                      isSingleCopied
                                        ? 'bg-green-100 border-green-300 text-green-700'
                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                    title="Copiar texto de esta ruta individual"
                                  >
                                    {isSingleCopied ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handlePreviewSingle(row)}
                                    className="p-1 rounded border bg-white border-slate-200 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                    title="Ver vista previa individual"
                                  >
                                    <Eye size={11} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenWhatsApp(condPhone, singleMsg)}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 transition-colors"
                                    title="Enviar solo esta ruta"
                                  >
                                    WA
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
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
                  Número de WhatsApp (ej: +56 9 1234 5678):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Sin teléfono (WhatsApp te pedirá elegir el contacto)"
                    value={previewModal.recipientPhone}
                    onChange={(e) => setPreviewModal(prev => ({ ...prev, recipientPhone: e.target.value }))}
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 font-mono"
                  />
                  {previewModal.conductorName && (
                    <button
                      type="button"
                      onClick={async () => {
                        await handleSaveStaffPhone(null, previewModal.recipientPhone, previewModal.conductorRut, previewModal.conductorName);
                        toast.success(`Número guardado en Dotación para ${previewModal.conductorName}`);
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg flex items-center gap-1"
                      title="Guardar este número en Dotación"
                    >
                      <Save size={12} />
                      Guardar en Dotación
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
                  const phone = resolveStaffPhone(group.conductor, group.rut);
                  const auxPhone = resolveStaffPhone(group.auxiliar, group.auxRut);
                  const groupMsg = buildConductorGroupWhatsAppMessage(
                    group.conductor, 
                    group.auxiliar, 
                    group.rows, 
                    selectedDate,
                    fleetList,
                    anticipacionMinutos
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
                              {group.totalViajes} {group.totalViajes === 1 ? 'viaje' : 'viajes'} ({group.rows.length} {group.rows.length === 1 ? 'ruta' : 'rutas'})
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>👥 Auxiliar: <strong className="text-indigo-900">{group.auxiliar || 'Sin Auxiliar'}</strong></span>
                            {auxPhone && <span className="font-mono text-[10px] text-slate-400">(Aux: {auxPhone})</span>}
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
                            title={phone ? `Enviar WhatsApp a ${group.conductor} (${phone})` : `Enviar WhatsApp a ${group.conductor}`}
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
                      <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs gap-3 flex-wrap">
                        {/* Teléfono enlazado a Dotación */}
                        <div className="flex items-center gap-1.5">
                          <Phone size={12} className="text-slate-400" />
                          <span className="text-[11px] font-bold text-slate-500">Celular Dotación:</span>
                          <input
                            type="text"
                            placeholder="Ej: +56 9 1234 5678"
                            value={editingPhoneMap[group.conductor] !== undefined ? editingPhoneMap[group.conductor] : phone}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditingPhoneMap(prev => ({ ...prev, [group.conductor]: val }));
                            }}
                            onBlur={(e) => {
                              handleSaveStaffPhone(null, e.target.value, group.rut, group.conductor);
                            }}
                            className="text-[11px] px-2 py-0.5 border border-slate-200 rounded bg-white w-44 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                          />
                          {savedPhoneFeedback[group.conductor] && (
                            <span className="text-[10px] text-green-600 font-semibold flex items-center gap-0.5">
                              <Check size={11} /> Guardado
                            </span>
                          )}
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

      {/* MODAL 3: MANTENEDOR DE NÚMEROS DE CELULAR — ENLAZADO CON DOTACIÓN */}
      {isStaffPhoneModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-5 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
            {/* Header del Mantenedor */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Smartphone size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Mantenedor de Números de Celular</h3>
                  <p className="text-xs text-slate-500">
                    Administra los teléfonos móviles vinculados a la <strong>Dotación</strong> (Conductores y Auxiliares) para envíos directos de rutas por WhatsApp.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsStaffPhoneModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            {/* Métricas rápidas del Directorio */}
            <div className="grid grid-cols-3 gap-2.5 pt-3 pb-1 shrink-0">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Total Dotación</span>
                  <p className="text-base font-black text-slate-800">{totalStaffCount} colaboradores</p>
                </div>
                <Users size={16} className="text-slate-400" />
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-700">Con Celular Registrado</span>
                  <p className="text-base font-black text-emerald-800">{staffWithPhoneCount} ({totalStaffCount > 0 ? Math.round((staffWithPhoneCount / totalStaffCount) * 100) : 0}%)</p>
                </div>
                <CheckCircle2 size={16} className="text-emerald-600" />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-700">Sin Celular (Pendientes)</span>
                  <p className="text-base font-black text-amber-800">{staffWithoutPhoneCount}</p>
                </div>
                <AlertCircle size={16} className="text-amber-600" />
              </div>
            </div>

            {/* Barra de Búsqueda, Filtros y Descarga Excel */}
            <div className="py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                {/* Buscador */}
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Buscar por Nombre, RUT o Fono..."
                    value={phoneSearchTerm}
                    onChange={(e) => setPhoneSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50 focus:bg-white"
                  />
                  {phoneSearchTerm && (
                    <button
                      onClick={() => setPhoneSearchTerm('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Filtro por Cargo / Rol */}
                <select
                  value={phoneFilterRole}
                  onChange={(e) => setPhoneFilterRole(e.target.value)}
                  className="text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 outline-none"
                >
                  <option value="Todos">Todos los Cargos</option>
                  <option value="Conductores">Solo Conductores</option>
                  <option value="Auxiliares">Solo Auxiliares</option>
                  <option value="Otros">Otros / Movilizadores</option>
                </select>

                {/* Filtro por Estado de Teléfono */}
                <select
                  value={phoneFilterStatus}
                  onChange={(e) => setPhoneFilterStatus(e.target.value)}
                  className="text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 outline-none"
                >
                  <option value="Todos">Todos los Registros</option>
                  <option value="Con Celular">Con Celular</option>
                  <option value="Sin Celular">Sin Celular</option>
                </select>
              </div>

              {/* Botón Descargar Directorio en Excel */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleExportPhoneDirectory}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                  title="Descargar listado completo de teléfonos de la dotación en Excel"
                >
                  <Download size={13} />
                  Descargar Directorio Excel
                </Button>
              </div>
            </div>

            {/* Tabla de Gestión Telefónica de la Dotación */}
            <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10 border-b border-slate-200 select-none">
                  <tr>
                    <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-slate-700">RUT</th>
                    <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-slate-700">Colaborador (Nombre)</th>
                    <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-slate-700">Cargo</th>
                    <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-slate-700">Tipo</th>
                    <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-slate-700 min-w-[200px]">Número de Celular</th>
                    <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider text-center text-slate-700">Acción WhatsApp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredStaffForPhoneModal.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-slate-400">
                        <Smartphone size={32} className="mx-auto text-slate-300 mb-2" />
                        <p className="font-medium text-sm">No se encontraron colaboradores con estos filtros.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredStaffForPhoneModal.map((staff) => {
                      const currentVal = editingPhoneMap[staff.id] !== undefined 
                        ? editingPhoneMap[staff.id] 
                        : (staff.phone || resolveStaffPhone(staff.name, staff.rut));
                      const isFeedback = savedPhoneFeedback[staff.id] || savedPhoneFeedback[staff.rut] || savedPhoneFeedback[staff.name];

                      return (
                        <tr key={staff.id} className="hover:bg-slate-50 transition-colors">
                          {/* RUT */}
                          <td className="py-2.5 px-3 font-mono font-medium text-slate-600">
                            {staff.rut || '—'}
                          </td>

                          {/* Nombre */}
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {staff.name}
                          </td>

                          {/* Cargo */}
                          <td className="py-2.5 px-3 text-slate-600">
                            <span className="font-medium">{staff.role}</span>
                          </td>

                          {/* Tipo */}
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              staff.tipo_dotacion === 'Externo'
                                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                : 'bg-blue-100 text-blue-700 border border-blue-200'
                            }`}>
                              {staff.tipo_dotacion || 'Propia'}
                            </span>
                            {staff.tipo_dotacion === 'Externo' && staff.empresa_externa && (
                              <span className="block text-[10px] text-purple-900 font-medium mt-0.5 max-w-[130px] truncate" title={staff.empresa_externa}>
                                {staff.empresa_externa}
                              </span>
                            )}
                          </td>

                          {/* Input Número de Celular con auto-guardado */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <div className="relative flex-1">
                                <input
                                  type="text"
                                  placeholder="+56 9 1234 5678"
                                  value={currentVal || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEditingPhoneMap(prev => ({ ...prev, [staff.id]: val }));
                                  }}
                                  onBlur={(e) => {
                                    handleSaveStaffPhone(staff.id, e.target.value, staff.rut, staff.name);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaveStaffPhone(staff.id, currentVal, staff.rut, staff.name);
                                      toast.success(`Teléfono guardado para ${staff.name}`);
                                    }
                                  }}
                                  className="w-full text-xs font-mono px-2.5 py-1 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-400"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSaveStaffPhone(staff.id, currentVal, staff.rut, staff.name);
                                  toast.success(`Teléfono guardado para ${staff.name}`);
                                }}
                                className={`p-1.5 rounded-lg border transition-all ${
                                  isFeedback
                                    ? 'bg-green-100 border-green-300 text-green-700'
                                    : 'bg-white border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
                                }`}
                                title="Guardar número de celular"
                              >
                                {isFeedback ? <Check size={13} className="text-green-600" /> : <Save size={13} />}
                              </button>
                            </div>
                          </td>

                          {/* Botón Acción WhatsApp de prueba */}
                          <td className="py-2.5 px-3 text-center">
                            {currentVal ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const testMsg = `Hola ${staff.name}, te contactamos desde Operaciones de Transporte Keylogistics.`;
                                  handleOpenWhatsApp(currentVal, testMsg);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all active:scale-95"
                                title={`Abrir chat de WhatsApp con ${staff.name}`}
                              >
                                <MessageSquare size={12} />
                                <span>WhatsApp</span>
                              </button>
                            ) : (
                              <span className="text-slate-300 italic text-[11px]">Sin celular</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer del Modal */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">
                Mostrando <strong>{filteredStaffForPhoneModal.length}</strong> de <strong>{staffList.length}</strong> colaboradores de Dotación
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsStaffPhoneModalOpen(false)}
                  className="text-xs font-bold"
                >
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

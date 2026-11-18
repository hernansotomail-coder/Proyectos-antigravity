import { supabase } from './supabase';
import { normalizeDate, parseDateStrToTimestamp, sortDatesDescending } from '../store/planningStore';

// URL y Token oficiales del Web App de Google Apps Script conectado a Google Drive
const DEFAULT_GDRIVE_URL = 'https://script.google.com/macros/s/AKfycbzc16kExdHQI3bS2efDZp8Xe5PWQ7sTrZWhNv4fMBowAk8SNoZwTXMXRGmz5xQRvQ4Ejg/exec';
const DEFAULT_GDRIVE_TOKEN = 'KEYLOGISTICS_DRIVE_2026_SECRET';

export const getGDriveConfig = () => {
  const customUrl = typeof window !== 'undefined' ? localStorage.getItem('keylogistics_gdrive_url') : null;
  const customToken = typeof window !== 'undefined' ? localStorage.getItem('keylogistics_gdrive_token') : null;
  return {
    url: customUrl || import.meta.env.VITE_GDRIVE_ARCHIVE_URL || DEFAULT_GDRIVE_URL,
    token: customToken || import.meta.env.VITE_GDRIVE_ARCHIVE_TOKEN || DEFAULT_GDRIVE_TOKEN
  };
};

// Convierte DD-MM-YYYY a YYYY-MM-DD
export const dmyToIso = (dmy) => {
  if (!dmy) return '';
  const norm = normalizeDate(dmy);
  const parts = String(norm).split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) return norm;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return norm;
};

// Convierte YYYY-MM-DD a DD-MM-YYYY
export const isoToDmy = (iso) => {
  if (!iso) return '';
  const clean = String(iso).trim().split('T')[0].split(' ')[0];
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
  }
  return normalizeDate(clean);
};

// Calcula si una fecha (DD-MM-YYYY o YYYY-MM-DD) tiene más de N días de antigüedad respecto a hoy
export const isDateOlderThanDays = (dateStr, retentionDays = 30) => {
  if (!dateStr) return false;
  const ts = parseDateStrToTimestamp(dateStr);
  if (!ts || ts <= 0) return false;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const cutoffMs = now.getTime() - (retentionDays * 24 * 60 * 60 * 1000);
  return ts < cutoffMs;
};

/**
 * 1. LISTAR TODAS LAS FECHAS ARCHIVADAS EN GOOGLE DRIVE
 */
export const fetchArchivedDatesFromDrive = async () => {
  const { url, token } = getGDriveConfig();
  const targetUrl = `${url}?action=list_dates&token=${encodeURIComponent(token)}&_t=${Date.now()}`;
  const res = await fetch(targetUrl, {
    method: 'GET',
    redirect: 'follow'
  });
  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status} al conectar con Google Drive`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'Respuesta inválida de Google Drive');
  }
  const sortedDates = sortDatesDescending((json.dates || []).map(d => d.fecha));
  return {
    ...json,
    sortedDates
  };
};

/**
 * 2. DESCARGAR UN DÍA ESPECÍFICO (DD-MM-YYYY) DESDE GOOGLE DRIVE
 */
export const fetchArchivedDayFromDrive = async (fechaDmy) => {
  const cleanFecha = normalizeDate(fechaDmy) || fechaDmy;
  const { url, token } = getGDriveConfig();
  const targetUrl = `${url}?action=get_day&fecha=${encodeURIComponent(cleanFecha)}&token=${encodeURIComponent(token)}&_t=${Date.now()}`;
  const res = await fetch(targetUrl, {
    method: 'GET',
    redirect: 'follow'
  });
  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status} al descargar fecha ${cleanFecha}`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || `No se encontró respaldo para la fecha ${cleanFecha}`);
  }
  return json;
};

/**
 * 3. DESCARGAR LA ASISTENCIA DE UN MES COMPLETO (YYYY-MM) DESDE GOOGLE DRIVE
 */
export const fetchArchivedMonthAttendanceFromDrive = async (yearMonth) => {
  const { url, token } = getGDriveConfig();
  const targetUrl = `${url}?action=get_month_attendance&month=${encodeURIComponent(yearMonth)}&token=${encodeURIComponent(token)}&_t=${Date.now()}`;
  const res = await fetch(targetUrl, {
    method: 'GET',
    redirect: 'follow'
  });
  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status} al consultar asistencia de ${yearMonth}`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || `Error al obtener asistencia de ${yearMonth}`);
  }
  return json;
};

/**
 * 4. GUARDAR UN DÍA O LOTE DE DÍAS EN GOOGLE DRIVE (Vía POST text/plain para evitar CORS preflight en Google Apps Script)
 */
export const uploadDaysBatchToDrive = async (daysArray) => {
  if (!Array.isArray(daysArray) || daysArray.length === 0) {
    return { ok: true, archivedCount: 0, results: [] };
  }
  const { url, token } = getGDriveConfig();
  const payload = {
    token,
    action: 'archive_batch',
    days: daysArray
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });

  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status} al subir respaldo a Google Drive`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'Error guardando lote en Google Drive');
  }
  return json;
};

/**
 * 5. GUARDAR UN DÍA INDIVIDUAL EN GOOGLE DRIVE (por ejemplo, para respaldar el Estatus Diario o la fecha actual)
 */
export const uploadSingleDayToDrive = async (fechaDmy, dayDataObj) => {
  const cleanFecha = normalizeDate(fechaDmy) || fechaDmy;
  const { url, token } = getGDriveConfig();
  const payload = {
    token,
    action: 'archive_day',
    fecha: cleanFecha,
    data: dayDataObj
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });

  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status} al respaldar ${cleanFecha} en Google Drive`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || `Error al guardar ${cleanFecha} en Google Drive`);
  }
  return json;
};

/**
 * 6. ESCANEAR SUPABASE PARA DETECTAR QUÉ FECHAS PUEDEN ARCHIVARSE Y LIBERAR ESPACIO
 * @param {number} retentionDays Días que se mantienen en Supabase para Planificación y Transporte (por defecto 30 días = 1 mes)
 * @param {number} attendanceRetentionDays Días que se mantienen en Supabase para Gestión de Dotación / Asistencia (por defecto 60 días = 2 meses)
 */
export const scanSupabaseForArchivableData = async (retentionDays = 30, attendanceRetentionDays = 60) => {
  // 1. Leer planning_assignments
  const { data: planningRows, error: planErr } = await supabase
    .from('planning_assignments')
    .select('*');

  if (planErr) throw planErr;

  // 2. Leer attendance (con paginación de bloques de 1000 para superar el límite max-rows=1000 de Supabase PostgREST)
  let attendanceRows = [];
  let attFrom = 0;
  const attLimit = 1000;
  let attHasMore = true;

  while (attHasMore) {
    const { data: attPage, error: attErr } = await supabase
      .from('attendance')
      .select('*')
      .order('id', { ascending: true })
      .range(attFrom, attFrom + attLimit - 1);

    if (attErr) throw attErr;
    if (attPage && attPage.length > 0) {
      attendanceRows = attendanceRows.concat(attPage);
      attFrom += attLimit;
      if (attPage.length < attLimit) attHasMore = false;
    } else {
      attHasMore = false;
    }
  }

  const daysMap = new Map(); // fecha (DD-MM-YYYY) -> { assignments, ruteoOverrides, savedHistoryEntry, changeHistory, attendance, estatusDiario, hasPlanningRow, rawDbFechaKey }
  const ensureDayBucket = (dmy) => {
    const clean = normalizeDate(dmy);
    if (!clean || clean.startsWith('__') || clean === 'Sin Fecha') return null;
    if (!daysMap.has(clean)) {
      const olderThanPlanning = isDateOlderThanDays(clean, retentionDays);
      const olderThanAttendance = isDateOlderThanDays(clean, attendanceRetentionDays);
      daysMap.set(clean, {
        fecha: clean,
        isoDate: dmyToIso(clean),
        isOlderThanCutoff: olderThanPlanning,
        isOlderThanAttendanceCutoff: olderThanAttendance,
        assignments: [],
        ruteoOverrides: {},
        savedHistoryEntry: null,
        changeHistory: [],
        attendance: [],
        estatusDiario: null,
        rawDbFechaKeys: []
      });
    }
    return daysMap.get(clean);
  };

  let fullSavedHistory = [];
  let fullChangeHistory = [];
  let fullRuteoOverrides = {};
  let estatusDiarioRecord = null;

  (planningRows || []).forEach(row => {
    const key = row.fecha;
    if (!key) return;

    if (key === '__saved_history__') {
      fullSavedHistory = Array.isArray(row.assignments) ? row.assignments : [];
    } else if (key === '__change_history__') {
      fullChangeHistory = Array.isArray(row.assignments) ? row.assignments : [];
    } else if (key === '__ruteo_overrides__') {
      fullRuteoOverrides = (row.assignments && typeof row.assignments === 'object') ? row.assignments : {};
    } else if (key === '__estatus_diario__') {
      estatusDiarioRecord = row.assignments;
    } else if (!key.startsWith('__') && Array.isArray(row.assignments)) {
      const bucket = ensureDayBucket(key);
      if (bucket) {
        bucket.assignments = row.assignments;
        bucket.rawDbFechaKeys.push(key);
      }
    }
  });

  // Cruzar __saved_history__
  fullSavedHistory.forEach(entry => {
    if (!entry || !entry.fecha) return;
    const bucket = ensureDayBucket(entry.fecha);
    if (bucket) {
      bucket.savedHistoryEntry = entry;
      if ((!bucket.assignments || bucket.assignments.length === 0) && Array.isArray(entry.rows)) {
        bucket.assignments = entry.rows;
      }
    }
  });

  // Cruzar __change_history__
  fullChangeHistory.forEach(ch => {
    if (!ch || !ch.fechaPlanificacion) return;
    const bucket = ensureDayBucket(ch.fechaPlanificacion);
    if (bucket) {
      bucket.changeHistory.push(ch);
    }
  });

  // Cruzar __ruteo_overrides__
  Object.entries(fullRuteoOverrides).forEach(([fKey, ovObj]) => {
    const bucket = ensureDayBucket(fKey);
    if (bucket && ovObj && typeof ovObj === 'object') {
      bucket.ruteoOverrides = ovObj;
    }
  });

  // Cruzar __estatus_diario__ si tiene fechaCorte
  if (estatusDiarioRecord && estatusDiarioRecord.processedData) {
    const fCorte = estatusDiarioRecord.fechaCorte || estatusDiarioRecord.processedData?.fechaCorteDmy;
    if (fCorte) {
      const bucket = ensureDayBucket(fCorte);
      if (bucket) {
        bucket.estatusDiario = estatusDiarioRecord;
      }
    }
  }

  // Cruzar attendance
  (attendanceRows || []).forEach(att => {
    if (!att || !att.date) return;
    const dmy = isoToDmy(att.date);
    const bucket = ensureDayBucket(dmy);
    if (bucket) {
      bucket.attendance.push(att);
    }
  });

  const allDays = Array.from(daysMap.values()).sort(
    (a, b) => parseDateStrToTimestamp(b.fecha) - parseDateStrToTimestamp(a.fecha)
  );

  // Una fecha es archivable si:
  // - Tiene datos de planificación/ruteo/cambios y supera retentionDays (30 días = 1 mes)
  // - O tiene datos de asistencia (Gestión de Dotación) y supera attendanceRetentionDays (60 días = 2 meses)
  const archivableOldDays = allDays.filter(d => {
    const hasPlanningData = (d.assignments?.length > 0) || (d.changeHistory?.length > 0) || (d.rawDbFechaKeys?.length > 0) || Boolean(d.savedHistoryEntry);
    const hasAttendanceData = d.attendance?.length > 0;
    if (hasPlanningData && d.isOlderThanCutoff) return true;
    if (hasAttendanceData && d.isOlderThanAttendanceCutoff) return true;
    return false;
  });

  return {
    allDays,
    archivableOldDays,
    fullSavedHistory,
    fullChangeHistory,
    fullRuteoOverrides
  };
};

/**
 * 7. ARCHIVAR EN GOOGLE DRIVE Y PURGAR DE SUPABASE (Verify-then-Purge)
 * Sube los días seleccionados a Google Drive y, solo tras confirmación exitosa, los elimina de Supabase para liberar espacio.
 * Respeta la regla de retención diferenciada:
 *   - Planificación y Transporte: se libera de Supabase tras 1 mes (30 días).
 *   - Gestión de Dotación (Asistencia): se mantiene en Supabase por 2 meses (60 días) antes de liberarse.
 */
export const archiveAndPurgeDatesFromSupabase = async (
  targetDatesDmy,
  { purgeFromSupabase = true, retentionDays = 30, attendanceRetentionDays = 60 } = {}
) => {
  const scan = await scanSupabaseForArchivableData(retentionDays, attendanceRetentionDays);
  const targetSet = new Set((targetDatesDmy || []).map(d => normalizeDate(d)));

  const bucketsToProcess = scan.allDays.filter(b => targetSet.has(b.fecha));
  if (bucketsToProcess.length === 0) {
    return { ok: true, archivedCount: 0, purgedCount: 0, purgedAttendanceCount: 0, message: 'No hay fechas seleccionadas para archivar.' };
  }

  // Armar lotes para subir a Google Drive (de a 10 días por petición para máxima velocidad y estabilidad)
  const BATCH_SIZE = 10;
  let totalArchived = 0;
  const confirmedFechas = new Set();

  for (let i = 0; i < bucketsToProcess.length; i += BATCH_SIZE) {
    const slice = bucketsToProcess.slice(i, i + BATCH_SIZE).map(b => ({
      fecha: b.fecha,
      data: {
        fecha: b.fecha,
        isoDate: b.isoDate,
        assignments: b.assignments || [],
        ruteoOverrides: b.ruteoOverrides || {},
        savedHistoryEntry: b.savedHistoryEntry || null,
        changeHistory: b.changeHistory || [],
        attendance: b.attendance || [],
        estatusDiario: b.estatusDiario || null
      }
    }));

    const driveRes = await uploadDaysBatchToDrive(slice);
    if (driveRes && driveRes.ok) {
      (driveRes.results || []).forEach(r => {
        if (r && r.ok && r.fecha) {
          confirmedFechas.add(normalizeDate(r.fecha));
          totalArchived++;
        }
      });
    }
  }

  let purgedCount = 0;
  let purgedAttendanceDays = 0;

  // FASE 2: Solo eliminar de Supabase aquellas fechas que Google Drive confirmó con fileId y ok:true
  if (purgeFromSupabase && confirmedFechas.size > 0) {
    const rawKeysToDelete = [];
    const isoDatesToDeleteAttendance = [];
    const planningConfirmedPurgeSet = new Set();

    bucketsToProcess.forEach(b => {
      if (confirmedFechas.has(b.fecha)) {
        // 1. Planificación / Transporte: Se libera si supera retentionDays (30 días) o si retentionDays === 0
        if (b.isOlderThanCutoff || retentionDays === 0) {
          b.rawDbFechaKeys.forEach(k => rawKeysToDelete.push(k));
          planningConfirmedPurgeSet.add(b.fecha);
        }

        // 2. Gestión de Dotación (Asistencia): Se mantiene por 2 meses (60 días) en Supabase.
        // Solo se borra de la tabla 'attendance' si tiene más de attendanceRetentionDays (60 días) o si attendanceRetentionDays === 0.
        if ((b.isOlderThanAttendanceCutoff || attendanceRetentionDays === 0) && b.isoDate) {
          isoDatesToDeleteAttendance.push(b.isoDate);
          purgedAttendanceDays++;
        }
      }
    });

    if (rawKeysToDelete.length > 0) {
      await supabase
        .from('planning_assignments')
        .delete()
        .in('fecha', rawKeysToDelete);
    }

    // Eliminar filas de attendance ÚNICAMENTE de las fechas que superaron los 2 meses (60 días)
    if (isoDatesToDeleteAttendance.length > 0) {
      await supabase
        .from('attendance')
        .delete()
        .in('date', isoDatesToDeleteAttendance);
    }

    if (planningConfirmedPurgeSet.size > 0) {
      // 3. Recortar __saved_history__ en Supabase quitando las fechas de planificación ya archivadas
      const remainingSavedHistory = (scan.fullSavedHistory || []).filter(
        h => !planningConfirmedPurgeSet.has(normalizeDate(h?.fecha))
      );
      await supabase
        .from('planning_assignments')
        .upsert({
          fecha: '__saved_history__',
          assignments: remainingSavedHistory,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fecha' });

      // 4. Recortar __change_history__ en Supabase quitando las fechas de planificación ya archivadas
      const remainingChangeHistory = (scan.fullChangeHistory || []).filter(
        ch => !planningConfirmedPurgeSet.has(normalizeDate(ch?.fechaPlanificacion))
      );
      await supabase
        .from('planning_assignments')
        .upsert({
          fecha: '__change_history__',
          assignments: remainingChangeHistory,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fecha' });

      // 5. Recortar __ruteo_overrides__ en Supabase quitando las fechas de planificación ya archivadas
      const remainingOverrides = {};
      Object.entries(scan.fullRuteoOverrides || {}).forEach(([k, v]) => {
        if (!planningConfirmedPurgeSet.has(normalizeDate(k))) {
          remainingOverrides[k] = v;
        }
      });
      await supabase
        .from('planning_assignments')
        .upsert({
          fecha: '__ruteo_overrides__',
          assignments: remainingOverrides,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fecha' });
    }

    purgedCount = planningConfirmedPurgeSet.size;
  }

  return {
    ok: true,
    archivedCount: totalArchived,
    purgedCount,
    purgedAttendanceDays,
    confirmedDates: Array.from(confirmedFechas)
  };
};

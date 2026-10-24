import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { matchVehicleByCode, normalizeVehicleCode } from '../lib/vehicleMatcher';

// Persistencia local para Lavados y Certificaciones de Flota
const loadPersistedFleetWashes = () => {
  try {
    const saved = localStorage.getItem('keylogistics_fleet_washes');
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
};

const persistFleetWashes = (map) => {
  try {
    localStorage.setItem('keylogistics_fleet_washes', JSON.stringify(map));
  } catch (e) {
    console.error('Error persisting fleet washes:', e);
  }
};

// Persistencia local para actualizaciones de columnas de flota
const loadPersistedFleetOverrides = () => {
  try {
    const saved = localStorage.getItem('keylogistics_fleet_overrides');
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
};

const persistFleetOverrides = (map) => {
  try {
    localStorage.setItem('keylogistics_fleet_overrides', JSON.stringify(map));
  } catch (e) {
    console.error('Error persisting fleet overrides:', e);
  }
};

export const inferTipoFlota = (f, overrideInfo = {}) => {
  if (overrideInfo?.tipo_flota) return overrideInfo.tipo_flota;
  if (f?.tipo_flota) return f.tipo_flota;
  if (overrideInfo?.empresa_externa && String(overrideInfo.empresa_externa).trim() !== '') return 'Externa';
  if (f?.empresa_externa && String(f.empresa_externa).trim() !== '') return 'Externa';
  
  const st = (f?.status || '').trim();
  const stLower = st.toLowerCase();
  if (stLower.startsWith('externo_') || stLower.includes('externo') || stLower.startsWith('transportes')) {
    return 'Externa';
  }
  const standardStatuses = ['activo', 'inactivo', 'taller', 'mantención', 'mantencion', 'disponible', 'de baja', 'dado de baja', 'desactivado'];
  if (st && !standardStatuses.includes(stLower)) {
    return 'Externa';
  }
  return 'Propia';
};

export const inferEmpresaExterna = (f, overrideInfo = {}) => {
  if (overrideInfo?.empresa_externa && String(overrideInfo.empresa_externa).trim() !== '') {
    return String(overrideInfo.empresa_externa).trim();
  }
  if (f?.empresa_externa && String(f.empresa_externa).trim() !== '') {
    return String(f.empresa_externa).trim();
  }
  
  const st = (f?.status || '').trim();
  const stLower = st.toLowerCase();
  if (stLower.startsWith('externo_')) {
    return st.replace(/^externo_/i, '').trim();
  }
  const standardStatuses = ['activo', 'inactivo', 'taller', 'mantención', 'mantencion', 'disponible', 'de baja', 'dado de baja', 'desactivado'];
  if (st && !standardStatuses.includes(stLower)) {
    return st;
  }
  return '';
};

export const isVehicleExternal = (f) => {
  if (!f) return false;
  if (f.tipo_flota === 'Externa') return true;
  if (f.empresa_externa && String(f.empresa_externa).trim() !== '') return true;
  const st = (f.status || '').trim();
  const stLower = st.toLowerCase();
  if (stLower.startsWith('externo_') || stLower.includes('externo') || stLower.startsWith('transportes')) {
    return true;
  }
  const standardStatuses = ['activo', 'inactivo', 'taller', 'mantención', 'mantencion', 'disponible', 'de baja', 'dado de baja', 'desactivado'];
  if (st && !standardStatuses.includes(stLower)) {
    return true;
  }
  return false;
};

export const useFleetStore = create((set, get) => ({
  fleetList: [],
  isLoading: false,

  fetchFleet: async () => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('fleet')
        .select('*')
        .order('plate');
      
      if (error) throw error;

      const washesMap = loadPersistedFleetWashes();
      const overridesMap = loadPersistedFleetOverrides();

      const enriched = (data || []).map(f => {
        const intKey = f.internal_number ? String(f.internal_number).trim() : null;
        const normIntKey = f.internal_number ? normalizeVehicleCode(f.internal_number) : null;
        const plateKey = f.plate ? String(f.plate).trim().toUpperCase() : null;
        const normPlateKey = f.plate ? normalizeVehicleCode(f.plate) : null;
        const idKey = f.id ? String(f.id) : null;

        const washInfo = (intKey && washesMap[intKey]) || 
                         (normIntKey && washesMap[normIntKey]) ||
                         (plateKey && washesMap[plateKey]) || 
                         (normPlateKey && washesMap[normPlateKey]) ||
                         (idKey && washesMap[idKey]) || {};

        const overrideInfo = (intKey && overridesMap[intKey]) || 
                             (normIntKey && overridesMap[normIntKey]) ||
                             (plateKey && overridesMap[plateKey]) || 
                             (normPlateKey && overridesMap[normPlateKey]) ||
                             (idKey && overridesMap[idKey]) || {};

        const tipo = inferTipoFlota(f, overrideInfo);
        const empresa = inferEmpresaExterna(f, overrideInfo);

        return {
          ...f,
          ...overrideInfo,
          tipo_flota: tipo,
          empresa_externa: empresa,
          ultima_certificacion: f.ultima_certificacion || washInfo.ultima_certificacion || null,
          fecha_ultimo_lavado: f.fecha_ultimo_lavado || washInfo.fecha_ultimo_lavado || null
        };
      });

      // Auto-sincronizar hacia Supabase si en este equipo hay datos locales de lavados/certificaciones
      const missingWashesInDb = (data || []).filter(f => {
        const intKey = f.internal_number ? String(f.internal_number).trim() : null;
        const normIntKey = f.internal_number ? normalizeVehicleCode(f.internal_number) : null;
        const plateKey = f.plate ? String(f.plate).trim().toUpperCase() : null;
        const normPlateKey = f.plate ? normalizeVehicleCode(f.plate) : null;
        const idKey = f.id ? String(f.id) : null;

        const washInfo = (intKey && washesMap[intKey]) || 
                         (normIntKey && washesMap[normIntKey]) ||
                         (plateKey && washesMap[plateKey]) || 
                         (normPlateKey && washesMap[normPlateKey]) ||
                         (idKey && washesMap[idKey]) || {};

        const hasLocalCert = washInfo.ultima_certificacion && !f.ultima_certificacion;
        const hasLocalWash = washInfo.fecha_ultimo_lavado && !f.fecha_ultimo_lavado;
        return hasLocalCert || hasLocalWash;
      });

      if (missingWashesInDb.length > 0) {
        setTimeout(async () => {
          for (const item of missingWashesInDb) {
            const intKey = item.internal_number ? String(item.internal_number).trim() : null;
            const normIntKey = item.internal_number ? normalizeVehicleCode(item.internal_number) : null;
            const plateKey = item.plate ? String(item.plate).trim().toUpperCase() : null;
            const normPlateKey = item.plate ? normalizeVehicleCode(item.plate) : null;
            const idKey = item.id ? String(item.id) : null;

            const washInfo = (intKey && washesMap[intKey]) || 
                             (normIntKey && washesMap[normIntKey]) ||
                             (plateKey && washesMap[plateKey]) || 
                             (normPlateKey && washesMap[normPlateKey]) ||
                             (idKey && washesMap[idKey]) || {};

            const payload = {};
            if (washInfo.ultima_certificacion && !item.ultima_certificacion) {
              payload.ultima_certificacion = washInfo.ultima_certificacion;
            }
            if (washInfo.fecha_ultimo_lavado && !item.fecha_ultimo_lavado) {
              payload.fecha_ultimo_lavado = washInfo.fecha_ultimo_lavado;
            }

            if (Object.keys(payload).length > 0) {
              try {
                await supabase.from('fleet').update(payload).eq('id', item.id);
              } catch (e) {
                break;
              }
            }
          }
        }, 1000);
      }

      set({ fleetList: enriched });
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar la flota');
    } finally {
      set({ isLoading: false });
    }
  },

  addFleet: async (fleetData) => {
    set({ isLoading: true });
    const tipoFlota = fleetData.tipo_flota || (fleetData.empresa_externa ? 'Externa' : 'Propia');
    const empresaExterna = fleetData.empresa_externa || '';
    let statusVal = fleetData.status || 'Activo';
    if (tipoFlota === 'Externa' && (!statusVal || statusVal === 'Activo')) {
      statusVal = empresaExterna ? `Externo_${empresaExterna.trim()}` : 'Externo';
    }
    const finalPayload = {
      ...fleetData,
      status: statusVal,
      tipo_flota: tipoFlota,
      empresa_externa: empresaExterna
    };
    try {
      let insertedRow = null;
      try {
        const { data, error } = await supabase
          .from('fleet')
          .insert([finalPayload])
          .select();

        if (error) {
          if (error.code === '23505') {
            toast.error('Esta patente ya está registrada');
            return false;
          }
          throw error;
        }
        insertedRow = data ? data[0] : null;
      } catch (insertErr) {
        // Fallback si tipo_flota o empresa_externa no existen como columnas en Supabase
        const { tipo_flota, empresa_externa, ...rest } = finalPayload;
        const { data, error } = await supabase
          .from('fleet')
          .insert([rest])
          .select();

        if (error) {
          if (error.code === '23505') {
            toast.error('Esta patente ya está registrada');
            return false;
          }
          throw error;
        }
        insertedRow = data ? data[0] : null;
      }

      // Persistir en overridesMap
      const overridesMap = loadPersistedFleetOverrides();
      const keysToMap = [
        fleetData.plate ? String(fleetData.plate).trim().toUpperCase() : null,
        fleetData.internal_number ? String(fleetData.internal_number).trim() : null,
        insertedRow?.id ? String(insertedRow.id) : null,
        insertedRow?.plate ? String(insertedRow.plate).trim().toUpperCase() : null,
        insertedRow?.internal_number ? String(insertedRow.internal_number).trim() : null
      ].filter(Boolean);

      keysToMap.forEach(k => {
        overridesMap[k] = {
          ...(overridesMap[k] || {}),
          tipo_flota: tipoFlota,
          empresa_externa: empresaExterna
        };
        overridesMap[normalizeVehicleCode(k)] = {
          ...(overridesMap[normalizeVehicleCode(k)] || {}),
          tipo_flota: tipoFlota,
          empresa_externa: empresaExterna
        };
      });
      persistFleetOverrides(overridesMap);
      
      toast.success('Vehículo agregado exitosamente');
      await get().fetchFleet();
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Error al agregar el vehículo');
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  addFleetBulk: async (fleetArray) => {
    set({ isLoading: true });
    try {
      const overridesMap = loadPersistedFleetOverrides();

      // Función para validar y corregir fechas (ej. 31 de junio -> 30 de junio)
      const sanitizeDate = (val) => {
        if (!val) return null;
        if (typeof val === 'string') {
          const trimmed = val.trim();
          const m = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
          if (m) {
            const y = parseInt(m[1], 10);
            const mon = parseInt(m[2], 10);
            const d = parseInt(m[3], 10);
            if (mon >= 1 && mon <= 12) {
              const maxD = new Date(y, mon, 0).getDate();
              const validD = Math.min(d, maxD);
              return `${y}-${String(mon).padStart(2, '0')}-${String(validD).padStart(2, '0')}`;
            }
          }
        }
        return val;
      };

      // Deduplicar por Patente (manteniendo la última fila del archivo si se repite)
      const uniqueMap = new Map();
      fleetArray.forEach(f => {
        if (!f || !f.plate) return;
        const plateKey = String(f.plate).trim().toUpperCase();
        uniqueMap.set(plateKey, { ...f, plate: plateKey });

        let tipoFlota = f.tipo_flota || (f.empresa_externa ? 'Externa' : 'Propia');
        let empresa = f.empresa_externa || '';

        // Si el estado viene como "Externo_Valencia", inferir tipo Externa y empresa Valencia
        if (f.status && String(f.status).toLowerCase().startsWith('externo_')) {
          tipoFlota = 'Externa';
          if (!empresa) {
            empresa = String(f.status).replace(/^externo_/i, '').trim();
          }
        } else if (f.status && String(f.status).toLowerCase().startsWith('transportes')) {
          tipoFlota = 'Externa';
          if (!empresa) empresa = String(f.status).trim();
        } else if (tipoFlota === 'Externa' && empresa && (!f.status || f.status === 'Activo')) {
          f.status = `Externo_${empresa.trim()}`;
        }

        const keys = [
          plateKey,
          f.internal_number ? String(f.internal_number).trim() : null
        ].filter(Boolean);

        keys.forEach(k => {
          overridesMap[k] = {
            ...(overridesMap[k] || {}),
            tipo_flota: tipoFlota,
            empresa_externa: empresa
          };
          overridesMap[normalizeVehicleCode(k)] = {
            ...(overridesMap[normalizeVehicleCode(k)] || {}),
            tipo_flota: tipoFlota,
            empresa_externa: empresa
          };
        });
      });
      persistFleetOverrides(overridesMap);

      const uniqueList = Array.from(uniqueMap.values());
      if (uniqueList.length === 0) {
        toast.error('No se encontraron vehículos válidos para procesar');
        return false;
      }

      // Sanitizar columnas reconocidas en Supabase y validar fechas
      const sanitized = uniqueList.map(f => {
        let statusVal = f.status || 'Activo';
        const tipoFlota = f.tipo_flota || (f.empresa_externa ? 'Externa' : 'Propia');
        const empresa = f.empresa_externa || '';
        if (tipoFlota === 'Externa' && (!statusVal || statusVal === 'Activo' || statusVal === 'Disponible')) {
          statusVal = empresa ? `Externo_${empresa}` : 'Externo';
        }

        return {
          type: String(f.type || 'Camión').trim(),
          plate: String(f.plate).trim().toUpperCase(),
          internal_number: f.internal_number != null ? String(f.internal_number).trim() : 'S/N',
          brand: f.brand ? String(f.brand).trim() : null,
          model: f.model ? String(f.model).trim() : null,
          year: f.year ? String(f.year).trim() : null,
          status: String(statusVal).trim(),
          frio: f.frio ? String(f.frio).trim() : null,
          engine_number: f.engine_number ? String(f.engine_number).trim() : null,
          chassis_number: f.chassis_number ? String(f.chassis_number).trim() : null,
          cc: f.cc ? String(f.cc).trim() : null,
          tank_capacity: f.tank_capacity ? String(f.tank_capacity).trim() : null,
          payload: f.payload ? String(f.payload).trim() : null,
          state2: f.state2 ? String(f.state2).trim() : null,
          rt_date: sanitizeDate(f.rt_date),
          gases_date: sanitizeDate(f.gases_date),
          pc_date: sanitizeDate(f.pc_date),
          soap_date: sanitizeDate(f.soap_date),
          carnes_date: sanitizeDate(f.carnes_date),
          resolution: f.resolution ? String(f.resolution).trim() : null,
          type2: f.type2 ? String(f.type2).trim() : null,
          side_doors: f.side_doors ? String(f.side_doors).trim() : null,
          gps: f.gps ? String(f.gps).trim() : null,
          operation: f.operation ? String(f.operation).trim() : null,
          insurer: f.insurer ? String(f.insurer).trim() : null,
          region: f.region ? String(f.region).trim() : null,
          tct: f.tct ? String(f.tct).trim() : null,
          tct_copy: f.tct_copy ? String(f.tct_copy).trim() : null,
          neo_tac: f.neo_tac ? String(f.neo_tac).trim() : null,
          pallet_capacity: f.pallet_capacity ? String(f.pallet_capacity).trim() : null
        };
      });

      // Inserción por lotes (chunks) de 50 para máxima estabilidad
      const chunkSize = 50;
      let totalInserted = 0;
      for (let i = 0; i < sanitized.length; i += chunkSize) {
        const chunk = sanitized.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('fleet')
          .upsert(chunk, { onConflict: 'plate' });

        if (error) {
          console.warn('Fallo lote en Supabase, intentando inserción fila por fila...', error);
          for (const item of chunk) {
            try {
              const { error: singleErr } = await supabase
                .from('fleet')
                .upsert([item], { onConflict: 'plate' });
              if (!singleErr) totalInserted++;
            } catch (e) {
              console.error('Error insertando vehículo:', item.plate, e);
            }
          }
        } else {
          totalInserted += chunk.length;
        }
      }
      
      await get().fetchFleet();
      toast.success(`${totalInserted} vehículo(s) procesados correctamente`);
      return true;
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'Error en la carga masiva');
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  updateFleet: async (id, fleetData) => {
    try {
      const overridesMap = loadPersistedFleetOverrides();
      const current = get().fleetList.find(f => f.id === id);
      const keys = [
        id ? String(id) : null,
        fleetData.plate ? String(fleetData.plate).trim().toUpperCase() : (current?.plate?.toUpperCase()),
        fleetData.internal_number ? String(fleetData.internal_number).trim() : current?.internal_number
      ].filter(Boolean);

      // Sanitización completa para PostgreSQL / Supabase
      // Evita error 22007 (invalid input syntax for type date: "") y columnas protegidas (id, created_at)
      const dateKeys = [
        'rt_date', 'gases_date', 'pc_date', 'soap_date', 'carnes_date', 
        'ultima_certificacion', 'fecha_ultimo_lavado', 'resolution'
      ];
      
      const sanitizedData = {};
      Object.entries(fleetData).forEach(([k, val]) => {
        if (k === 'id' || k === 'created_at' || k === 'updated_at' || k === 'dashboardCategory') return;
        
        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (trimmed === '' || trimmed === 'NaN' || trimmed === 'null' || trimmed === 'undefined') {
            sanitizedData[k] = null;
          } else {
            sanitizedData[k] = trimmed;
          }
        } else if (val === undefined) {
          sanitizedData[k] = null;
        } else {
          sanitizedData[k] = val;
        }
      });

      // Guardar en overridesMap local
      keys.forEach(k => {
        overridesMap[k] = {
          ...(overridesMap[k] || {}),
          ...fleetData,
          ...sanitizedData
        };
        overridesMap[normalizeVehicleCode(k)] = {
          ...(overridesMap[normalizeVehicleCode(k)] || {}),
          ...fleetData,
          ...sanitizedData
        };
      });
      persistFleetOverrides(overridesMap);

      // Ajuste para flota externa
      let dataToUpdate = { ...sanitizedData };
      if (dataToUpdate.tipo_flota === 'Externa' && dataToUpdate.empresa_externa) {
        if (!dataToUpdate.status || dataToUpdate.status === 'Activo') {
          dataToUpdate.status = `Externo_${dataToUpdate.empresa_externa.trim()}`;
        }
      }

      try {
        const { error } = await supabase
          .from('fleet')
          .update(dataToUpdate)
          .eq('id', id);

        if (error) throw error;
      } catch (subErr) {
        console.warn('Fallo actualización directa en Supabase, intentando con fallback sanitizado...', subErr);
        // Fallback sanitizado sin columnas custom si no existen en el schema de Supabase
        const { tipo_flota, empresa_externa, ...rest } = dataToUpdate;
        const { error } = await supabase
          .from('fleet')
          .update(rest)
          .eq('id', id);

        if (error) {
          console.warn('Error en fallback Supabase, pero guardado localmente:', error);
          // Si el registro solo existe localmente o la red falló, permitir continuar con persistencia local
        }
      }
      
      toast.success('Vehículo actualizado exitosamente');
      await get().fetchFleet();
      return true;
    } catch (err) {
      console.error('Error al actualizar el vehículo:', err);
      toast.error(err?.message || 'Error al actualizar el vehículo');
      return false;
    }
  },

  deleteFleet: async (id) => {
    try {
      const { error } = await supabase
        .from('fleet')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Vehículo eliminado');
      await get().fetchFleet();
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar el vehículo');
      return false;
    }
  },

  // 1. CARGA MASIVA POR COLUMNAS (Requisito 1)
  // Actualiza masivamente columnas seleccionadas basándose en la relación con "N° Interno"
  updateFleetBulkColumns: async (updatesArray) => {
    set({ isLoading: true });
    try {
      const overridesMap = loadPersistedFleetOverrides();
      const currentList = get().fleetList;

      let updatedCount = 0;

      for (const updateItem of updatesArray) {
        const { internal_number, ...fieldsToUpdate } = updateItem;
        if (!internal_number) continue;

        const cleanInternal = String(internal_number).trim();
        const existingVehicle = matchVehicleByCode(cleanInternal, '', currentList);

        if (existingVehicle) {
          updatedCount++;
          // Guardar en override map (claves directa, normalizada y por id)
          overridesMap[cleanInternal] = {
            ...(overridesMap[cleanInternal] || {}),
            ...fieldsToUpdate
          };
          overridesMap[normalizeVehicleCode(cleanInternal)] = {
            ...(overridesMap[normalizeVehicleCode(cleanInternal)] || {}),
            ...fieldsToUpdate
          };
          if (existingVehicle.internal_number) {
            overridesMap[existingVehicle.internal_number] = {
              ...(overridesMap[existingVehicle.internal_number] || {}),
              ...fieldsToUpdate
            };
            overridesMap[normalizeVehicleCode(existingVehicle.internal_number)] = {
              ...(overridesMap[normalizeVehicleCode(existingVehicle.internal_number)] || {}),
              ...fieldsToUpdate
            };
          }
          if (existingVehicle.id) {
            overridesMap[existingVehicle.id] = {
              ...(overridesMap[existingVehicle.id] || {}),
              ...fieldsToUpdate
            };
          }

          // Intentar actualizar en Supabase (si falla por columna inexistente, el override local lo preserva)
          try {
            await supabase
              .from('fleet')
              .update(fieldsToUpdate)
              .eq('id', existingVehicle.id);
          } catch (subErr) {
            console.warn('Fallback al actualizar columna en Supabase:', subErr);
          }
        }
      }

      persistFleetOverrides(overridesMap);
      await get().fetchFleet();
      toast.success(`Carga masiva completada: ${updatedCount} vehículo(s) actualizado(s)`);
      return true;
    } catch (err) {
      console.error('Error en updateFleetBulkColumns:', err);
      toast.error('Error al procesar la carga masiva por columnas');
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // 2. ACTUALIZACIÓN DE LAVADOS Y CERTIFICACIONES (Requisito 2 y 3)
  updateFleetWashes: async (washesArray) => {
    set({ isLoading: true });
    try {
      const washesMap = loadPersistedFleetWashes();
      const currentList = get().fleetList;
      let matchedCount = 0;
      const dbUpdates = [];

      washesArray.forEach(w => {
        const key = w.internal_number ? String(w.internal_number).trim() : null;
        const plate = w.plate ? String(w.plate).trim().toUpperCase() : null;

        if (key || plate) {
          const found = matchVehicleByCode(key, plate, currentList);
          const existingKey = key || plate;
          const currentEntry = washesMap[existingKey] || 
                               (key && washesMap[normalizeVehicleCode(key)]) || 
                               (plate && washesMap[normalizeVehicleCode(plate)]) || {};
          
          const newEntry = {
            ...currentEntry,
            ...(w.ultima_certificacion !== undefined ? { ultima_certificacion: w.ultima_certificacion } : {}),
            ...(w.fecha_ultimo_lavado !== undefined ? { fecha_ultimo_lavado: w.fecha_ultimo_lavado } : {})
          };

          if (key) {
            washesMap[key] = newEntry;
            washesMap[normalizeVehicleCode(key)] = newEntry;
          }
          if (plate) {
            washesMap[plate] = newEntry;
            washesMap[normalizeVehicleCode(plate)] = newEntry;
          }

          // Vincular también con el vehículo encontrado
          if (found && found.id) {
            washesMap[found.id] = newEntry;
            if (found.internal_number) {
              washesMap[found.internal_number] = newEntry;
              washesMap[normalizeVehicleCode(found.internal_number)] = newEntry;
            }
            if (found.plate) {
              washesMap[found.plate] = newEntry;
              washesMap[normalizeVehicleCode(found.plate)] = newEntry;
            }
            matchedCount++;

            const payload = {};
            if (w.ultima_certificacion !== undefined) payload.ultima_certificacion = w.ultima_certificacion;
            if (w.fecha_ultimo_lavado !== undefined) payload.fecha_ultimo_lavado = w.fecha_ultimo_lavado;
            if (Object.keys(payload).length > 0) {
              dbUpdates.push({ id: found.id, payload });
            }
          }
        }
      });

      persistFleetWashes(washesMap);

      // Sincronizar en Supabase para que cualquier computador pueda leerlo
      if (dbUpdates.length > 0) {
        const batchSize = 10;
        for (let i = 0; i < dbUpdates.length; i += batchSize) {
          const batch = dbUpdates.slice(i, i + batchSize);
          await Promise.allSettled(batch.map(u => 
            supabase.from('fleet').update(u.payload).eq('id', u.id)
          ));
        }
      }

      await get().fetchFleet();
      return true;
    } catch (err) {
      console.error('Error en updateFleetWashes:', err);
      toast.error('Error al guardar datos de lavados/certificaciones');
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // 3. ACTUALIZAR UN SOLO VEHÍCULO MANUALMENTE
  updateSingleFleetWash: async (internalOrId, washData) => {
    try {
      const washesMap = loadPersistedFleetWashes();
      const key = String(internalOrId).trim();
      washesMap[key] = {
        ...(washesMap[key] || {}),
        ...washData
      };
      persistFleetWashes(washesMap);

      const currentList = get().fleetList;
      const found = matchVehicleByCode(key, '', currentList) || currentList.find(f => f.id === key);
      if (found && found.id) {
        try {
          await supabase
            .from('fleet')
            .update(washData)
            .eq('id', found.id);
        } catch (subErr) {
          console.warn('Fallback al actualizar wash en Supabase:', subErr);
        }
      }

      set(state => ({
        fleetList: state.fleetList.map(f => {
          if (String(f.internal_number).trim() === key || String(f.id) === key || (found && f.id === found.id)) {
            return { ...f, ...washData };
          }
          return f;
        })
      }));

      toast.success('Registro de lavado/certificación actualizado');
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar registro');
      return false;
    }
  }
}));

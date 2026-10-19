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

        return {
          ...f,
          ...overrideInfo,
          tipo_flota: f.tipo_flota || overrideInfo.tipo_flota || 'Propia',
          empresa_externa: f.empresa_externa || overrideInfo.empresa_externa || '',
          ultima_certificacion: f.ultima_certificacion || washInfo.ultima_certificacion || null,
          fecha_ultimo_lavado: f.fecha_ultimo_lavado || washInfo.fecha_ultimo_lavado || null
        };
      });

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
    try {
      let insertedRow = null;
      try {
        const { data, error } = await supabase
          .from('fleet')
          .insert([fleetData])
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
        const { tipo_flota, empresa_externa, ...rest } = fleetData;
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
        if (statusVal && String(statusVal).toLowerCase().startsWith('externo_')) {
          // Mantener statusVal para que se guarde tal cual (ej. Externo_Valencia)
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
      // Guardar en overridesMap
      const overridesMap = loadPersistedFleetOverrides();
      const current = get().fleetList.find(f => f.id === id);
      const keys = [
        id ? String(id) : null,
        fleetData.plate ? String(fleetData.plate).trim().toUpperCase() : (current?.plate?.toUpperCase()),
        fleetData.internal_number ? String(fleetData.internal_number).trim() : current?.internal_number
      ].filter(Boolean);

      keys.forEach(k => {
        overridesMap[k] = {
          ...(overridesMap[k] || {}),
          ...fleetData
        };
        overridesMap[normalizeVehicleCode(k)] = {
          ...(overridesMap[normalizeVehicleCode(k)] || {}),
          ...fleetData
        };
      });
      persistFleetOverrides(overridesMap);

      try {
        const { error } = await supabase
          .from('fleet')
          .update(fleetData)
          .eq('id', id);

        if (error) throw error;
      } catch (subErr) {
        // Fallback sanitizado sin columnas custom si no existen en Supabase
        const { tipo_flota, empresa_externa, ...rest } = fleetData;
        const { error } = await supabase
          .from('fleet')
          .update(rest)
          .eq('id', id);

        if (error) throw error;
      }
      
      toast.success('Vehículo actualizado exitosamente');
      await get().fetchFleet();
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar el vehículo');
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

            // Intentar sincronizar con Supabase si las columnas existen en la base
            supabase
              .from('fleet')
              .update({
                ...(w.ultima_certificacion !== undefined ? { ultima_certificacion: w.ultima_certificacion } : {}),
                ...(w.fecha_ultimo_lavado !== undefined ? { fecha_ultimo_lavado: w.fecha_ultimo_lavado } : {})
              })
              .eq('id', found.id)
              .then(() => {})
              .catch(() => {});
          }
        }
      });

      persistFleetWashes(washesMap);
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

      set(state => ({
        fleetList: state.fleetList.map(f => {
          if (String(f.internal_number).trim() === key || String(f.id) === key) {
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

import { create } from 'zustand';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import PRELOADED_TIENDAS_CRITICAS from '../data/tiendasCriticasPreloaded.json';

const STORAGE_KEY = 'keylogistics_tiendas_criticas_v1';

// Normalizador de texto para cruces precisos de Destino
export const normalizeDestino = (str) => {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const loadPersistedTiendas = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error cargando tiendas críticas de localStorage:', e);
  }
  return PRELOADED_TIENDAS_CRITICAS || [];
};

const persistTiendas = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Error guardando tiendas críticas en localStorage:', e);
  }
};

export const useTiendasCriticasStore = create((set, get) => ({
  tiendas: loadPersistedTiendas(),
  isLoading: false,

  // Agregar tienda crítica manualmente
  addTiendaCritica: (tiendaData) => {
    const { tiendas } = get();
    const newTienda = {
      id: `crit-custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      cliente: (tiendaData.cliente || '').trim(),
      consideracion: (tiendaData.consideracion || 'URGENTE CON PRIORIDAD').trim(),
      destino: (tiendaData.destino || '').trim(),
      direccion: (tiendaData.direccion || '').trim(),
      comuna: (tiendaData.comuna || '').trim(),
      region: (tiendaData.region || '').trim(),
      transportista: (tiendaData.transportista || '').trim(),
      ipr: (tiendaData.ipr || '').trim(),
      ventanaHoraria: (tiendaData.ventanaHoraria || '').trim(),
      ventanaHoraria2: (tiendaData.ventanaHoraria2 || '').trim(),
      observaciones: (tiendaData.observaciones || '').trim()
    };

    if (!newTienda.destino) {
      toast.error('El campo Destino es obligatorio');
      return false;
    }

    const updated = [newTienda, ...tiendas];
    set({ tiendas: updated });
    persistTiendas(updated);
    toast.success(`Tienda crítica "${newTienda.destino}" agregada exitosamente`);
    return true;
  },

  // Modificar tienda crítica existente
  updateTiendaCritica: (id, updatedFields) => {
    const { tiendas } = get();
    const updated = tiendas.map(t => {
      if (t.id === id) {
        return {
          ...t,
          ...updatedFields,
          destino: (updatedFields.destino || t.destino || '').trim(),
          cliente: (updatedFields.cliente || t.cliente || '').trim(),
          consideracion: (updatedFields.consideracion || t.consideracion || '').trim()
        };
      }
      return t;
    });

    set({ tiendas: updated });
    persistTiendas(updated);
    toast.success('Tienda crítica actualizada correctamente');
    return true;
  },

  // Eliminar tienda crítica
  deleteTiendaCritica: (id) => {
    const { tiendas } = get();
    const target = tiendas.find(t => t.id === id);
    const updated = tiendas.filter(t => t.id !== id);
    set({ tiendas: updated });
    persistTiendas(updated);
    toast.success(`Tienda crítica "${target?.destino || id}" eliminada`);
    return true;
  },

  // Carga Masiva desde Excel (Requisito 1: Fila 3 como títulos)
  uploadExcelTiendasCriticas: async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          // Convertir a matriz raw (array de arrays)
          const rawSheet = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

          if (!rawSheet || rawSheet.length < 3) {
            toast.error('El archivo no tiene el formato esperado (se requieren encabezados en fila 3)');
            resolve(false);
            return;
          }

          // Fila 3 en índice 0-based es 2
          const headerRow = rawSheet[2] || [];
          const headers = headerRow.map(h => String(h || '').trim());

          // Encontrar índices de columnas según los encabezados de fila 3
          // Headers: Cliente, Consideracion, Cliente, Destino, Direccion, Comuna, Región, Transportista, IPR, Ventana Horaria, Ventana Horaria 2, OBSERVACIONES
          let colConsideracion = headers.findIndex(h => /consideraci[oó]n/i.test(h));
          let colCliente = -1;
          // Si hay 2 columnas de cliente (como en el excel del usuario), tomar la que viene después de consideracion o la primera no vacía
          for (let i = 0; i < headers.length; i++) {
            if (/cliente/i.test(headers[i])) {
              colCliente = i;
            }
          }
          let colDestino = headers.findIndex(h => /destino/i.test(h));
          let colDireccion = headers.findIndex(h => /direcci[oó]n/i.test(h));
          let colComuna = headers.findIndex(h => /comuna/i.test(h));
          let colRegion = headers.findIndex(h => /regi[oó]n/i.test(h));
          let colTransp = headers.findIndex(h => /transportista/i.test(h));
          let colIpr = headers.findIndex(h => /ipr/i.test(h));
          let colVentana1 = headers.findIndex(h => /ventana\s*horaria$/i.test(h) || (/ventana/i.test(h) && !/2/i.test(h)));
          let colVentana2 = headers.findIndex(h => /ventana\s*horaria\s*2/i.test(h) || (/ventana/i.test(h) && /2/i.test(h)));
          let colObservaciones = headers.findIndex(h => /observaci[oó]n/i.test(h));

          // Fallbacks posicionales estándar si no encuentra por nombre exacto
          if (colConsideracion === -1) colConsideracion = 1;
          if (colCliente === -1) colCliente = 2;
          if (colDestino === -1) colDestino = 3;
          if (colDireccion === -1) colDireccion = 4;
          if (colComuna === -1) colComuna = 5;
          if (colRegion === -1) colRegion = 6;
          if (colTransp === -1) colTransp = 7;
          if (colIpr === -1) colIpr = 8;
          if (colVentana1 === -1) colVentana1 = 9;
          if (colVentana2 === -1) colVentana2 = 10;
          if (colObservaciones === -1) colObservaciones = 11;

          const parsedList = [];
          for (let r = 3; r < rawSheet.length; r++) {
            const row = rawSheet[r];
            if (!row || row.length === 0) continue;

            const destino = String(row[colDestino] || '').trim();
            if (!destino || destino.toUpperCase() === 'NAN') continue;

            let cliente = String(row[colCliente] || '').trim();
            if (cliente === 'NaN' || !cliente) {
              cliente = String(row[0] || '').trim();
            }
            if (cliente === 'NaN') cliente = '';

            const consideracion = String(row[colConsideracion] || 'URGENTE CON PRIORIDAD').trim();
            const direccion = String(row[colDireccion] || '').trim();
            const comuna = String(row[colComuna] || '').trim();
            const region = String(row[colRegion] || '').trim();
            const transportista = String(row[colTransp] || '').trim();
            const ipr = String(row[colIpr] || '').trim();
            const ventanaHoraria = String(row[colVentana1] || '').trim();
            const ventanaHoraria2 = String(row[colVentana2] || '').trim();
            const observaciones = String(row[colObservaciones] || '').trim();

            parsedList.push({
              id: `crit-import-${Date.now()}-${r}`,
              cliente,
              consideracion: consideracion !== 'NaN' ? consideracion : 'URGENTE CON PRIORIDAD',
              destino,
              direccion: direccion !== 'NaN' ? direccion : '',
              comuna: comuna !== 'NaN' ? comuna : '',
              region: region !== 'NaN' ? region : '',
              transportista: transportista !== 'NaN' ? transportista : '',
              ipr: ipr !== 'NaN' ? ipr : '',
              ventanaHoraria: ventanaHoraria !== 'NaN' ? ventanaHoraria : '',
              ventanaHoraria2: ventanaHoraria2 !== 'NaN' ? ventanaHoraria2 : '',
              observaciones: observaciones !== 'NaN' ? observaciones : ''
            });
          }

          if (parsedList.length === 0) {
            toast.error('No se encontraron registros de tiendas críticas válidos en el archivo');
            resolve(false);
            return;
          }

          set({ tiendas: parsedList });
          persistTiendas(parsedList);
          toast.success(`Carga exitosa: ${parsedList.length} tiendas críticas registradas desde Excel`);
          resolve(true);
        } catch (err) {
          console.error('Error al procesar archivo de tiendas críticas:', err);
          toast.error('Error al leer el archivo Excel');
          resolve(false);
        }
      };

      reader.onerror = () => {
        toast.error('Error al abrir el archivo');
        resolve(false);
      };

      reader.readAsArrayBuffer(file);
    });
  },

  // Restaurar dataset predeterminado (110 tiendas)
  resetToDefaults: () => {
    const list = PRELOADED_TIENDAS_CRITICAS || [];
    set({ tiendas: list });
    persistTiendas(list);
    toast.success(`Dataset restablecido a las ${list.length} tiendas críticas base`);
  },

  // Helper para buscar tienda crítica por destino (Cruce con Ruteo)
  findTiendaCritica: (destino) => {
    const { tiendas } = get();
    if (!destino) return null;
    const normSearch = normalizeDestino(destino);
    if (!normSearch) return null;

    // 1. Coincidencia exacta normalizada
    for (const t of tiendas) {
      const normT = normalizeDestino(t.destino);
      if (normT && normT === normSearch) {
        return t;
      }
    }

    // 2. Coincidencia por contención bidireccional si la longitud es significativa (>= 5 caracteres)
    if (normSearch.length >= 5) {
      for (const t of tiendas) {
        const normT = normalizeDestino(t.destino);
        if (normT && normT.length >= 5) {
          if (normSearch.includes(normT) || normT.includes(normSearch)) {
            return t;
          }
        }
      }
    }

    return null;
  }
}));

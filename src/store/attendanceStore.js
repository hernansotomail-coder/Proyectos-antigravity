import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

export const useAttendanceStore = create((set) => ({
  attendanceList: [],
  isLoading: false,

  fetchAttendanceByDateRange: async (startDate, endDate) => {
    set({ isLoading: true });
    try {
      let allData = [];
      let from = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate)
          .range(from, from + limit - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += limit;
          if (data.length < limit) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      set({ attendanceList: allData });
      return allData;
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar la asistencia');
      return [];
    } finally {
      set({ isLoading: false });
    }
  },

  saveAttendanceBulk: async (attendanceRecords) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase
        .from('attendance')
        .upsert(attendanceRecords, { onConflict: 'staff_id,date' });

      if (error) throw error;
      toast.success(`${attendanceRecords.length} registros guardados exitosamente`);
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Error masivo: ' + (err.message || 'Desconocido'));
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  saveAttendanceRange: async (staffId, startDate, endDate, serviceType) => {
    set({ isLoading: true });
    try {
      const records = [];
      let currentStr = startDate;
      
      while (currentStr <= endDate) {
        const [y, m, d] = currentStr.split('-').map(Number);
        const loopDate = new Date(y, m - 1, d);

        // No contabilizar los días domingos (0 = Domingo en getDay())
        if (loopDate.getDay() !== 0) {
          records.push({
            staff_id: staffId,
            date: currentStr,
            service_type: serviceType
          });
        }
        
        // Avanzar 1 día de forma segura ignorando zonas horarias
        const nextDate = new Date(y, m - 1, d + 1);
        const ny = nextDate.getFullYear();
        const nm = String(nextDate.getMonth() + 1).padStart(2, '0');
        const nd = String(nextDate.getDate()).padStart(2, '0');
        currentStr = `${ny}-${nm}-${nd}`;
      }

      const { error } = await supabase
        .from('attendance')
        .upsert(records, { onConflict: 'staff_id,date' });

      if (error) throw error;
      toast.success(`Se asignó ${serviceType} desde ${startDate} hasta ${endDate}`);
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Error de rango: ' + (err.message || 'Desconocido'));
      return false;
    } finally {
      set({ isLoading: false });
    }
  }
}));

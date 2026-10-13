import React, { useState } from 'react';
import { 
  FileText, Calendar, CheckSquare, MessageSquare, AlertTriangle, 
  Printer, ShieldCheck, Truck, Users, Clock, CheckCircle2 
} from 'lucide-react';
import { Button } from './ui/Button';
import { usePlanningStore } from '../store/planningStore';
import { useStaffStore } from '../store/staffStore';
import { useFleetStore } from '../store/fleetStore';

export default function Briefing() {
  const { selectedDisponibilizarDate, transmittedAssignments } = usePlanningStore();
  const { staffList } = useStaffStore();
  const { fleetList } = useFleetStore();

  const [date, setDate] = useState(
    selectedDisponibilizarDate || new Date().toISOString().split('T')[0]
  );
  const [shift, setShift] = useState('Mañana');
  const [facilitator, setFacilitator] = useState('Supervisor Operaciones');
  
  const [checklist, setChecklist] = useState({
    epp: true,
    documentacion: true,
    temperatura: true,
    rutas: true,
    seguridad: true,
    novedades: false
  });

  const [notes, setNotes] = useState('');

  const currentAssignments = transmittedAssignments[date] || [];

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 gap-4 overflow-y-auto">
      
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 font-bold px-2.5 py-0.5 rounded-full text-xs">
              Planificación
            </span>
            <h1 className="text-xl font-bold text-slate-800">Briefing Diario Operacional</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro y control de la reunión de alineamiento previo a la salida de rutas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => window.print()}
            className="flex items-center gap-2 text-xs font-bold"
          >
            <Printer size={15} />
            Imprimir Minuta
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Info Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2 border-b pb-2">
            <Calendar size={18} className="text-blue-600" />
            Parámetros de la Jornada
          </h2>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Fecha</label>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="w-full text-xs border border-slate-200 rounded-xl p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Turno</label>
            <select 
              value={shift} 
              onChange={e => setShift(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option>Mañana (06:00 - 14:00)</option>
              <option>Tarde (14:00 - 22:00)</option>
              <option>Noche (22:00 - 06:00)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Facilitador / Supervisor</label>
            <input 
              type="text" 
              value={facilitator} 
              onChange={e => setFacilitator(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Quick counters */}
          <div className="pt-2 border-t grid grid-cols-2 gap-2 text-center">
            <div className="bg-blue-50 p-2.5 rounded-xl">
              <span className="text-[10px] text-blue-600 font-bold uppercase block">Rutas del Día</span>
              <span className="text-lg font-black text-blue-900">{currentAssignments.length}</span>
            </div>
            <div className="bg-emerald-50 p-2.5 rounded-xl">
              <span className="text-[10px] text-emerald-600 font-bold uppercase block">Flota Disponible</span>
              <span className="text-lg font-black text-emerald-900">{fleetList.length}</span>
            </div>
          </div>
        </div>

        {/* Checklist */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2 border-b pb-2">
            <CheckSquare size={18} className="text-indigo-600" />
            Puntos de Control Obligatorios
          </h2>

          <div className="space-y-3">
            {[
              { key: 'epp', label: 'Verificación de EPP completo en conductores y auxiliares' },
              { key: 'documentacion', label: 'Revisión de documentos del vehículo (RT, Gases, SOAP)' },
              { key: 'temperatura', label: 'Revisión y pre-enfriado de sistema de frío' },
              { key: 'rutas', label: 'Instrucción de rutas prioritarias y ventanas horarias' },
              { key: 'seguridad', label: 'Charla de seguridad vial de 5 minutos impartida' },
              { key: 'novedades', label: 'Desvíos o vehículos de reemplazo reportados' },
            ].map(item => (
              <label 
                key={item.key} 
                className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-50 cursor-pointer text-xs text-slate-700 transition-colors"
              >
                <input 
                  type="checkbox" 
                  checked={checklist[item.key]} 
                  onChange={e => setChecklist({...checklist, [item.key]: e.target.checked})}
                  className="rounded text-blue-600 focus:ring-blue-500 mt-0.5"
                />
                <span className="leading-snug">{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Minuta y Novedades */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col space-y-3">
          <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2 border-b pb-2">
            <MessageSquare size={18} className="text-amber-600" />
            Minuta y Novedades del Turno
          </h2>

          <textarea 
            rows={8}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anota aquí novedades del turno, demoras en carga, reemplazos de camión o chofer, instrucciones especiales de clientes..."
            className="w-full flex-1 text-xs border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white resize-none"
          />

          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700 text-xs font-bold py-2 rounded-xl"
            onClick={() => {
              toast.success('Minuta de Briefing guardada exitosamente');
            }}
          >
            Guardar Registro de Briefing
          </Button>
        </div>

      </div>

    </div>
  );
}

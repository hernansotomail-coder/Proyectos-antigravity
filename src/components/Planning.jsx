import React from 'react';
import { CalendarClock } from 'lucide-react';

export default function Planning() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
      <CalendarClock size={64} className="text-slate-300 mb-6" />
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Planificación</h2>
      <p className="text-slate-500 max-w-md text-center">
        Este módulo está en construcción. Aquí podrás gestionar la planificación y horarios de manera centralizada muy pronto.
      </p>
    </div>
  );
}

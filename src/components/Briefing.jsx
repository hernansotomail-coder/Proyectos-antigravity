import React from 'react';
import { Sparkles, Compass } from 'lucide-react';

export default function Briefing() {
  return (
    <div className="flex flex-col h-full bg-slate-50 p-6 overflow-y-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
        <div className="flex items-center gap-2">
          <span className="bg-indigo-100 text-indigo-700 font-bold px-2.5 py-0.5 rounded-full text-xs">
            Operaciones
          </span>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Compass className="text-indigo-600" size={22} />
            Briefing
          </h1>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Espacio reservado para el próximo desarrollo del módulo de Briefing.
        </p>
      </div>

      {/* Área vacía para desarrollo futuro */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-dashed border-slate-300 flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
          <Sparkles size={28} />
        </div>
        <h2 className="text-base font-bold text-slate-700 mb-1">
          Módulo de Briefing disponible
        </h2>
        <p className="text-xs text-slate-400 max-w-sm">
          Este sub-menú se encuentra en blanco y listo para implementar las funcionalidades que requieras más adelante.
        </p>
      </div>
    </div>
  );
}

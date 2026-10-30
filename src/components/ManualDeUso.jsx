import React, { useState } from 'react';
import { 
  BookOpen, Download, ExternalLink, Printer, Search, 
  FileText, CheckCircle2, ChevronRight, Layers, Truck, 
  MapPin, Send, HelpCircle, Shield, AlertTriangle, Eye, Sparkles
} from 'lucide-react';
import { Button } from './ui/Button';

export default function ManualDeUso() {
  const [activeTab, setActiveTab] = useState('pdf'); // 'pdf' | 'interactive'
  const [searchTerm, setSearchTerm] = useState('');
  const [activeChapter, setActiveChapter] = useState('todos');

  const chapters = [
    {
      id: 'flujo',
      title: '1. Arquitectura y Flujo Operacional',
      icon: Layers,
      color: 'text-blue-600 bg-blue-50 border-blue-200',
      summary: 'Secuencia completa desde la carga del archivo Excel diario hasta la salida física de camiones.',
      content: (
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            El sistema opera como una torre de control integral que enlaza secuencialmente los departamentos de Planificación, Operaciones de Transporte y Jefatura de Flota:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 text-center font-bold text-xs">
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900">
              <span className="block text-[10px] text-blue-500 font-black">PASO 1</span>
              Asignación Diaria
              <p className="font-normal text-[11px] text-slate-500 mt-1">Carga Excel + Catálogo Maestro</p>
            </div>
            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 text-indigo-900">
              <span className="block text-[10px] text-indigo-500 font-black">PASO 2</span>
              Disponibilización
              <p className="font-normal text-[11px] text-slate-500 mt-1">Camión + Chofer + Aux + SPID</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900">
              <span className="block text-[10px] text-amber-500 font-black">PASO 3</span>
              Ruteo Dinámico
              <p className="font-normal text-[11px] text-slate-500 mt-1">Tiendas Críticas + Colores</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900">
              <span className="block text-[10px] text-emerald-500 font-black">PASO 4</span>
              Envío WhatsApp
              <p className="font-normal text-[11px] text-slate-500 mt-1">Agrupado por Conductor</p>
            </div>
            <div className="p-3 bg-teal-50 rounded-xl border border-teal-200 text-teal-900">
              <span className="block text-[10px] text-teal-500 font-black">PASO 5</span>
              Briefing Operativo
              <p className="font-normal text-[11px] text-slate-500 mt-1">Control Gerencial por Cuenta</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'flota',
      title: '2. Gestión de Flota y Control de Lavados',
      icon: Truck,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
      summary: 'Separación de Flota Propia y Externa, bloqueo automático por taller o documentos, y ordenamiento A-Z.',
      content: (
        <div className="space-y-3 text-sm text-slate-600">
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-900">
            <h4 className="font-bold flex items-center gap-1.5 text-xs uppercase tracking-wide text-red-800">
              <AlertTriangle size={15} /> Candado de Seguridad de Disponibilización:
            </h4>
            <p className="text-xs mt-1 leading-relaxed">
              Si un camión se encuentra en estado <strong>"En Taller"</strong>, <strong>"Bloqueado por Documentación"</strong> o cualquier condición distinta a <strong>"Activo"</strong>, el sistema bloquea su selección en Disponibilización y emite un pop-up con el motivo exacto, evitando salidas irregulares a ruta.
            </p>
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600">
            <li><strong>Pestañas Dedicadas:</strong> Gestión separada para "Flota Propia" y "Flota Externa" tanto en la matriz de flota como en Lavados.</li>
            <li><strong>Filtros de Ordenamiento:</strong> Puedes ordenar de la A a la Z o de mayor a menor haciendo clic en las cabeceras de columna de las matrices y dashboards.</li>
            <li><strong>Dashboard Flota:</strong> Tarjeta de "Resolución" en formato fecha sincronizada con semáforos de taller.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'asignacion',
      title: '3. Asignación Diaria y Catálogo Maestro',
      icon: Layers,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      summary: 'Normalización de 1.383 rutas en 26 operaciones oficiales y segregación de temperaturas.',
      content: (
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            Al subir la planilla Excel en <strong>Asignación Diaria</strong>, el motor de normalización cruza en milisegundos las rutas con el Catálogo Maestro de Operaciones:
          </p>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
            <p><strong>Cuentas Canónicas:</strong> Fast Food y Petroleras (Subway, Carls Jr, Streat Burguer, Sbarro, Enex Unitario y Copec), Centralizado (Aramark y Megafrio), Newrest ByI, SODEXO, SPID, Nutrisco, Sea Garden, Carga Consolidada y Última Milla Regional.</p>
            <p><strong>Temperaturas:</strong> Detección automática de ambientes (C: Congelado, R: Refrigerado, S: Seco) y suma de metros cúbicos.</p>
            <p><strong>Transmisión:</strong> Un solo clic en "Transmitir a Disponibilización" deja todo listo para armar tripulaciones.</p>
          </div>
        </div>
      )
    },
    {
      id: 'disponibilizacion',
      title: '4. Disponibilización y Servicios Extras (SPID)',
      icon: Truck,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      summary: 'Asignación de recursos por vuelta (V.1, V.2), registro del servicio SPID y auditoría de cambios.',
      content: (
        <div className="space-y-3 text-sm text-slate-600">
          <p>Permite vincular cada viaje a un Conductor, Auxiliares (peonetas) y Patente de camión:</p>
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1 text-emerald-950">
            <p className="font-bold">⭐ Servicio Extra SPID:</p>
            <p>En el modal "Registrar Servicios Extras", escoge el tipo <strong>"SPID"</strong>. Se genera la ruta designada y los camiones asignados se suman de inmediato en el Briefing en la fila de SPID.</p>
          </div>
        </div>
      )
    },
    {
      id: 'ruteo',
      title: '5. Ruteo, Tiendas Críticas y Copia de Imagen',
      icon: MapPin,
      color: 'text-sky-600 bg-sky-50 border-sky-200',
      summary: 'Cálculo de comuna más lejana desde San Bernardo, colores pastel de prioridad y exportación a Excel/imagen.',
      content: (
        <div className="space-y-3 text-sm text-slate-600">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 rounded-xl border border-slate-300 bg-slate-100 text-slate-800">
              <span className="font-black block">⬛ Redespachos</span>
              Negro pastel para entregas pendientes obligatorias.
            </div>
            <div className="p-2.5 rounded-xl border border-red-200 bg-red-100/70 text-red-900">
              <span className="font-black block">🟥 Prioridad Urgente</span>
              Rojo pastel para locales críticos o con ventanas acotadas.
            </div>
            <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-100/70 text-amber-900">
              <span className="font-black block">🟨 Urgente</span>
              Amarillo pastel para tiendas prioritarias.
            </div>
          </div>
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs space-y-1.5 text-indigo-950">
            <p className="font-bold">📋 Nuevas funciones de exportación:</p>
            <p><strong>Copiar imagen:</strong> Haz clic en el botón superior en Ruteo y luego en Excel presiona <code>Ctrl + V</code>. La matriz se pega instantáneamente como imagen con el formato exacto.</p>
            <p><strong>Descargar imagen:</strong> Descarga el snapshot visual en formato PNG de alta calidad.</p>
          </div>
        </div>
      )
    },
    {
      id: 'dispatch',
      title: '6. Envío de Rutas por WhatsApp',
      icon: Send,
      color: 'text-green-600 bg-green-50 border-green-200',
      summary: 'Mensaje agrupado por chofer y vuelta, icono 📦 en todos los viajes, hora cita general y desfase masivo.',
      content: (
        <div className="space-y-3 text-sm text-slate-600">
          <div className="bg-[#efeae2] p-3 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 leading-relaxed whitespace-pre-line">
{`🚛 *PROGRAMACIÓN DE RUTAS* - 24-10-2026
━━━━━━━━━━━━━━━━━━━━━
⏰ *Hora Cita / Presentación:* 06:45
👤 *Conductor:* GONZALEZ ARANCIBIA DAVID
👥 *Auxiliar:* ANJARID FLORES KEVIN
🚚 *Camión:* C281 (WBGK44)
━━━━━━━━━━━━━━━━━━━━━
   📦 *VIAJE 1 (VUELTA 1)* [Curacaví]
   ▫️ *Ruta 1831* (SUBWAY): 1 locales | 0.260 m³
   ▫️ *Ruta 1837* (SUBWAY): 4 locales | 1.332 m³

   📦 *VIAJE 2 (VUELTA 2)* [Melipilla]
   ▫️ *Ruta 4308* (STREAT BURGUER): 1 local | 1.925 m³`}
          </div>
          <p className="text-xs">
            <strong>Viñeta expandir/contraer:</strong> Permite replegar la tabla para visualizar sólo los totales por chofer o abrir el desglose de rutas con un solo clic.
          </p>
        </div>
      )
    },
    {
      id: 'briefing',
      title: '7. Briefing Operativo y Control Ejecutivo',
      icon: FileText,
      color: 'text-violet-600 bg-violet-50 border-violet-200',
      summary: 'Filtro por múltiples operaciones, tarjetas ordenadas por actividad, logo oficial y métricas por vuelta.',
      content: (
        <div className="space-y-3 text-sm text-slate-600">
          <p className="text-xs">
            Presenta el resumen consolidado por Operación con conteo de camiones en 1ra y 2da vuelta (Flota Propia vs Flota Externa), rutas sin cobertura, bultos, kilos, temperaturas y volumen total.
          </p>
          <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl text-xs space-y-1 text-violet-950">
            <p className="font-bold">🎯 Filtro Multi-Operación y Orden de Tarjetas:</p>
            <p>Puedes seleccionar una o más operaciones simultáneamente. Las operaciones que tienen servicios activos se muestran al inicio, y las que no tienen servicios registrados quedan ordenadas al final.</p>
          </div>
        </div>
      )
    }
  ];

  const filteredChapters = chapters.filter(c => {
    if (activeChapter !== 'todos' && c.id !== activeChapter) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return c.title.toLowerCase().includes(term) || c.summary.toLowerCase().includes(term);
  });

  return (
    <div className="flex flex-col h-full space-y-3 p-2 sm:p-4 bg-slate-50 overflow-hidden">
      {/* Cabecera Principal */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-sm shrink-0">
            <BookOpen size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 tracking-tight">Manual de Uso</h1>
              <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                Oficial 2026
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Documentación técnica y operativa interactiva para la plataforma Key Logistics.
            </p>
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de Modo */}
          <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('pdf')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'pdf'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText size={14} />
              <span>Lector PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('interactive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'interactive'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles size={14} className="text-amber-500" />
              <span>Guía Interactiva</span>
            </button>
          </div>

          <a
            href="/Manual_de_Usuario_KeyLogistics.pdf"
            download="Manual_de_Usuario_KeyLogistics.pdf"
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition-all"
            title="Descargar archivo PDF completo a tu computador"
          >
            <Download size={14} />
            <span>Descargar PDF</span>
          </a>

          <a
            href="/Manual_de_Usuario_KeyLogistics.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold px-3 py-2 rounded-xl transition-all"
            title="Abrir el documento PDF en una nueva pestaña del navegador"
          >
            <ExternalLink size={14} />
            <span>Pestaña nueva</span>
          </a>
        </div>
      </div>

      {/* Contenido según pestaña */}
      {activeTab === 'pdf' ? (
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0">
          <div className="bg-slate-100/80 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 shrink-0">
            <span className="font-bold flex items-center gap-1.5 text-slate-700">
              <FileText size={14} className="text-blue-600" />
              Visualizador de Documento Oficial: Manual_de_Usuario_KeyLogistics.pdf
            </span>
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Base: Lago Riñihue 02319, San Bernardo • Edición Enterprise
            </span>
          </div>

          <div className="flex-1 w-full h-full min-h-[480px] bg-slate-200 relative">
            <iframe
              src="/Manual_de_Usuario_KeyLogistics.pdf#toolbar=1&navpanes=1"
              title="Manual de Usuario Key Logistics"
              className="w-full h-full border-0 absolute inset-0"
            />
          </div>
        </div>
      ) : (
        /* Guía Interactiva en Pantalla */
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 overflow-auto flex flex-col space-y-4 min-h-0">
          {/* Barra de Filtro y Búsqueda de Capítulos */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pb-2 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-thin">
              <button
                type="button"
                onClick={() => setActiveChapter('todos')}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all shrink-0 ${
                  activeChapter === 'todos'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Todos los Capítulos
              </button>
              {chapters.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveChapter(c.id)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    activeChapter === c.id
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c.title.split('.')[0]}. {c.title.split('.')[1]?.trim()?.split(' ')[0]}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar tema o función..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Lista de Capítulos Desplegados */}
          <div className="space-y-4">
            {filteredChapters.map(chap => {
              const Icon = chap.icon;
              return (
                <div key={chap.id} className="border border-slate-200 rounded-2xl p-4 bg-white shadow-2xs hover:shadow-xs transition-shadow">
                  <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
                    <div className={`p-2.5 rounded-xl border ${chap.color} shrink-0`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{chap.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{chap.summary}</p>
                    </div>
                  </div>
                  <div className="pt-3">
                    {chap.content}
                  </div>
                </div>
              );
            })}

            {filteredChapters.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <HelpCircle size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-xs font-bold">No se encontraron temas para "{searchTerm}"</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

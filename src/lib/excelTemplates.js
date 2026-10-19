import * as XLSX from 'xlsx';
import { toast } from 'sonner';

/**
 * Genera y descarga un archivo Excel a partir de columnas y filas de ejemplo.
 */
const exportTemplate = (columns, sampleRows, fileName, sheetName = 'Plantilla') => {
  try {
    const ws = XLSX.utils.json_to_sheet(sampleRows, { header: columns });
    
    // Auto-ajustar ancho de columnas
    const colWidths = columns.map(col => ({
      wch: Math.max(col.length + 4, 14)
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
    toast.success(`Plantilla descargada: ${fileName}`);
  } catch (err) {
    console.error('Error generando plantilla Excel:', err);
    toast.error('Error al generar la plantilla Excel');
  }
};

/**
 * Plantilla 1: Carga Masiva por Columnas de Flota (ManageFleet)
 */
export const downloadFleetBulkTemplate = () => {
  const columns = [
    'N° Interno', 'Patente', 'Tipo', 'Tipo de Flota', 'Empresa Externa', 'Marca', 'Modelo', 'Año', 
    'Estado', 'RT', 'Gases', 'PC', 'SOAP', 'Carnes', 'Frío', 
    'N° Motor', 'N° Chasis', 'CC', 'Carga Estanque', 'Carga/Peso', 
    'Estado 2', 'Resolución', 'Tipo 2', 'P. Laterales', 'GPS', 
    'Operación', 'Aseguradora', 'Región', 'TCT', 'Copia TCT', 
    'NEO TAC', 'Cap. Pallet', 'Última Certificación', 'Fecha Último Lavado'
  ];

  const sampleRows = [
    {
      'N° Interno': 'C200',
      'Patente': 'ABCD12',
      'Tipo': 'Camión',
      'Tipo de Flota': 'Propia',
      'Empresa Externa': '',
      'Marca': 'Mercedes Benz',
      'Modelo': 'Atego 1726',
      'Año': 2024,
      'Estado': 'Activo',
      'RT': '2026-11-30',
      'Gases': '2026-11-30',
      'PC': '2026-12-31',
      'SOAP': '2027-03-31',
      'Carnes': '2026-10-31',
      'Frío': 'Sí',
      'N° Motor': 'MB-906-12345',
      'N° Chasis': '9BM970-54321',
      'CC': 6400,
      'Carga Estanque': '300 L',
      'Carga/Peso': '10.500 kg',
      'Estado 2': 'Operativo',
      'Resolución': 'Res-1234',
      'Tipo 2': 'Furgón Frigorífico',
      'P. Laterales': '2',
      'GPS': 'Instalado',
      'Operación': 'Distribución Central',
      'Aseguradora': 'BCI Seguros',
      'Región': 'Metropolitana',
      'TCT': 'TCT-9876',
      'Copia TCT': 'Sí',
      'NEO TAC': 'Activo',
      'Cap. Pallet': 14,
      'Última Certificación': '2026-10-15',
      'Fecha Último Lavado': '2026-10-18'
    },
    {
      'N° Interno': 'EXT-101',
      'Patente': 'WXYZ34',
      'Tipo': 'Camión',
      'Tipo de Flota': 'Externa',
      'Empresa Externa': 'Transportes del Sur SPA',
      'Marca': 'Volvo',
      'Modelo': 'VM 270',
      'Año': 2023,
      'Estado': 'Activo',
      'RT': '2026-12-15',
      'Gases': '2026-12-15',
      'PC': '2026-12-31',
      'SOAP': '2027-03-31',
      'Carnes': '2026-11-15',
      'Frío': 'Sí',
      'N° Motor': 'VOLVO-7654',
      'N° Chasis': 'YV2-8899',
      'CC': 7200,
      'Carga Estanque': '250 L',
      'Carga/Peso': '12.000 kg',
      'Estado 2': 'Operativo',
      'Resolución': 'Res-5678',
      'Tipo 2': 'Furgón',
      'P. Laterales': '1',
      'GPS': 'Instalado',
      'Operación': 'Regiones',
      'Aseguradora': 'Mapfre',
      'Región': 'Valparaíso',
      'TCT': 'TCT-5544',
      'Copia TCT': 'Sí',
      'NEO TAC': 'Activo',
      'Cap. Pallet': 16,
      'Última Certificación': '2026-09-20',
      'Fecha Último Lavado': '2026-10-17'
    }
  ];

  exportTemplate(columns, sampleRows, 'Plantilla_Carga_Masiva_Flota.xlsx', 'Flota');
};

/**
 * Plantilla 2: Carga Masiva de Certificaciones de Lavado (FleetWashes)
 */
export const downloadFleetWashesCertTemplate = () => {
  const columns = ['N° Interno', 'Ultima certificación'];
  const sampleRows = [
    { 'N° Interno': 'C200', 'Ultima certificación': '15/10/2026' },
    { 'N° Interno': 'C201', 'Ultima certificación': '18/10/2026' },
    { 'N° Interno': 'C-202', 'Ultima certificación': '20/10/2026' },
    { 'N° Interno': 'T 1365', 'Ultima certificación': '12/10/2026' }
  ];
  exportTemplate(columns, sampleRows, 'Plantilla_Carga_Certificaciones.xlsx', 'Certificaciones');
};

/**
 * Plantilla 3: Cargar Archivo de Lavados (FleetWashes)
 */
export const downloadFleetWashesRecordsTemplate = () => {
  const columns = ['Código de camión', 'Creado', 'Patente de camión', 'Servicio'];
  const sampleRows = [
    { 'Código de camión': 'C 200', 'Creado': '19-10-2026 12:15', 'Patente de camión': 'ABCD12', 'Servicio': 'Limpieza Externa' },
    { 'Código de camión': 'C-201', 'Creado': '19-10-2026 14:30', 'Patente de camión': 'WXYZ34', 'Servicio': 'Limpieza Interna, Sanitización' },
    { 'Código de camión': 'T 1365', 'Creado': '19-10-2026 16:45', 'Patente de camión': 'KJTR88', 'Servicio': 'Deshielo' }
  ];
  exportTemplate(columns, sampleRows, 'Plantilla_Carga_Lavados.xlsx', 'Lavados');
};

/**
 * Plantilla 4: Carga Masiva de Dotación (AddStaff / ManageStaff)
 */
export const downloadStaffBulkTemplate = () => {
  const columns = ['RUT', 'Conductor/Auxiliar', 'Cargo', 'Tipo Dotación', 'Empresa Externa', 'Teléfono Celular', 'Estado'];
  const sampleRows = [
    {
      'RUT': '12.345.678-9',
      'Conductor/Auxiliar': 'JUAN PÉREZ GONZÁLEZ',
      'Cargo': 'Conductor A4',
      'Tipo Dotación': 'Propia',
      'Empresa Externa': '',
      'Teléfono Celular': '+56 9 9876 5432',
      'Estado': 'Activo'
    },
    {
      'RUT': '16.789.012-3',
      'Conductor/Auxiliar': 'CARLOS SILVA MUÑOZ',
      'Cargo': 'Auxiliar',
      'Tipo Dotación': 'Externo',
      'Empresa Externa': 'Servicios Integrales Logísticos SPA',
      'Teléfono Celular': '+56 9 8765 4321',
      'Estado': 'Activo'
    },
    {
      'RUT': '18.456.789-K',
      'Conductor/Auxiliar': 'RODRIGO VENEGAS SOTO',
      'Cargo': 'Conductor A5',
      'Tipo Dotación': 'Propia',
      'Empresa Externa': '',
      'Teléfono Celular': '+56 9 7654 3210',
      'Estado': 'Activo'
    }
  ];
  exportTemplate(columns, sampleRows, 'Plantilla_Carga_Masiva_Dotacion.xlsx', 'Dotacion');
};

/**
 * Plantilla 5: Creación Masiva de Nuevos Vehículos (AddFleet)
 */
export const downloadFleetNewTemplate = (category = 'Camiones') => {
  const columns = ['Patente', 'N° Interno', 'Tipo', 'Tipo de Flota', 'Empresa Externa', 'Marca', 'Modelo', 'Año', 'Estado', 'Región', 'RT', 'Gases', 'PC', 'SOAP', 'Carnes'];
  const sampleRows = [
    {
      'Patente': 'GH-JK-12',
      'N° Interno': 'C300',
      'Tipo': category,
      'Tipo de Flota': 'Propia',
      'Empresa Externa': '',
      'Marca': 'Mercedes Benz',
      'Modelo': 'Atego 1726',
      'Año': 2025,
      'Estado': 'Activo',
      'Región': 'Metropolitana',
      'RT': '2027-01-31',
      'Gases': '2027-01-31',
      'PC': '2027-03-31',
      'SOAP': '2027-03-31',
      'Carnes': '2026-12-31'
    },
    {
      'Patente': 'KL-MN-34',
      'N° Interno': 'EXT-202',
      'Tipo': category,
      'Tipo de Flota': 'Externa',
      'Empresa Externa': 'Transportes Rent a Truck SPA',
      'Marca': 'Scania',
      'Modelo': 'R450',
      'Año': 2024,
      'Estado': 'Activo',
      'Región': 'Metropolitana',
      'RT': '2027-03-15',
      'Gases': '2027-03-15',
      'PC': '2027-03-31',
      'SOAP': '2027-03-31',
      'Carnes': '2026-11-30'
    }
  ];
  exportTemplate(columns, sampleRows, `Plantilla_Creacion_${category.replace(/\s+/g, '_')}.xlsx`, category);
};

/**
 * Utilidades para normalizar y cruzar identificadores de vehículos (N° Interno y Patente)
 * Reconoce formatos flexibles como: C200, C-200, C 200, c-200, C.200, etc.
 */

export const normalizeVehicleCode = (str) => {
  if (!str) return '';
  return String(str)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
};

/**
 * Busca un vehículo en la lista de flota relacionando N° Interno o Patente
 * con soporte para formatos como C200, C-200, C 200, etc.
 * 
 * @param {string|number} rawCode - Código o N° Interno proveniente del archivo
 * @param {string} [rawPlate] - Patente opcional proveniente del archivo
 * @param {Array} fleetList - Lista de vehículos de la flota
 * @returns {Object|null} Vehículo coincidente o null
 */
export const matchVehicleByCode = (rawCode, rawPlate = '', fleetList = []) => {
  if (!fleetList || !Array.isArray(fleetList) || fleetList.length === 0) return null;

  const cleanCode = normalizeVehicleCode(rawCode);
  const cleanPlate = normalizeVehicleCode(rawPlate);

  if (!cleanCode && !cleanPlate) return null;

  // 1. Coincidencia directa normalizada por N° Interno (ej: "C-200" o "C 200" coincide con "C200")
  if (cleanCode) {
    const directInternal = fleetList.find(f => 
      normalizeVehicleCode(f.internal_number) === cleanCode
    );
    if (directInternal) return directInternal;
  }

  // 2. Coincidencia directa normalizada por Patente
  if (cleanPlate) {
    const directPlate = fleetList.find(f => 
      normalizeVehicleCode(f.plate) === cleanPlate
    );
    if (directPlate) return directPlate;
  }

  // 3. El código ingresado en el archivo coincide con la Patente de un vehículo
  if (cleanCode) {
    const codeAsPlate = fleetList.find(f => 
      normalizeVehicleCode(f.plate) === cleanCode
    );
    if (codeAsPlate) return codeAsPlate;
  }

  // 4. La patente ingresada en el archivo coincide con el N° Interno
  if (cleanPlate) {
    const plateAsInternal = fleetList.find(f => 
      normalizeVehicleCode(f.internal_number) === cleanPlate
    );
    if (plateAsInternal) return plateAsInternal;
  }

  // 5. Comparación con manejo de ceros iniciales o sin prefijo de letra si es unívoco (ej: C0200 vs C200)
  if (cleanCode) {
    const codeLetters = cleanCode.replace(/[0-9]/g, '');
    const codeDigits = cleanCode.replace(/[^0-9]/g, '');

    if (codeDigits) {
      const codeNum = parseInt(codeDigits, 10);
      const candidates = fleetList.filter(f => {
        const fNorm = normalizeVehicleCode(f.internal_number);
        const fLetters = fNorm.replace(/[0-9]/g, '');
        const fDigits = fNorm.replace(/[^0-9]/g, '');

        if (!fDigits) return false;
        if (parseInt(fDigits, 10) !== codeNum) return false;

        // Si ambos tienen letras, deben ser iguales (ej. C200 no debe asociarse con T200)
        if (codeLetters && fLetters) {
          return codeLetters === fLetters;
        }
        return true;
      });

      if (candidates.length === 1) {
        return candidates[0];
      }
    }
  }

  return null;
};

import re

with open('src/components/FleetDashboard.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Imports
content = content.replace("import { Download } from 'lucide-react';", "import { Download, ChevronDown } from 'lucide-react';")

# MultiSelect Component
multi_select = """
const MultiSelectDropdown = ({ options, selectedValues, onChange, placeholder }) => {
  const [isOpen, React_useState] = React.useState(false);
  return (
    <div className="relative flex-1 min-w-[150px]">
      <div onClick={() => React_useState(!isOpen)} className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 cursor-pointer">
        <span className="truncate">{selectedValues.length === 0 ? placeholder : `${selectedValues.length} seleccionados`}</span>
        <ChevronDown size={16} />
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-auto">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="checkbox" checked={selectedValues.includes(opt)} onChange={(e) => {
                if (e.target.checked) onChange([...selectedValues, opt]);
                else onChange(selectedValues.filter(v => v !== opt));
              }} className="rounded text-blue-600 focus:ring-blue-500"/>
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
"""

content = content.replace("export default function FleetDashboard() {", multi_select + "\nexport default function FleetDashboard() {")

# State
content = content.replace("const [typeFilter, setTypeFilter] = useState('Todos');\n  const [regionFilter, setRegionFilter] = useState('Todas');", "const [typeFilter, setTypeFilter] = useState([]);\n  const [regionFilter, setRegionFilter] = useState([]);\n  const [frioFilter, setFrioFilter] = useState([]);")

# Frio Options
content = content.replace("const regions = useMemo(() => {", "const frios = useMemo(() => {\n    const fSet = new Set(fleetList.map(f => f.type2).filter(Boolean));\n    return Array.from(fSet).sort();\n  }, [fleetList]);\n\n  const regions = useMemo(() => {")

# Filtering logic
old_filter = """if (typeFilter !== 'Todos' && f.dashboardCategory !== typeFilter) return false;
      if (regionFilter !== 'Todas' && f.region !== regionFilter) return false;"""
new_filter = """if (typeFilter.length > 0 && !typeFilter.includes(f.dashboardCategory)) return false;
      if (regionFilter.length > 0 && !regionFilter.includes(f.region)) return false;
      if (frioFilter.length > 0 && !frioFilter.includes(f.type2)) return false;"""
content = content.replace(old_filter, new_filter)

# Dropdowns in UI
old_ui = """<Select 
            value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            options={[{ value: 'Todos', label: 'Tipo de camión' }, { value: 'Camiones/Camionetas', label: 'Camiones/Camionetas' }, { value: 'Tractos', label: 'Tractos' }, { value: 'Semiremolques', label: 'Semiremolques' }]}
          />
          <Select 
            value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
            options={regions.map(r => ({ value: r, label: r === 'Todas' ? 'Ubicación de camión' : r }))}
          />"""

new_ui = """<MultiSelectDropdown 
            options={['Camiones/Camionetas', 'Tractos', 'Semiremolques']} 
            selectedValues={typeFilter} 
            onChange={setTypeFilter} 
            placeholder="Tipo de camión" 
          />
          <MultiSelectDropdown 
            options={regions.filter(r => r !== 'Todas')} 
            selectedValues={regionFilter} 
            onChange={setRegionFilter} 
            placeholder="Ubicación de camión" 
          />
          <MultiSelectDropdown 
            options={frios} 
            selectedValues={frioFilter} 
            onChange={setFrioFilter} 
            placeholder="Sistema de frio" 
          />"""
          
content = re.sub(r'<Select \s*value=\{typeFilter\}[^>]+>\s*</Select>\s*<Select \s*value=\{regionFilter\}[^>]+>\s*</Select>', new_ui, content, flags=re.MULTILINE|re.DOTALL)
content = content.replace('<Select \n            value={typeFilter} onChange={e => setTypeFilter(e.target.value)}\n            options={[{ value: \'Todos\', label: \'Tipo de camión\' }, { value: \'Camiones/Camionetas\', label: \'Camiones/Camionetas\' }, { value: \'Tractos\', label: \'Tractos\' }, { value: \'Semiremolques\', label: \'Semiremolques\' }]}\n          />\n          <Select \n            value={regionFilter} onChange={e => setRegionFilter(e.target.value)}\n            options={regions.map(r => ({ value: r, label: r === \'Todas\' ? \'Ubicación de camión\' : r }))}\n          />', new_ui)

# Just in case of different encoding or small differences, doing string replace:
content = content.replace("options={[{ value: 'Todos', label: 'Tipo de cami\\xc3\\xb3n' }", "options={[{ value: 'Todos', label: 'Tipo de camión' }")


with open('src/components/FleetDashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

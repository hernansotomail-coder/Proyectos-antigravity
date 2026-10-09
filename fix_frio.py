with open('src/components/FleetDashboard.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Fix the dependency array just in case my one-liner failed or I need to be sure
c = c.replace('}, [categorized, typeFilter, regionFilter, searchFilter]);', '}, [categorized, typeFilter, regionFilter, searchFilter, frioFilter]);')

# Fix the frioFilter logic
old_frio_logic = "if (frioFilter.length > 0 && !frioFilter.includes(f.type2)) return false;"
new_frio_logic = "if (frioFilter.length > 0 && !frioFilter.includes(f.type2 || 'N/A')) return false;"
c = c.replace(old_frio_logic, new_frio_logic)

# Also ensure "N/A" is in the dropdown if there are null values!
old_frios = """const frios = useMemo(() => {
    const fSet = new Set(fleetList.map(f => f.type2).filter(Boolean));
    return Array.from(fSet).sort();
  }, [fleetList]);"""
new_frios = """const frios = useMemo(() => {
    const fSet = new Set(fleetList.map(f => f.type2 || 'N/A'));
    return Array.from(fSet).sort();
  }, [fleetList]);"""
c = c.replace(old_frios, new_frios)

with open('src/components/FleetDashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(c)

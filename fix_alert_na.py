with open('src/components/FleetDashboard.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    "if (activeCard === 'rt' && f.rtStatus === 'green') return false;",
    "if (activeCard === 'rt' && (f.rtStatus === 'green' || f.rtStatus === 'N/A')) return false;"
)
c = c.replace(
    "if (activeCard === 'gases' && f.gasesStatus === 'green') return false;",
    "if (activeCard === 'gases' && (f.gasesStatus === 'green' || f.gasesStatus === 'N/A')) return false;"
)
c = c.replace(
    "if (activeCard === 'pc' && f.pcStatus === 'green') return false;",
    "if (activeCard === 'pc' && (f.pcStatus === 'green' || f.pcStatus === 'N/A')) return false;"
)
c = c.replace(
    "if (activeCard === 'soap' && f.soapStatus === 'green') return false;",
    "if (activeCard === 'soap' && (f.soapStatus === 'green' || f.soapStatus === 'N/A')) return false;"
)
c = c.replace(
    "if (activeCard === 'carnes' && f.carnesStatus === 'green') return false;",
    "if (activeCard === 'carnes' && (f.carnesStatus === 'green' || f.carnesStatus === 'N/A')) return false;"
)

with open('src/components/FleetDashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(c)

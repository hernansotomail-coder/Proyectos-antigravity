import re

with open('src/components/Layout.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('const transporteItems = [', 'let transporteItems = [')
content = content.replace('const administracionItems = [', 'let administracionItems = [')

new_logic = """  if (user?.role === 'Administrador') {
    administracionItems.push({ name: 'Usuarios', path: '/users', icon: Key });
  } else if (user?.role === 'Visualizador') {
    transporteItems = transporteItems.filter(i => i.name === 'Dashboard Flota');
    administracionItems = administracionItems.filter(i => i.name === 'Dashboard');
  }"""

content = re.sub(r'  if \(user\?\.role === \'Administrador\'\) \{\n    administracionItems\.push\(\{ name: \'Usuarios\', path: \'/users\', icon: Key \}\);\n  \}', new_logic, content)

content = re.sub(r'(\{/\* Men[^\n]+ Planificaci[^\n]+ \*/\})\s*<NavLink', r'\1\n          {user?.role !== \'Visualizador\' && (\n            <NavLink', content)
content = re.sub(r'(<span>Planificaci[^\n]+</span>\s*</NavLink>)', r'\1\n          )}', content)

content = re.sub(r'(<NavLink\n\s*to="/planning")', r'{user?.role !== \'Visualizador\' && (\n            \1', content)

with open('src/components/Layout.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

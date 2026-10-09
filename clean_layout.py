import re
with open('src/components/Layout.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = re.sub(r'(\{user\?\.role !== \'Visualizador\' && \(\n\s*)+\<NavLink', r'{user?.role !== \'Visualizador\' && (\n            <NavLink', c)
c = re.sub(r'(<span>Planificaci.n</span>\s*</NavLink>\n\s*\)\}\n\s*)+\}\)', r'<span>Planificación</span>\n          </NavLink>\n          )}', c)

# Mobile menu
c = re.sub(r'(\{user\?\.role !== \'Visualizador\' && \(\n\s*)+\{user\?\.role !== \'Visualizador\' && \(\n\s*<NavLink', r'{user?.role !== \'Visualizador\' && (\n            <NavLink', c)

with open('src/components/Layout.jsx', 'w', encoding='utf-8') as f:
    f.write(c)

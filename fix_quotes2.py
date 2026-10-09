with open('src/components/Layout.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(r"\'", "'")

with open('src/components/Layout.jsx', 'w', encoding='utf-8') as f:
    f.write(c)

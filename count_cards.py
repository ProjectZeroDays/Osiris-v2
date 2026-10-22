import re
with open('src/config/security-tools.ts') as f:
    content = f.read()
lines = content.splitlines()
start = next(i for i,l in enumerate(lines) if 'SECURITY_TOOL_CARDS' in l)
section = '\n'.join(lines[start:start+120])
ids_sec = re.findall(r'id: "([a-z0-9-]+)"', section)
print('Count:', len(ids_sec))
for i in ids_sec: print(i)

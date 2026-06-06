from pathlib import Path
p = Path('ui.js')
text = p.read_text(encoding='utf-8')
marker = '/**\n * Refresh user profile header\n */\n'
idx = text.find(marker)
if idx == -1:
    raise SystemExit('marker not found')
p.write_text(text[:idx] + marker + 'export async function refreshUserProfileHeader() { return; }\n', encoding='utf-8')
print('ok')

from pathlib import Path

path = Path('lib/chat/supabase-direct-chat.ts')
text = path.read_text()

old_import = "import * as Crypto from 'expo-crypto';\n\nimport { supabase } from '@/lib/supabase/client';"
new_import = "import * as Crypto from 'expo-crypto';\nimport { File } from 'expo-file-system';\n\nimport { supabase } from '@/lib/supabase/client';"
if old_import not in text:
    raise SystemExit('import block not found')
text = text.replace(old_import, new_import, 1)

old_reader = """async function localUriToArrayBuffer(uri: string) {\n  const response = await fetch(uri);\n  if (!response.ok && response.status !== 0) throw new Error('file_read_failed');\n  return response.arrayBuffer();\n}\n"""
new_reader = """async function localUriToArrayBuffer(uri: string) {\n  try {\n    return await new File(uri).arrayBuffer();\n  } catch (fileError) {\n    try {\n      const response = await fetch(uri);\n      if (!response.ok && response.status !== 0) throw new Error('file_read_failed');\n      return await response.arrayBuffer();\n    } catch {\n      throw fileError instanceof Error ? fileError : new Error('file_read_failed');\n    }\n  }\n}\n"""
if old_reader not in text:
    raise SystemExit('reader block not found')
text = text.replace(old_reader, new_reader, 1)
path.write_text(text)

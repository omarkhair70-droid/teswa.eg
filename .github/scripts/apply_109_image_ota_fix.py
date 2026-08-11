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

channel = Path('lib/chat/native-direct-channel.ts')
channel_text = channel.read_text()
old_typing = """      const byId = new Map(result.messages.map((message) => [message.id, message]));\n      this.state.messages = await Promise.all(result.messages.map((message) => this.mapMessage(message, byId)));\n      this.updateReadState(result.messages);\n"""
new_typing = """      const nativeMessages = result.messages as NativeDirectMessage[];\n      const byId = new Map<string, NativeDirectMessage>(nativeMessages.map((message: NativeDirectMessage) => [message.id, message]));\n      this.state.messages = await Promise.all(nativeMessages.map((message: NativeDirectMessage) => this.mapMessage(message, byId)));\n      this.updateReadState(nativeMessages);\n"""
if old_typing not in channel_text:
    raise SystemExit('native direct typing block not found')
channel.write_text(channel_text.replace(old_typing, new_typing, 1))

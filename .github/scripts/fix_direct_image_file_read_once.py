from pathlib import Path

chat = Path('lib/chat/supabase-direct-chat.ts')
text = chat.read_text()

old_import = "import * as Crypto from 'expo-crypto';\n\nimport { supabase } from '@/lib/supabase/client';"
new_import = "import * as Crypto from 'expo-crypto';\nimport { File } from 'expo-file-system';\n\nimport { supabase } from '@/lib/supabase/client';"
if old_import not in text:
    raise SystemExit('supabase chat import block not found')
text = text.replace(old_import, new_import, 1)

old_reader = """async function localUriToArrayBuffer(uri: string) {\n  const response = await fetch(uri);\n  if (!response.ok && response.status !== 0) throw new Error('file_read_failed');\n  return response.arrayBuffer();\n}\n"""
new_reader = """async function localUriToArrayBuffer(uri: string) {\n  try {\n    return await new File(uri).arrayBuffer();\n  } catch (fileError) {\n    try {\n      const response = await fetch(uri);\n      if (!response.ok && response.status !== 0) throw new Error('file_read_failed');\n      return await response.arrayBuffer();\n    } catch {\n      throw fileError instanceof Error ? fileError : new Error('file_read_failed');\n    }\n  }\n}\n"""
if old_reader not in text:
    raise SystemExit('localUriToArrayBuffer block not found')
text = text.replace(old_reader, new_reader, 1)
chat.write_text(text)

screen = Path('app/direct/[id].tsx')
screen_text = screen.read_text()
old_catch = "    } catch { showActionFeedbackToast('تعذر إرسال الميديا حالياً.'); }\n    finally { setMediaSending(false); setSending(false); }"
new_catch = "    } catch (sendError) {\n      const message = sendError instanceof Error && sendError.message.trim()\n        ? sendError.message\n        : 'تعذر إرسال الميديا حالياً.';\n      showActionFeedbackToast(message);\n    }\n    finally { setMediaSending(false); setSending(false); }"
if old_catch not in screen_text:
    raise SystemExit('direct media catch block not found')
screen_text = screen_text.replace(old_catch, new_catch, 1)
screen.write_text(screen_text)

from pathlib import Path

path = Path('app/offer/[id].tsx')
text = path.read_text()

old_import = "import { useCallback, useEffect, useMemo, useState } from 'react';"
new_import = "import { useCallback, useEffect, useState } from 'react';"
if old_import not in text:
    raise SystemExit('expected React import not found')
text = text.replace(old_import, new_import, 1)

old_block = """  const createdLabel = useMemo(() => {
    if (!offer.createdAt) return null;
    const date = new Date(offer.createdAt);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString('ar-EG');
  }, [offer.createdAt]);"""
new_block = """  const createdLabel = (() => {
    if (!offer.createdAt) return null;
    const date = new Date(offer.createdAt);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString('ar-EG');
  })();"""
if old_block not in text:
    raise SystemExit('expected createdLabel hook block not found')
text = text.replace(old_block, new_block, 1)

path.write_text(text)

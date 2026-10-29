import type { Terminal } from '@xterm/xterm'

export function terminalVoiceInputReady(
  terminal: Pick<Terminal, 'buffer' | 'modes' | 'rows'>
): boolean {
  if (!terminal.modes.bracketedPasteMode) {
    return false
  }
  const buffer = terminal.buffer.active
  const row = buffer.baseY + buffer.cursorY
  const line = buffer.getLine(row)
  if (!line || !/^\s*›\s*$/.test(line.translateToString(false, 0, buffer.cursorX))) {
    return false
  }
  let inputEnd = buffer.baseY + terminal.rows
  for (let y = inputEnd - 1; y > row + 1; y--) {
    if (/^\s*\?\s/.test(buffer.getLine(y)?.translateToString(true) ?? '')) {
      const footer = buffer
        .getLine(y - 1)
        ?.translateToString(true)
        .trim()
      if (footer && y > row + 2) {
        inputEnd = y - 1
      } else if (buffer.type === 'normal') {
        inputEnd = y
      }
      break
    }
  }
  if (buffer.type === 'alternate' && inputEnd === buffer.baseY + terminal.rows) {
    return false
  }
  for (let y = row; y < inputEnd; y++) {
    const current = buffer.getLine(y)
    if (!current) {
      continue
    }
    for (let x = y === row ? buffer.cursorX : 0; x < current.length; x++) {
      const cell = current.getCell(x)
      if (cell?.getChars().trim() && !cell.isDim()) {
        return false
      }
    }
  }
  return true
}

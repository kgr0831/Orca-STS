import { Terminal } from '@xterm/headless'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { terminalVoiceInputReady } from './terminal-voice-input-ready'

const terminals: Terminal[] = []
afterEach(() => terminals.splice(0).forEach((terminal) => terminal.dispose()))

async function screen(input = '') {
  const terminal = new Terminal({ cols: 80, rows: 12, allowProposedApi: true })
  terminals.push(terminal)
  await new Promise<void>((resolve) =>
    terminal.write(
      `\x1b[?2004h\x1b[?1049h\x1b[7;1H› ${input}\x1b[10;1H\x1b[2mModel · folder\x1b[11;1H? for shortcuts\x1b[0m\x1b[7;3H`,
      resolve
    )
  )
  return terminal
}

it('accepts the empty Codex composer and dim placeholders', async () => {
  expect(terminalVoiceInputReady(await screen())).toBe(true)
  expect(terminalVoiceInputReady(await screen('\x1b[2mExplain this code\x1b[0m'))).toBe(true)
})

it('does not overwrite a draft even when the cursor is at its beginning', async () => {
  expect(terminalVoiceInputReady(await screen('Unsent text'))).toBe(false)
  expect(terminalVoiceInputReady(await screen('\r\n  Second line'))).toBe(false)
})

it('refuses shell input and approval selectors', async () => {
  const terminal = await screen()
  await new Promise<void>((resolve) => terminal.write('\x1b[?2004l', resolve))
  expect(terminalVoiceInputReady(terminal)).toBe(false)
  await new Promise<void>((resolve) =>
    terminal.write('\x1b[?2004h\x1b[7;1H\x1b[2K1. Approve\x1b[7;1H', resolve)
  )
  expect(terminalVoiceInputReady(terminal)).toBe(false)
})

it.each(['codex-fullscreen-startup', 'codex-fullscreen-custom-footer'])(
  'recognizes the empty composer in the captured %s frames',
  async (fixture) => {
    const terminal = new Terminal({ cols: 120, rows: 40, allowProposedApi: true })
    terminals.push(terminal)
    const data = readFileSync(
      new URL(`../../../../main/runtime/__fixtures__/${fixture}.txt`, import.meta.url),
      'utf8'
    )
    let ready = false
    for (const frame of data.split('\x1b[?2026l')) {
      await new Promise<void>((resolve) => terminal.write(`${frame}\x1b[?2026l`, resolve))
      ready ||= terminalVoiceInputReady(terminal)
    }
    expect(ready).toBe(true)
  }
)

// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type {
  ElevenLabsAudioChunk,
  ElevenLabsSpeechRequest,
  VoiceSettings
} from '../../../../shared/speech-types'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { useNativeChatVoicePlayback } from './use-native-chat-voice-playback'

class Source {
  buffer: { duration: number } | null = null
  onended: (() => void) | null = null
  connect = vi.fn()
  disconnect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class Context {
  static instances: Context[] = []
  state = 'suspended'
  currentTime = 1
  destination = {}
  sources: Source[] = []
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  suspend = vi.fn(async () => {
    this.state = 'suspended'
  })
  close = vi.fn(async () => {
    this.state = 'closed'
  })
  constructor() {
    Context.instances.push(this)
  }
  createBuffer(_channels: number, count: number, rate: number) {
    return { duration: count / rate, getChannelData: () => new Float32Array(count) }
  }
  createBufferSource() {
    const source = new Source()
    this.sources.push(source)
    return source
  }
}

let emit = (_chunk: ElevenLabsAudioChunk) => {}
let voicesChanged = () => {}
let voices = [{ lang: 'en-US', localService: true, voiceURI: 'first' }]
const stream = vi.fn(async (request: ElevenLabsSpeechRequest) => {
  emit({ requestId: request.requestId, bytes: new Uint8Array([0, 1, 0, 2]) })
})
const settings: VoiceSettings = {
  enabled: true,
  sttModel: 'elevenlabs-scribe-v2-realtime',
  modelsDir: '',
  language: 'en',
  dictationMode: 'toggle',
  terminalConfirmBeforeInsert: true,
  userModels: [],
  openAiApiKeyConfigured: false,
  microphoneDeviceId: null,
  microphoneDeviceLabel: null,
  ttsProvider: 'elevenlabs',
  elevenLabsApiKeyConfigured: true,
  elevenLabsVoiceId: 'voice'
}

function message(id: string, text: string): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    source: 'transcript',
    timestamp: 1,
    blocks: [{ type: 'text', text }]
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  Context.instances = []
  voices = [{ lang: 'en-US', localService: true, voiceURI: 'first' }]
  vi.stubGlobal('AudioContext', Context)
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => voices,
    addEventListener: (_name: string, listener: () => void) => {
      voicesChanged = listener
    },
    removeEventListener: vi.fn()
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      speech: {
        synthesizeElevenLabs: vi.fn(),
        streamElevenLabs: stream,
        onElevenLabsAudio: (listener: typeof emit) => {
          emit = listener
          return () => {}
        },
        cancelElevenLabs: vi.fn(async () => {})
      }
    }
  })
})
afterEach(() => vi.unstubAllGlobals())

async function setup() {
  const old = message('old', 'Old history.')
  const initial: { messages: NativeChatMessage[]; enabled: boolean } = {
    messages: [old],
    enabled: false
  }
  const hook = renderHook(
    ({ messages, enabled }) => useNativeChatVoicePlayback(messages, false, enabled, settings),
    { initialProps: initial }
  )
  await act(async () => {
    await hook.result.current.prepare()
  })
  hook.rerender({ messages: [old], enabled: true })
  expect(stream).not.toHaveBeenCalled()
  await act(async () => {
    hook.rerender({
      messages: [old, message('new', 'First sentence. Second sentence.')],
      enabled: true
    })
  })
  return hook
}

it('reuses the audio context opened by Start and survives unrelated installed-voice changes', async () => {
  const hook = await setup()
  expect(stream).toHaveBeenCalledOnce()
  const context = Context.instances[0]
  act(() => {
    voices = [{ lang: 'en-US', localService: true, voiceURI: 'new-installed-voice' }]
    voicesChanged()
  })
  expect(context.sources[0].stop).not.toHaveBeenCalled()
  expect(hook.result.current.speaking).toBe(true)
  await act(async () => {
    context.sources[0].onended?.()
  })
  expect(stream).toHaveBeenCalledTimes(2)
  expect(stream.mock.lastCall?.[0].text).toBe('Second sentence.')
  expect(Context.instances).toHaveLength(1)
  expect(context.close).not.toHaveBeenCalled()
  hook.unmount()
  expect(context.close).toHaveBeenCalledOnce()
})

it('pauses and resumes queued PCM for an acknowledgment, then cancels it on a real interruption', async () => {
  const hook = await setup()
  const context = Context.instances[0]
  await act(async () => {
    hook.result.current.hold(true)
  })
  expect(context.suspend).toHaveBeenCalledOnce()
  expect(context.sources[0].stop).not.toHaveBeenCalled()
  await act(async () => {
    hook.result.current.hold(false)
  })
  expect(context.state).toBe('running')
  expect(stream).toHaveBeenCalledOnce()
  act(() => hook.result.current.stop())
  expect(context.sources[0].stop).toHaveBeenCalledOnce()
  expect(hook.result.current.speaking).toBe(false)
  hook.unmount()
})

it('recovers playback for the next spoken turn after a stream failure', async () => {
  stream.mockRejectedValueOnce(new Error('elevenlabs_connection_failed'))
  const hook = await setup()
  expect(hook.result.current.error).toBe(true)
  await act(async () => {
    hook.result.current.restart()
  })
  await act(async () => {
    hook.rerender({ messages: [message('next', 'Recovered reply.')], enabled: true })
  })
  expect(hook.result.current.error).toBe(false)
  expect(hook.result.current.speaking).toBe(true)
  expect(stream.mock.lastCall?.[0].text).toBe('Recovered reply.')
  hook.unmount()
})

it('releases active playback if audio preparation fails after a reply has started', async () => {
  const hook = await setup()
  const context = Context.instances[0]
  context.resume.mockRejectedValueOnce(new Error('audio unavailable'))
  await act(async () => {
    await hook.result.current.prepare()
  })
  expect(context.sources[0].stop).toHaveBeenCalledOnce()
  expect(context.close).toHaveBeenCalledOnce()
  expect(hook.result.current.speaking).toBe(false)
  expect(hook.result.current.error).toBe(true)
  hook.unmount()
})

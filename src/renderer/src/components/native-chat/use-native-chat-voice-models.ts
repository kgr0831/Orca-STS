import { useCallback, useEffect, useRef, useState } from 'react'
import type { StsTurnModelAsset } from '../../../../shared/sts-turn-models'
import { StsLocalModelClient } from './sts-local-model-client'

export function useNativeChatVoiceModels() {
  const [preparing, setPreparing] = useState(false)
  const generation = useRef(0)
  const client = useRef<StsLocalModelClient | null>(null)
  const close = useCallback(() => {
    ++generation.current
    client.current?.close()
    client.current = null
    setPreparing(false)
  }, [])

  useEffect(
    () => () => {
      ++generation.current
      client.current?.close()
      client.current = null
    },
    []
  )

  const start = async (load?: () => Promise<StsTurnModelAsset[]>) => {
    close()
    const run = generation.current
    const next = new StsLocalModelClient()
    client.current = next
    setPreparing(true)
    try {
      if (!load) {
        throw new Error('local_turn_models_unsupported')
      }
      await next.start(load)
      if (run !== generation.current) {
        return 'canceled'
      }
      setPreparing(false)
      return 'ready'
    } catch {
      if (run !== generation.current) {
        return 'canceled'
      }
      close()
      return 'failed'
    }
  }

  const resetAudio = useCallback(() => client.current?.resetAudio(), [])
  const predict = useCallback(
    (text: string, output: string, final: boolean) =>
      client.current?.predict(text, output, final) ??
      Promise.reject(new Error('turn_model_unavailable')),
    []
  )

  return {
    preparing,
    start,
    close,
    feed: (samples: Float32Array, rate: number) => client.current?.feed(samples, rate),
    resetAudio,
    predict
  }
}

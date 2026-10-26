export async function resumeSpeechAudioContext(context: AudioContext): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      context.resume(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('speech_audio_start_timeout')), 3_000)
      })
    ])
    if (context.state === 'closed' || context.state === 'suspended') {
      throw new Error('speech_audio_unavailable')
    }
  } finally {
    clearTimeout(timer)
  }
}

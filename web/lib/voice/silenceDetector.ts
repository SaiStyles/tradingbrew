export interface SilenceDetectorOptions {
  silenceThresholdDb: number  // e.g. -50 — RMS dB below which = silence
  silenceDurationMs: number   // e.g. 1500 — how long silence must persist before triggering
  onSilenceDetected: () => void
  onSpeechDetected: () => void
}

export class SilenceDetector {
  private analyser: AnalyserNode
  private dataArray: Float32Array
  private silenceStart: number | null = null
  private rafId: number | null = null
  private isSpeechActive = false

  constructor(
    audioCtx: AudioContext,
    source: MediaStreamAudioSourceNode,
    private opts: SilenceDetectorOptions
  ) {
    this.analyser = audioCtx.createAnalyser()
    this.analyser.fftSize = 2048
    this.dataArray = new Float32Array(this.analyser.fftSize)
    source.connect(this.analyser)
    // NOT connected to destination — we don't want to hear ourselves
  }

  start() {
    let logTick = 0
    const tick = () => {
      this.analyser.getFloatTimeDomainData(this.dataArray)

      // RMS amplitude
      let sum = 0
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i] * this.dataArray[i]
      }
      const rms = Math.sqrt(sum / this.dataArray.length)
      const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity

      // Log every ~60 frames (~1s) so we can see mic levels in console
      logTick++
      if (logTick % 60 === 0) {
        console.log(`[vad] db: ${db.toFixed(1)} | threshold: ${this.opts.silenceThresholdDb} | speech: ${this.isSpeechActive}`)
      }

      const isSilent = db < this.opts.silenceThresholdDb

      if (!isSilent) {
        this.silenceStart = null
        if (!this.isSpeechActive) {
          this.isSpeechActive = true
          console.log('[vad] speech detected, db:', db.toFixed(1))
          this.opts.onSpeechDetected()
        }
      } else if (this.isSpeechActive) {
        if (this.silenceStart === null) {
          this.silenceStart = Date.now()
        } else if (Date.now() - this.silenceStart >= this.opts.silenceDurationMs) {
          this.isSpeechActive = false
          this.silenceStart = null
          console.log('[vad] silence detected — sending to Whisper')
          this.opts.onSilenceDetected()
        }
      }

      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    try { this.analyser.disconnect() } catch { /* already disconnected */ }
  }
}

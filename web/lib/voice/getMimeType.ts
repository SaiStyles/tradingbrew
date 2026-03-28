export function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ]
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

export function mimeToExtension(mime: string): string {
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mp4')) return 'mp4'
  return 'webm'
}

declare module 'heic-convert' {
  interface ConvertOptions {
    buffer: ArrayBuffer | ArrayBufferView
    format: 'JPEG' | 'PNG'
    quality: number
  }

  export default function convert(options: ConvertOptions): Promise<ArrayBuffer>
}

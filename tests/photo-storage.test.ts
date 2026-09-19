import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import sharp from 'sharp'
import { MAX_PHOTO_BYTES, uploadOrderPhoto } from '../lib/photo-upload.ts'
import { imageFormat, normalizePhoto, PhotoInputError } from '../lib/photo-storage.ts'

describe('photo normalization', () => {
  test('detects supported formats by content and normalizes to an oriented 2400px JPEG', async () => {
    const source = { create: { width: 3000, height: 1500, channels: 3 as const, background: '#447799' } }
    const fixtures = [
      await sharp(source).jpeg().toBuffer(),
      await sharp(source).png().toBuffer(),
      await sharp(source).webp().toBuffer(),
      await sharp(source).avif().toBuffer(),
    ]
    for (const bytes of fixtures) {
      assert.equal(imageFormat(bytes), 'native')
      const normalized = await normalizePhoto(bytes)
      const metadata = await sharp(normalized).metadata()
      assert.equal(metadata.format, 'jpeg')
      assert.ok((metadata.width ?? Infinity) <= 2400)
      assert.ok((metadata.height ?? Infinity) <= 2400)
    }

    const rotated = await sharp({
      create: { width: 40, height: 20, channels: 3, background: 'red' },
    }).withMetadata({ orientation: 6 }).jpeg().toBuffer()
    const metadata = await sharp(await normalizePhoto(rotated)).metadata()
    assert.equal(metadata.width, 20)
    assert.equal(metadata.height, 40)
    assert.equal(metadata.orientation, undefined)
  })

  test('routes HEIC/HEIF content through conversion before normalization', async () => {
    const heicSignature = Buffer.from('000000186674797068656963000000006d69663168656963', 'hex')
    const jpeg = await sharp({
      create: { width: 12, height: 8, channels: 3, background: 'green' },
    }).jpeg().toBuffer()
    let converted = false
    const normalized = await normalizePhoto(heicSignature, async ({ format, quality }) => {
      converted = true
      assert.equal(format, 'JPEG')
      assert.equal(quality, 1)
      return Uint8Array.from(jpeg).buffer
    })
    assert.equal(converted, true)
    assert.equal((await sharp(normalized).metadata()).format, 'jpeg')
  })

  test('rejects unsupported, corrupt, and oversized content', async () => {
    await assert.rejects(normalizePhoto(Buffer.from('<svg/>')), PhotoInputError)
    await assert.rejects(
      normalizePhoto(Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex')),
      PhotoInputError,
    )
    await assert.rejects(normalizePhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1)), (error: unknown) => {
      return error instanceof PhotoInputError && error.status === 413
    })
  })
})

describe('worker photo upload client', () => {
  test('sends only the worker token and kind, accepts iPhone MIME variants, and enforces the limit', async () => {
    const originalFetch = global.fetch
    const token = 'w'.repeat(32)
    const calls: Array<{ url: string; authorization: string | null }> = []
    try {
      global.fetch = async (input, init) => {
        const headers = new Headers(init?.headers)
        calls.push({ url: String(input), authorization: headers.get('authorization') })
        return Response.json({
          id: '11111111-1111-1111-1111-111111111111',
          kind: 'before',
          src: '/api/photos/11111111-1111-1111-1111-111111111111',
          alt: 'Фото до выполнения работы',
        }, { status: 201 })
      }
      for (const type of ['', 'application/octet-stream', 'image/x-heic', 'image/avif']) {
        await uploadOrderPhoto(new File(['image bytes'], 'iphone.heic', { type }), token, 'before')
      }
      assert.equal(calls.length, 4)
      assert.ok(calls.every((call) => call.url === '/api/photos?kind=before'))
      assert.ok(calls.every((call) => call.authorization === `Bearer ${token}`))
      assert.ok(calls.every((call) => !call.url.includes(token)))

      await assert.rejects(
        uploadOrderPhoto({ size: MAX_PHOTO_BYTES + 1 } as File, token, 'after'),
        /Фото слишком большое/,
      )
      assert.equal(calls.length, 4)
    } finally {
      global.fetch = originalFetch
    }
  })
})

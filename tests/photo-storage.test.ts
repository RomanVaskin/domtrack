import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import sharp from 'sharp'
import {
  MAX_PHOTO_BYTES,
  photoUploadMessage,
  takeSelectedPhotoFiles,
  uploadOrderPhoto,
  uploadOrderPhotos,
  uploadChecklistPhoto,
} from '../lib/photo-upload.ts'
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
  test('snapshots every selected file before resetting the input', () => {
    const selected = [
      new File(['before one'], 'before-1.heic', { type: 'image/heic' }),
      new File(['before two'], 'before-2.jpg', { type: 'image/jpeg' }),
    ]
    let liveFiles = selected
    const input = {
      get files() { return liveFiles as unknown as FileList },
      get value() { return 'C:\\fakepath\\before-1.heic' },
      set value(value: string) {
        assert.equal(value, '')
        liveFiles = []
      },
    }

    assert.deepEqual(takeSelectedPhotoFiles(input), selected)
    assert.deepEqual(liveFiles, [])
  })

  test('posts before/after batches with the worker token and updates after every success', async () => {
    const originalFetch = global.fetch
    const token = 'w'.repeat(32)
    const calls: Array<{ url: string; authorization: string | null; body: BodyInit | null | undefined }> = []
    const uploaded: string[] = []
    try {
      global.fetch = async (input, init) => {
        const headers = new Headers(init?.headers)
        calls.push({ url: String(input), authorization: headers.get('authorization'), body: init?.body })
        const kind = String(input).endsWith('after') ? 'after' : 'before'
        const id = `${String(calls.length).padStart(8, '0')}-1111-1111-1111-111111111111`
        return Response.json({
          id,
          kind,
          src: `/api/photos/${id}`,
          alt: `Фото ${kind}`,
        }, { status: 201 })
      }

      const beforeFiles = ['', 'application/octet-stream', 'image/x-heic', 'image/avif']
        .map((type) => new File(['image bytes'], 'iphone.heic', { type }))
      const afterFiles = [new File(['after'], 'after.jpg', { type: 'image/jpeg' })]
      await uploadOrderPhotos(beforeFiles, token, 'before', (photo) => uploaded.push(photo.id))
      await uploadOrderPhotos(afterFiles, token, 'after', (photo) => uploaded.push(photo.id))

      assert.equal(calls.length, 5)
      assert.ok(calls.slice(0, 4).every((call) => call.url === '/api/photos?kind=before'))
      assert.equal(calls[4]?.url, '/api/photos?kind=after')
      assert.ok(calls.every((call) => call.authorization === `Bearer ${token}`))
      assert.ok(calls.every((call) => !call.url.includes(token)))
      assert.deepEqual(calls.map((call) => call.body), [...beforeFiles, ...afterFiles])
      assert.equal(uploaded.length, 5)

      const checklistFile = new File(['checklist'], 'checklist.heic', { type: 'image/heic' })
      global.fetch = async (input, init) => {
        const headers = new Headers(init?.headers)
        assert.equal(String(input), '/api/photos?checklist_item_id=42')
        assert.equal(headers.get('authorization'), `Bearer ${token}`)
        assert.equal(init?.body, checklistFile)
        return Response.json({
          id: '99999999-1111-1111-1111-111111111111',
          kind: 'checklist',
          checklistItemId: '42',
        }, { status: 201 })
      }
      assert.equal((await uploadChecklistPhoto(checklistFile, token, '42')).checklistItemId, '42')

      await assert.rejects(
        uploadOrderPhoto({ size: MAX_PHOTO_BYTES + 1 } as File, token, 'after'),
        /Фото слишком большое/,
      )
      assert.equal(calls.length, 5)
    } finally {
      global.fetch = originalFetch
    }
  })

  test('turns a failed upload into a short user-facing error', async () => {
    const originalFetch = global.fetch
    try {
      global.fetch = async () => new Response(null, { status: 500 })
      await assert.rejects(
        uploadOrderPhotos(
          [new File(['image'], 'photo.jpg', { type: 'image/jpeg' })],
          'w'.repeat(32),
          'before',
          () => assert.fail('failed uploads must not update the gallery'),
        ),
        (error: unknown) => photoUploadMessage(error) === 'Не удалось загрузить фото',
      )
      assert.equal(photoUploadMessage(new TypeError('Failed to fetch')), 'Не удалось загрузить фото')
    } finally {
      global.fetch = originalFetch
    }
  })
})

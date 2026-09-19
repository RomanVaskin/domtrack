import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { formatRequestedDate } from '../lib/format-requested-date.ts'

describe('formatRequestedDate', () => {
  test('returns a DD.MM.YYYY requested date without parsing it', () => {
    assert.equal(formatRequestedDate('21.09.2026'), '21.09.2026')
  })

  test('does not throw for an invalid date', () => {
    assert.equal(formatRequestedDate('not-a-date'), 'not-a-date')
  })
})

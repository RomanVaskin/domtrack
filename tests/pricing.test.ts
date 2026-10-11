import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculatePrice } from '../lib/pricing.ts'

test('supporting cleaning <=100 m2 -> 6900', () => {
  const result = calculatePrice('house_cleaning', { house_area: 90, cleaning_tier: 'supporting' })
  assert.deepEqual(result, { amount: 6900, fromAmount: null, requiresManualConfirmation: false })
})

test('supporting cleaning <=150 m2 -> 8900', () => {
  const result = calculatePrice('house_cleaning', { house_area: 140, cleaning_tier: 'supporting' })
  assert.equal(result.amount, 8900)
})

test('general cleaning <=100 m2 -> 10900', () => {
  const result = calculatePrice('house_cleaning', { house_area: 100, cleaning_tier: 'general' })
  assert.equal(result.amount, 10900)
})

test('general cleaning <=150 m2 -> 14900', () => {
  const result = calculatePrice('house_cleaning', { house_area: 150, cleaning_tier: 'general' })
  assert.equal(result.amount, 14900)
})

test('post-renovation cleaning <=100 m2 -> 14900', () => {
  const result = calculatePrice('house_cleaning', { house_area: 80, cleaning_tier: 'post_renovation' })
  assert.equal(result.amount, 14900)
})

test('post-renovation cleaning <=150 m2 -> 21900', () => {
  const result = calculatePrice('house_cleaning', { house_area: 150, cleaning_tier: 'post_renovation' })
  assert.equal(result.amount, 21900)
})

test('lawn mowing applies the minimum price for a small area', () => {
  const result = calculatePrice('lawn_mowing', { lawn_area: 100, collect_grass: false })
  // 100 m2 = 1 сотка * 700 = 700, below the 3500 minimum.
  assert.deepEqual(result, { amount: 3500, fromAmount: null, requiresManualConfirmation: false })
})

test('lawn mowing above the minimum uses the per-сотка rate, converting m2 to сотки', () => {
  const result = calculatePrice('lawn_mowing', { lawn_area: 1000, collect_grass: false })
  // 1000 m2 = 10 сотки * 700 = 7000
  assert.equal(result.amount, 7000)
})

test('lawn mowing grass collection adds a surcharge per сотка', () => {
  const result = calculatePrice('lawn_mowing', { lawn_area: 1000, collect_grass: true })
  // 10 сотки * 700 + 10 сотки * 300 = 10000
  assert.equal(result.amount, 10000)
})

test('snow removal applies the minimum price for a small area', () => {
  const result = calculatePrice('snow_removal', { snow_area: 10, urgent: false })
  // 10 m2 * 60 = 600, below the 4500 minimum.
  assert.deepEqual(result, { amount: 4500, fromAmount: null, requiresManualConfirmation: false })
})

test('snow removal above the minimum uses the per-m2 rate', () => {
  const result = calculatePrice('snow_removal', { snow_area: 100, urgent: false })
  assert.equal(result.amount, 6000)
})

test('urgent snow removal adds a 30% surcharge', () => {
  const result = calculatePrice('snow_removal', { snow_area: 100, urgent: true })
  assert.equal(result.amount, Math.round(6000 * 1.3))
})

test('handyman: 1 hour is billed at the 2-hour minimum', () => {
  const result = calculatePrice('handyman', { handyman_hours: 1 })
  assert.deepEqual(result, { amount: 3000, fromAmount: null, requiresManualConfirmation: false })
})

test('handyman: 2 hours', () => {
  const result = calculatePrice('handyman', { handyman_hours: 2 })
  assert.equal(result.amount, 3000)
})

test('handyman: 3 hours', () => {
  const result = calculatePrice('handyman', { handyman_hours: 3 })
  assert.equal(result.amount, 4500)
})

test('pool care: one-time service', () => {
  const result = calculatePrice('pool_care', { pool_type: 'one_time' })
  assert.deepEqual(result, { amount: 5900, fromAmount: null, requiresManualConfirmation: false })
})

test('pool care: winterization', () => {
  const result = calculatePrice('pool_care', { pool_type: 'winterization' })
  assert.deepEqual(result, { amount: 8900, fromAmount: null, requiresManualConfirmation: false })
})

test('pool care: de-winterization', () => {
  const result = calculatePrice('pool_care', { pool_type: 'de_winterization' })
  assert.deepEqual(result, { amount: 9900, fromAmount: null, requiresManualConfirmation: false })
})

test('pool care: regular service is manual, from-priced only', () => {
  const result = calculatePrice('pool_care', { pool_type: 'regular' })
  assert.deepEqual(result, { amount: null, fromAmount: 9900, requiresManualConfirmation: true })
})

test('house_prep: preliminary "from" price only, total_price stays null', () => {
  const result = calculatePrice('house_prep', {})
  assert.deepEqual(result, { amount: null, fromAmount: 9900, requiresManualConfirmation: true })
})

test('window_cleaning: fully manual, no preliminary price', () => {
  const result = calculatePrice('window_cleaning', { windows_count: 5, panoramic_windows: false })
  assert.deepEqual(result, { amount: null, fromAmount: null, requiresManualConfirmation: true })
})

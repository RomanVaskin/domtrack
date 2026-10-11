import type { OrderParameters, ServiceType } from '@/lib/telegram/types'

export interface PricingResult {
  /** Final, unambiguous price in rubles. Safe to write into orders.total_price. */
  amount: number | null
  /** Display-only preliminary "from" price (rubles), e.g. for house_prep. Never write this into orders.total_price. */
  fromAmount: number | null
  /** True when an admin must confirm/enter the final price manually. */
  requiresManualConfirmation: boolean
}

function houseCleaningTierPrice(
  tiers: [number, number][],
  area: number,
): number | null {
  for (const [maxArea, price] of tiers) {
    if (area <= maxArea) return price
  }
  return null
}

const SUPPORTING_TIERS: [number, number][] = [
  [100, 6900],
  [150, 8900],
  [200, 10900],
  [250, 12900],
]

const GENERAL_TIERS: [number, number][] = [
  [100, 10900],
  [150, 14900],
  [200, 18900],
  [250, 22900],
]

const POST_RENOVATION_TIERS: [number, number][] = [
  [100, 14900],
  [150, 21900],
  [200, 29900],
  [250, 36900],
]

function toNumber(value: OrderParameters[string] | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toBoolean(value: OrderParameters[string] | undefined): boolean {
  return value === true || value === 'true'
}

export function formatRubles(amount: number): string {
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`
}

export function formatPriceDisplay(
  serviceType: ServiceType,
  parameters: OrderParameters,
  totalPrice: number | null,
): string {
  if (totalPrice !== null) return `Стоимость: ${formatRubles(totalPrice)}`
  const pricing = calculatePrice(serviceType, parameters)
  if (pricing.fromAmount !== null) return `Предварительная стоимость: от ${formatRubles(pricing.fromAmount)}`
  return 'Стоимость будет подтверждена после уточнения объёма работ'
}

const manual: PricingResult = {
  amount: null,
  fromAmount: null,
  requiresManualConfirmation: true,
}

export function calculatePrice(
  serviceType: ServiceType,
  parameters: OrderParameters,
): PricingResult {
  switch (serviceType) {
    case 'house_cleaning': {
      const area = toNumber(parameters.house_area)
      const tier = parameters.cleaning_tier
      if (area === null || area > 250) return manual
      let tiers: [number, number][] | null = null
      if (tier === 'supporting') tiers = SUPPORTING_TIERS
      else if (tier === 'general') tiers = GENERAL_TIERS
      else if (tier === 'post_renovation') tiers = POST_RENOVATION_TIERS
      if (!tiers) return manual
      const amount = houseCleaningTierPrice(tiers, area)
      if (amount === null) return manual
      return { amount, fromAmount: null, requiresManualConfirmation: false }
    }

    case 'lawn_mowing': {
      const regime = parameters.lawn_regime
      if (regime === 'irregular' || regime === 'high_grass') return manual
      const areaM2 = toNumber(parameters.lawn_area)
      if (areaM2 === null || areaM2 <= 0) return manual
      const sotka = areaM2 / 100
      const collectGrass = toBoolean(parameters.collect_grass)
      let amount = Math.round(sotka * 700)
      if (collectGrass) amount += Math.round(sotka * 300)
      amount = Math.max(amount, 3500)
      return { amount, fromAmount: null, requiresManualConfirmation: false }
    }

    case 'snow_removal': {
      const areaM2 = toNumber(parameters.snow_area)
      if (areaM2 === null || areaM2 <= 0) return manual
      const urgent = toBoolean(parameters.urgent)
      let amount = Math.max(Math.round(areaM2 * 60), 4500)
      if (urgent) amount = Math.round(amount * 1.3)
      return { amount, fromAmount: null, requiresManualConfirmation: false }
    }

    case 'pool_care': {
      const poolType = parameters.pool_type
      if (poolType === 'one_time')
        return { amount: 5900, fromAmount: null, requiresManualConfirmation: false }
      if (poolType === 'winterization')
        return { amount: 8900, fromAmount: null, requiresManualConfirmation: false }
      if (poolType === 'de_winterization')
        return { amount: 9900, fromAmount: null, requiresManualConfirmation: false }
      // 'regular' and anything unset: from-price only, needs manual confirmation.
      return { amount: null, fromAmount: 9900, requiresManualConfirmation: true }
    }

    case 'handyman': {
      const hours = toNumber(parameters.handyman_hours)
      if (hours === null || hours <= 0) return manual
      const billedHours = Math.max(hours, 2)
      const amount = Math.round(billedHours * 1500)
      return { amount, fromAmount: null, requiresManualConfirmation: false }
    }

    case 'house_prep':
      return { amount: null, fromAmount: 9900, requiresManualConfirmation: true }

    // window_cleaning, furniture_cleaning, leaf_removal, roof snow removal (not a
    // separate service type yet), other: fully manual in this MVP.
    default:
      return manual
  }
}

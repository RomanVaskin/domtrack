import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { Hero } from '@/components/hero'
import { HowItWorks } from '@/components/how-it-works'
import { ServiceGrid } from '@/components/service-grid'
import { KeyScenario } from '@/components/key-scenario'
import { TrackerSection } from '@/components/tracker-section'
import { Benefits } from '@/components/benefits'
import { ReferralTeaser } from '@/components/referral-teaser'
import { FinalCta } from '@/components/final-cta'
import { Logo } from '@/components/logo'
import { domTrackBaseUrl } from '@/lib/domtrack-url'
import { getReferralCodeFromCookies, resolveTelegramOrderUrl } from '@/lib/referral-attribution'

export const metadata: Metadata = {
  alternates: { canonical: domTrackBaseUrl().replace(/\/$/, '') },
}

export default async function HomePage() {
  const referralCode = await getReferralCodeFromCookies()
  const telegramUrl = resolveTelegramOrderUrl(referralCode)

  return (
    <main className="min-h-screen">
      <SiteHeader telegramUrl={telegramUrl} />
      <Hero telegramUrl={telegramUrl} />
      <HowItWorks />
      <ServiceGrid />
      <KeyScenario />
      <TrackerSection />
      <Benefits />
      <ReferralTeaser />
      <FinalCta telegramUrl={telegramUrl} />

      <footer className="mx-auto mt-16 max-w-6xl px-4 pb-7 sm:mt-24 sm:px-5 sm:pb-12 md:px-8">
        <div className="flex flex-col items-start justify-between gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:gap-4 sm:pt-8">
          <Logo />
          <div className="flex items-center gap-4">
            <Link href="/partners" className="text-sm text-foreground/70 hover:text-foreground">
              Партнёрская программа
            </Link>
            <p className="text-sm text-foreground/70">
              Дом под присмотром. © {new Date().getFullYear()} DomTrack
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}

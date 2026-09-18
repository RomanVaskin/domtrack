import { SiteHeader } from '@/components/site-header'
import { Hero } from '@/components/hero'
import { ServiceGrid } from '@/components/service-grid'
import { HowItWorks } from '@/components/how-it-works'
import { Logo } from '@/components/logo'

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <Hero />
      <ServiceGrid />
      <HowItWorks />

      <footer className="mx-auto mt-16 max-w-6xl px-4 pb-7 sm:mt-24 sm:px-5 sm:pb-12 md:px-8">
        <div className="flex flex-col items-start justify-between gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:gap-4 sm:pt-8">
          <Logo />
          <p className="text-sm text-muted-foreground">
            Дом под присмотром. © {new Date().getFullYear()} DomTrack
          </p>
        </div>
      </footer>
    </main>
  )
}

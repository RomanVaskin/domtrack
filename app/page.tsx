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

      <footer className="mx-auto mt-24 max-w-6xl px-5 pb-12 md:px-8">
        <div className="flex flex-col items-start justify-between gap-4 border-t border-border pt-8 sm:flex-row sm:items-center">
          <Logo />
          <p className="text-sm text-muted-foreground">
            Дом под присмотром. © {new Date().getFullYear()} DomTrack
          </p>
        </div>
      </footer>
    </main>
  )
}

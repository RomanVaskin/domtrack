import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'

const NAV_LINKS = [
  { href: '#how', label: 'Как работает' },
  { href: '#services', label: 'Услуги' },
  { href: '#tracker', label: 'Трекер' },
  { href: '#benefits', label: 'Возможности' },
]

export function SiteHeader({ telegramUrl }: { telegramUrl: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-5 md:h-16 md:px-8">
        <Link href="/" aria-label="DomTrack — на главную" className="inline-flex min-h-11 items-center">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Основная навигация">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-foreground/75 transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Button
          render={<a href={telegramUrl} target="_blank" rel="noreferrer" />}
          nativeButton={false}
          size="sm"
          className="rounded-full px-4 sm:px-5"
        >
          Заказать услугу
        </Button>
      </div>
    </header>
  )
}

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link href="/" aria-label="DomTrack — на главную">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Основная навигация">
          <a
            href="#how"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Как это работает
          </a>
          <Link
            href="/o/8K3P2"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Мои заказы
          </Link>
        </nav>

        <Button render={<a href="#services" />} nativeButton={false} size="sm" className="rounded-full px-5">
          Заказать услугу
        </Button>
      </div>
    </header>
  )
}

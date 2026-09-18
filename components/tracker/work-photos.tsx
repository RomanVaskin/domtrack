import Image from 'next/image'

const photos = [
  { src: '/images/lawn-before.png', label: 'До', alt: 'Газон до стрижки' },
  { src: '/images/lawn-progress.png', label: 'В процессе', alt: 'Газон во время стрижки' },
  { src: '/images/lawn-after.png', label: 'После', alt: 'Аккуратно подстриженный газон' },
]

export function WorkPhotos() {
  return (
    <div className="grid gap-4 sm:grid-cols-3 sm:gap-3">
      {photos.map((p) => (
        <figure key={p.label} className="group">
          <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border sm:aspect-[3/4]">
            <Image
              src={p.src || '/placeholder.svg'}
              alt={p.alt}
              fill
              sizes="(max-width: 639px) calc(100vw - 72px), 30vw"
              className="object-cover"
            />
          </div>
          <figcaption className="mt-1.5 text-left text-xs font-medium text-muted-foreground sm:text-center">
            {p.label}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

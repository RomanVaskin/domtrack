import Image from 'next/image'

const photos = [
  { src: '/images/lawn-before.png', label: 'До', alt: 'Газон до стрижки' },
  { src: '/images/lawn-progress.png', label: 'В процессе', alt: 'Газон во время стрижки' },
  { src: '/images/lawn-after.png', label: 'После', alt: 'Аккуратно подстриженный газон' },
]

export function WorkPhotos() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {photos.map((p) => (
        <figure key={p.label} className="group">
          <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border">
            <Image
              src={p.src || '/placeholder.svg'}
              alt={p.alt}
              fill
              sizes="30vw"
              className="object-cover"
            />
          </div>
          <figcaption className="mt-1.5 text-center text-xs font-medium text-muted-foreground">
            {p.label}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

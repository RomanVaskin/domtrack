const RUSSIAN_DATE_PATTERN = /^\d{2}\.\d{2}\.\d{4}$/

const formatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatRequestedDate(value: string): string {
  if (RUSSIAN_DATE_PATTERN.test(value)) return value

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return formatter.format(date)
}

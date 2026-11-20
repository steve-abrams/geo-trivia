import { COUNTRIES } from '../data/countries'

// Vite turns each flag SVG into a hashed asset URL; a flag is only downloaded when shown.
const FLAG_URLS = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

export function flagUrl(code: string): string | undefined {
  return FLAG_URLS[`/node_modules/flag-icons/flags/4x3/${code}.svg`]
}

export function Flag({ countryId }: { countryId: string }) {
  const country = COUNTRIES.find((c) => c.id === countryId)
  const url = country && flagUrl(country.code)
  if (!url) return <div className="flag missing">🏳️</div>
  return <img className="flag" src={url} alt="A mystery flag" draggable={false} />
}

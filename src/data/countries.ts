import data from './countries.json'

export const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'] as const
export type Continent = (typeof CONTINENTS)[number]

export interface Country {
  id: string // ISO numeric (world-atlas feature id), or "XK" for Kosovo
  code: string // ISO alpha-2, lowercase (flag file name)
  name: string
  capital: string
  capitalLatLng: [number, number]
  latlng: [number, number]
  continent: Continent
  subregion: string
  area: number
}

export const COUNTRIES = data as Country[]

// US states keyed by FIPS code (matches us-atlas states-10m feature ids).
// Census regions/divisions drive distractor choice on medium/hard.

export type UsRegion = 'Northeast' | 'Midwest' | 'South' | 'West'

export interface UsState {
  id: string
  name: string
  region: UsRegion
  division: string
}

const D: Record<string, [UsRegion, string[]]> = {
  'New England': ['Northeast', ['09', '23', '25', '33', '44', '50']],
  'Mid-Atlantic': ['Northeast', ['34', '36', '42']],
  'East North Central': ['Midwest', ['17', '18', '26', '39', '55']],
  'West North Central': ['Midwest', ['19', '20', '27', '29', '31', '38', '46']],
  'South Atlantic': ['South', ['10', '12', '13', '24', '37', '45', '51', '54']],
  'East South Central': ['South', ['01', '21', '28', '47']],
  'West South Central': ['South', ['05', '22', '40', '48']],
  Mountain: ['West', ['04', '08', '16', '30', '32', '35', '49', '56']],
  Pacific: ['West', ['02', '06', '15', '41', '53']],
}

const NAMES: Record<string, string> = {
  '01': 'Alabama', '02': 'Alaska', '04': 'Arizona', '05': 'Arkansas', '06': 'California',
  '08': 'Colorado', '09': 'Connecticut', '10': 'Delaware', '12': 'Florida', '13': 'Georgia',
  '15': 'Hawaii', '16': 'Idaho', '17': 'Illinois', '18': 'Indiana', '19': 'Iowa',
  '20': 'Kansas', '21': 'Kentucky', '22': 'Louisiana', '23': 'Maine', '24': 'Maryland',
  '25': 'Massachusetts', '26': 'Michigan', '27': 'Minnesota', '28': 'Mississippi', '29': 'Missouri',
  '30': 'Montana', '31': 'Nebraska', '32': 'Nevada', '33': 'New Hampshire', '34': 'New Jersey',
  '35': 'New Mexico', '36': 'New York', '37': 'North Carolina', '38': 'North Dakota', '39': 'Ohio',
  '40': 'Oklahoma', '41': 'Oregon', '42': 'Pennsylvania', '44': 'Rhode Island', '45': 'South Carolina',
  '46': 'South Dakota', '47': 'Tennessee', '48': 'Texas', '49': 'Utah', '50': 'Vermont',
  '51': 'Virginia', '53': 'Washington', '54': 'West Virginia', '55': 'Wisconsin', '56': 'Wyoming',
}

export const STATES: UsState[] = Object.entries(D)
  .flatMap(([division, [region, ids]]) => ids.map((id) => ({ id, name: NAMES[id], region, division })))
  .sort((a, b) => a.name.localeCompare(b.name))

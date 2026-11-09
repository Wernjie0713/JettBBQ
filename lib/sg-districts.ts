// Singapore postal sector (first two digits of a postal code) → general area, after the URA postal
// district list. Used only to label the demand-by-area list.

const DISTRICTS: [sectors: string[], area: string][] = [
  [["01", "02", "03", "04", "05", "06"], "Raffles Place, Marina"],
  [["07", "08"], "Tanjong Pagar, Anson"],
  [["09", "10"], "Telok Blangah, HarbourFront"],
  [["11", "12", "13"], "Pasir Panjang, Clementi"],
  [["14", "15", "16"], "Queenstown, Tiong Bahru"],
  [["17"], "Beach Road, High Street"],
  [["18", "19"], "Bugis, Golden Mile"],
  [["20", "21"], "Little India, Farrer Park"],
  [["22", "23"], "Orchard, River Valley"],
  [["24", "25", "26", "27"], "Bukit Timah, Holland"],
  [["28", "29", "30"], "Novena, Thomson"],
  [["31", "32", "33"], "Balestier, Toa Payoh"],
  [["34", "35", "36", "37"], "MacPherson, Braddell"],
  [["38", "39", "40", "41"], "Geylang, Eunos"],
  [["42", "43", "44", "45"], "Katong, Marine Parade"],
  [["46", "47", "48"], "Bedok, Upper East Coast"],
  [["49", "50", "81"], "Changi, Loyang"],
  [["51", "52"], "Tampines, Pasir Ris"],
  [["53", "54", "55", "82"], "Serangoon, Hougang, Punggol"],
  [["56", "57"], "Bishan, Ang Mo Kio"],
  [["58", "59"], "Upper Bukit Timah, Clementi Park"],
  [["60", "61", "62", "63", "64"], "Jurong, Boon Lay"],
  [["65", "66", "67", "68"], "Bukit Batok, Bukit Panjang, Choa Chu Kang"],
  [["69", "70", "71"], "Lim Chu Kang, Tengah"],
  [["72", "73"], "Kranji, Woodlands"],
  [["75", "76"], "Yishun, Sembawang"],
  [["77", "78"], "Upper Thomson, Springleaf"],
  [["79", "80"], "Seletar, Yio Chu Kang"],
];

const AREA_BY_SECTOR = new Map(DISTRICTS.flatMap(([sectors, area]) => sectors.map((s) => [s, area] as const)));

export function areaOfSector(sector: string): string {
  return AREA_BY_SECTOR.get(sector) ?? `Sector ${sector}`;
}

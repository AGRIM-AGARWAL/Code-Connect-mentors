// Visual helpers for mentors (display only — no data logic)
export const ACCENTS = ['#C9A66B', '#6FA6A1', '#B4645A', '#9C8399', '#7C93B0', '#8FA88A'] // amber, teal, clay, mauve, steel, sage
export const RANKS = ['1ST', '2ND', '3RD']

export const accentFor = (accent: string | null | undefined, index: number) =>
  accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : ACCENTS[((index % ACCENTS.length) + ACCENTS.length) % ACCENTS.length]

/** accent colour with an alpha suffix, e.g. hexA('#C9A66B', 0.11) */
export const hexA = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, '0')

export const pad2 = (n: number) => String(n).padStart(2, '0')

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export const firstName = (name: string) => name.split(/\s+/)[0]

/** Photos shipped with the site (public/mentors/). Used when the database has no photo_url for that mentor. */
export const LOCAL_PHOTOS: Record<string, string> = {
  om: 'mentors/om.jpg',
  chirrayu: 'mentors/chirrayu.jpg',
  vanshdeep: 'mentors/vanshdeep.jpg',
  khushi: 'mentors/khushi.jpg',
  aarjav: 'mentors/aarjav.jpg',
  divyanshu: 'mentors/divyanshu.jpg',
  manan: 'mentors/manan.jpg',
  charvie: 'mentors/charvie.jpg',
}

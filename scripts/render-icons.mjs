// Builds the app icon files from src/ui/brand/chevron.ts, then renders the PNGs.
// Run with `npm run icons` (needs Node 22.18+ or 23.6+, which load the .ts module directly).
import { writeFile } from 'node:fs/promises'
import { Resvg } from '@resvg/resvg-js'
import { CHEVRON_BOTTOM, CHEVRON_GREY, CHEVRON_TOP, GLYPH_BOX, ICON_RADIUS, ICON_SIZE } from '../src/ui/brand/chevron.ts'

const S = ICON_SIZE
/** Keeps the glyph well inside the maskable safe zone (a circle of 80% of the icon). */
const MASKABLE_SCALE = 0.62

const file = path => new URL(`../${path}`, import.meta.url)
const svg = (viewBox, size, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}">${body}</svg>\n`
const glyph = (top, bottom) => `<polygon points="${CHEVRON_BOTTOM}" fill="${bottom}"/><polygon points="${CHEVRON_TOP}" fill="${top}"/>`

const icon = svg(`0 0 ${S} ${S}`, S, `<rect width="${S}" height="${S}" rx="${ICON_RADIUS}" fill="#000000"/>${glyph('#FFFFFF', CHEVRON_GREY)}`)
const mono = svg(`${GLYPH_BOX.origin} ${GLYPH_BOX.origin} ${GLYPH_BOX.size} ${GLYPH_BOX.size}`, GLYPH_BOX.size, glyph('#FFFFFF', '#FFFFFF'))
const maskable = svg(`0 0 ${S} ${S}`, S, `<rect width="${S}" height="${S}" fill="#000000"/><g transform="translate(${S / 2} ${S / 2}) scale(${MASKABLE_SCALE}) translate(${-S / 2} ${-S / 2})">${glyph('#FFFFFF', CHEVRON_GREY)}</g>`)

for (const [path, content] of [['src/ui/brand/icon.svg', icon], ['public/icon.svg', icon], ['src/ui/brand/icon-mono.svg', mono]]) {
  await writeFile(file(path), content)
  console.log(`${path}  ${content.length} bytes`)
}

for (const [name, source, size] of [['icon-192.png', icon, 192], ['icon-512.png', icon, 512], ['icon-512-maskable.png', maskable, 512]]) {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng()
  await writeFile(file(`public/${name}`), png)
  console.log(`public/${name}  ${size}x${size}  ${png.length} bytes`)
}

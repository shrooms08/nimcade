// Renders the app icon PNGs from public/icon.svg. Run with `npm run icons` after changing the icon.
import { readFile, writeFile } from 'node:fs/promises'
import { Resvg } from '@resvg/resvg-js'

const svg = await readFile(new URL('../public/icon.svg', import.meta.url))

for (const size of [192, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  await writeFile(new URL(`../public/icon-${size}.png`, import.meta.url), png)
  console.log(`public/icon-${size}.png  ${size}x${size}  ${png.length} bytes`)
}

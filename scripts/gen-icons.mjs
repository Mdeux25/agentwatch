/**
 * Generates all Tauri-required icon sizes from icon.svg
 * Run: node scripts/gen-icons.mjs
 */
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root  = resolve(__dir, '..')
const src   = resolve(root, 'src-tauri/icons/icon.svg')
const svg   = readFileSync(src)

const iconsDir = resolve(root, 'src-tauri/icons')
mkdirSync(iconsDir, { recursive: true })

const sizes = [
  { file: '32x32.png',      size: 32  },
  { file: '128x128.png',    size: 128 },
  { file: '128x128@2x.png', size: 256 },
  { file: 'icon.png',       size: 512 },
  // Extra sizes for macOS .icns and Windows .ico (tauri icon cmd uses these)
  { file: '512x512.png',    size: 512 },
  { file: '1024x1024.png',  size: 1024 },
]

for (const { file, size } of sizes) {
  const out = resolve(iconsDir, file)
  await sharp(svg, { density: Math.ceil((size / 1024) * 96 * 4) })
    .resize(size, size)
    .png()
    .toFile(out)
  console.log(`✓  ${file}  (${size}×${size})`)
}

console.log('\nDone. Run: npm run tauri icon src-tauri/icons/1024x1024.png')

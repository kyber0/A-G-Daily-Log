// Script to convert icon.jpg to icon.ico using sharp
// Run: node scripts/convert-icon.mjs
import sharp from 'sharp'
import { createWriteStream } from 'fs'
import { resolve } from 'path'

const src = resolve('resources/A&G-logo.png')
const dst = resolve('resources/icon.ico')

// Create a 256x256 PNG buffer and write it as ICO
// Note: electron-builder accepts PNG named .ico for NSIS builds; for true .ico,
// we'll produce a .png named icon.png and reference it properly.
await sharp(src)
  .resize(256, 256)
  .png()
  .toFile(resolve('resources/icon.png'))

console.log('Created resources/icon.png (256x256)')
console.log('For packaging, electron-builder will use icon.png automatically on Windows builds.')

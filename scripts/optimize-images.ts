// Convert the founder's original photos (up to ~35 MB each) into web-sized WebP files.
// Usage: node scripts/optimize-images.ts "<path to 'Jett BBQ/Images' folder>"

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const SOURCE_DIR = process.argv[2];
const OUT_DIR = "public/images";

// [source file, output name, max long edge in px]. Usage per image: docs/DESIGN.md §10.
const IMAGES: [string, string, number][] = [
  ["20241013 Jett BBQ1033.JPG.jpeg", "hero-spread-landscape", 2400],
  ["20241013 Jett BBQ1037 2.JPG.jpeg", "hero-spread-portrait", 1600],
  ["20241013 Jett BBQ1025.JPG.jpeg", "beef-rib-set-spread", 1600],
  ["20241013 Jett BBQ1009.jpg.jpeg", "beef-rib-closeup", 1600],
  ["20241013 Jett BBQ1009 2.JPG.jpeg", "beef-rib-board", 1600],
  ["20241013 Jett BBQ0993 2.JPG.jpeg", "beef-rib-knife", 1600],
  ["20241013 Jett BBQ1018.jpg.jpeg", "beef-rib-sliced-square", 1600],
  ["20241013 Jett BBQ1018 2.JPG.jpeg", "beef-rib-sliced", 1600],
  ["20241013 Jett BBQ0942.JPG.jpeg", "side-mashed-potato", 1200],
  ["20241013 Jett BBQ0958.JPG.jpeg", "side-mac-and-cheese", 1200],
  ["20241013 Jett BBQ0962.JPG.jpeg", "side-aglio-olio", 1200],
  ["20241013 Jett BBQ0968.JPG.jpeg", "side-coleslaw", 1200],
  ["20241013 Jett BBQ0977.JPG.jpeg", "side-stuffed-mushrooms", 1200],
  ["20241013 Jett BBQ0983.JPG.jpeg", "side-sauce-and-pickles", 1200],
  ["Jett Barbecue Christmas Set.jpeg", "christmas-platter", 1600],
  ["WhatsApp Image 2026-11-04 at 15.26.58.jpeg", "tray-dessert", 1200],
  ["WhatsApp Image 2026-11-04 at 15.26.582.jpeg", "tray-aglio-olio", 1200],
  ["WhatsApp Image 2026-11-04 at 15.26.583.jpeg", "tray-roast-vegetables", 1200],
  ["WhatsApp Image 2026-11-04 at 15.26.59.jpeg", "tray-meatballs", 1200],
  ["WhatsApp Image 2026-11-04 at 15.26.592.jpeg", "tray-coleslaw", 1200],
  ["WhatsApp Image 2026-11-04 at 15.26.593.jpeg", "tray-salmon", 1200],
  ["Logo.jpeg", "logo", 512],
];

async function main() {
  if (!SOURCE_DIR || !existsSync(SOURCE_DIR)) {
    throw new Error(`Source folder not found: ${SOURCE_DIR ?? "(none given)"}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  for (const [file, name, maxEdge] of IMAGES) {
    const input = join(SOURCE_DIR, file);
    if (!existsSync(input)) {
      console.warn(`Missing, skipped: ${file}`);
      continue;
    }
    const info = await sharp(input)
      .rotate() // respect camera orientation
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(join(OUT_DIR, `${name}.webp`));
    console.log(`${name}.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
  }

  // App icons from the logo (Next.js picks up app/icon.png and app/apple-icon.png).
  const logo = join(SOURCE_DIR, "Logo.jpeg");
  await sharp(logo).resize(512, 512).png().toFile("app/icon.png");
  await sharp(logo).resize(180, 180).png().toFile("app/apple-icon.png");
  console.log("app/icon.png, app/apple-icon.png");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

// Harbour Lights — hand-in program (Node 22, standard library only).
//
// Run by the grader in a fresh container with a read-only repo at /bot and
// a writable /output (outside the grader, MAKEFUN_OUTPUT_DIR stands in for
// /output). It copies this repo's game/ and screenshots/ into the output
// directory and writes /output/dossier.json with buildDossier from the
// vendored make.fun library, so the sealed scorer can check the game, the
// screenshots and the dossier byte for byte.
//
// The output directory is a bind-mounted volume in the grader: this program
// empties its *contents* but never removes the directory itself, or the run
// fails with EACCES. It writes nothing back into the repo.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? "/output");

// Empty the output directory's contents, leaving the directory in place.
function emptyOutputDir(dir) {
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

// Copy one top-level folder of the repo into the output directory.
function handInFolder(name) {
  const source = join(repoRoot, name);
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    throw new Error(`Harbour Lights: expected ./${name}/ beside main.ts, found nothing`);
  }
  cpSync(source, join(outputDir, name), { recursive: true });
}

emptyOutputDir(outputDir);
handInFolder("game");
handInFolder("screenshots");

// The dossier is the judge's view of the entry: game files, screenshots and
// source text, as the vendored library writes them. The caps below are the
// scorer's own limits (game files, screenshots, dossier text).
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, "dossier.json"), dossier);

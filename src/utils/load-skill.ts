import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getResourcePath(filename: string): string {
  return path.resolve(__dirname, "../../resources", filename);
}

/** Load markdown from resources/ (CLAUDE.md, prd-skill.md, ralph-skill.md). */
export async function loadResource(filename: string): Promise<string> {
  return readFile(getResourcePath(filename), "utf-8");
}

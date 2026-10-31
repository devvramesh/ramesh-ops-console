import { existsSync } from "node:fs";

let loaded = false;

// Next.js loads .env.local itself. tsx scripts and Vitest don't, so they call this.
export function loadEnv() {
  if (loaded) return;
  loaded = true;
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

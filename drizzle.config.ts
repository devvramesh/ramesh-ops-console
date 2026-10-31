import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: ["src/platform/**/schema.ts", "src/apps/*/schema.ts"],
  dbCredentials: {
    url: process.env.DATABASE_FILE ?? "data/app.sqlite",
  },
});

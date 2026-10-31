export default async function setup() {
  process.env.DATABASE_FILE = "data/test.sqlite";
  process.env.AUTH_MODE = "dev";
  process.env.SESSION_SECRET = "test-secret";
  const { resetDatabase } = await import("../src/platform/db/reset");
  await resetDatabase();
}

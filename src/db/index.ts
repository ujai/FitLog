import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Neon accepts standard connections; pool of 1 is plenty for 3 users.
// prepare:false keeps the client compatible with Neon's PgBouncer pooler
// (transaction mode), which Vercel uses in production.
// Reuse the client across dev hot reloads so HMR doesn't pile up connections.
const globalForDb = globalThis as unknown as { __healthTrackerSql?: postgres.Sql };
const client =
  globalForDb.__healthTrackerSql ?? postgres(connectionString, { max: 1, ssl: "prefer", prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.__healthTrackerSql = client;

export const db = drizzle(client, { schema });

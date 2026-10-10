/**
 * The role vocabulary, as pure data: no imports, so the server session helper and
 * the unit tests can both read it without pulling in auth or a database.
 */
export type Role = "admin" | "member" | "trainer";

/**
 * Runtime counterpart to the `Role` union. The value arrives typed as `string`:
 * Better Auth declares it that way, its admin plugin only enforces its own
 * `user`/`admin`, and `member`/`trainer` are written by direct Drizzle updates.
 * So it has to be checked rather than asserted.
 */
export function isRole(value: string): value is Role {
  return value === "admin" || value === "trainer" || value === "member";
}

/**
 * What a stored role actually means. The value arrives from Better Auth as
 * `string | null | undefined`; anything unrecognised — including absent — reads as
 * the least privileged role, so a bad row loses access rather than gaining it, and
 * no caller is handed a `Role` the type system invented.
 */
export function roleOf(value: string | null | undefined): Role {
  return typeof value === "string" && isRole(value) ? value : "member";
}

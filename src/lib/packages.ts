/**
 * Prepaid PT sessions as a punch card per participant. A package belongs to a
 * member or to the couple (null), exactly like a PT session, and every session
 * marked done for that same participant — on or after the first package's
 * start — uses one up. Packages pool: buying 10 more simply adds 10.
 *
 * Remaining can go negative: sessions held beyond what was paid for are worth
 * showing as "2 over", not hiding at zero.
 */
export type PackageRow = { memberUserId: string | null; sessions: number; startsOn: Date };
export type HeldSession = { memberUserId: string | null; startsAt: Date };
export type PackageBalance = {
  memberUserId: string | null;
  purchased: number;
  used: number;
  remaining: number;
  since: Date;
};

export function packageBalances(packages: PackageRow[], held: HeldSession[]): PackageBalance[] {
  const byOwner = new Map<string | null, { purchased: number; since: Date }>();
  for (const p of packages) {
    const acc = byOwner.get(p.memberUserId);
    if (!acc) byOwner.set(p.memberUserId, { purchased: p.sessions, since: p.startsOn });
    else {
      acc.purchased += p.sessions;
      if (p.startsOn < acc.since) acc.since = p.startsOn;
    }
  }
  return [...byOwner.entries()].map(([memberUserId, { purchased, since }]) => {
    const used = held.filter((s) => s.memberUserId === memberUserId && s.startsAt >= since).length;
    return { memberUserId, purchased, used, remaining: purchased - used, since };
  });
}

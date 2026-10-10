/** Link to one exercise's history for a person; `?user=` only when it isn't the viewer. */
export function exerciseHistoryHref(name: string, userId: string, viewerId: string): string {
  const params = new URLSearchParams({ name });
  if (userId !== viewerId) params.set("user", userId);
  return `/workouts/exercise?${params}`;
}

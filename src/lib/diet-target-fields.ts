export type DietTargets = {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export const DIET_TARGET_FIELDS = [
  { key: "calories", label: "Calories", unit: "kcal", max: 10_000, integer: true },
  { key: "proteinG", label: "Protein", unit: "g", max: 1_000, integer: false },
  { key: "carbsG", label: "Carbs", unit: "g", max: 1_000, integer: false },
  { key: "fatG", label: "Fat", unit: "g", max: 1_000, integer: false },
] as const satisfies ReadonlyArray<{ key: keyof DietTargets; label: string; unit: string; max: number; integer: boolean }>;

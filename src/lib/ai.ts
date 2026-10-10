import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

function ai() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set — get a free key at https://aistudio.google.com/apikey");
  }
  // Pass the key explicitly: the SDK default only reads
  // GOOGLE_GENERATIVE_AI_API_KEY, not this project's GEMINI_API_KEY.
  return createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })(MODEL);
}

// ---------------------------------------------------------------------------
// Extract Evolt metrics from a screenshot
// ---------------------------------------------------------------------------

const scanSchema = z.object({
  scannedAt: z.string().nullable().describe("Scan date/time shown in the report, ISO if possible"),
  weightKg: z.number().nullable(),
  leanBodyMassKg: z.number().nullable(),
  skeletalMuscleMassKg: z.number().nullable(),
  proteinKg: z.number().nullable(),
  mineralKg: z.number().nullable(),
  totalBodyWaterKg: z.number().nullable(),
  bodyFatMassKg: z.number().nullable(),
  subcutaneousFatMassKg: z.number().nullable(),
  visceralFatMassKg: z.number().nullable(),
  visceralFatAreaCm2: z.number().nullable(),
  visceralFatLevel: z.number().nullable(),
  bodyFatPct: z.number().nullable(),
  icfKg: z.number().nullable(),
  ecfKg: z.number().nullable(),
  bmr: z.number().nullable(),
  teeKcal: z.number().nullable(),
  bioAge: z.number().nullable(),
  bwiScore: z.number().nullable(),
  abdominalCircumferenceCm: z.number().nullable(),
  waistToHipRatio: z.number().nullable(),
});

export type ExtractedScan = z.infer<typeof scanSchema>;

type ExtractedImage = { base64: string; mime: string };

export async function extractScanFromImage(
  parts: ExtractedImage[],
): Promise<ExtractedScan> {
  const isPdf = parts.length === 1 && parts[0].mime === "application/pdf";
  const { object } = await generateObject({
    model: ai(),
    schema: scanSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              (isPdf
                ? "This is an Evolt 360 body-composition result sheet PDF. "
                : "These are one or more vertical slices of an Evolt Active app body-composition result screenshot (they are in order and may overlap slightly — read each metric once, from the clearest slice). ") +
              "Extract every numbered metric you can find and map it exactly: " +
              "weightKg = WEIGHT header; leanBodyMassKg = '1. LEAN BODY MASS'; skeletalMuscleMassKg = '2. SKELETAL MUSCLE MASS'; " +
              "proteinKg = '3. PROTEIN'; mineralKg = '4. MINERAL'; totalBodyWaterKg = '5. TOTAL BODY WATER'; " +
              "bodyFatMassKg = '6. BODY FAT MASS'; subcutaneousFatMassKg = '7. SUBCUTANEOUS FAT MASS'; " +
              "visceralFatMassKg = '8. VISCERAL FAT MASS'; visceralFatAreaCm2 = '9. VISCERAL FAT AREA'; " +
              "visceralFatLevel = '11. VISCERAL FAT LEVEL'; bodyFatPct = '10. TOTAL BODY FAT PERCENTAGE'; " +
              "icfKg = '12. INTRACELLULAR FLUID (ICF)'; ecfKg = '13. EXTRACELLULAR FLUID (ECF)'; " +
              "bmr = '14. BMR'; teeKcal = '15. TEE'; bioAge = '16. BIO AGE'; bwiScore = '17. BWI SCORE'; " +
              "abdominalCircumferenceCm = '19. ABDOMINAL CIRCUMFERENCE'; waistToHipRatio = '20. WAIST TO HIP RATIO'. " +
              "Values may be written like '63.0 / High [47.7 - 58.3]' or '101 kg (kg)' — take the measurement number only; " +
              "ignore the High/Optimal/Under rating and the bracketed reference range. " +
              "For scannedAt, parse the scan date/time shown (e.g. '16-07-2026 04:07' or '16 Jul 2026, 04:07'). " +
              "Do NOT take values from the nutrition/calorie recommendation section. " +
              "If a metric is not visible or unclear, return null for it. Do not guess numbers.",
          },
          ...parts.map((part) => ({
            type: "file" as const,
            data: part.base64,
            mediaType: part.mime,
          })),
        ],
      },
    ],
  });
  return object;
}

// ---------------------------------------------------------------------------
// Estimate macros from a meal photo
// ---------------------------------------------------------------------------

const mealSchema = z.object({
  description: z.string().describe("Short dish description, e.g. 'Nasi lemak with fried egg'"),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).nullable().describe("Most likely meal type, if guessable"),
  calories: z.number().int().nullable().describe("Estimated total kcal for the portion shown"),
  proteinG: z.number().nullable(),
  carbsG: z.number().nullable(),
  fatG: z.number().nullable(),
});

export type ExtractedMeal = z.infer<typeof mealSchema>;

export async function extractMealFromImage(
  imageBase64: string,
  mimeType: string,
): Promise<ExtractedMeal> {
  const { object } = await generateObject({
    model: ai(),
    schema: mealSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "This is a photo of a meal or drink. Estimate its nutritional content for the portion actually shown. " +
              "Write a short description naming the dish and main components (max ~80 chars). " +
              "Round calories to the nearest 10 and macros to the nearest gram. " +
              "If a value genuinely cannot be estimated, return null for it — but always provide calories and a description. " +
              "These are rough estimates for a personal food diary, not medical advice; do not add caveats.",
          },
          { type: "file", data: imageBase64, mediaType: mimeType },
        ],
      },
    ],
  });
  return object;
}

// ---------------------------------------------------------------------------
// Review scan history and give pointers
// ---------------------------------------------------------------------------

const scanPointerSchema = z.object({
  area: z.string().describe("e.g. 'Body fat', 'Visceral fat', 'Protein intake'"),
  observation: z.string().describe("What the data shows"),
  suggestion: z.string().describe("Concrete, actionable suggestion"),
});

const reviewSchema = z.object({
  summary: z.string().describe("2-4 sentence honest summary of the trend"),
  positives: z.array(z.string()).describe("Things that are going well"),
  focus: z.array(scanPointerSchema).describe("3-5 areas needing attention, most important first"),
});

type ScanReview = z.infer<typeof reviewSchema>;

export type ScanPoint = {
  scannedAt: string;
  weightKg: number | null;
  leanBodyMassKg: number | null;
  skeletalMuscleMassKg: number | null;
  proteinKg: number | null;
  mineralKg: number | null;
  totalBodyWaterKg: number | null;
  bodyFatMassKg: number | null;
  subcutaneousFatMassKg: number | null;
  visceralFatMassKg: number | null;
  visceralFatAreaCm2: number | null;
  visceralFatLevel: number | null;
  bodyFatPct: number | null;
  icfKg: number | null;
  ecfKg: number | null;
  bmr: number | null;
  teeKcal: number | null;
  bioAge: number | null;
  bwiScore: number | null;
  abdominalCircumferenceCm: number | null;
  waistToHipRatio: number | null;
};

export async function reviewScanHistory(input: {
  name: string;
  scans: ScanPoint[];
}): Promise<ScanReview & { model: string }> {
  const { object } = await generateObject({
    model: ai(),
    schema: reviewSchema,
    messages: [
      {
        role: "user",
        content:
          `You are reviewing body-composition scan history (Evolt 360 BIA scans) for ${input.name}, ` +
          `who trains with a personal trainer. Data is ordered oldest to newest:\n\n` +
          JSON.stringify(input.scans, null, 2) +
          `\n\nGive an honest assessment: celebrate real progress, flag regressions, and give practical pointers. ` +
          `Compare consecutive scans and the overall trend. Note typical healthy directions: ` +
          `body fat (mass/%, subcutaneous) down or stable, lean body and skeletal muscle mass up, ` +
          `visceral fat (mass/area/level) down, protein and body water adequate, BWI score up, bio age below real age. ` +
          `Do not invent medical advice or diagnose anything; suggest checking with professionals where relevant.`,
      },
    ],
  });
  return { ...object, model: MODEL };
}

/** Review a single scan in the context of up to two previous scans. */
export async function reviewSingleScan(input: {
  name: string;
  scan: ScanPoint;
  previous: ScanPoint[];
}): Promise<ScanReview & { model: string }> {
  const { object } = await generateObject({
    model: ai(),
    schema: reviewSchema,
    messages: [
      {
        role: "user",
        content:
          `You are reviewing a single body-composition scan (Evolt 360 BIA) for ${input.name}, ` +
          `who trains with a personal trainer. The scan to review:\n\n` +
          JSON.stringify(input.scan, null, 2) +
          `\n\nPrevious scans for context, oldest first:\n\n` +
          JSON.stringify(input.previous, null, 2) +
          `\n\nAssess THIS scan: what changed versus the previous ones, what is going well, and what to focus on ` +
          `before the next scan. Note typical healthy directions: body fat (mass/%, subcutaneous) down or stable, ` +
          `lean body and skeletal muscle mass up, visceral fat (mass/area/level) down, protein and body water adequate, ` +
          `BWI score up, bio age below real age. ` +
          `Do not invent medical advice or diagnose anything; suggest checking with professionals where relevant.`,
      },
    ],
  });
  return { ...object, model: MODEL };
}

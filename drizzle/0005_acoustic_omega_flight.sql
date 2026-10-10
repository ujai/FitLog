ALTER TABLE "scans" ADD COLUMN "lean_body_mass_kg" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "skeletal_muscle_mass_kg" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "protein_kg" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "mineral_kg" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "total_body_water_kg" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "body_fat_mass_kg" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "subcutaneous_fat_mass_kg" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "visceral_fat_mass_kg" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "visceral_fat_area_cm2" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "visceral_fat_level" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "icf_kg" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "ecf_kg" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "tee_kcal" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "bio_age" integer;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "bwi_score" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "abdominal_circumference_cm" double precision;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "waist_to_hip_ratio" double precision;
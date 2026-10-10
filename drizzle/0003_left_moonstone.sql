CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"weight_kg" double precision,
	"waist_cm" double precision,
	"chest_cm" double precision,
	"arm_cm" double precision,
	"thigh_cm" double precision,
	"hip_cm" double precision,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"notes" text,
	"image_mime" text,
	"image_data" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainer_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_user_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_template_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_reviews" ALTER COLUMN "pointers" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_notes" ADD CONSTRAINT "trainer_notes_member_user_id_user_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_notes" ADD CONSTRAINT "trainer_notes_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_template_exercises" ADD CONSTRAINT "workout_template_exercises_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "measurements_user_date_idx" ON "measurements" USING btree ("user_id","measured_at");--> statement-breakpoint
CREATE INDEX "progress_photos_user_date_idx" ON "progress_photos" USING btree ("user_id","taken_at");--> statement-breakpoint
CREATE INDEX "trainer_notes_member_date_idx" ON "trainer_notes" USING btree ("member_user_id","created_at");--> statement-breakpoint
CREATE INDEX "workout_templates_owner_idx" ON "workout_templates" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_reviews_progress_uniq" ON "ai_reviews" USING btree ("user_id","kind") WHERE kind = 'progress';--> statement-breakpoint
CREATE UNIQUE INDEX "ai_reviews_scan_uniq" ON "ai_reviews" USING btree ("user_id","scan_id") WHERE kind = 'scan';
CREATE TABLE "diet_targets" (
	"user_id" text PRIMARY KEY NOT NULL,
	"calories" integer,
	"protein_g" double precision,
	"carbs_g" double precision,
	"fat_g" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pt_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_user_id" text,
	"sessions" integer NOT NULL,
	"starts_on" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pt_packages_sessions_check" CHECK ("pt_packages"."sessions" between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "trainer_notes" ADD COLUMN "workout_session_id" uuid;--> statement-breakpoint
ALTER TABLE "diet_targets" ADD CONSTRAINT "diet_targets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_packages" ADD CONSTRAINT "pt_packages_member_user_id_user_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pt_packages_member_idx" ON "pt_packages" USING btree ("member_user_id","starts_on");--> statement-breakpoint
ALTER TABLE "trainer_notes" ADD CONSTRAINT "trainer_notes_workout_session_id_workout_sessions_id_fk" FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trainer_notes_workout_idx" ON "trainer_notes" USING btree ("workout_session_id");
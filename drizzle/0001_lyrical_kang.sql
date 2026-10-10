ALTER TABLE "workout_sessions" ADD COLUMN "group_id" uuid;--> statement-breakpoint
CREATE INDEX "workouts_group_idx" ON "workout_sessions" USING btree ("group_id");
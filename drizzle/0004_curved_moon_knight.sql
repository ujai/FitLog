CREATE INDEX "workout_exercises_session_idx" ON "workout_exercises" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "workout_sets_exercise_idx" ON "workout_sets" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "workout_template_exercises_template_idx" ON "workout_template_exercises" USING btree ("template_id");
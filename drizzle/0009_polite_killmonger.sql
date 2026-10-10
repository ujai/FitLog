ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_kind_check" CHECK ("ai_reviews"."kind" in ('progress', 'scan'));--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_meal_type_check" CHECK ("meals"."meal_type" in ('breakfast', 'lunch', 'dinner', 'snack'));--> statement-breakpoint
ALTER TABLE "metric_goals" ADD CONSTRAINT "metric_goals_direction_check" CHECK ("metric_goals"."direction" is null or "metric_goals"."direction" in ('up', 'down'));--> statement-breakpoint
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_status_check" CHECK ("pt_sessions"."status" in ('scheduled', 'done', 'cancelled'));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_check" CHECK ("user"."role" in ('admin', 'trainer', 'member', 'user'));
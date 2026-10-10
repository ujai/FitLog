ALTER TABLE "trainer_notes" DROP CONSTRAINT "trainer_notes_author_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "trainer_notes" ALTER COLUMN "author_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trainer_notes" ADD CONSTRAINT "trainer_notes_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
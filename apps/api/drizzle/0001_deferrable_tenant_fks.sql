-- Composite tenant FKs without a cascade rule are made DEFERRABLE so that deleting a whole
-- organisation (which cascades through departments, agents, members, ...) succeeds atomically:
-- referential integrity is still verified, at commit time.
ALTER TABLE "tasks" ALTER CONSTRAINT "tasks_assignee_member_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tasks" ALTER CONSTRAINT "tasks_assignee_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "comments" ALTER CONSTRAINT "comments_member_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "comments" ALTER CONSTRAINT "comments_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "requests" ALTER CONSTRAINT "requests_from_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "requests" ALTER CONSTRAINT "requests_to_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "requests" ALTER CONSTRAINT "requests_creator_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "messages" ALTER CONSTRAINT "messages_sender_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "files" ALTER CONSTRAINT "files_dept_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "files" ALTER CONSTRAINT "files_owner_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER CONSTRAINT "runs_requester_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "requests" DROP CONSTRAINT "requests_from_fk";--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_from_fk" FOREIGN KEY ("org_id","from_department_id") REFERENCES "public"."departments"("org_id","id") ON DELETE cascade DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "requests" DROP CONSTRAINT "requests_to_fk";--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_to_fk" FOREIGN KEY ("org_id","to_department_id") REFERENCES "public"."departments"("org_id","id") ON DELETE cascade DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint

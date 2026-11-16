-- Parked: a tracked job kept for later. It is not open, so it has no due-date
-- nag and no next action in Dough, and Unpark returns it to the status it had.
ALTER TABLE "jobbi"."applications" DROP CONSTRAINT "applications_status_check";
ALTER TABLE "jobbi"."applications" ADD CONSTRAINT "applications_status_check"
  CHECK ("status" IN ('saved', 'applied', 'interview', 'offer', 'rejected', 'withdrawn', 'parked'));

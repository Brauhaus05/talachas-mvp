-- Self-service talachero onboarding (Sprint 2) — part 1 of 2.
-- Adds the 'in_review' state to verification_status. MUST be its own migration
-- file: Postgres forbids USING a newly-added enum value in the same transaction
-- it was added in, and the CLI runs each migration file in its own transaction.
alter type public.verification_status add value if not exists 'in_review';

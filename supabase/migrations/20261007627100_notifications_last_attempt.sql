-- When the worker last tried a notice, on the worker's clock (the test clock outside production). Retries back off from it,
-- and a row left in `sending` by a crash is recognised by it. `updated_at` cannot serve: the trigger stamps real time.
alter table public.notifications add column last_attempt_at timestamptz;

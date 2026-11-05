# Deploy runbook

Written in full in Phase 6; this holds the steps found so far.

## Before the first real import

- The stricter national ID check (`private.holds_national_id`) does not revalidate rows that already exist, and an import of an older export holding text it now refuses fails the whole import, because CHECK constraints still bind during an import. Run the check over the text of the export before the first real import.

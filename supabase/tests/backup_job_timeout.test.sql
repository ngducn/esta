begin;
\ir _harness.psql

select plan(3);

select is(private.agent_job_timeout('backup_export'), interval '20 minutes', 'a stuck backup_export is reclaimed after its 20 minute timeout');
select is(private.agent_job_timeout('ask'), interval '4 minutes', 'ask keeps its 4 minute timeout');
select is(private.agent_job_timeout('research_scan'), interval '10 minutes', 'a kind with no entry keeps the 10 minute default');

select * from finish();
rollback;

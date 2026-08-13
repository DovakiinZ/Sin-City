-- ============================================================================
-- SCHEDULE THE ACTIVITY-EMAIL WORKER via Supabase pg_cron + pg_net
-- Vercel Hobby cannot run sub-daily crons, so we drive the worker from Postgres.
-- Runs every 5 minutes; POSTs /api/notifications-cron?action=cron with the
-- CRON_SECRET (the SAME value stored in Vercel env), read from Supabase Vault.
--
-- ⚠️  BEFORE RUNNING: replace PASTE_YOUR_CRON_SECRET_HERE below with the exact
--     CRON_SECRET value from your Vercel project (Settings → Environment
--     Variables → CRON_SECRET). It must match, or the endpoint returns 401.
-- ============================================================================

-- 1. Extensions (idempotent). If the SQL editor lacks privilege, enable these
--    instead via Dashboard → Database → Extensions (pg_cron, pg_net).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Store the shared secret in Vault (keeps it out of the cron.job definition).
--    Re-running: delete any old copy first so this stays idempotent.
DELETE FROM vault.secrets WHERE name = 'cron_secret_notifications';
SELECT vault.create_secret(
  'PASTE_YOUR_CRON_SECRET_HERE',        -- <-- replace with your real CRON_SECRET
  'cron_secret_notifications',
  'Bearer secret for /api/notifications-cron (matches Vercel CRON_SECRET)'
);

-- 3. Schedule the worker every 5 minutes. cron.schedule is keyed by job name,
--    so re-running updates the existing job rather than duplicating it.
SELECT cron.schedule(
  'notification-email-worker',
  '*/5 * * * *',
  $job$
    SELECT net.http_post(
      url     := 'https://cicada.city/api/notifications-cron?action=cron',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets
                      WHERE name = 'cron_secret_notifications'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $job$
);

-- 4. Verify it registered.
SELECT jobid, schedule, jobname, active
FROM cron.job
WHERE jobname = 'notification-email-worker';

-- ----------------------------------------------------------------------------
-- USEFUL LATER:
--   -- See recent runs + HTTP status (status_code 200 = worker accepted it):
--   SELECT j.jobname, r.status, r.return_message, r.start_time
--   FROM cron.job_run_details r JOIN cron.job j ON j.jobid = r.jobid
--   WHERE j.jobname = 'notification-email-worker'
--   ORDER BY r.start_time DESC LIMIT 10;
--
--   -- Inspect the actual HTTP responses pg_net received:
--   SELECT status_code, content FROM net._http_response ORDER BY created DESC LIMIT 10;
--
--   -- Pause / remove the schedule:
--   SELECT cron.unschedule('notification-email-worker');
-- ----------------------------------------------------------------------------

DO $$ BEGIN RAISE NOTICE '✅ notification-email-worker scheduled every 5 minutes'; END $$;

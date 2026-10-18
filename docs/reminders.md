# Reminders and notifications

How reminders reach a device, and the two things to set up once on the
live site.

## How it works

- A to-do, habit or event can remind **at a time on its day**, **some
  minutes before** its time, or **at any moment** (to-dos), and can be
  **snoozed**. One module decides what is due: `src/lib/reminders.ts`.
- **While Acture is open**, the app checks every 20 seconds and shows a card
  with Done and Snooze (and a system notification on devices without push).
- **While it is closed**, the server pushes the reminder. Each device that
  turned notifications on (Settings → Notifications, or the first time a
  reminder is set) is stored as a private `PushDevice` node. Once a minute
  a scheduled job calls `/api/reminders/dispatch`, which sends whatever is
  due on each person's own clock and records it on the item so it is never
  sent twice (`src/lib/push-server.ts`).
- The notification has **Done** and **Snooze 10 min** buttons where the
  platform supports them (Mac and Android; iPhone shows it without
  buttons). The service worker (`public/sw.js`) acts on them directly.

Where push works: Chrome, Edge and Firefox on Mac/Windows/Android; Safari on
macOS 13+; iPhone/iPad 16.4+ **only in the app added to the Home Screen**.
The Mac desktop app (`desktop/`) shows reminders natively while it is
running, from the same in-app check.

## One-time setup on the live site

### 1. Environment variables in Vercel

Copy these four from your local `.env` into the Vercel project
(`life-p` → Settings → Environment Variables, Production), then redeploy:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
CRON_SECRET
```

Or from this folder: `vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production`
(and the same for each), pasting the value from `.env` when asked.

Keep `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as a pair: if
you ever change them, every device has to turn notifications on again.

### 2. The every-minute job (Supabase)

Vercel's free plan only runs scheduled jobs once a day, so the minute-by-
minute call comes from Supabase, which you already use for sign-in. In the
Supabase dashboard → **Integrations → Cron** (enable it), or in the SQL
editor:

```sql
-- once: the extensions the job needs
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- every minute: ask Acture to send what is due
select cron.schedule(
  'acture-reminders',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://app.acture.co/api/reminders/dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET from .env>')
  );
  $$
);
```

To check it is running: `select * from cron.job_run_details order by start_time desc limit 5;`
To stop it: `select cron.unschedule('acture-reminders');`

On a Vercel Pro plan you can use Vercel Cron instead: add
`{"crons":[{"path":"/api/reminders/dispatch","schedule":"* * * * *"}]}` to
`vercel.json`. Vercel sends the same `Authorization: Bearer $CRON_SECRET`
header, so the route needs no change.

### 3. Try it

Open the live app → Settings → Notifications → **Turn on** → **Send a test**.

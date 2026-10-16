# Deploy checklist — Code Connect

About 15 minutes. You need a free Supabase account, a free Vercel account and a GitHub account.

## 1. Supabase (database + backend)
1. supabase.com → **New project** (any name; region **Mumbai** is closest).
2. Left menu → **SQL Editor** → **New query** → paste all of `supabase/00_ALL_IN_ONE.sql` → **Run**.
   It should end with "Success. No rows returned".
3. New query → run this with **your own** admin password:
   ```sql
   update public.settings set admin_hash = extensions.crypt('YOUR-ADMIN-PASSWORD', extensions.gen_salt('bf')) where id = 1;
   ```
4. **Project Settings → API Keys** → copy the **Project URL** and the **Publishable key** (`sb_publishable_…`).
   Never use the secret / service_role key in the website.

## 2. GitHub
Push this folder to a new GitHub repo (GitHub Desktop → Add existing repository → Publish).
`.env.local`, `node_modules` and `dist` are ignored automatically.

## 3. Vercel (website)
1. vercel.com → **Add New → Project** → import the repo.
2. Settings are read from `vercel.json` (Vite, `npm run build`, output `dist`, Node 22). Don't change them.
3. **Environment Variables** → add both:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = your Publishable key
4. **Deploy**. You get a link like `code-connect.vercel.app`.

## 4. Before students arrive
- [ ] Open `yoursite/#/admin`, log in with your admin password.
- [ ] **Interests** tab: fill every mentor's answers from the Google Form (no "UNSET" left).
- [ ] **Control** tab: check team sizes (min / max) for each mentor.
- [ ] Register one test student yourself, pick mentors, answer a few questions.
- [ ] **Students** tab → **Reset** your test student (or leave the quiz closed until the event).
- [ ] Click **Open quiz** when you are ready to start.

## 5. On the day
- Share the link. Students: ENTER → Create access → pick 3 mentors → quiz.
- Watch **Control** for "Picks locked" / "Quiz complete" counts.
- When time is up: **Teams → End quiz & create teams → Save teams → Export CSV**.
- Fix teams by hand with **Move to…**; change sizes on **Control**, then **Re-create teams**.

## Updating later
- New mentor or question: edit `data/mentors.json` → `npm run seed` → run the new `supabase/03_seed.sql` (or `00_ALL_IN_ONE.sql`) in Supabase. Student data and team sizes are kept.
- Code change: push to GitHub; Vercel redeploys automatically.
- Optional voice line: put your recording at `public/audio/voice-select.mp3`.

## If something goes wrong
| What you see | Fix |
|---|---|
| "Supabase is not configured" | Env vars missing in Vercel → add them → **Redeploy** |
| "The admin password has not been set" | Run step 1.3 |
| Login says "No registration found" | Student must register first (Create access) |
| Interest questions give everyone 0 | Fill the mentor's answers on the Interests tab |
| Student's laptop died mid-quiz | They log in again — the quiz continues. If stuck: Students → Reset |

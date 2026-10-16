# Code Connect · Hypervision — Mentor Selection

> **Deploying? Follow [DEPLOY.md](./DEPLOY.md)** — one SQL file for Supabase, two env vars for Vercel.

React + Vite + TypeScript frontend, Supabase backend (no server of your own). Deploys as a static site on Vercel.

## How it works

| Who | Page | What happens |
|---|---|---|
| Student | `#/register` | Registers (name, SAP ID, year, phone, college email, interests) and is logged in |
| Student | `#/` | Logs in with SAP ID + college email |
| Student | `#/student` | Picks 3 mentors in order → takes 3 quiz parts (one per mentor) → sees **"Quiz complete"** |
| Admin | `#/admin` | Opens/ends the quiz, sets mentor interest answers, **creates teams (visible to admins only)**, exports CSV |

**Quiz:** each mentor has their own quiz: 5 skill questions about that mentor + 5 interest-match questions = 10 per mentor, 30 total.
**Scoring (on the server):** correct or matching answer **+4**, plus up to **+2** for speed (full bonus at 0 s, none at the time limit); wrong or non-matching **−1**; skip or time-out **0**. Each question has 30 s. The clock runs on the server, so refreshing the page doesn't buy extra time.
**Teams:** students are placed by preference first, then by score in that mentor's quiz: all 1st choices, then 2nd, then 3rd. Anyone left goes to the mentor with the best interest match who has space. Teams are 5–8 by default.

## 1. Supabase setup (once)

In your Supabase project, open **SQL Editor → New query**, then paste `supabase/00_ALL_IN_ONE.sql` and run it (it contains the three files below, in order):

1. `supabase/01_registrations.sql`: the registrations table
2. `supabase/02_quiz.sql`: mentors, questions, answers, teams, and all the functions
3. `supabase/03_seed.sql`: the 5 mentors and their 50 questions

Then **set the admin password** (choose your own):

```sql
update public.settings set admin_hash = extensions.crypt('YOUR-ADMIN-PASSWORD', extensions.gen_salt('bf')) where id = 1;
```

## 2. Env vars

Create `.env.local` (git-ignored):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

Add the same two variables in **Vercel → Project → Settings → Environment Variables**.

## 3. Run / deploy

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # Vercel does this automatically (output: dist)
```

## 4. On the day

1. Mentors fill in the Google Form (`create_mentor_form.gs`).
2. Admin → **Mentor interests**: copy each mentor's 6 answers from the form's response sheet. Until you do this, interest questions for that mentor score 0. The Overview tab warns you.
3. Admin → **Open quiz**.
4. When time is up: Admin → Teams → **End quiz & create teams** → check the preview → **Save teams** → **Export CSV**.
5. If a student's laptop dies mid-quiz: Admin → Students → **Reset** lets them start again.
6. **Change a team's size:** Admin → Control → Mentors table → edit min / max → **Save**. Takes effect the next time you create teams. Re-running the seed does not overwrite it.
7. **Move a student to another team:** Admin → Teams → **Move to…** next to their name. In a preview it changes the preview (save to keep it); on saved teams it saves straight away. Moved students show "Moved by admin". Unassigned students in a preview can be placed with **Add to…**.

## Adding mentors or editing questions

1. Edit `data/mentors.json` to add a mentor (give them a lowercase `id`) or change questions. `answer` is the 0-based index of the correct option.
2. Run `npm run seed`. This regenerates `supabase/03_seed.sql` and checks the data for mistakes.
3. Paste the new `03_seed.sql` into the SQL Editor and run it. Student data and interest answers are kept.

Team size limits: set the starting size with `"minTeam"` / `"maxTeam"` in `mentors.json` (used only when a mentor is first added); after that, change it on the admin page.
Interest questions: `data/interest_questions.json`. Keep the option order identical to the Google Form.
Time per question / marks: `settings` table (`question_seconds`, `points_correct`, `points_wrong`, `speed_bonus_max`).

## Security

- The correct answers never reach the browser. They live in tables the publishable key can't read. Scoring happens inside Postgres functions.
- Students only reach their own data through a session token. Admin functions need the admin password.
- Login is SAP ID + college email with no OTP, as agreed. Anyone who knows both values can log in as that student.

## Project structure

```
data/                     mentors + questions (source of truth, NOT shipped to the browser)
scripts/build-seed.mjs    data/*.json → supabase/03_seed.sql
supabase/                 SQL to run in Supabase
src/pages/                Login, Register, Student (Choose → Quiz → Done), Admin
src/lib/api.ts            Supabase RPC calls + error messages
src/lib/allocate.ts       team allocation rules
src/index.css             Hypervision theme
```
# Code-Connect-mentors
# code-connect-mentors

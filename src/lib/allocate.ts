// Team allocation — runs in the admin page, result is saved to the `teams` table.
//
// Rules (agreed):
// 1. Preference first, then score:
//    Round 1 seats students on their 1st-choice mentor, highest score first, until the team is full.
//    Round 2 does the same for remaining students' 2nd choice, then Round 3 for 3rd choice.
//    Score = the student's points in THAT mentor's quiz (ties → less time, then SAP ID).
// 2. Anyone still unplaced goes to the mentor with the best interest match who has space
//    (mentors below their minimum team size are filled first).
// 3. If every team is full, the student is listed as unplaced for the admin to handle.

export type MentorSlot = { id: string; name: string; min_team: number; max_team: number }

export type StudentResult = {
  sap_id: string
  name: string
  choices: string[] // [1st, 2nd, 3rd]
  finished: boolean
  scores: Record<string, number> // mentorId → points in that mentor's quiz
  seconds: Record<string, number> // mentorId → total seconds used
  interests: Record<string, number> // qkey → option index the student picked
}

export type Placement = {
  sap_id: string
  mentor_id: string
  via: 'choice1' | 'choice2' | 'choice3' | 'interest' | 'manual' // manual = moved by an admin
  score: number | null // score in that mentor's quiz, null if they never took it
  match?: number // interest matches (only for via = 'interest')
}

export type AllocationResult = {
  placements: Placement[]
  unplaced: string[] // sap_ids
  belowMin: { mentor_id: string; count: number; min: number }[]
}

export function interestMatch(student: Record<string, number>, mentor: Record<string, number>): number {
  let n = 0
  for (const k of Object.keys(mentor)) if (student[k] !== undefined && student[k] === mentor[k]) n++
  return n
}

export function allocate(
  mentors: MentorSlot[],
  students: StudentResult[],
  mentorInterests: Record<string, Record<string, number>>, // mentorId → qkey → answer index
): AllocationResult {
  const seats = new Map<string, number>(mentors.map((m) => [m.id, 0]))
  const byId = new Map(mentors.map((m) => [m.id, m]))
  const placed = new Map<string, Placement>()

  const score = (s: StudentResult, m: string) => s.scores[m] ?? 0
  const secs = (s: StudentResult, m: string) => s.seconds[m] ?? Number.MAX_SAFE_INTEGER

  // Rounds 1–3: preference first, then score
  for (let r = 0; r < 3; r++) {
    for (const m of mentors) {
      const queue = students
        .filter((s) => !placed.has(s.sap_id) && s.choices[r] === m.id)
        .sort(
          (a, b) =>
            score(b, m.id) - score(a, m.id) || secs(a, m.id) - secs(b, m.id) || a.sap_id.localeCompare(b.sap_id),
        )
      for (const s of queue) {
        if (seats.get(m.id)! >= m.max_team) break
        placed.set(s.sap_id, {
          sap_id: s.sap_id,
          mentor_id: m.id,
          via: (['choice1', 'choice2', 'choice3'] as const)[r],
          score: s.scores[m.id] ?? null,
        })
        seats.set(m.id, seats.get(m.id)! + 1)
      }
    }
  }

  // Leftovers: best interest match among mentors with space (under-minimum teams first)
  const best = (s: StudentResult) => Math.max(0, ...Object.values(s.scores))
  const leftovers = students.filter((s) => !placed.has(s.sap_id)).sort((a, b) => best(b) - best(a))
  const unplaced: string[] = []

  for (const s of leftovers) {
    const open = mentors.filter((m) => seats.get(m.id)! < m.max_team)
    if (open.length === 0) {
      unplaced.push(s.sap_id)
      continue
    }
    const ranked = open
      .map((m) => ({
        m,
        under: seats.get(m.id)! < m.min_team ? 1 : 0,
        match: interestMatch(s.interests, mentorInterests[m.id] ?? {}),
        size: seats.get(m.id)!,
      }))
      .sort((a, b) => b.under - a.under || b.match - a.match || a.size - b.size || a.m.id.localeCompare(b.m.id))
    const pick = ranked[0]
    placed.set(s.sap_id, {
      sap_id: s.sap_id,
      mentor_id: pick.m.id,
      via: 'interest',
      score: s.scores[pick.m.id] ?? null,
      match: pick.match,
    })
    seats.set(pick.m.id, pick.size + 1)
  }

  const belowMin = mentors
    .filter((m) => seats.get(m.id)! < m.min_team)
    .map((m) => ({ mentor_id: m.id, count: seats.get(m.id)!, min: byId.get(m.id)!.min_team }))

  return { placements: [...placed.values()], unplaced, belowMin }
}

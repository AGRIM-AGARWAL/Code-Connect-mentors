/**
 * Code Connect · Hypervision — Mentor Interest Form
 *
 * HOW TO USE (2 minutes):
 * 1. Go to https://script.google.com → New project
 * 2. Delete the sample code, paste this whole file
 * 3. Click Run ▶ (function: createMentorForm) → allow permissions
 * 4. Open "Execution log" — it prints the form link + the responses Sheet link
 *
 * IMPORTANT: the INTEREST questions use FIXED options on purpose.
 * The student quiz will ask the SAME questions with the SAME options,
 * so answers can be matched exactly. Don't edit option text after
 * mentors start responding.
 */

// Same list as the student registration form (keep in sync with INTEREST_OPTIONS in App.tsx)
const DOMAINS = [
  'Web Development',
  'App Development',
  'AI / Machine Learning',
  'Data Science',
  'Cybersecurity',
  'Cloud & DevOps',
  'Blockchain / Web3',
  'Game Development',
  'IoT / Hardware',
];

function createMentorForm() {
  const form = FormApp.create('Code Connect · Mentor Interest Form');
  form
    .setDescription(
      'Hi! Thanks for mentoring at Hypervision → Code Connect.\n\n' +
      'Students will take a short quiz about the mentors they pick. ' +
      'Your answers here decide (1) the skill questions about you and ' +
      '(2) the interest-match questions that pair you with like-minded students.\n\n' +
      'Takes about 5 minutes.'
    )
    .setProgressBar(true)
    .setLimitOneResponsePerUser(false)
    .setAllowResponseEdits(true);

  // ── Section 1: About you ─────────────────────────────
  form.addSectionHeaderItem().setTitle('About you');

  form.addTextItem().setTitle('Full name').setRequired(true);

  form.addTextItem()
    .setTitle('Email')
    .setRequired(true)
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build());

  form.addTextItem()
    .setTitle('Contact number (10 digits)')
    .setRequired(true)
    .setValidation(
      FormApp.createTextValidation()
        .requireTextMatchesPattern('^[6-9][0-9]{9}$')
        .setHelpText('Enter a valid 10-digit Indian mobile number')
        .build()
    );

  form.addTextItem()
    .setTitle('LinkedIn profile URL')
    .setHelpText('We use this to frame the skill questions about you.')
    .setRequired(true)
    .setValidation(FormApp.createTextValidation().requireTextIsUrl().build());

  form.addTextItem()
    .setTitle('GitHub / portfolio URL (optional)')
    .setValidation(FormApp.createTextValidation().requireTextIsUrl().build());

  form.addTextItem()
    .setTitle('Current role (e.g. 4th year B.Tech CSE / SDE at XYZ)')
    .setRequired(true);

  // ── Section 2: Skills (→ Part A quiz questions) ──────
  form.addPageBreakItem()
    .setTitle('Your skills')
    .setHelpText('Part A of the student quiz is about YOU. Be specific — this is what students will be tested on.');

  form.addCheckboxItem()
    .setTitle('Your main domains')
    .setChoiceValues(DOMAINS)
    .showOtherOption(true)
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('Languages, frameworks & tools you use most')
    .setHelpText('e.g. Python, React, PyTorch, Docker, Figma')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('2–3 projects you are proud of (name + one line each)')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('Internships, achievements, hackathon wins (optional)');

  form.addParagraphTextItem()
    .setTitle('2–3 fun facts about you students could be quizzed on (optional)');

  // ── Section 3: Interests (→ Part B interest match) ───
  form.addPageBreakItem()
    .setTitle('Your interests')
    .setHelpText('Part B of the quiz asks students these same questions. Matching answers = higher score with you.');

  form.addCheckboxItem()
    .setTitle('Which domains do you want to mentor in? (pick up to 3)')
    .setChoiceValues(DOMAINS)
    .setValidation(FormApp.createCheckboxValidation().requireSelectAtMost(3).build())
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('What kind of project would you like your team to build?')
    .setChoiceValues([
      'Real product / startup-style app',
      'Research / paper-style project',
      'Open-source contribution',
      'Hackathon / competition build',
      'Learning-first (fundamentals + mini projects)',
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Your mentoring style')
    .setChoiceValues([
      'Hands-on — I code alongside the team',
      'Guide & review — I set direction, review their work',
      'Hands-off — the team drives, I unblock when needed',
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('How do you like to work?')
    .setChoiceValues([
      'Structured — fixed weekly goals and check-ins',
      'Sprint-based — intense bursts around deadlines',
      'Flexible — async, at our own pace',
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('What do you value most in a mentee?')
    .setChoiceValues([
      'Consistency',
      'Curiosity',
      'Technical depth',
      'Creativity',
      'Communication',
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Preferred way to meet the team')
    .setChoiceValues(['In person on campus', 'Online calls (Meet / Discord)', 'Mostly chat (WhatsApp / Discord)'])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Time you can give per week')
    .setChoiceValues(['Under 2 hours', '2–4 hours', '4–6 hours', '6+ hours'])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('Interests outside tech (pick up to 3)')
    .setChoiceValues([
      'Sports / fitness',
      'Music',
      'Gaming',
      'Reading / writing',
      'Design / art',
      'Entrepreneurship',
      'Finance / investing',
      'Content creation',
      'Travel',
    ])
    .setValidation(FormApp.createCheckboxValidation().requireSelectAtMost(3).build())
    .setRequired(true);

  // ── Section 4: Team ──────────────────────────────────
  form.addPageBreakItem().setTitle('Your team');

  form.addMultipleChoiceItem()
    .setTitle('Preferred team size (allowed range is 5–8)')
    .setChoiceValues(['5', '6', '7', '8'])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Have you mentored before?')
    .setChoiceValues(['Yes', 'No'])
    .setRequired(true);

  form.addParagraphTextItem().setTitle('Anything else we should know? (optional)');

  // ── Responses → Google Sheet ─────────────────────────
  const sheet = SpreadsheetApp.create('Code Connect · Mentor Responses');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  Logger.log('Share this link with mentors: ' + form.getPublishedUrl());
  Logger.log('Edit the form:               ' + form.getEditUrl());
  Logger.log('Responses sheet:             ' + sheet.getUrl());
}

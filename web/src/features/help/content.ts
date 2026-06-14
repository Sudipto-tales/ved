// The help content registry. Each topic is keyed by the string passed to <HelpDot
// topic="..."> / PageHeader help="...". Content is plain data (no markup engine) so
// it stays simple, searchable, and easy for non-engineers to extend. Keep entries
// short, task-focused, and written in plain language for school staff.

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'tip'; text: string };

export interface HelpTopic {
  /** URL key, e.g. /help/students */
  slug: string;
  title: string;
  /** One-line description for the help index. */
  summary: string;
  /** Grouping for the help index. */
  category: 'Getting started' | 'People' | 'Academics' | 'Finance' | 'Administration' | 'Platform';
  blocks: Block[];
  /** Related topic slugs shown at the bottom. */
  related?: string[];
}

const p = (text: string): Block => ({ kind: 'p', text });
const h = (text: string): Block => ({ kind: 'h', text });
const ul = (items: string[]): Block => ({ kind: 'ul', items });
const ol = (items: string[]): Block => ({ kind: 'ol', items });
const tip = (text: string): Block => ({ kind: 'tip', text });

export const HELP_TOPICS: HelpTopic[] = [
  {
    slug: 'getting-started',
    title: 'Getting started with VED',
    summary: 'What VED is, how to sign in, and how to find your way around.',
    category: 'Getting started',
    blocks: [
      p('VED replaces the spreadsheets and paper registers schools rely on with one simple, secure system for students, staff, academics, and fees. It works on your school’s own network, so it keeps running even when the internet is down.'),
      h('Finding your way around'),
      ul([
        'The left sidebar groups everything by who it’s for — admin tools, teacher tools, and so on.',
        'Each screen has a title at the top. A small “?” next to a title opens help for exactly that screen.',
        'Your school is shown near the top of the sidebar. Use “Sign out” at the bottom to leave.',
      ]),
      tip('Look for the “?” next to any page title or section — it always opens guidance written for that specific task.'),
    ],
    related: ['signing-in', 'choosing-school'],
  },
  {
    slug: 'signing-in',
    title: 'Signing in & your password',
    summary: 'Logging in, first-time password setup, and what to do if sign-in fails.',
    category: 'Getting started',
    blocks: [
      h('Signing in'),
      ol([
        'Enter the email or username your school gave you.',
        'Enter your password and select “Sign in”.',
      ]),
      h('First-time sign in'),
      p('If this is your first sign-in, you’ll be asked to set a new password. Enter the temporary password you were given, then choose a new one (at least 8 characters). This keeps your account private to you.'),
      h('If you can’t sign in'),
      ul([
        'Double-check the email/username for typos.',
        'Passwords are case-sensitive.',
        'If you’re still stuck, ask your school administrator to reset your account — they can issue a fresh temporary password.',
      ]),
      tip('VED never shows whether an email exists, so a wrong email and a wrong password look the same. That’s deliberate — it protects everyone’s accounts.'),
    ],
    related: ['getting-started', 'choosing-school'],
  },
  {
    slug: 'choosing-school',
    title: 'Working across multiple schools',
    summary: 'How to pick which school you’re working in when you belong to several.',
    category: 'Getting started',
    blocks: [
      p('One VED account can belong to more than one school — useful for administrators who run several. Your role can differ in each: admin in one, teacher in another.'),
      ol([
        'After signing in, if you belong to more than one school you’ll see a chooser.',
        'Select the school you want to work in. Everything you see and change applies only to that school.',
        'To switch, sign out and sign back in, then pick a different school.',
      ]),
      tip('Schools are fully separated. Data from one school is never visible while you’re working in another.'),
    ],
    related: ['signing-in'],
  },
  {
    slug: 'notes',
    title: 'Notes (demo)',
    summary: 'A small demonstration screen used while VED is being built.',
    category: 'Getting started',
    blocks: [
      p('Notes is a temporary demonstration screen. It proves the core plumbing works end to end: your school’s data stays private to your school, every change is recorded, and nothing is lost.'),
      p('It will be removed once the first real screens (students and onboarding) are ready.'),
    ],
  },
  {
    slug: 'students',
    title: 'Students',
    summary: 'Admitting students, the roster, and student profiles.',
    category: 'People',
    blocks: [
      p('The Students area is where you admit new students, view the full roster, and open any student’s profile.'),
      h('Admitting a student'),
      ol([
        'Start the onboarding wizard and enter the student’s details.',
        'VED generates the student’s login automatically and links any guardians.',
        'Review and confirm — the student is enrolled and a record is created.',
      ]),
      h('The roster'),
      ul([
        'Search and filter to find a student quickly.',
        'Open a profile to see academics, fees, and guardians in one place.',
      ]),
      tip('Removing a student only hides them — records are kept so you can restore them and never lose history.'),
    ],
    related: ['onboarding', 'guardians', 'fees'],
  },
  {
    slug: 'onboarding',
    title: 'Onboarding & credentials',
    summary: 'How new people get added and how their logins are created.',
    category: 'People',
    blocks: [
      p('Onboarding is the guided process for adding a new student, teacher, or staff member. It collects their details, creates their login, and sets up their access in one flow.'),
      h('Logins are generated for you'),
      ul([
        'VED creates a unique login for each person automatically — you don’t invent usernames.',
        'Each person gets a temporary password and is asked to set their own on first sign-in.',
        'Young students may not have an email; VED still gives them a usable login.',
      ]),
      h('Approvals'),
      p('Some schools require a second person to approve new entries. If yours does, submitted entries wait in an approvals list until an administrator confirms them.'),
      tip('You can skip the wizard for bulk or quick entry where your school allows it — ask your administrator which mode is enabled.'),
    ],
    related: ['students', 'teachers', 'staff', 'access'],
  },
  {
    slug: 'teachers',
    title: 'Teachers',
    summary: 'Managing teaching staff and their portal.',
    category: 'People',
    blocks: [
      p('The Teachers area manages your teaching staff: adding them, viewing profiles, and assigning them to classes (in Academics).'),
      ul([
        'Add a teacher through onboarding — their login is created automatically.',
        'Teachers get their own portal for classes, attendance, and marks.',
        'A person’s job title (designation) is separate from what they’re allowed to do (their role).',
      ]),
    ],
    related: ['onboarding', 'academics', 'access'],
  },
  {
    slug: 'staff',
    title: 'Staff',
    summary: 'Managing non-teaching staff and authorities.',
    category: 'People',
    blocks: [
      p('Staff covers non-teaching employees — office, accounts, administration. They’re added the same way as teachers, through onboarding.'),
      p('What each staff member can do is controlled by the roles you assign them, not by their job title.'),
    ],
    related: ['onboarding', 'access'],
  },
  {
    slug: 'access',
    title: 'Roles & permissions',
    summary: 'How VED decides who can do what.',
    category: 'Administration',
    blocks: [
      p('Access in VED is built from a few simple ideas that keep things both flexible and safe.'),
      h('Roles vs. designations'),
      ul([
        'A role is a bundle of permissions, like “Admission Officer” or “Accountant”. Roles decide what someone can do.',
        'A designation is a job title, like “Vice Principal”. It’s for display and HR only — it never grants access.',
      ]),
      h('Assigning access'),
      ol([
        'Create roles and tick the permissions each one should have.',
        'Assign one or more roles to a person.',
        'They can immediately do everything their roles allow — nothing more.',
      ]),
      tip('The “School Admin” role can do everything within your school. Give it sparingly.'),
    ],
    related: ['onboarding', 'admin'],
  },
  {
    slug: 'academics',
    title: 'Academics',
    summary: 'Programs, subjects, sections, timetables, attendance, and exams.',
    category: 'Academics',
    blocks: [
      p('Academics is where you set up how your school teaches: programs and grades, subjects, the sections students belong to, who teaches them, the timetable, attendance, and exams.'),
      h('A typical setup order'),
      ol([
        'Create programs and their stages/grades.',
        'Add subjects and build the curriculum.',
        'Create sections and enrol students into them.',
        'Assign teachers, then build the timetable.',
      ]),
      tip('Attendance and exam marks are recorded as a running history — corrections add a new entry rather than overwriting, so you always have an accurate trail.'),
    ],
    related: ['teachers', 'students'],
  },
  {
    slug: 'finance',
    title: 'Finance',
    summary: 'Fees, invoices, collections, and the ledger.',
    category: 'Finance',
    blocks: [
      p('Finance manages money owed and money received: what students are charged, what’s outstanding, and what’s been paid.'),
      h('How it fits together'),
      ul([
        'Fee heads are the things you charge for (tuition, transport, exam).',
        'A fee structure groups heads into what a class or student owes.',
        'Invoices show what’s due; collections record payments against them.',
      ]),
      tip('Every payment gets a sequential receipt number with no gaps, and the ledger is never edited — corrections are added as new entries. This keeps your accounts audit-ready.'),
    ],
    related: ['fees', 'students', 'reports'],
  },
  {
    slug: 'fees',
    title: 'Fees & payments',
    summary: 'Recording a payment and reading a student’s balance.',
    category: 'Finance',
    blocks: [
      h('Recording a payment'),
      ol([
        'Open the student or the invoice you’re collecting against.',
        'Enter the amount received and the method.',
        'Confirm — VED issues a receipt number automatically.',
      ]),
      h('Reading a balance'),
      p('A student’s balance is always calculated from their actual charges and payments, so it’s never out of date and can’t be edited by hand.'),
    ],
    related: ['finance', 'students'],
  },
  {
    slug: 'guardians',
    title: 'Guardian portal',
    summary: 'What parents and guardians can see and do.',
    category: 'People',
    blocks: [
      p('Guardians get a focused, read-friendly view of their own children only — attendance, marks, fees, and notices. They can never see other families’ data.'),
      ul([
        'A guardian linked to several children switches between them in the portal.',
        'Early on the portal is mainly for viewing; paying fees and other actions are added over time.',
      ]),
    ],
    related: ['students', 'fees'],
  },
  {
    slug: 'learning',
    title: 'Learning (LMS)',
    summary: 'Lesson plans, materials, assignments, and grading.',
    category: 'Academics',
    blocks: [
      p('The Learning area is the online classroom: teachers share lesson plans and materials, set assignments, and grade what students submit.'),
      ul([
        'Teachers create assignments and attach files.',
        'Students submit their work; teachers grade it.',
        'Grades flow into the academic record automatically.',
      ]),
    ],
    related: ['academics', 'teachers'],
  },
  {
    slug: 'communication',
    title: 'Communication',
    summary: 'Notices and notifications.',
    category: 'Administration',
    blocks: [
      p('Communication is how the school reaches people — posting notices and sending notifications to students, staff, and guardians.'),
      tip('Target a notice to the right audience (a class, a role, or everyone) so people only get what’s relevant to them.'),
    ],
  },
  {
    slug: 'reports',
    title: 'Reports & backups',
    summary: 'Dashboards, exports, and keeping your data safe.',
    category: 'Administration',
    blocks: [
      p('Reports turn your day-to-day data into dashboards and exports, and let you back up and restore your school’s records.'),
      ul([
        'Dashboards summarise enrolment, attendance, and collections at a glance.',
        'Exports produce spreadsheets for sharing or archiving.',
        'Backups let you save a full copy and restore it if needed.',
      ]),
      tip('Run a backup before any big change — admissions season, fee restructuring, or year-end.'),
    ],
  },
  {
    slug: 'admin',
    title: 'School settings',
    summary: 'Your school’s profile, academic year, and rooms.',
    category: 'Administration',
    blocks: [
      p('Settings hold the basics about your school: its profile, the current academic year, and physical rooms used for timetabling.'),
      p('Changes here affect the whole school, so they’re usually limited to administrators.'),
    ],
    related: ['access', 'academics'],
  },
];

const BY_SLUG: Record<string, HelpTopic> = Object.fromEntries(HELP_TOPICS.map((t) => [t.slug, t]));

export function getTopic(slug: string | undefined): HelpTopic | undefined {
  return slug ? BY_SLUG[slug] : undefined;
}

// Maps a route's first path segment to the most relevant help topic, so any screen
// (including not-yet-built ones) can show a contextual "?". Falls back to the
// getting-started overview.
const SEGMENT_TO_TOPIC: Record<string, string> = {
  notes: 'notes',
  students: 'students', portal: 'students',
  teachers: 'teachers',
  staff: 'staff',
  onboarding: 'onboarding',
  guardians: 'guardians', guardian: 'guardians',
  academics: 'academics', programs: 'academics', curriculum: 'academics', subjects: 'academics',
  sections: 'academics', enrollment: 'academics', timetable: 'academics', attendance: 'academics',
  exams: 'academics', marks: 'academics',
  finance: 'finance', 'fee-heads': 'finance', 'fee-structures': 'finance', invoices: 'fees',
  collection: 'fees', ledger: 'finance', payments: 'fees',
  learning: 'learning', assignments: 'learning', 'lesson-plans': 'learning',
  access: 'access', roles: 'access', designations: 'access',
  admin: 'admin',
  communication: 'communication', notices: 'communication', notifications: 'communication',
  reports: 'reports', dashboards: 'reports', exports: 'reports', 'backup-restore': 'reports',
};

export function topicForPath(path: string): string {
  const seg = path.split('/')[0];
  return SEGMENT_TO_TOPIC[seg] ?? 'getting-started';
}

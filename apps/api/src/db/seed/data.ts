import type { AvatarConfig, RobotConfig } from '@space/shared';

/**
 * Juniper Space — fictional demonstration company. Every record here is inserted into the real
 * database through the same tables the product uses; nothing is rendered from hardcoded UI data.
 */

type A = Partial<AvatarConfig>;
const abaya = (o: A = {}): A => ({ body: 'feminine', outfit: 'abaya', headwear: 'hijab', abayaVariant: 'classic', outfitColor: '#1c1b20', headwearColor: '#1c1b20', shoes: 'loafers', ...o });
const thobe = (o: A = {}): A => ({ body: 'masculine', outfit: 'thobe', headwear: 'shemagh', agal: true, outfitColor: '#f7f5f0', hairStyle: 'short', hairColor: '#1f1a1a', shoes: 'sandals', blush: false, ...o });
const casualF = (o: A = {}): A => ({ body: 'feminine', outfit: 'casual', headwear: 'none', hairStyle: 'long_wavy', outfitColor: '#e9e3d8', innerColor: '#cfd9e8', shoes: 'sneakers', ...o });
const casualM = (o: A = {}): A => ({ body: 'masculine', outfit: 'casual', headwear: 'none', hairStyle: 'short_curly', hairColor: '#1f1a1a', outfitColor: '#2c2c33', innerColor: '#e9e3d8', shoes: 'sneakers', blush: false, ...o });

export interface SeedPerson {
  key: string;
  name: string;
  email: string;
  title: string;
  role: 'company_admin' | 'employee' | 'viewer';
  depts: Array<[string, 'admin' | 'member']>;
  presence: 'available' | 'working' | 'in_meeting' | 'focus' | 'remote' | 'away' | 'on_break' | 'offline';
  avatar: A;
}

export const DEPARTMENTS = [
  { key: 'dev', name: 'Development', theme: 'development', floor: 1, description: 'Builds and runs the Juniper platform.' },
  { key: 'design', name: 'Design', theme: 'design', floor: 1, description: 'Product, brand and visual design.' },
  { key: 'mkt', name: 'Marketing', theme: 'marketing', floor: 1, description: 'Campaigns, content and growth.' },
  { key: 'ops', name: 'Operations', theme: 'operations', floor: 1, description: 'Facilities, vendors and internal processes.' },
  { key: 'fin', name: 'Finance', theme: 'finance', floor: 1, description: 'Budgeting, reporting and payments.' },
  { key: 'hr', name: 'Human Resources', theme: 'hr', floor: 1, description: 'People, hiring and culture.' },
  { key: 'product', name: 'Product', theme: 'product', floor: 2, description: 'Roadmap, discovery and delivery.' },
  { key: 'cs', name: 'Customer Success', theme: 'general', floor: 2, description: 'Onboarding and support for customers.' },
] as const;

export const PEOPLE: SeedPerson[] = [
  { key: 'munira', name: 'Munira Alhilal', email: 'munira@juniper.demo', title: 'Chief Operating Officer', role: 'company_admin', depts: [['ops', 'member']], presence: 'working', avatar: abaya({ hairStyle: 'long_wavy', abayaVariant: 'modern', held: 'tablet', bag: 'handbag', skinTone: '#f1cbb0' }) },
  { key: 'faisal', name: 'Faisal Almutairi', email: 'faisal@juniper.demo', title: 'Head of Engineering', role: 'employee', depts: [['dev', 'admin']], presence: 'in_meeting', avatar: thobe({ glasses: 'square', held: 'laptop', bag: 'briefcase', skinTone: '#e6b48f', watch: true }) },
  { key: 'sara', name: 'Sara Alqahtani', email: 'sara@juniper.demo', title: 'Frontend Developer', role: 'employee', depts: [['dev', 'member']], presence: 'working', avatar: abaya({ held: 'laptop', bag: 'handbag', skinTone: '#f1cbb0' }) },
  { key: 'khalid', name: 'Khalid Alzahrani', email: 'khalid@juniper.demo', title: 'Backend Developer', role: 'employee', depts: [['dev', 'member']], presence: 'focus', avatar: thobe({ headwear: 'ghutra', headwearColor: '#f7f5f0', held: 'laptop', skinTone: '#d49c74' }) },
  { key: 'ghada', name: 'Ghada Almutlaq', email: 'ghada@juniper.demo', title: 'QA Engineer', role: 'employee', depts: [['dev', 'member']], presence: 'working', avatar: casualF({ hairStyle: 'long_wavy', hairColor: '#3b2a22', glasses: 'round', headphones: true, held: 'laptop', outfitColor: '#d6e4d0', skinTone: '#f1cbb0' }) },
  { key: 'omar', name: 'Omar Alghamdi', email: 'omar@juniper.demo', title: 'DevOps Engineer', role: 'employee', depts: [['dev', 'member']], presence: 'working', avatar: casualM({ headphones: true, held: 'coffee', bag: 'backpack', skinTone: '#e6b48f' }) },
  { key: 'mohammed', name: 'Mohammed Alyami', email: 'mohammed@juniper.demo', title: 'Mobile Developer', role: 'employee', depts: [['dev', 'member']], presence: 'available', avatar: thobe({ headwear: 'none', hairStyle: 'short', held: 'tablet', bag: 'backpack', skinTone: '#b97d57' }) },
  { key: 'hessa', name: 'Hessa Alenazi', email: 'hessa@juniper.demo', title: 'Design Lead', role: 'employee', depts: [['design', 'admin']], presence: 'working', avatar: abaya({ abayaVariant: 'embroidered', embroidery: true, headwearColor: '#e7dccb', held: 'tablet', bag: 'tote', skinTone: '#f8dcc8' }) },
  { key: 'maha', name: 'Maha Alrashid', email: 'maha@juniper.demo', title: 'UI/UX Designer', role: 'employee', depts: [['design', 'member']], presence: 'focus', avatar: casualF({ hairStyle: 'bun', hairColor: '#5a3a28', outfitColor: '#f1d0d6', glasses: 'round', held: 'tablet', skinTone: '#f1cbb0' }) },
  { key: 'asma', name: 'Asma Alzahrani', email: 'asma@juniper.demo', title: 'Brand Designer', role: 'employee', depts: [['design', 'member']], presence: 'working', avatar: abaya({ abayaVariant: 'open', outfitColor: '#d6c3a8', headwearColor: '#d6c3a8', innerColor: '#f2ece2', headphones: true, held: 'coffee', skinTone: '#e6b48f' }) },
  { key: 'lina', name: 'Lina Alharbi', email: 'lina@juniper.demo', title: 'Marketing Manager', role: 'employee', depts: [['mkt', 'admin']], presence: 'working', avatar: abaya({ abayaVariant: 'modern', glasses: 'sun', bag: 'handbag', held: 'tablet', skinTone: '#f1cbb0' }) },
  { key: 'yousef', name: 'Yousef Alqahtani', email: 'yousef@juniper.demo', title: 'Growth Specialist', role: 'employee', depts: [['mkt', 'member']], presence: 'in_meeting', avatar: thobe({ held: 'coffee', bag: 'briefcase', skinTone: '#e6b48f' }) },
  { key: 'jawaher', name: 'Jawaher Alsubaie', email: 'jawaher@juniper.demo', title: 'Content Strategist', role: 'employee', depts: [['mkt', 'member']], presence: 'available', avatar: casualF({ hairStyle: 'straight', hairColor: '#1f1a1a', outfitColor: '#c7b8a4', bag: 'tote', held: 'coffee', skinTone: '#d49c74' }) },
  { key: 'ahmed', name: 'Ahmed Alharbi', email: 'ahmed@juniper.demo', title: 'Operations Manager', role: 'employee', depts: [['ops', 'admin']], presence: 'working', avatar: thobe({ glasses: 'square', bisht: true, watch: true, held: 'tablet', skinTone: '#d49c74' }) },
  { key: 'fahad', name: 'Fahad Alshammari', email: 'fahad@juniper.demo', title: 'Facilities Coordinator', role: 'employee', depts: [['ops', 'member']], presence: 'away', avatar: thobe({ outfitColor: '#9097a3', headwear: 'none', hairStyle: 'short_curly', skinTone: '#b97d57' }) },
  { key: 'abdullah', name: 'Abdullah Alotaibi', email: 'abdullah@juniper.demo', title: 'Finance Manager', role: 'employee', depts: [['fin', 'admin']], presence: 'working', avatar: thobe({ headwear: 'ghutra', headwearColor: '#f7f5f0', glasses: 'round', bag: 'briefcase', watch: true, skinTone: '#e6b48f' }) },
  { key: 'reem', name: 'Reem Aldossari', email: 'reem@juniper.demo', title: 'Financial Analyst', role: 'employee', depts: [['fin', 'member']], presence: 'focus', avatar: abaya({ outfitColor: '#24304f', headwearColor: '#2b3556', glasses: 'round', held: 'laptop', skinTone: '#f1cbb0' }) },
  { key: 'turki', name: 'Turki Almalki', email: 'turki@juniper.demo', title: 'Accountant', role: 'employee', depts: [['fin', 'member']], presence: 'working', avatar: thobe({ outfitColor: '#2f3a55', headwear: 'none', hairStyle: 'short', held: 'laptop', skinTone: '#94603f' }) },
  { key: 'noura', name: 'Noura Alshehri', email: 'noura@juniper.demo', title: 'HR Manager', role: 'employee', depts: [['hr', 'admin']], presence: 'in_meeting', avatar: abaya({ outfitColor: '#2e4a3f', headwearColor: '#1c1b20', bag: 'handbag', held: 'tablet', skinTone: '#e6b48f' }) },
  { key: 'lama', name: 'Lama Alamri', email: 'lama@juniper.demo', title: 'Talent Partner', role: 'employee', depts: [['hr', 'member']], presence: 'available', avatar: casualF({ hairStyle: 'curly', hairColor: '#5a3a28', outfitColor: '#f1d0d6', held: 'coffee', skinTone: '#f8dcc8' }) },
  { key: 'nora', name: 'Nora Alfaisal', email: 'nora@juniper.demo', title: 'Head of Product', role: 'employee', depts: [['product', 'admin']], presence: 'working', avatar: abaya({ abayaVariant: 'open', outfitColor: '#5b4a63', headwearColor: '#5d4a63', innerColor: '#e9e3d8', held: 'laptop', bag: 'tote', skinTone: '#f1cbb0' }) },
  { key: 'saad', name: 'Saad Albaqami', email: 'saad@juniper.demo', title: 'Product Manager', role: 'employee', depts: [['product', 'member']], presence: 'working', avatar: thobe({ held: 'tablet', skinTone: '#e6b48f' }) },
  { key: 'dana', name: 'Dana Alkhaldi', email: 'dana@juniper.demo', title: 'Customer Success Lead', role: 'employee', depts: [['cs', 'admin']], presence: 'working', avatar: abaya({ headwearColor: '#8d8f99', outfitColor: '#3f3a36', headphones: true, held: 'laptop', skinTone: '#d49c74' }) },
  { key: 'rakan', name: 'Rakan Alanazi', email: 'rakan@juniper.demo', title: 'Support Specialist', role: 'employee', depts: [['cs', 'member']], presence: 'on_break', avatar: casualM({ outfitColor: '#b8c4dd', held: 'coffee', skinTone: '#d49c74' }) },
  { key: 'sultan', name: 'Sultan Alharthi', email: 'sultan@juniper.demo', title: 'Board Observer', role: 'viewer', depts: [['fin', 'member']], presence: 'offline', avatar: thobe({ bisht: true, glasses: 'square', skinTone: '#b97d57' }) },
];


/** Additional employees so each department room feels like a real, staffed office. */
const EXTRA: Array<[string, string, string, string, 'f' | 'm', number]> = [
  ['Nouf Alqahtani', 'Frontend Developer', 'dev', 'working', 'f', 0],
  ['Bandar Alsharif', 'Backend Developer', 'dev', 'remote', 'm', 1],
  ['Shahad Alghamdi', 'Data Engineer', 'dev', 'focus', 'f', 2],
  ['Rawan Alotaibi', 'Product Designer', 'design', 'working', 'f', 3],
  ['Hind Alzahrani', 'Motion Designer', 'design', 'remote', 'f', 4],
  ['Majed Alanazi', 'Visual Designer', 'design', 'available', 'm', 5],
  ['Ruba Alshehri', 'Social Media Lead', 'mkt', 'working', 'f', 6],
  ['Ziyad Alsubaie', 'Performance Marketer', 'mkt', 'remote', 'm', 7],
  ['Afnan Almalki', 'Copywriter', 'mkt', 'focus', 'f', 8],
  ['Lulwa Alrashid', 'Operations Analyst', 'ops', 'working', 'f', 9],
  ['Mishari Aldossari', 'Procurement Specialist', 'ops', 'away', 'm', 10],
  ['Sarah Alamri', 'Workplace Coordinator', 'ops', 'available', 'f', 11],
  ['Amal Alkhaldi', 'Payroll Specialist', 'fin', 'working', 'f', 12],
  ['Hamad Alyami', 'Financial Controller', 'fin', 'remote', 'm', 13],
  ['Joud Albaqami', 'Recruiter', 'hr', 'working', 'f', 14],
  ['Waleed Alharthi', 'People Operations', 'hr', 'offline', 'm', 15],
  ['Dalia Alfaisal', 'L&D Specialist', 'hr', 'focus', 'f', 16],
  ['Raghad Almutairi', 'Product Manager', 'product', 'working', 'f', 17],
  ['Nawaf Alenazi', 'Product Analyst', 'product', 'remote', 'm', 18],
  ['Taif Alshammari', 'UX Researcher', 'product', 'available', 'f', 19],
  ['Ghala Almutlaq', 'Support Specialist', 'cs', 'working', 'f', 20],
  ['Fares Alhilal', 'Onboarding Manager', 'cs', 'away', 'm', 21],
];
const FEM_LOOKS: A[] = [
  abaya({ held: 'laptop' }),
  abaya({ abayaVariant: 'modern', headwearColor: '#2b3556', outfitColor: '#24304f', bag: 'handbag' }),
  casualF({ hairStyle: 'long_wavy', hairColor: '#3b2a22', outfitColor: '#f1d0d6', held: 'coffee' }),
  abaya({ abayaVariant: 'open', outfitColor: '#d6c3a8', headwearColor: '#e7dccb', innerColor: '#f2ece2', headphones: true }),
  abaya({ glasses: 'round', held: 'tablet' }),
  casualF({ hairStyle: 'straight', hairColor: '#1f1a1a', outfitColor: '#c7b8a4', glasses: 'round' }),
  abaya({ abayaVariant: 'embroidered', embroidery: true, headwearColor: '#8d8f99' }),
  abaya({ outfitColor: '#2e4a3f', headwearColor: '#1c1b20', bag: 'tote' }),
];
const MASC_LOOKS: A[] = [
  thobe({ held: 'laptop' }),
  thobe({ headwear: 'ghutra', headwearColor: '#f7f5f0', glasses: 'square' }),
  casualM({ headphones: true, outfitColor: '#2c2c33', innerColor: '#c7b8a4' }),
  thobe({ headwear: 'none', hairStyle: 'short', outfitColor: '#9097a3' }),
  thobe({ bag: 'briefcase', watch: true }),
];
const SKINS = ['#f8dcc8', '#f1cbb0', '#e6b48f', '#d49c74', '#b97d57'];
for (const [name, title, dept, presence, g, i] of EXTRA) {
  const first = name.split(' ')[0].toLowerCase();
  const look = g === 'f' ? FEM_LOOKS[i % FEM_LOOKS.length] : MASC_LOOKS[i % MASC_LOOKS.length];
  PEOPLE.push({
    key: `x${i}`,
    name,
    email: `${first}.${i}@juniper.demo`,
    title,
    role: 'employee',
    depts: [[dept, 'member']],
    presence: presence as SeedPerson['presence'],
    avatar: { ...look, skinTone: SKINS[i % SKINS.length] },
  });
}

export const AGENTS: Array<{ key: string; name: string; role: 'coding' | 'research' | 'design' | 'data' | 'documentation' | 'project'; dept: string | null; description: string; tools: string[]; robot: RobotConfig; autonomy?: 'supervised' | 'autonomous' }> = [
  { key: 'codenest', name: 'CodeNest', role: 'coding', dept: 'dev', description: 'Reviews pull requests, summarises changes and drafts technical documentation.', tools: ['list_department_tasks', 'get_task', 'read_file', 'add_task_comment', 'create_subtask', 'save_document', 'github_list_issues', 'github_get_pull_request', 'github_recent_commits', 'github_create_issue'], robot: { theme: 'sky', ears: 'headphones', face: 'happy', badge: '' } },
  { key: 'designgen', name: 'DesignGen', role: 'design', dept: 'design', description: 'Prepares design briefs and structured feedback from design files and requests.', tools: ['list_department_tasks', 'get_task', 'get_request', 'read_file', 'add_task_comment', 'save_document'], robot: { theme: 'blush', ears: 'cat', face: 'happy', badge: '' } },
  { key: 'nova', name: 'Nova', role: 'research', dept: 'mkt', description: 'Researches campaign briefs and summarises audience insights from provided documents.', tools: ['list_department_tasks', 'get_task', 'get_request', 'read_file', 'save_document'], robot: { theme: 'lilac', ears: 'headphones', face: 'curious', badge: '' } },
  { key: 'datamind', name: 'DataMind', role: 'data', dept: 'fin', description: 'Analyses structured finance data files and prepares reports.', tools: ['list_department_tasks', 'get_task', 'read_file', 'department_stats', 'save_document'], robot: { theme: 'mint', ears: 'antenna', face: 'focused', badge: '' } },
  { key: 'atlas', name: 'Atlas', role: 'project', dept: 'ops', description: 'Keeps operational projects on track: status summaries, action items and planning.', tools: ['list_department_tasks', 'get_task', 'department_stats', 'add_task_comment', 'create_subtask', 'save_document'], robot: { theme: 'peach', ears: 'round', face: 'happy', badge: '' } },
  { key: 'docubot', name: 'DocuBot', role: 'documentation', dept: null, description: 'Central documentation agent available to every department admin.', tools: ['list_department_tasks', 'get_task', 'get_request', 'read_file', 'department_stats', 'save_document'], robot: { theme: 'butter', ears: 'antenna', face: 'wink', badge: '' } },
];

type TaskSeed = {
  title: string;
  status: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due: number; // days from today
  assignee?: string; // person key or agent:key
  progress?: number;
  description?: string;
  subtasks?: Array<{ title: string; status: 'todo' | 'in_progress' | 'done'; assignee?: string }>;
  comments?: Array<[string, string]>;
  labels?: string[];
  key?: string;
  dependsOn?: string[];
};

export const PROJECTS: Array<{ dept: string; name: string; description: string; due: number; tasks: TaskSeed[] }> = [
  {
    dept: 'dev',
    name: 'Customer Portal v2',
    description: 'Rebuild of the customer self-service portal with the new design system.',
    due: 40,
    tasks: [
      { key: 'dash', title: 'Design the new dashboard shell', status: 'in_progress', priority: 'high', due: 2, assignee: 'sara', progress: 70, labels: ['frontend'], description: 'Implement the layout, navigation and empty states from the approved Figma frames.', subtasks: [ { title: 'Navigation sidebar', status: 'done', assignee: 'sara' }, { title: 'Responsive grid', status: 'in_progress', assignee: 'sara' }, { title: 'Empty states', status: 'todo' } ], comments: [ ['faisal', 'Please keep the sidebar collapsible on 13" laptops.'], ['sara', 'Done — it collapses below 1360px.'] ] },
      { key: 'api', title: 'API integration for account settings', status: 'in_progress', priority: 'medium', due: 5, assignee: 'khalid', progress: 40, labels: ['backend'], dependsOn: [] },
      { key: 'auth', title: 'Implement SSO authentication', status: 'todo', priority: 'high', due: 9, assignee: 'khalid', labels: ['security'] },
      { title: 'End-to-end test suite for portal flows', status: 'todo', priority: 'medium', due: 12, assignee: 'ghada', dependsOn: ['dash', 'api'] },
      { title: 'UI improvements from usability review', status: 'in_review', priority: 'medium', due: 1, assignee: 'sara', progress: 90 },
      { title: 'Document portal API endpoints', status: 'todo', priority: 'low', due: 14, assignee: 'agent:codenest', description: 'Draft reference documentation for the new endpoints for human review.' },
      { title: 'Set up feature flags', status: 'done', priority: 'medium', due: -3, assignee: 'omar' },
    ],
  },
  {
    dept: 'dev',
    name: 'Platform Reliability',
    description: 'Observability, incident readiness and infrastructure hygiene.',
    due: 60,
    tasks: [
      { title: 'Migrate CI runners to new cluster', status: 'in_progress', priority: 'high', due: 4, assignee: 'omar', progress: 55 },
      { title: 'Add structured logging to payment service', status: 'done', priority: 'medium', due: -6, assignee: 'khalid' },
      { title: 'Fix flaky notification tests', status: 'blocked', priority: 'medium', due: 3, assignee: 'ghada', comments: [['ghada', 'Blocked until the staging queue is upgraded.']] },
      { title: 'Mobile crash rate investigation', status: 'todo', priority: 'urgent', due: 2, assignee: 'mohammed' },
    ],
  },
  {
    dept: 'design',
    name: 'Brand Refresh 2026',
    description: 'Refresh of the Juniper visual identity across product and marketing.',
    due: 30,
    tasks: [
      { title: 'Finalise colour tokens', status: 'done', priority: 'high', due: -4, assignee: 'hessa' },
      { title: 'Illustration style guide', status: 'in_progress', priority: 'medium', due: 6, assignee: 'asma', progress: 50 },
      { title: 'Design review: portal dashboard', status: 'in_review', priority: 'high', due: 1, assignee: 'maha', progress: 85 },
      { title: 'Icon set audit', status: 'todo', priority: 'low', due: 15, assignee: 'maha' },
    ],
  },
  {
    dept: 'mkt',
    name: 'Riyadh Season Campaign',
    description: 'Q4 integrated campaign across social, web and events.',
    due: 25,
    tasks: [
      { title: 'Campaign brief and KPIs', status: 'done', priority: 'high', due: -8, assignee: 'lina' },
      { title: 'Content calendar for November', status: 'in_progress', priority: 'medium', due: 3, assignee: 'jawaher', progress: 60 },
      { title: 'Paid social audience research', status: 'in_progress', priority: 'medium', due: 4, assignee: 'yousef', progress: 30 },
      { title: 'Prepare presentation for leadership', status: 'todo', priority: 'high', due: 2, assignee: 'lina' },
      { title: 'Summarise competitor campaign notes', status: 'todo', priority: 'low', due: 10, assignee: 'agent:nova' },
    ],
  },
  {
    dept: 'ops',
    name: 'Office Move Readiness',
    description: 'Prepare the new floor for the Product and Customer Success teams.',
    due: 35,
    tasks: [
      { title: 'Vendor contracts review', status: 'in_progress', priority: 'high', due: 5, assignee: 'ahmed', progress: 45 },
      { title: 'Seating plan for floor 2', status: 'in_review', priority: 'medium', due: 2, assignee: 'fahad', progress: 80 },
      { title: 'Network installation schedule', status: 'todo', priority: 'medium', due: 9, assignee: 'fahad' },
      { title: 'Weekly operations status summary', status: 'todo', priority: 'low', due: 6, assignee: 'agent:atlas' },
    ],
  },
  {
    dept: 'fin',
    name: 'FY27 Budget Planning',
    description: 'Department budget requests, consolidation and approval.',
    due: 45,
    tasks: [
      { title: 'Collect department budget requests', status: 'in_progress', priority: 'high', due: 6, assignee: 'reem', progress: 65 },
      { title: 'Reconcile Q3 vendor payments', status: 'done', priority: 'medium', due: -2, assignee: 'turki' },
      { title: 'Cash flow forecast model', status: 'todo', priority: 'high', due: 11, assignee: 'abdullah' },
    ],
  },
  {
    dept: 'hr',
    name: 'Onboarding Revamp',
    description: 'A friendlier first 30 days for new joiners.',
    due: 50,
    tasks: [
      { title: 'New joiner survey analysis', status: 'done', priority: 'medium', due: -5, assignee: 'lama' },
      { title: 'Buddy programme guidelines', status: 'in_progress', priority: 'medium', due: 7, assignee: 'noura', progress: 35 },
      { title: 'Update onboarding checklist', status: 'todo', priority: 'low', due: 13, assignee: 'lama' },
    ],
  },
  {
    dept: 'product',
    name: 'Roadmap H1 2027',
    description: 'Discovery and prioritisation for the first half of 2027.',
    due: 55,
    tasks: [
      { title: 'Customer interview synthesis', status: 'in_progress', priority: 'high', due: 4, assignee: 'saad', progress: 50 },
      { title: 'Payments opportunity sizing', status: 'todo', priority: 'medium', due: 10, assignee: 'nora' },
    ],
  },
  {
    dept: 'cs',
    name: 'Support Playbook',
    description: 'Standard responses and escalation paths.',
    due: 28,
    tasks: [
      { title: 'Escalation matrix draft', status: 'in_progress', priority: 'medium', due: 5, assignee: 'dana', progress: 40 },
      { title: 'Top 20 FAQ answers', status: 'todo', priority: 'medium', due: 8, assignee: 'rakan' },
    ],
  },
];

export const REQUESTS: Array<{
  from: string;
  to: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due: number;
  labels: string[];
  by: string;
  path: Array<{ action: string; by: string; note?: string; hoursAgo: number }>;
  tasks?: TaskSeed[];
  project?: string;
  comments?: Array<[string, string]>;
}> = [
  {
    from: 'mkt',
    to: 'dev',
    title: 'Landing page for the Riyadh Season campaign',
    description: 'We need a bilingual landing page with a sign-up form and campaign tracking, live before the campaign launch.',
    priority: 'high',
    due: 12,
    labels: ['Frontend', 'Campaign'],
    by: 'lina',
    path: [
      { action: 'accept', by: 'faisal', hoursAgo: 50 },
      { action: 'start', by: 'faisal', hoursAgo: 48 },
    ],
    project: 'Customer Portal v2',
    tasks: [
      { title: 'Landing page layout (EN/AR)', status: 'done', priority: 'high', due: 3, assignee: 'sara' },
      { title: 'Sign-up form and validation', status: 'in_progress', priority: 'high', due: 5, assignee: 'mohammed', progress: 50 },
      { title: 'Campaign analytics tags', status: 'todo', priority: 'medium', due: 7, assignee: 'omar' },
      { title: 'Cross-browser QA', status: 'todo', priority: 'medium', due: 9, assignee: 'ghada' },
    ],
    comments: [['lina', 'Copy for both languages is in the shared drive. Thank you!']],
  },
  {
    from: 'mkt',
    to: 'dev',
    title: 'Social media analytics dashboard',
    description: 'A new analytics section to track campaign performance: reach, CTR and conversions per channel.',
    priority: 'high',
    due: 3,
    labels: ['UI/UX', 'Frontend'],
    by: 'lina',
    path: [],
  },
  {
    from: 'mkt',
    to: 'design',
    title: 'Campaign key visuals',
    description: 'Hero visuals and social sizes for the Riyadh Season campaign.',
    priority: 'medium',
    due: 1,
    labels: ['Brand'],
    by: 'lina',
    path: [
      { action: 'accept', by: 'hessa', hoursAgo: 120 },
      { action: 'start', by: 'hessa', hoursAgo: 118 },
      { action: 'deliver', by: 'hessa', note: 'Final visuals exported in all sizes — see the attached folder link in the brief.', hoursAgo: 3 },
    ],
  },
  {
    from: 'product',
    to: 'dev',
    title: 'Payment provider integration',
    description: 'Integrate the selected payment provider for subscriptions in the customer portal.',
    priority: 'urgent',
    due: 20,
    labels: ['Backend', 'Payments'],
    by: 'nora',
    path: [{ action: 'accept', by: 'faisal', hoursAgo: 20 }],
  },
  {
    from: 'ops',
    to: 'fin',
    title: 'Q2 operating cost report',
    description: 'Breakdown of Q2 operating costs by site for the facilities review.',
    priority: 'medium',
    due: 6,
    labels: ['Reporting'],
    by: 'ahmed',
    path: [{ action: 'request_clarification', by: 'abdullah', note: 'Should this include the temporary warehouse lease?', hoursAgo: 6 }],
  },
  {
    from: 'hr',
    to: 'design',
    title: 'Onboarding handbook layout',
    description: 'Layout and illustrations for the new joiner handbook.',
    priority: 'low',
    due: -2,
    labels: ['Print'],
    by: 'noura',
    path: [
      { action: 'accept', by: 'hessa', hoursAgo: 300 },
      { action: 'start', by: 'hessa', hoursAgo: 290 },
      { action: 'deliver', by: 'hessa', note: 'Handbook layout delivered.', hoursAgo: 80 },
      { action: 'approve', by: 'noura', hoursAgo: 70 },
    ],
  },
  {
    from: 'fin',
    to: 'ops',
    title: 'Vendor list clean-up',
    description: 'Remove inactive vendors from the procurement system.',
    priority: 'low',
    due: 10,
    labels: ['Procurement'],
    by: 'abdullah',
    path: [{ action: 'reject', by: 'ahmed', note: 'Procurement system access moved to Finance last month — please handle directly.', hoursAgo: 30 }],
  },
];

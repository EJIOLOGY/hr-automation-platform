export const UNASSIGNED_DEPARTMENT = 'Unassigned';

/**
 * Ordered keyword -> department rules. Order matters: more specific
 * matches must come before generic ones (e.g. "Procurement Manager"
 * must hit Bids & Proposals / Procurement before the generic
 * "manager" catch-all).
 *
 * This list is a starting point calibrated for an Energy & Resources
 * / oil & gas services company (InterTech Systems). Extend it as real
 * designations come in from HR — rows that don't match anything are
 * imported with department = "Unassigned" and flagged for manual
 * review rather than guessed at silently.
 */
const DEPARTMENT_RULES: Array<{ department: string; keywords: string[] }> = [
  {
    department: 'Bids & Proposals',
    keywords: ['bid', 'proposal', 'tender', 'nipex'],
  },
  {
    department: 'Procurement',
    keywords: ['procurement', 'vendor', 'purchasing', 'supply chain'],
  },
  {
    department: 'Health, Safety & Environment',
    keywords: ['hse', 'health safety', 'safety officer', 'environment'],
  },
  {
    department: 'Engineering',
    keywords: ['engineer', 'technician', 'field officer', 'maintenance'],
  },
  {
    department: 'Information Technology',
    keywords: [
      'software',
      'developer',
      'it officer',
      'it support',
      'systems admin',
      'network admin',
    ],
  },
  {
    department: 'Finance & Accounts',
    keywords: ['account', 'finance', 'treasury', 'audit', 'payroll'],
  },
  {
    department: 'Human Resources',
    keywords: ['human resources', 'hr officer', 'hr manager', 'hr executive'],
  },
  {
    department: 'Legal & Compliance',
    keywords: ['legal', 'compliance officer', 'company secretary'],
  },
  {
    department: 'Operations',
    keywords: ['operations', 'logistics', 'warehouse', 'store'],
  },
  {
    department: 'Administration',
    keywords: ['admin', 'secretary', 'front desk', 'office assistant'],
  },
  {
    department: 'Executive Management',
    keywords: ['chief executive', 'managing director', 'chairman', 'director'],
  },
];

export interface DepartmentDerivationResult {
  department: string;
  matched: boolean;
}

/**
 * Derives a department from a free-text job designation using ordered
 * keyword matching. Returns matched: false (and department set to
 * "Unassigned") when nothing in DEPARTMENT_RULES fits, so the caller
 * can flag the row for manual HR review instead of silently guessing.
 */
export function deriveDepartment(
  designation: string | undefined,
): DepartmentDerivationResult {
  const normalized = (designation ?? '').trim().toLowerCase();

  if (!normalized) {
    return { department: UNASSIGNED_DEPARTMENT, matched: false };
  }

  for (const rule of DEPARTMENT_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return { department: rule.department, matched: true };
    }
  }

  return { department: UNASSIGNED_DEPARTMENT, matched: false };
}

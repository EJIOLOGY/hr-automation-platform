export const NILL_DEPARTMENT = 'NILL';

export interface DepartmentDerivationResult {
  department: string;
  matched: boolean;
}

/**
 * Department derivation is based on the Current Designation field
 * from the approved HR employee spreadsheet.
 *
 * Rules are intentionally ordered from specific to general.
 * Unknown, empty, location, project, or otherwise non-designation
 * values return NILL and are flagged for review.
 */

const DEPARTMENT_RULES: Array<{
  department: string;
  keywords: string[];
}> = [
  /**
   * Bids & Proposals
   */
  {
    department: 'Bids & Proposals',
    keywords: ['bid', 'proposal', 'tender', 'nipex'],
  },

  /**
   * Procurement
   */
  {
    department: 'Procurement',
    keywords: [
      'procurement',
      'purchas',
      'buyer',
      'store',
      'warehouse',
      'inventory',
      'shipping coordinator',
    ],
  },

  /**
   * HSE
   */
  {
    department: 'HSE',
    keywords: ['hse', 'health safety', 'environment', 'fireman', 'fire'],
  },

  /**
   * Human Resources
   */
  {
    department: 'HR',
    keywords: [
      'human resources',
      'hr officer',
      'hr executive',
      'hrbp',
      'talent acquisition',
    ],
  },

  /**
   * Information Technology
   *
   * IT-specific engineering/designation terms must be evaluated
   * before the general Engineering rules.
   */
  {
    department: 'IT',
    keywords: [
      'site it',
      'site ict',
      'it officer',
      'it support',
      'senior it',
      'ict',
      'information technology',
      'network engineer',
      'infrastructure engineer',
      'cctv',
      'sharepoint',
      'power platforms',
      'microsoft fabric',
      'digitalization',
      'telematics',
      'iot',
      'sap consultant',
      'sap sd consultant',
      'sap mm consultant',
      'rpa',
      'data analyst',
      'business analyst',
      'printer engineer',
    ],
  },

  /**
   * Technical
   *
   * Technician roles are intentionally separate from Engineering.
   */
  {
    department: 'Technical',
    keywords: [
      'technician',
      'plant mechanic',
      'rigger',
      'rigger foreman',
      'scaffolding supervisor',
      'welder',
    ],
  },

  /**
   * Engineering
   *
   * Engineer/design/engineering-management roles belong here.
   * Technician roles are deliberately excluded.
   */
  {
    department: 'Engineering',
    keywords: [
      'engineer',
      'engineering',
      'draftsman',
      'draftsman',
      'draftman',
      'draghtsman',
      'quantity surveyor',
      'surveyor',
      'estimator',
      'qa/qc',
      'qaqc',
      'laboratory',
      'lab.',
      'civil supervisor',
      'site civil',
      'civil consultant',
      'construction manager',
      'project manager',
      'project engineer',
      'project coordinator',
      'planning engineer',
      'electrical foreman',
      'eletrical foreman',
      'instrumentation & control foreman',
    ],
  },

  /**
   * Operations
   */
  {
    department: 'Operations',
    keywords: [
      'operator',
      'operations',
      'operation',
      'loading',
      'batching plant',
      'asphalt plant',
      'asphalt paver',
      'paver operator',
      'roller operator',
      'bitumen operator',
      'tar boiler',
      'piling rig',
      'raker',
      'foreman',
      'shift supervisor',
      'shift operations',
      'field operator',
      'dcs panel',
      'panel operator',
      'chemical process',
    ],
  },

  /**
   * Administration
   */
  {
    department: 'Administration',
    keywords: ['admin', 'administrative', 'document controller', 'translator'],
  },

  /**
   * Finance & Accounts
   */
  {
    department: 'Finance & Accounts',
    keywords: ['finance', 'account', 'accounting', 'treasury', 'payroll'],
  },

  /**
   * Legal & Compliance
   */
  {
    department: 'Legal & Compliance',
    keywords: ['legal', 'compliance'],
  },

  /**
   * Executive Management
   */
  {
    department: 'Executive Management',
    keywords: ['chief executive', 'managing director', 'chairman', 'director'],
  },
];

/**
 * Values observed in the HR spreadsheet that are not job designations.
 *
 * These must never be interpreted as departments.
 */
const NON_DESIGNATION_VALUES = new Set([
  'akwa ibom',
  'lagos',
  'oml 13',
  'gpp1',
]);

export function deriveDepartment(
  designation: string | undefined,
): DepartmentDerivationResult {
  const normalized = normalizeDesignation(designation);

  if (!normalized || NON_DESIGNATION_VALUES.has(normalized)) {
    return {
      department: NILL_DEPARTMENT,
      matched: false,
    };
  }

  for (const rule of DEPARTMENT_RULES) {
    if (
      rule.keywords.some((keyword) =>
        normalized.includes(normalizeDesignation(keyword)),
      )
    ) {
      return {
        department: rule.department,
        matched: true,
      };
    }
  }

  return {
    department: NILL_DEPARTMENT,
    matched: false,
  };
}

function normalizeDesignation(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

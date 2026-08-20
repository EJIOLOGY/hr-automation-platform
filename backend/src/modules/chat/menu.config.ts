export const MENU_IDS = {
  MAIN: 'main_menu',
  POLICY: 'policy_menu',
  LEAVE: 'leave_menu',
  BENEFITS: 'benefits_menu',
  VERIFICATION: 'verification_menu',
  DOCUMENT_REQUEST: 'document_request_menu',
} as const;

export const MENU_SELECTION_IDS = {
  POLICY_FAQ: 'policy_faq',
  LEAVE_BALANCE: 'leave_balance',
  BENEFITS: 'benefits',
  HR_DOCUMENT_REQUESTS: 'hr_document_requests',
  TALK_TO_HR: 'talk_to_hr',

  LEAVE_POLICY: 'leave_policy',
  WORKING_HOURS_ATTENDANCE: 'working_hours_attendance',
  CODE_OF_CONDUCT: 'code_of_conduct',
  HSE_WORKPLACE_SAFETY: 'hse_workplace_safety',
  HEALTH_INSURANCE: 'health_insurance',
  BENEFITS_POLICY: 'benefits_policy',
  OTHER_HR_FAQ: 'other_hr_faq',

  LEAVE_TYPES: 'leave_types',
  HOW_TO_APPLY_LEAVE: 'how_to_apply_leave',
  LEAVE_APPLICATION_STATUS: 'leave_application_status',

  MEDICAL_BENEFITS: 'medical_benefits',
  INSURANCE_BENEFITS: 'insurance_benefits',
  PENSION: 'pension',
  OTHER_BENEFITS: 'other_benefits',

  REQUEST_HR_DOCUMENT: 'request_hr_document',
  EMPLOYMENT_VERIFICATION_LETTER: 'employment_verification_letter',
  SALARY_CERTIFICATE: 'salary_certificate',
  NO_OBJECTION_CERTIFICATE: 'no_objection_certificate',
  OTHER_HR_DOCUMENT: 'other_hr_document',
} as const;

export type MenuAction =
  | 'open_policy_faq'
  | 'open_leave_balance'
  | 'open_benefits'
  | 'open_hr_document_requests'
  | 'open_document_request'
  | 'talk_to_hr'
  | 'show_leave_policy'
  | 'show_working_hours_attendance'
  | 'show_code_of_conduct'
  | 'show_hse_workplace_safety'
  | 'show_health_insurance'
  | 'show_benefits_policy'
  | 'show_other_hr_faq'
  | 'show_leave_types'
  | 'show_how_to_apply_leave'
  | 'show_leave_application_status'
  | 'show_medical_benefits'
  | 'show_insurance_benefits'
  | 'show_pension'
  | 'show_other_benefits'
  | 'request_hr_document'
  | 'request_document'
  | 'back';

export interface MenuOption {
  id: string;
  label: string;
  action: MenuAction;
}

export interface MenuDefinition {
  id: string;
  title: string;
  prompt: string;
  options: readonly MenuOption[];
}

/**
 * Deterministic presentation-only menu definitions.
 *
 * Existing main-menu IDs are preserved. Submenus are defined here so
 * ConversationService does not need to contain menu configuration.
 *
 * FAQ content remains externalized and can be expanded later without
 * changing this menu/state architecture.
 */
export const MENU_CONFIG: readonly MenuDefinition[] = [
  {
    id: MENU_IDS.MAIN,
    title: 'HR Services',
    prompt: 'How may we be of service?',
    options: [
      {
        id: MENU_SELECTION_IDS.POLICY_FAQ,
        label: 'I Have a Question',
        action: 'open_policy_faq',
      },
      {
        id: MENU_SELECTION_IDS.LEAVE_BALANCE,
        label: 'Leave & Time Off',
        action: 'open_leave_balance',
      },
      {
        id: MENU_SELECTION_IDS.BENEFITS,
        label: 'Benefits',
        action: 'open_benefits',
      },
      {
        id: MENU_SELECTION_IDS.HR_DOCUMENT_REQUESTS,
        label: 'HR Document Requests',
        action: 'open_hr_document_requests',
      },
    ],
  },
  {
    id: MENU_IDS.POLICY,
    title: '❓ I Have a Question',
    prompt: 'What would you like to know about?',
    options: [
      {
        id: MENU_SELECTION_IDS.LEAVE_POLICY,
        label: 'Leave',
        action: 'show_leave_policy',
      },
      {
        id: MENU_SELECTION_IDS.WORKING_HOURS_ATTENDANCE,
        label: 'Working Hours & Attendance',
        action: 'show_working_hours_attendance',
      },
      {
        id: MENU_SELECTION_IDS.CODE_OF_CONDUCT,
        label: 'Code of Conduct',
        action: 'show_code_of_conduct',
      },
      {
        id: MENU_SELECTION_IDS.HSE_WORKPLACE_SAFETY,
        label: 'HSE & Workplace Safety',
        action: 'show_hse_workplace_safety',
      },
      {
        id: MENU_SELECTION_IDS.HEALTH_INSURANCE,
        label: 'Health Insurance',
        action: 'show_health_insurance',
      },
      {
        id: MENU_SELECTION_IDS.BENEFITS_POLICY,
        label: 'Benefits',
        action: 'show_benefits_policy',
      },
      {
        id: MENU_SELECTION_IDS.OTHER_HR_FAQ,
        label: 'Other Questions',
        action: 'show_other_hr_faq',
      },
      {
        id: MENU_SELECTION_IDS.TALK_TO_HR,
        label: 'Talk to HR',
        action: 'talk_to_hr',
      },
      { id: 'back', label: 'Back', action: 'back' },
    ],
  },
  {
    id: MENU_IDS.LEAVE,
    title: 'Leave & Time Off',
    prompt: 'How can we assist you with your leave?',
    options: [
      {
        id: MENU_SELECTION_IDS.LEAVE_BALANCE,
        label: 'Check My Leave Balance',
        action: 'open_leave_balance',
      },
      {
        id: MENU_SELECTION_IDS.LEAVE_TYPES,
        label: 'Learn About Leave',
        action: 'show_leave_types',
      },
      {
        id: MENU_SELECTION_IDS.HOW_TO_APPLY_LEAVE,
        label: 'Apply for Leave',
        action: 'show_how_to_apply_leave',
      },
      {
        id: MENU_SELECTION_IDS.LEAVE_APPLICATION_STATUS,
        label: 'Leave Application Status',
        action: 'show_leave_application_status',
      },
      {
        id: MENU_SELECTION_IDS.TALK_TO_HR,
        label: 'Talk to HR',
        action: 'talk_to_hr',
      },
      { id: 'back', label: 'Back', action: 'back' },
    ],
  },
  {
    id: MENU_IDS.BENEFITS,
    title: 'Benefits',
    prompt: 'What would you like to know about your benefits?',
    options: [
      {
        id: MENU_SELECTION_IDS.MEDICAL_BENEFITS,
        label: 'Medical Benefits',
        action: 'show_medical_benefits',
      },
      {
        id: MENU_SELECTION_IDS.INSURANCE_BENEFITS,
        label: 'Insurance',
        action: 'show_insurance_benefits',
      },
      {
        id: MENU_SELECTION_IDS.PENSION,
        label: 'Pension',
        action: 'show_pension',
      },
      {
        id: MENU_SELECTION_IDS.OTHER_BENEFITS,
        label: 'Other Benefits',
        action: 'show_other_benefits',
      },
      {
        id: MENU_SELECTION_IDS.TALK_TO_HR,
        label: 'Talk to HR',
        action: 'talk_to_hr',
      },
      { id: 'back', label: 'Back', action: 'back' },
    ],
  },
  {
    id: MENU_IDS.VERIFICATION,
    title: 'HR Document Requests',
    prompt: 'What would you like to do?',
    options: [
      {
        id: MENU_SELECTION_IDS.REQUEST_HR_DOCUMENT,
        label: 'Request an HR Document',
        action: 'open_document_request',
      },
      {
        id: MENU_SELECTION_IDS.TALK_TO_HR,
        label: 'Talk to HR',
        action: 'talk_to_hr',
      },
      { id: 'back', label: 'Back', action: 'back' },
    ],
  },
  {
    id: MENU_IDS.DOCUMENT_REQUEST,
    title: 'Request an HR Document',
    prompt: 'What document do you need?',
    options: [
      {
        id: MENU_SELECTION_IDS.EMPLOYMENT_VERIFICATION_LETTER,
        label: 'Employment Verification Letter (EVL)',
        action: 'request_document',
      },
      {
        id: MENU_SELECTION_IDS.SALARY_CERTIFICATE,
        label: 'Salary Certificate',
        action: 'request_document',
      },
      {
        id: MENU_SELECTION_IDS.NO_OBJECTION_CERTIFICATE,
        label: 'No Objection Certificate (NOC)',
        action: 'request_document',
      },
      {
        id: MENU_SELECTION_IDS.OTHER_HR_DOCUMENT,
        label: 'Other HR Document',
        action: 'request_document',
      },
      {
        id: MENU_SELECTION_IDS.TALK_TO_HR,
        label: 'Talk to HR',
        action: 'talk_to_hr',
      },
      { id: 'back', label: 'Back', action: 'back' },
    ],
  },
];

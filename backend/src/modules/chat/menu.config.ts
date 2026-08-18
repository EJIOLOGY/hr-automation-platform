export const MENU_IDS = {
  MAIN: 'main_menu',
  POLICY: 'policy_menu',
  LEAVE: 'leave_menu',
  BENEFITS: 'benefits_menu',
  VERIFICATION: 'verification_menu',
} as const;

export const MENU_SELECTION_IDS = {
  POLICY_FAQ: 'policy_faq',
  LEAVE_BALANCE: 'leave_balance',
  BENEFITS: 'benefits',
  EMPLOYMENT_VERIFICATION: 'employment_verification',
  TALK_TO_HR: 'talk_to_hr',

  LEAVE_POLICY: 'leave_policy',
  WORKING_HOURS_ATTENDANCE: 'working_hours_attendance',
  CODE_OF_CONDUCT: 'code_of_conduct',
  HSE_WORKPLACE_SAFETY: 'hse_workplace_safety',
  BENEFITS_POLICY: 'benefits_policy',
  OTHER_HR_FAQ: 'other_hr_faq',

  LEAVE_TYPES: 'leave_types',
  HOW_TO_APPLY_LEAVE: 'how_to_apply_leave',
  LEAVE_APPLICATION_STATUS: 'leave_application_status',

  MEDICAL_BENEFITS: 'medical_benefits',
  INSURANCE_BENEFITS: 'insurance_benefits',
  PENSION: 'pension',
  OTHER_BENEFITS: 'other_benefits',

  EMPLOYMENT_LETTER: 'employment_letter',
  OTHER_HR_DOCUMENT: 'other_hr_document',
} as const;

export type MenuAction =
  | 'open_policy_faq'
  | 'open_leave_balance'
  | 'open_benefits'
  | 'open_employment_verification'
  | 'talk_to_hr'
  | 'show_leave_policy'
  | 'show_working_hours_attendance'
  | 'show_code_of_conduct'
  | 'show_hse_workplace_safety'
  | 'show_benefits_policy'
  | 'show_other_hr_faq'
  | 'show_leave_types'
  | 'show_how_to_apply_leave'
  | 'show_leave_application_status'
  | 'show_medical_benefits'
  | 'show_insurance_benefits'
  | 'show_pension'
  | 'show_other_benefits'
  | 'request_verification'
  | 'request_employment_letter'
  | 'request_other_hr_document'
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
    prompt: 'Please choose an option.',
    options: [
      {
        id: MENU_SELECTION_IDS.POLICY_FAQ,
        label: 'Policy & HR FAQ',
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
        id: MENU_SELECTION_IDS.EMPLOYMENT_VERIFICATION,
        label: 'Employment & Documents',
        action: 'open_employment_verification',
      },
      {
        id: MENU_SELECTION_IDS.TALK_TO_HR,
        label: 'Talk to HR',
        action: 'talk_to_hr',
      },
    ],
  },
  {
    id: MENU_IDS.POLICY,
    title: 'Policy & HR FAQ',
    prompt: 'Please choose a topic.',
    options: [
      {
        id: MENU_SELECTION_IDS.LEAVE_POLICY,
        label: 'Leave Policy',
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
        label: 'HSE / Workplace Safety',
        action: 'show_hse_workplace_safety',
      },
      {
        id: MENU_SELECTION_IDS.BENEFITS_POLICY,
        label: 'Employee Benefits Policy',
        action: 'show_benefits_policy',
      },
      {
        id: MENU_SELECTION_IDS.OTHER_HR_FAQ,
        label: 'Other HR FAQs',
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
    prompt: 'Please choose an option.',
    options: [
      {
        id: MENU_SELECTION_IDS.LEAVE_BALANCE,
        label: 'Check Leave Balance',
        action: 'open_leave_balance',
      },
      {
        id: MENU_SELECTION_IDS.LEAVE_TYPES,
        label: 'Leave Types',
        action: 'show_leave_types',
      },
      {
        id: MENU_SELECTION_IDS.HOW_TO_APPLY_LEAVE,
        label: 'How to Apply for Leave',
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
    prompt: 'Please choose an option.',
    options: [
      {
        id: MENU_SELECTION_IDS.MEDICAL_BENEFITS,
        label: 'Medical / Health Benefits',
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
    title: 'Employment & Documents',
    prompt: 'Please choose an option.',
    options: [
      {
        id: 'request_verification',
        label: 'Employment Verification',
        action: 'request_verification',
      },
      {
        id: MENU_SELECTION_IDS.EMPLOYMENT_LETTER,
        label: 'Employment Letter',
        action: 'request_employment_letter',
      },
      {
        id: MENU_SELECTION_IDS.OTHER_HR_DOCUMENT,
        label: 'Other HR Document',
        action: 'request_other_hr_document',
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

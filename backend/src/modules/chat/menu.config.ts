export const MENU_IDS = {
  MAIN: 'main_menu',
} as const;

export const MENU_SELECTION_IDS = {
  POLICY_FAQ: 'policy_faq',
  LEAVE_BALANCE: 'leave_balance',
  BENEFITS: 'benefits',
  EMPLOYMENT_VERIFICATION: 'employment_verification',
  TALK_TO_HR: 'talk_to_hr',
} as const;

export type MenuAction =
  | 'open_policy_faq'
  | 'open_leave_balance'
  | 'open_benefits'
  | 'open_employment_verification'
  | 'talk_to_hr';

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
 * Deterministic, presentation-only menu definitions. Domain answers remain
 * in their respective externalized content sources.
 */
export const MENU_CONFIG: readonly MenuDefinition[] = [
  {
    id: MENU_IDS.MAIN,
    title: 'HR Services',
    prompt: 'Please choose an option.',
    options: [
      {
        id: MENU_SELECTION_IDS.POLICY_FAQ,
        label: 'Policy FAQ',
        action: 'open_policy_faq',
      },
      {
        id: MENU_SELECTION_IDS.LEAVE_BALANCE,
        label: 'Leave Balance',
        action: 'open_leave_balance',
      },
      {
        id: MENU_SELECTION_IDS.BENEFITS,
        label: 'Benefits',
        action: 'open_benefits',
      },
      {
        id: MENU_SELECTION_IDS.EMPLOYMENT_VERIFICATION,
        label: 'Employment Verification',
        action: 'open_employment_verification',
      },
      {
        id: MENU_SELECTION_IDS.TALK_TO_HR,
        label: 'Talk to HR',
        action: 'talk_to_hr',
      },
    ],
  },
];

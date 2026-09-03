import { MENU_CONFIG, MENU_IDS, MENU_SELECTION_IDS } from './menu.config';
import { MenuReplyBuilderService } from './menu-reply-builder.service';

describe('MenuReplyBuilderService', () => {
  const service = new MenuReplyBuilderService();

  it('provides the main menu', () => {
    expect(service.buildMenuReply(MENU_IDS.MAIN)).toMatchObject({
      type: 'menu',
      menuId: MENU_IDS.MAIN,
    });
  });

  it('includes all four required MVP domains', () => {
    const mainMenu = service.buildMenuReply(MENU_IDS.MAIN);
    const optionIds = mainMenu?.options.map((option) => option.id);

    expect(optionIds).toEqual(
      expect.arrayContaining([
        MENU_SELECTION_IDS.POLICY_FAQ,
        MENU_SELECTION_IDS.LEAVE_BALANCE,
        MENU_SELECTION_IDS.BENEFITS,
        MENU_SELECTION_IDS.HR_DOCUMENT_REQUESTS,
      ]),
    );
  });

  it('includes Talk to HR in every submenu', () => {
    for (const menu of MENU_CONFIG.filter(
      (menu) => menu.id !== MENU_IDS.MAIN,
    )) {
      expect(menu.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: MENU_SELECTION_IDS.TALK_TO_HR }),
        ]),
      );
    }
  });

  it('does not include Talk to HR in the main menu', () => {
    const mainMenu = service.buildMenuReply(MENU_IDS.MAIN);
    const optionIds = mainMenu?.options.map((option) => option.id);

    expect(optionIds).not.toContain(MENU_SELECTION_IDS.TALK_TO_HR);
  });

  it('includes Health Insurance in I Have a Question', () => {
    const questionMenu = service.buildMenuReply(MENU_IDS.POLICY);
    const optionIds = questionMenu?.options.map((option) => option.id);

    expect(optionIds).toContain(MENU_SELECTION_IDS.HEALTH_INSURANCE);
  });

  it('uses unique menu IDs and unique selection IDs within each menu', () => {
    const menuIds = MENU_CONFIG.map((menu) => menu.id);

    expect(new Set(menuIds).size).toBe(menuIds.length);

    for (const menu of MENU_CONFIG) {
      const selectionIds = menu.options.map((option) => option.id);

      expect(new Set(selectionIds).size).toBe(selectionIds.length);
    }
  });

  it('renders numbered options without emojis', () => {
    const mainMenu = service.buildMenuReply(MENU_IDS.MAIN);

    expect(mainMenu?.options.map((option) => option.label)).toEqual([
      '[1] I Have a Question',
      '[2] Leave & Time Off',
      '[3] Benefits',
      '[4] HR Document Requests',
    ]);
  });

  it('resolves a numeric selection to the option in the current menu', () => {
    expect(service.getSelection(MENU_IDS.MAIN, '2')).toEqual({
      id: MENU_SELECTION_IDS.LEAVE_BALANCE,
      action: 'open_leave_balance',
    });
  });

  it('resolves numeric selections independently within each submenu', () => {
    expect(service.getSelection(MENU_IDS.BENEFITS, '2')).toEqual({
      id: MENU_SELECTION_IDS.INSURANCE_BENEFITS,
      action: 'show_insurance_benefits',
    });

    expect(service.getSelection(MENU_IDS.LEAVE, '5')).toEqual({
      id: MENU_SELECTION_IDS.TALK_TO_HR,
      action: 'talk_to_hr',
    });
  });

  it('returns undefined for a numeric selection outside the menu range', () => {
    expect(service.getSelection(MENU_IDS.MAIN, '9')).toBeUndefined();
  });

  it('does not create a route for an invalid selection', () => {
    expect(
      service.getSelection(MENU_IDS.MAIN, 'unrecognized_selection'),
    ).toBeUndefined();
  });
  it('provides the locked HR Document Requests flow', () => {
    expect(service.getSelection(MENU_IDS.VERIFICATION, '1')).toEqual({
      id: MENU_SELECTION_IDS.REQUEST_HR_DOCUMENT,
      action: 'open_document_request',
    });

    expect(service.getSelection(MENU_IDS.DOCUMENT_REQUEST, '1')).toEqual({
      id: MENU_SELECTION_IDS.EMPLOYMENT_VERIFICATION_LETTER,
      action: 'request_document',
    });

    expect(service.getSelection(MENU_IDS.DOCUMENT_REQUEST, '2')).toEqual({
      id: MENU_SELECTION_IDS.SALARY_CERTIFICATE,
      action: 'request_document',
    });

    expect(service.getSelection(MENU_IDS.DOCUMENT_REQUEST, '3')).toEqual({
      id: MENU_SELECTION_IDS.NO_OBJECTION_CERTIFICATE,
      action: 'request_document',
    });

    expect(service.getSelection(MENU_IDS.DOCUMENT_REQUEST, '4')).toEqual({
      id: MENU_SELECTION_IDS.OTHER_HR_DOCUMENT,
      action: 'request_document',
    });
  });
});

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
        MENU_SELECTION_IDS.EMPLOYMENT_VERIFICATION,
      ]),
    );
  });

  it('includes Talk to HR in every configured menu', () => {
    for (const menu of MENU_CONFIG) {
      expect(menu.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: MENU_SELECTION_IDS.TALK_TO_HR }),
        ]),
      );
    }
  });

  it('uses unique menu IDs and unique selection IDs within each menu', () => {
    const menuIds = MENU_CONFIG.map((menu) => menu.id);

    expect(new Set(menuIds).size).toBe(menuIds.length);

    for (const menu of MENU_CONFIG) {
      const selectionIds = menu.options.map((option) => option.id);

      expect(new Set(selectionIds).size).toBe(selectionIds.length);
    }
  });

  it('does not create a route for an invalid selection', () => {
    expect(
      service.getSelection(MENU_IDS.MAIN, 'unrecognized_selection'),
    ).toBeUndefined();
  });
});

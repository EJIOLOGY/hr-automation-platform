import { Injectable } from '@nestjs/common';
import type { MenuAction, MenuDefinition, MenuOption } from './menu.config';
import { MENU_CONFIG } from './menu.config';

export interface MenuReply {
  type: 'menu';
  menuId: string;
  title: string;
  prompt: string;
  options: readonly {
    id: string;
    label: string;
  }[];
}

export interface MenuSelection {
  id: string;
  action: MenuAction;
}

/**
 * Converts static menu configuration into a transport-neutral reply model.
 * A future WhatsApp adapter can map this model to List or Reply Button payloads.
 */
@Injectable()
export class MenuReplyBuilderService {
  buildMenuReply(menuId: string): MenuReply | undefined {
    const menu = this.findMenu(menuId);

    if (!menu) {
      return undefined;
    }

    return {
      type: 'menu',
      menuId: menu.id,
      title: menu.title,
      prompt: menu.prompt,
      options: menu.options.map(({ id, label }, index) => ({
        id,
        label: `[${index + 1}] ${label}`,
      })),
    };
  }

  getSelectionLabel(menuId: string, selectionId: string): string | undefined {
    const menu = this.findMenu(menuId);

    if (!menu) {
      return undefined;
    }

    const normalizedSelection = selectionId.trim().toLowerCase();

    if (/^\d+$/.test(normalizedSelection)) {
      const option = menu.options[Number(normalizedSelection) - 1];
      return option?.label;
    }

    const option = menu.options.find(
      (candidate) => candidate.id === normalizedSelection,
    );

    return option?.label;
  }

  getSelection(menuId: string, selectionId: string): MenuSelection | undefined {
    const menu = this.findMenu(menuId);

    if (!menu) {
      return undefined;
    }

    const normalizedSelection = selectionId.trim().toLowerCase();

    /**
     * Employee-facing menu input is numeric and 1-based.
     * The configured option ID remains the internal route key.
     *
     * Example:
     *   "2" -> second option in the current menu.
     *
     * Internal selection IDs are still accepted so existing
     * deterministic integrations/tests remain backward compatible.
     */
    if (/^\d+$/.test(normalizedSelection)) {
      const optionIndex = Number(normalizedSelection) - 1;
      const option = menu.options[optionIndex];

      return option ? this.toSelection(option) : undefined;
    }

    const option = menu.options.find(
      (candidate) => candidate.id === normalizedSelection,
    );

    return option ? this.toSelection(option) : undefined;
  }

  private findMenu(menuId: string): MenuDefinition | undefined {
    return MENU_CONFIG.find((menu) => menu.id === menuId);
  }

  private toSelection(option: MenuOption): MenuSelection {
    return {
      id: option.id,
      action: option.action,
    };
  }
}

jest.mock('../../core/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

jest.mock('../employee/employee.service', () => ({
  EmployeeService: class {},
}));

jest.mock('./chat-session.service', () => ({
  ChatSessionService: class {},
}));

jest.mock('../escalation/escalation.service', () => ({
  EscalationService: class {},
}));

import { ConversationService } from './chat.service';
import { MENU_IDS, MENU_SELECTION_IDS } from './menu.config';

describe('ConversationService', () => {
  let service: ConversationService;
  let employeeService: { findByPhoneNumber: jest.Mock };
  let prisma: { chatMessage: { create: jest.Mock }; chatSession: any };
  let chatSessionService: {
    getOrCreateSession: jest.Mock;
    updateState: jest.Mock;
    touch: jest.Mock;
  };
  let menuReplyBuilder: {
    getSelection: jest.Mock;
    buildMenuReply: jest.Mock;
  };
  let escalationService: {
    createOrGetActiveEscalation: jest.Mock;
  };

  beforeEach(() => {
    employeeService = { findByPhoneNumber: jest.fn() };
    prisma = {
      chatMessage: { create: jest.fn() },
      chatSession: {
        findUnique: jest.fn(),
      },
    };
    chatSessionService = {
      getOrCreateSession: jest.fn(),
      updateState: jest.fn(),
      touch: jest.fn(),
    };
    menuReplyBuilder = {
      getSelection: jest.fn(),
      buildMenuReply: jest.fn(),
    };
    escalationService = {
      createOrGetActiveEscalation: jest.fn(),
    };

    service = new ConversationService(
      employeeService as any,
      prisma as any,
      chatSessionService as any,
      menuReplyBuilder as any,
      escalationService as any,
    );
  });

  it('handles a known active employee', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-1',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-1',
      currentState: 'MAIN_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.LEAVE_BALANCE,
      action: 'open_leave_balance',
    });
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.LEAVE,
      title: 'Leave & Time Off',
      prompt: 'Please choose an option.',
      options: [{ id: MENU_SELECTION_IDS.TALK_TO_HR, label: 'Talk to HR' }],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.LEAVE_BALANCE },
    });

    expect(response.success).toBe(true);
    expect(response.state).toBe('LEAVE_MENU');
    expect(response.action).toBe('leave_menu');
    expect(response.replies[0]).toMatchObject({
      type: 'menu',
      menuId: MENU_IDS.LEAVE,
    });
  });

  it('handles an unknown employee', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue(null);

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'text', value: 'hello' },
    });

    expect(response.success).toBe(false);
    expect(response.replies).toEqual([
      { type: 'text', text: 'Employee not found.' },
    ]);
  });

  it('handles an inactive employee', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-2',
      status: 'INACTIVE',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'text', value: 'hello' },
    });

    expect(response.success).toBe(false);
    expect(response.replies).toEqual([
      {
        type: 'text',
        text: 'Your employee account is not active. Please contact HR.',
      },
    ]);
  });

  it('returns the main menu', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-3',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-3',
      currentState: 'MAIN_MENU',
    });
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.MAIN,
      title: 'HR Services',
      prompt: 'Please choose an option.',
      options: [{ id: MENU_SELECTION_IDS.TALK_TO_HR, label: 'Talk to HR' }],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: 'menu' },
    });

    expect(response.success).toBe(true);
    expect(response.replies[0]).toMatchObject({
      type: 'menu',
      menuId: MENU_IDS.MAIN,
    });
  });

  it('returns to the main menu from a submenu when back is selected', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-back-1',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-back-1',
      currentState: 'LEAVE_MENU',
    });
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.MAIN,
      title: 'HR Services',
      prompt: 'Please choose an option.',
      options: [{ id: MENU_SELECTION_IDS.TALK_TO_HR, label: 'Talk to HR' }],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'text', value: 'back' },
    });

    expect(chatSessionService.updateState).toHaveBeenCalledWith(
      'session-back-1',
      'MAIN_MENU',
    );
    expect(response.state).toBe('MAIN_MENU');
    expect(response.action).toBe('main_menu');
    expect(response.replies[0]).toEqual({
      type: 'menu',
      menuId: MENU_IDS.MAIN,
      title: 'HR Services',
      prompt: 'Please choose an option.',
      options: [{ id: MENU_SELECTION_IDS.TALK_TO_HR, label: 'Talk to HR' }],
    });
  });

  it('returns to the main menu from the HR queue when back is selected without resolving escalation', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-back-2',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-back-2',
      currentState: 'HR_QUEUE',
    });
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.MAIN,
      title: 'HR Services',
      prompt: 'Please choose an option.',
      options: [{ id: MENU_SELECTION_IDS.TALK_TO_HR, label: 'Talk to HR' }],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'text', value: 'back' },
    });

    expect(chatSessionService.updateState).toHaveBeenCalledWith(
      'session-back-2',
      'MAIN_MENU',
    );
    expect(
      escalationService.createOrGetActiveEscalation,
    ).not.toHaveBeenCalled();
    expect(response.state).toBe('MAIN_MENU');
    expect(response.replies[0].type).toBe('menu');
  });

  it('handles a deterministic selection', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-4',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-4',
      currentState: 'MAIN_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.BENEFITS,
      action: 'open_benefits',
    });
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.BENEFITS,
      title: 'Benefits',
      prompt: 'Please choose an option.',
      options: [{ id: MENU_SELECTION_IDS.TALK_TO_HR, label: 'Talk to HR' }],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.BENEFITS },
    });

    expect(response.success).toBe(true);
    expect(response.state).toBe('BENEFITS_MENU');
    expect(response.replies[0]).toMatchObject({
      type: 'menu',
      menuId: MENU_IDS.BENEFITS,
    });
  });

  it('routes selections within the Policy FAQ menu', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-policy',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-policy',
      currentState: 'POLICY_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.LEAVE_POLICY,
      action: 'show_leave_policy',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.LEAVE_POLICY },
    });

    expect(menuReplyBuilder.getSelection).toHaveBeenCalledWith(
      MENU_IDS.POLICY,
      MENU_SELECTION_IDS.LEAVE_POLICY,
    );
    expect(response.state).toBe('POLICY_MENU');
    expect(response.action).toBe('show_leave_policy');
  });

  it('routes selections within the Leave menu', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-leave',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-leave',
      currentState: 'LEAVE_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.LEAVE_TYPES,
      action: 'show_leave_types',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.LEAVE_TYPES },
    });

    expect(response.state).toBe('LEAVE_MENU');
    expect(response.action).toBe('show_leave_types');
  });

  it('routes selections within the Benefits menu', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-benefits',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-benefits',
      currentState: 'BENEFITS_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.PENSION,
      action: 'show_pension',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.PENSION },
    });

    expect(response.state).toBe('BENEFITS_MENU');
    expect(response.action).toBe('show_pension');
  });

  it('returns a fallback reply when the selection is not recognized', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-5',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-5',
      currentState: 'MAIN_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue(undefined);
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.MAIN,
      title: 'HR Services',
      prompt: 'Please choose an option.',
      options: [{ id: MENU_SELECTION_IDS.TALK_TO_HR, label: 'Talk to HR' }],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'text', value: 'not-a-valid-choice' },
    });

    expect(response.success).toBe(true);
    expect(response.action).toBe('fallback');
    expect(response.replies[0]).toEqual({
      type: 'text',
      text: 'I could not match that selection. Please choose one of the available options.',
    });
  });

  it('handles a Talk to HR selection with a renderable reply', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-6',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-6',
      currentState: 'MAIN_MENU',
    });
    escalationService.createOrGetActiveEscalation.mockResolvedValue({
      escalationId: 'esc-1',
      status: 'OPEN',
      queuePosition: 1,
      hrBusy: false,
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.TALK_TO_HR },
    });

    expect(response.success).toBe(true);
    expect(response.replies[0]).toEqual({
      type: 'text',
      text: 'Your request has been added to the HR queue. You are number 1 in the queue. An HR representative will attend to you shortly.',
    });
  });

  it('provides renderable replies across branches', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-7',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-7',
      currentState: 'MAIN_MENU',
    });
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.MAIN,
      title: 'HR Services',
      prompt: 'Please choose an option.',
      options: [{ id: MENU_SELECTION_IDS.TALK_TO_HR, label: 'Talk to HR' }],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: 'menu' },
    });

    expect(Array.isArray(response.replies)).toBe(true);
    expect(response.replies.length).toBeGreaterThan(0);
    expect(response.replies[0].type).toBe('menu');
  });
});

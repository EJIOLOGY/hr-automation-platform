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

jest.mock('../../content/hr-content.service', () => ({
  HrContentService: class {},
}));

jest.mock('../leave/leave.service', () => ({
  LeaveService: class {},
}));

jest.mock('../verification/hr-document-request.service', () => ({
  HrDocumentRequestService: class {},
}));

import { ConversationService } from './chat.service';
import { LeaveService } from '../leave/leave.service';
import { HrDocumentRequestService } from '../verification/hr-document-request.service';
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
  let leaveService: {
    getLeaveBalanceByPhone: jest.Mock;
  };
  let hrDocumentRequestService: {
    createRequest: jest.Mock;
  };
  let hrContentService: {
    get: jest.Mock;
    getAnswer: jest.Mock;
    exists: jest.Mock;
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

    leaveService = {
      getLeaveBalanceByPhone: jest.fn(),
    };

    hrDocumentRequestService = {
      createRequest: jest.fn(),
    };

    hrContentService = {
      get: jest.fn(),
      getAnswer: jest.fn(),
      exists: jest.fn(),
    };

    service = new ConversationService(
      employeeService as any,
      prisma as any,
      chatSessionService as any,
      menuReplyBuilder as any,
      escalationService as any,
      hrContentService as any,
      leaveService as any,
      hrDocumentRequestService as any,
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
      prompt: 'How may we be of service?',
      options: [],
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
      prompt: 'How may we be of service?',
      options: [],
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
      prompt: 'How may we be of service?',
      options: [],
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
      prompt: 'How may we be of service?',
      options: [],
    });
  });

  it('does not interrupt an active HR conversation with navigation commands', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-back-2',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-back-2',
      currentState: 'HR_QUEUE',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'text', value: 'back' },
    });

    expect(chatSessionService.updateState).not.toHaveBeenCalled();
    expect(escalationService.createOrGetActiveEscalation).not.toHaveBeenCalled();
    expect(response.state).toBe('HR_QUEUE');
    expect(response.action).toBe('hr_conversation');
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
      prompt: 'How may we be of service?',
      options: [],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: '2' },
    });

    expect(response.success).toBe(true);
    expect(response.state).toBe('BENEFITS_MENU');
    expect(response.replies[0]).toMatchObject({
      type: 'menu',
      menuId: MENU_IDS.BENEFITS,
    });
  });

  it('passes numeric menu input through the deterministic selection flow', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-numeric',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-numeric',
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
      prompt: 'How can we assist you with your leave?',
      options: [],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'text', value: '2' },
    });

    expect(menuReplyBuilder.getSelection).toHaveBeenCalledWith(
      MENU_IDS.MAIN,
      '2',
    );
    expect(response.success).toBe(true);
    expect(response.state).toBe('LEAVE_MENU');
  });

  it('returns static HR content for a Policy FAQ selection', async () => {
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
    hrContentService.get.mockReturnValue({
      id: 'leave_policy',
      title: 'Leave Policy',
      answer:
        '[HR APPROVAL REQUIRED] Leave policy content has not yet been provided by HR.',
      status: 'PLACEHOLDER',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.LEAVE_POLICY },
    });

    expect(menuReplyBuilder.getSelection).toHaveBeenCalledWith(
      MENU_IDS.POLICY,
      MENU_SELECTION_IDS.LEAVE_POLICY,
    );
    expect(hrContentService.get).toHaveBeenCalledWith(
      'policy',
      MENU_SELECTION_IDS.LEAVE_POLICY,
    );
    expect(response.success).toBe(true);
    expect(response.state).toBe('POLICY_MENU');
    expect(response.action).toBe('show_leave_policy');
    expect(response.message).toBe(
      '[HR APPROVAL REQUIRED] Leave policy content has not yet been provided by HR.',
    );
    expect(response.replies).toEqual([
      {
        type: 'text',
        text: '[HR APPROVAL REQUIRED] Leave policy content has not yet been provided by HR.',
      },
    ]);
  });

  it('returns a content-not-found response when a Policy FAQ item has no static content', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-policy-missing-content',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-policy-missing-content',
      currentState: 'POLICY_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.LEAVE_POLICY,
      action: 'show_leave_policy',
    });
    hrContentService.get.mockReturnValue(undefined);

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.LEAVE_POLICY },
    });

    expect(hrContentService.get).toHaveBeenCalledWith(
      'policy',
      MENU_SELECTION_IDS.LEAVE_POLICY,
    );
    expect(response.state).toBe('POLICY_MENU');
    expect(response.action).toBe('content_not_found');
  });

  it('returns static HR content for a Health Insurance selection', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-health-insurance',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-health-insurance',
      currentState: 'POLICY_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.HEALTH_INSURANCE,
      action: 'show_health_insurance',
    });
    hrContentService.get.mockReturnValue({
      id: 'health_insurance',
      title: 'Health Insurance',
      answer:
        '[HR APPROVAL REQUIRED] Health Insurance information has not yet been provided by HR.',
      status: 'PLACEHOLDER',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: {
        kind: 'selection',
        value: MENU_SELECTION_IDS.HEALTH_INSURANCE,
      },
    });

    expect(menuReplyBuilder.getSelection).toHaveBeenCalledWith(
      MENU_IDS.POLICY,
      MENU_SELECTION_IDS.HEALTH_INSURANCE,
    );
    expect(hrContentService.get).toHaveBeenCalledWith(
      'policy',
      MENU_SELECTION_IDS.HEALTH_INSURANCE,
    );
    expect(response.success).toBe(true);
    expect(response.state).toBe('POLICY_MENU');
    expect(response.action).toBe('show_health_insurance');
    expect(response.message).toBe(
      '[HR APPROVAL REQUIRED] Health Insurance information has not yet been provided by HR.',
    );
    expect(response.replies).toEqual([
      {
        type: 'text',
        text: '[HR APPROVAL REQUIRED] Health Insurance information has not yet been provided by HR.',
      },
    ]);
  });

  it('returns the employee leave balance through LeaveService', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-leave-balance',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-leave-balance',
      currentState: 'LEAVE_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.LEAVE_BALANCE,
      action: 'open_leave_balance',
    });
    leaveService.getLeaveBalanceByPhone.mockResolvedValue({
      status: 'available',
      balance: { remainingDays: 12 },
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.LEAVE_BALANCE },
    });

    expect(leaveService.getLeaveBalanceByPhone).toHaveBeenCalledWith(
      '+2347044965784',
    );
    expect(response.success).toBe(true);
    expect(response.state).toBe('LEAVE_MENU');
    expect(response.action).toBe('open_leave_balance');
    expect(response.message).toBe('You have 12 leave days remaining.');
    expect(response.replies).toEqual([
      { type: 'text', text: 'You have 12 leave days remaining.' },
    ]);
  });

  it('returns a safe message when the leave balance is unavailable', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-leave-balance-unavailable',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-leave-balance-unavailable',
      currentState: 'LEAVE_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.LEAVE_BALANCE,
      action: 'open_leave_balance',
    });
    leaveService.getLeaveBalanceByPhone.mockResolvedValue({
      status: 'unavailable',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.LEAVE_BALANCE },
    });

    expect(response.action).toBe('leave_balance_unavailable');
    expect(response.message).toBe(
      'Your leave balance is currently unavailable. Please contact HR for assistance.',
    );
  });

  it('returns static HR content for Learn About Leave', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-leave-types',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-leave-types',
      currentState: 'LEAVE_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.LEAVE_TYPES,
      action: 'show_leave_types',
    });
    hrContentService.get.mockReturnValue({
      id: MENU_SELECTION_IDS.LEAVE_TYPES,
      title: 'Leave Types',
      answer:
        '[HR APPROVAL REQUIRED] Leave types content has not yet been provided by HR.',
      status: 'PLACEHOLDER',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.LEAVE_TYPES },
    });

    expect(hrContentService.get).toHaveBeenCalledWith(
      'leave',
      MENU_SELECTION_IDS.LEAVE_TYPES,
    );
    expect(response.message).toBe(
      '[HR APPROVAL REQUIRED] Leave types content has not yet been provided by HR.',
    );
    expect(response.action).toBe('show_leave_types');
  });

  it('routes a Learn About Leave selection through the HR content layer', async () => {
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
    hrContentService.get.mockReturnValue({
      id: MENU_SELECTION_IDS.LEAVE_TYPES,
      title: 'Leave Types',
      answer:
        '[HR APPROVAL REQUIRED] Leave types content has not yet been provided by HR.',
      status: 'PLACEHOLDER',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.LEAVE_TYPES },
    });

    expect(menuReplyBuilder.getSelection).toHaveBeenCalledWith(
      MENU_IDS.LEAVE,
      MENU_SELECTION_IDS.LEAVE_TYPES,
    );
    expect(hrContentService.get).toHaveBeenCalledWith(
      'leave',
      MENU_SELECTION_IDS.LEAVE_TYPES,
    );
    expect(response.state).toBe('LEAVE_MENU');
    expect(response.action).toBe('show_leave_types');
    expect(response.message).toBe(
      '[HR APPROVAL REQUIRED] Leave types content has not yet been provided by HR.',
    );
  });

  it('returns static HR content for a Benefits selection', async () => {
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
    hrContentService.get.mockReturnValue({
      id: 'pension',
      title: 'Pension',
      answer:
        '[HR APPROVAL REQUIRED] Pension information has not yet been provided by HR.',
      status: 'PLACEHOLDER',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.PENSION },
    });

    expect(menuReplyBuilder.getSelection).toHaveBeenCalledWith(
      MENU_IDS.BENEFITS,
      MENU_SELECTION_IDS.PENSION,
    );
    expect(hrContentService.get).toHaveBeenCalledWith(
      'benefits',
      MENU_SELECTION_IDS.PENSION,
    );
    expect(response.success).toBe(true);
    expect(response.state).toBe('BENEFITS_MENU');
    expect(response.action).toBe('show_pension');
    expect(response.message).toBe(
      '[HR APPROVAL REQUIRED] Pension information has not yet been provided by HR.',
    );
    expect(response.replies).toEqual([
      {
        type: 'text',
        text: '[HR APPROVAL REQUIRED] Pension information has not yet been provided by HR.',
      },
    ]);
  });

  it('returns a content-not-found response when a Benefits item has no static content', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-benefits-missing-content',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-benefits-missing-content',
      currentState: 'BENEFITS_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.PENSION,
      action: 'show_pension',
    });
    hrContentService.get.mockReturnValue(undefined);

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.PENSION },
    });

    expect(hrContentService.get).toHaveBeenCalledWith(
      'benefits',
      MENU_SELECTION_IDS.PENSION,
    );
    expect(response.state).toBe('BENEFITS_MENU');
    expect(response.action).toBe('content_not_found');
  });

  it('returns to the main menu from the Policy FAQ menu when back is selected', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-policy-back',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-policy-back',
      currentState: 'POLICY_MENU',
    });
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.MAIN,
      title: 'HR Services',
      prompt: 'How may we be of service?',
      options: [],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: 'back' },
    });

    expect(chatSessionService.updateState).toHaveBeenCalledWith(
      'session-policy-back',
      'MAIN_MENU',
    );
    expect(response.state).toBe('MAIN_MENU');
    expect(response.menu?.menuId).toBe(MENU_IDS.MAIN);
  });

  it('returns to the main menu from the Leave menu when back is selected', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-leave-back',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-leave-back',
      currentState: 'LEAVE_MENU',
    });
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.MAIN,
      title: 'HR Services',
      prompt: 'How may we be of service?',
      options: [],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: 'back' },
    });

    expect(chatSessionService.updateState).toHaveBeenCalledWith(
      'session-leave-back',
      'MAIN_MENU',
    );
    expect(response.state).toBe('MAIN_MENU');
    expect(response.menu?.menuId).toBe(MENU_IDS.MAIN);
  });

  it('returns to the main menu from the Benefits menu when back is selected', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-benefits-back',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-benefits-back',
      currentState: 'BENEFITS_MENU',
    });
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.MAIN,
      title: 'HR Services',
      prompt: 'How may we be of service?',
      options: [],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: 'back' },
    });

    expect(chatSessionService.updateState).toHaveBeenCalledWith(
      'session-benefits-back',
      'MAIN_MENU',
    );
    expect(response.state).toBe('MAIN_MENU');
    expect(response.menu?.menuId).toBe(MENU_IDS.MAIN);
  });

  it('returns to the main menu from the HR Document Requests menu when back is selected', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-verification-back',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-verification-back',
      currentState: 'VERIFICATION_MENU',
    });
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.MAIN,
      title: 'HR Services',
      prompt: 'How may we be of service?',
      options: [],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: 'back' },
    });

    expect(chatSessionService.updateState).toHaveBeenCalledWith(
      'session-verification-back',
      'MAIN_MENU',
    );
    expect(response.state).toBe('MAIN_MENU');
    expect(response.menu?.menuId).toBe(MENU_IDS.MAIN);
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
      prompt: 'How may we be of service?',
      options: [],
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

  it('prompts the employee to describe the issue before escalating to HR', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-6',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-6',
      currentState: 'POLICY_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.TALK_TO_HR,
      action: 'talk_to_hr',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: MENU_SELECTION_IDS.TALK_TO_HR },
    });

    expect(chatSessionService.updateState).toHaveBeenCalledWith(
      'session-6',
      'HR_MESSAGE',
    );
    expect(escalationService.createOrGetActiveEscalation).not.toHaveBeenCalled();
    expect(response.state).toBe('HR_MESSAGE');
    expect(response.action).toBe('awaiting_hr_message');
    expect(response.replies[0]).toEqual({
      type: 'text',
      text: 'Please tell us what you would like to discuss with HR.',
    });
  });

  it('creates the HR ticket using the employee message and returns the existing escalation reply', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-hr-message',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-hr-message',
      currentState: 'HR_MESSAGE',
    });
    escalationService.createOrGetActiveEscalation.mockResolvedValue({
      escalationId: 'ticket-1',
      status: 'OPEN',
      queuePosition: 1,
      hrBusy: false,
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: {
        kind: 'text',
        value: 'I have not received my medical insurance card.',
      },
    });

    expect(escalationService.createOrGetActiveEscalation).toHaveBeenCalledWith(
      'emp-hr-message',
      'session-hr-message',
      'I have not received my medical insurance card.',
    );
    expect(chatSessionService.updateState).toHaveBeenCalledWith(
      'session-hr-message',
      'HR_QUEUE',
    );
    expect(response.escalated).toBe(true);
    expect(response.escalationId).toBe('ticket-1');
    expect(response.state).toBe('HR_QUEUE');
    expect(response.replies[0]).toEqual({
      type: 'text',
      text: 'Your request has been added to the HR queue. You are number 1 in the queue. An HR representative will attend to you shortly.',
    });
  });

  it('keeps subsequent employee messages in the active HR conversation without creating another ticket', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-hr-follow-up',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-hr-follow-up',
      currentState: 'HR_QUEUE',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: {
        kind: 'text',
        value: 'I also want to know if my dependent is covered.',
      },
    });

    expect(escalationService.createOrGetActiveEscalation).not.toHaveBeenCalled();
    expect(chatSessionService.touch).toHaveBeenCalledWith(
      'session-hr-follow-up',
    );
    expect(response.state).toBe('HR_QUEUE');
    expect(response.action).toBe('hr_conversation');
    expect(response.replies[0]).toEqual({
      type: 'text',
      text: 'Your message has been added to your HR request. An HR representative will respond as soon as possible.',
    });
  });

  it('prompts again when the HR issue is empty', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-hr-empty',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-hr-empty',
      currentState: 'HR_MESSAGE',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'text', value: '   ' },
    });

    expect(escalationService.createOrGetActiveEscalation).not.toHaveBeenCalled();
    expect(response.state).toBe('HR_MESSAGE');
    expect(response.action).toBe('awaiting_hr_message');
  });

  it('handles numeric Talk to HR selection by first requesting the employee message', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-numeric-talk-to-hr',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-numeric-talk-to-hr',
      currentState: 'POLICY_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.TALK_TO_HR,
      action: 'talk_to_hr',
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'text', value: '8' },
    });

    expect(menuReplyBuilder.getSelection).toHaveBeenCalledWith(
      MENU_IDS.POLICY,
      '8',
    );
    expect(escalationService.createOrGetActiveEscalation).not.toHaveBeenCalled();
    expect(response.state).toBe('HR_MESSAGE');
  });

  it('does not escalate Talk to HR from the main menu', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-main-talk-to-hr',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-main-talk-to-hr',
      currentState: 'MAIN_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue(undefined);
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.MAIN,
      title: 'HR Services',
      prompt: 'How may we be of service?',
      options: [],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: {
        kind: 'selection',
        value: MENU_SELECTION_IDS.TALK_TO_HR,
      },
    });

    expect(
      escalationService.createOrGetActiveEscalation,
    ).not.toHaveBeenCalled();
    expect(response.state).toBe('MAIN_MENU');
    expect(response.action).toBe('fallback');
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
      prompt: 'How may we be of service?',
      options: [],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: 'menu' },
    });

    expect(Array.isArray(response.replies)).toBe(true);
    expect(response.replies.length).toBeGreaterThan(0);
    expect(response.replies[0].type).toBe('menu');
  });
  it('opens HR Document Requests from the main menu', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-doc-menu',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-doc-menu',
      currentState: 'MAIN_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.HR_DOCUMENT_REQUESTS,
      action: 'open_hr_document_requests',
    });
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.VERIFICATION,
      title: 'HR Document Requests',
      prompt: 'What would you like to do?',
      options: [],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: '4' },
    });

    expect(response.state).toBe('VERIFICATION_MENU');
    expect(response.menu?.menuId).toBe(MENU_IDS.VERIFICATION);
  });

  it('opens the HR document type menu', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-doc-request',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-doc-request',
      currentState: 'VERIFICATION_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.REQUEST_HR_DOCUMENT,
      action: 'open_document_request',
    });
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.DOCUMENT_REQUEST,
      title: 'Request an HR Document',
      prompt: 'What document do you need?',
      options: [],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: '1' },
    });

    expect(chatSessionService.updateState).toHaveBeenCalledWith(
      'session-doc-request',
      'DOCUMENT_REQUEST_MENU',
    );
    expect(response.state).toBe('DOCUMENT_REQUEST_MENU');
    expect(response.menu?.menuId).toBe(MENU_IDS.DOCUMENT_REQUEST);
  });

  it('escalates a selected HR document request to HR', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-doc-evl',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-doc-evl',
      currentState: 'DOCUMENT_REQUEST_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: MENU_SELECTION_IDS.EMPLOYMENT_VERIFICATION_LETTER,
      action: 'request_document',
    });
    hrDocumentRequestService.createRequest.mockReturnValue({
      id: MENU_SELECTION_IDS.EMPLOYMENT_VERIFICATION_LETTER,
      label: 'Employment Verification Letter (EVL)',
    });
    escalationService.createOrGetActiveEscalation.mockResolvedValue({
      escalationId: 'esc-doc-1',
      status: 'OPEN',
      queuePosition: 1,
      hrBusy: false,
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: '1' },
    });

    expect(hrDocumentRequestService.createRequest).toHaveBeenCalledWith(
      MENU_SELECTION_IDS.EMPLOYMENT_VERIFICATION_LETTER,
    );
    expect(escalationService.createOrGetActiveEscalation).toHaveBeenCalledWith(
      'emp-doc-evl',
      'session-doc-evl',
      'HR document request: Employment Verification Letter (EVL)',
    );
    expect(response.escalated).toBe(true);
    expect(response.state).toBe('HR_QUEUE');
    expect(response.action).toBe('talk_to_hr');
  });

  it('returns from the document type menu to HR Document Requests', async () => {
    employeeService.findByPhoneNumber.mockResolvedValue({
      id: 'emp-doc-back',
      status: 'ACTIVE',
    });
    chatSessionService.getOrCreateSession.mockResolvedValue({
      id: 'session-doc-back',
      currentState: 'DOCUMENT_REQUEST_MENU',
    });
    menuReplyBuilder.getSelection.mockReturnValue({
      id: 'back',
      action: 'back',
    });
    menuReplyBuilder.buildMenuReply.mockReturnValue({
      type: 'menu',
      menuId: MENU_IDS.VERIFICATION,
      title: 'HR Document Requests',
      prompt: 'What would you like to do?',
      options: [],
    });

    const response = await service.handleMessage({
      senderPhoneNumber: '+2347044965784',
      input: { kind: 'selection', value: '6' },
    });

    expect(chatSessionService.updateState).toHaveBeenCalledWith(
      'session-doc-back',
      'VERIFICATION_MENU',
    );
    expect(response.state).toBe('VERIFICATION_MENU');
    expect(response.menu?.menuId).toBe(MENU_IDS.VERIFICATION);
  });

});

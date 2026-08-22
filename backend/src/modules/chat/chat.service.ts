import { Injectable } from '@nestjs/common';
import { EmployeeService } from '../employee/employee.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ChatSessionService } from './chat-session.service';
import { MessageDirection, MessageType } from '../../generated/prisma/enums';
import { MENU_IDS, MENU_SELECTION_IDS } from './menu.config';
import { MenuReplyBuilderService } from './menu-reply-builder.service';
import { EscalationService } from '../escalation/escalation.service';
import { HrContentService } from '../../content/hr-content.service';
import { LeaveService } from '../leave/leave.service';
import { HrDocumentRequestService } from '../verification/hr-document-request.service';
import type {
  ConversationResponse,
  InboundConversationMessage,
} from './conversation.contracts';

@Injectable()
export class ConversationService {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly prisma: PrismaService,
    private readonly chatSessionService: ChatSessionService,
    private readonly menuReplyBuilder: MenuReplyBuilderService,
    private readonly escalationService: EscalationService,
    private readonly hrContentService: HrContentService,
    private readonly leaveService: LeaveService,
    private readonly hrDocumentRequestService: HrDocumentRequestService,
  ) {}

  /**
   * Handles an inbound employee message.
   *
   * MVP rules:
   * - Employee is identified by registered phone number.
   * - Conversation state is persisted in ChatSession.
   * - User input is treated as a deterministic menu selection.
   * - Every inbound message is logged.
   * - Session state is persisted through ChatSessionService.
   * - Human escalation is handled through EscalationService.
   */
  async handleMessage(
    inboundMessage: InboundConversationMessage,
  ): Promise<ConversationResponse> {
    const phoneNumber = inboundMessage.senderPhoneNumber;
    const message = inboundMessage.input.value;
    const employee = await this.employeeService.findByPhoneNumber(phoneNumber);

    if (!employee) {
      return {
        success: false,
        message: 'Employee not found.',
        replies: [{ type: 'text', text: 'Employee not found.' }],
      };
    }

    /**
     * Only active employees should be allowed to use
     * the HR assistant.
     */
    if (employee.status !== 'ACTIVE') {
      return {
        success: false,
        message: 'Your employee account is not active. Please contact HR.',
        replies: [
          {
            type: 'text',
            text: 'Your employee account is not active. Please contact HR.',
          },
        ],
      };
    }

    /**
     * Get the employee's active session or create one
     * starting from the main menu.
     */
    const session = await this.chatSessionService.getOrCreateSession(
      employee.id,
      'MAIN_MENU',
    );

    const previousInboundMessage = await this.prisma.chatMessage.findFirst({
      where: {
        sessionId: session.id,
        direction: MessageDirection.INBOUND,
      },
      select: {
        id: true,
      },
    });

    /**
     * Log every inbound message.
     */
    await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        direction: MessageDirection.INBOUND,
        messageType: MessageType.TEXT,
        content: message,
      },
    });

    if (!previousInboundMessage) {
      return this.createMenuResponse(session.id, MENU_IDS.MAIN, 'MAIN_MENU');
    }

    const selection = message.trim().toLowerCase();

    /**
     * Once the employee has asked to speak with HR, the next message is
     * the issue that will become the ticket reason. The bot must not
     * interpret that message as a menu selection.
     */
    if (session.currentState === 'HR_MESSAGE') {
      return this.handleHrMessageSubmission(
        employee.id,
        session.id,
        session.currentState,
        message,
      );
    }

    /**
     * Once an HR ticket is active, subsequent employee messages remain
     * part of that same conversation. They are already persisted by the
     * inbound message log above and must not create another ticket or be
     * interpreted as bot navigation.
     */
    if (session.currentState === 'HR_QUEUE') {
      return this.handleHrQueueState(session.id);
    }

    const currentMenuId = this.getMenuIdForState(session.currentState);
    const numericMenuSelection =
      currentMenuId && /^\d+$/.test(selection)
        ? this.menuReplyBuilder.getSelection(currentMenuId, selection)
        : undefined;

    /**
     * Global "back" navigation.
     *
     * The MVP does not maintain a navigation stack. "back"
     * therefore returns the employee to the main menu from
     * any non-main conversation state.
     *
     * The active HR escalation, if any, is not resolved by
     * changing the conversation state.
     */
    if (this.isBack(selection) || numericMenuSelection?.action === 'back') {
      const parentMenuId = this.getParentMenuId(session.currentState);

      if (parentMenuId === MENU_IDS.MAIN) {
        if (session.currentState !== 'MAIN_MENU') {
          await this.chatSessionService.updateState(session.id, 'MAIN_MENU');
        }

        return this.createMenuResponse(session.id, MENU_IDS.MAIN, 'MAIN_MENU');
      }

      if (parentMenuId) {
        const parentState = this.getMenuState(parentMenuId);

        if (parentState && session.currentState !== parentState) {
          await this.chatSessionService.updateState(session.id, parentState);
        }

        return this.createMenuResponse(
          session.id,
          parentMenuId,
          parentState ?? session.currentState,
        );
      }

      if (session.currentState !== 'MAIN_MENU') {
        await this.chatSessionService.updateState(session.id, 'MAIN_MENU');
      }

      return this.createMenuResponse(session.id, MENU_IDS.MAIN, 'MAIN_MENU');
    }

    /**
     * Talk to HR is available from every submenu, but not from
     * the main menu. Employees should first see the self-service
     * options before choosing to escalate to HR.
     */
    if (
      session.currentState !== 'MAIN_MENU' &&
      (selection === MENU_SELECTION_IDS.TALK_TO_HR ||
        this.isTalkToHrAlias(selection) ||
        numericMenuSelection?.action === 'talk_to_hr')
    ) {
      return this.requestHrMessage(session.id, session.currentState);
    }

    /**
     * Global main-menu navigation.
     *
     * This remains available while the employee is waiting
     * in the HR queue.
     */
    if (this.isMainMenu(selection)) {
      await this.chatSessionService.updateState(session.id, 'MAIN_MENU');

      return this.createMenuResponse(session.id, MENU_IDS.MAIN, 'MAIN_MENU');
    }

    /**
     * Deterministic conversation state machine.
     */
    switch (session.currentState) {
      case 'MAIN_MENU':
        return this.handleMainMenuSelection(session.id, selection);

      case 'POLICY_MENU':
        return this.handlePolicySelection(session.id, selection);

      case 'LEAVE_MENU':
        return this.handleLeaveSelection(session.id, selection, phoneNumber);

      case 'BENEFITS_MENU':
        return this.handleBenefitsSelection(session.id, selection);

      case 'VERIFICATION_MENU':
        return this.handleVerificationSelection(session.id, selection);

      case 'DOCUMENT_REQUEST_MENU':
        return this.handleDocumentRequestSelection(
          employee.id,
          session.id,
          session.currentState,
          selection,
        );

      default:
        return this.escalateToHr(
          employee.id,
          session.id,
          session.currentState,
          'Unknown conversation state encountered.',
        );
    }
  }

  /**
   * Handles selections from the main menu.
   *
   * MenuReplyBuilderService validates the selection against
   * MENU_CONFIG so the conversation engine does not duplicate
   * menu configuration.
   */
  private async handleMainMenuSelection(
    sessionId: string,
    selection: string,
  ): Promise<ConversationResponse> {
    const menuSelection = this.menuReplyBuilder.getSelection(
      MENU_IDS.MAIN,
      selection,
    );

    if (!menuSelection) {
      return this.handleUnknownSelection(sessionId, 'MAIN_MENU', MENU_IDS.MAIN);
    }

    switch (menuSelection.action) {
      case 'open_policy_faq':
        return this.transitionAndMenuResponse(
          sessionId,
          'POLICY_MENU',
          MENU_IDS.POLICY,
        );

      case 'open_leave_balance':
        return this.transitionAndMenuResponse(
          sessionId,
          'LEAVE_MENU',
          MENU_IDS.LEAVE,
        );

      case 'open_benefits':
        return this.transitionAndMenuResponse(
          sessionId,
          'BENEFITS_MENU',
          MENU_IDS.BENEFITS,
        );

      case 'open_hr_document_requests':
        return this.transitionAndMenuResponse(
          sessionId,
          'VERIFICATION_MENU',
          MENU_IDS.VERIFICATION,
        );

      default:
        return this.handleUnknownSelection(
          sessionId,
          'MAIN_MENU',
          MENU_IDS.MAIN,
        );
    }
  }

  /**
   * I Have a Question state.
   *
   * Actual policy content will be connected through the
   * Policy module in its own integration step.
   */
  private async handlePolicySelection(
    sessionId: string,
    selection: string,
  ): Promise<ConversationResponse> {
    const menuSelection = this.menuReplyBuilder.getSelection(
      MENU_IDS.POLICY,
      selection,
    );

    if (!menuSelection) {
      return this.handleUnknownSelection(
        sessionId,
        'POLICY_MENU',
        MENU_IDS.POLICY,
      );
    }

    const content = this.hrContentService.get('policy', menuSelection.id);

    if (!content) {
      return this.createResponse(sessionId, 'POLICY_MENU', 'content_not_found');
    }

    return {
      success: true,
      sessionId,
      state: 'POLICY_MENU',
      action: menuSelection.action,
      message: content.answer,
      replies: [
        {
          type: 'text',
          text: content.answer,
        },
      ],
      escalationAvailable: true,
    };
  }

  /**
   * Leave & Time Off state.
   *
   * Static leave information is served from the HR content layer.
   * Leave balance is retrieved through LeaveService, which keeps
   * the conversation layer independent of the spreadsheet adapter.
   */
  private async handleLeaveSelection(
    sessionId: string,
    selection: string,
    phoneNumber: string,
  ): Promise<ConversationResponse> {
    const menuSelection = this.menuReplyBuilder.getSelection(
      MENU_IDS.LEAVE,
      selection,
    );

    if (!menuSelection) {
      return this.handleUnknownSelection(
        sessionId,
        'LEAVE_MENU',
        MENU_IDS.LEAVE,
      );
    }

    if (menuSelection.action === 'open_leave_balance') {
      return this.handleLeaveBalanceSelection(sessionId, phoneNumber);
    }

    if (
      menuSelection.action === 'show_leave_types' ||
      menuSelection.action === 'show_how_to_apply_leave' ||
      menuSelection.action === 'show_leave_application_status'
    ) {
      const content = this.hrContentService.get('leave', menuSelection.id);

      if (!content) {
        return this.createResponse(
          sessionId,
          'LEAVE_MENU',
          'content_not_found',
        );
      }

      return {
        success: true,
        sessionId,
        state: 'LEAVE_MENU',
        action: menuSelection.action,
        message: content.answer,
        replies: [
          {
            type: 'text',
            text: content.answer,
          },
        ],
        escalationAvailable: true,
      };
    }

    return this.createResponse(sessionId, 'LEAVE_MENU', menuSelection.action);
  }

  private async handleLeaveBalanceSelection(
    sessionId: string,
    phoneNumber: string,
  ): Promise<ConversationResponse> {
    const result = await this.leaveService.getLeaveBalanceByPhone(phoneNumber);

    switch (result.status) {
      case 'available':
        return {
          success: true,
          sessionId,
          state: 'LEAVE_MENU',
          action: 'open_leave_balance',
          message: `You have ${result.balance.remainingDays} leave day${result.balance.remainingDays === 1 ? '' : 's'} remaining.`,
          replies: [
            {
              type: 'text',
              text: `You have ${result.balance.remainingDays} leave day${result.balance.remainingDays === 1 ? '' : 's'} remaining.`,
            },
          ],
          escalationAvailable: true,
        };

      case 'employee-not-found':
      case 'invalid-phone-number':
      case 'unavailable':
        return {
          success: true,
          sessionId,
          state: 'LEAVE_MENU',
          action: 'leave_balance_unavailable',
          message:
            'Your leave balance is currently unavailable. Please contact HR for assistance.',
          replies: [
            {
              type: 'text',
              text: 'Your leave balance is currently unavailable. Please contact HR for assistance.',
            },
          ],
          escalationAvailable: true,
        };
    }
  }

  /**
   * Benefits state.
   */
  private async handleBenefitsSelection(
    sessionId: string,
    selection: string,
  ): Promise<ConversationResponse> {
    const menuSelection = this.menuReplyBuilder.getSelection(
      MENU_IDS.BENEFITS,
      selection,
    );

    if (!menuSelection) {
      return this.handleUnknownSelection(
        sessionId,
        'BENEFITS_MENU',
        MENU_IDS.BENEFITS,
      );
    }

    const content = this.hrContentService.get('benefits', menuSelection.id);

    if (!content) {
      return this.createResponse(
        sessionId,
        'BENEFITS_MENU',
        'content_not_found',
      );
    }

    return {
      success: true,
      sessionId,
      state: 'BENEFITS_MENU',
      action: menuSelection.action,
      message: content.answer,
      replies: [
        {
          type: 'text',
          text: content.answer,
        },
      ],
      escalationAvailable: true,
    };
  }

  /**
   * Employment verification state.
   */
  private async handleVerificationSelection(
    sessionId: string,
    selection: string,
  ): Promise<ConversationResponse> {
    const menuSelection = this.menuReplyBuilder.getSelection(
      MENU_IDS.VERIFICATION,
      selection,
    );

    if (!menuSelection) {
      return this.handleUnknownSelection(
        sessionId,
        'VERIFICATION_MENU',
        MENU_IDS.VERIFICATION,
      );
    }

    if (menuSelection.action === 'open_document_request') {
      return this.transitionAndMenuResponse(
        sessionId,
        'DOCUMENT_REQUEST_MENU',
        MENU_IDS.DOCUMENT_REQUEST,
      );
    }

    return this.createResponse(
      sessionId,
      'VERIFICATION_MENU',
      menuSelection.action,
    );
  }

  /**
   * Handles HR document requests.
   *
   * The employee is already identified by their registered phone number.
   * The selected document request is escalated to HR for processing.
   * The actual document is not generated or delivered by the bot.
   */
  private async handleDocumentRequestSelection(
    employeeId: string,
    sessionId: string,
    currentState: string,
    selection: string,
  ): Promise<ConversationResponse> {
    const menuSelection = this.menuReplyBuilder.getSelection(
      MENU_IDS.DOCUMENT_REQUEST,
      selection,
    );

    if (!menuSelection) {
      return this.handleUnknownSelection(
        sessionId,
        'DOCUMENT_REQUEST_MENU',
        MENU_IDS.DOCUMENT_REQUEST,
      );
    }

    if (menuSelection.action === 'request_document') {
      const request = this.hrDocumentRequestService.createRequest(
        menuSelection.id,
      );

      if (!request) {
        return this.handleUnknownSelection(
          sessionId,
          'DOCUMENT_REQUEST_MENU',
          MENU_IDS.DOCUMENT_REQUEST,
        );
      }

      return this.escalateToHr(
        employeeId,
        sessionId,
        currentState,
        `HR document request: ${request.label}`,
        {
          category: 'DOCUMENT_REQUEST',
          documentType: request.id,
        },
      );
    }

    return this.createResponse(
      sessionId,
      'DOCUMENT_REQUEST_MENU',
      menuSelection.action,
    );
  }

  /**
   * Prompts the employee for the issue that should become the HR ticket.
   */
  private async requestHrMessage(
    sessionId: string,
    currentState: string,
  ): Promise<ConversationResponse> {
    await this.chatSessionService.updateState(sessionId, 'HR_MESSAGE');

    const message = 'Please tell us what you would like to discuss with HR.';

    return {
      success: true,
      sessionId,
      previousState: currentState,
      state: 'HR_MESSAGE',
      action: 'awaiting_hr_message',
      message,
      replies: [{ type: 'text', text: message }],
      escalationAvailable: true,
    };
  }

  /**
   * Creates the HR ticket only after the employee supplies the issue.
   */
  private async handleHrMessageSubmission(
    employeeId: string,
    sessionId: string,
    currentState: string,
    message: string,
  ): Promise<ConversationResponse> {
    const issue = message.trim();

    if (!issue) {
      const prompt = 'Please tell us what you would like to discuss with HR.';

      return {
        success: true,
        sessionId,
        previousState: currentState,
        state: 'HR_MESSAGE',
        action: 'awaiting_hr_message',
        message: prompt,
        replies: [{ type: 'text', text: prompt }],
        escalationAvailable: true,
      };
    }

    return this.escalateToHr(
      employeeId,
      sessionId,
      currentState,
      issue,
    );
  }

  /**
   * Keeps subsequent employee messages in the same active HR ticket.
   * The inbound message has already been persisted by handleMessage.
   */
  private async handleHrQueueState(
    sessionId: string,
  ): Promise<ConversationResponse> {
    await this.chatSessionService.touch(sessionId);

    const acknowledgement =
      'Your message has been added to your HR request. An HR representative will respond as soon as possible.';

    return {
      success: true,
      sessionId,
      state: 'HR_QUEUE',
      action: 'hr_conversation',
      message: acknowledgement,
      replies: [{ type: 'text', text: acknowledgement }],
      escalationAvailable: false,
    };
  }

  /**
   * Handles an unrecognized deterministic selection.
   *
   * The system does not attempt to interpret arbitrary text
   * as natural-language intent.
   */
  private async handleUnknownSelection(
    sessionId: string,
    currentState: string,
    menuId?: string,
  ): Promise<ConversationResponse> {
    await this.chatSessionService.touch(sessionId);

    const response = {
      success: true,
      sessionId,
      state: currentState,
      action: 'fallback',
      message:
        'I could not match that selection. Please choose one of the available options.',
      replies: [
        {
          type: 'text' as const,
          text: 'I could not match that selection. Please choose one of the available options.',
        },
      ],
      escalationAvailable: true,
    };

    if (menuId) {
      const menu = this.menuReplyBuilder.buildMenuReply(menuId);

      if (menu) {
        return {
          ...response,
          menu,
          replies: [...response.replies, menu],
        };
      }
    }

    return response;
  }

  /**
   * Persists a conversation state transition.
   */
  private async transitionAndRespond(
    sessionId: string,
    nextState: string,
    action: string,
  ): Promise<ConversationResponse> {
    const previousSession = await this.prisma.chatSession.findUnique({
      where: {
        id: sessionId,
      },
      select: {
        currentState: true,
      },
    });

    await this.chatSessionService.updateState(sessionId, nextState);

    await this.prisma.chatMessage.create({
      data: {
        sessionId,
        direction: MessageDirection.OUTBOUND,
        messageType: MessageType.SYSTEM,
        content: `STATE_TRANSITION:${previousSession?.currentState ?? 'UNKNOWN'}->${nextState}`,
      },
    });

    return this.createResponse(sessionId, nextState, action);
  }

  /**
   * Builds a transport-neutral menu response.
   */
  private createMenuResponse(
    sessionId: string,
    menuId: string,
    state: string,
  ): ConversationResponse {
    const menu = this.menuReplyBuilder.buildMenuReply(menuId);

    if (!menu) {
      return {
        success: false,
        sessionId,
        state,
        message: 'Menu configuration could not be loaded.',
        replies: [
          { type: 'text', text: 'Menu configuration could not be loaded.' },
        ],
      };
    }

    return {
      success: true,
      sessionId,
      state,
      action: menuId,
      menu,
      replies: [menu],
      escalationAvailable: true,
    };
  }

  /**
   * Persists a state transition and returns the target menu.
   *
   * This is used when a main-menu selection opens a submenu.
   */
  private async transitionAndMenuResponse(
    sessionId: string,
    nextState: string,
    menuId: string,
  ): Promise<ConversationResponse> {
    const previousSession = await this.prisma.chatSession.findUnique({
      where: {
        id: sessionId,
      },
      select: {
        currentState: true,
      },
    });

    await this.chatSessionService.updateState(sessionId, nextState);

    await this.prisma.chatMessage.create({
      data: {
        sessionId,
        direction: MessageDirection.OUTBOUND,
        messageType: MessageType.SYSTEM,
        content: `STATE_TRANSITION:${previousSession?.currentState ?? 'UNKNOWN'}->${nextState}`,
      },
    });

    return this.createMenuResponse(sessionId, menuId, nextState);
  }

  /**
   * Creates a standard conversation response.
   */
  private createResponse(
    sessionId: string,
    state: string,
    action: string,
  ): ConversationResponse {
    return {
      success: true,
      sessionId,
      state,
      action,
      replies: [
        {
          type: 'text',
          text: 'Your selection has been received.',
        },
      ],
      escalationAvailable: true,
    };
  }

  /**
   * Creates or reuses the employee's active escalation
   * and returns the current HR queue position.
   */
  private async escalateToHr(
    employeeId: string,
    sessionId: string,
    currentState: string,
    reason: string,
    context?: {
      category?: 'DOCUMENT_REQUEST';
      documentType?: string;
    },
  ): Promise<ConversationResponse> {
    const queueStatus = context
      ? await this.escalationService.createOrGetActiveEscalation(
          employeeId,
          sessionId,
          reason,
          context,
        )
      : await this.escalationService.createOrGetActiveEscalation(
          employeeId,
          sessionId,
          reason,
        );

    await this.chatSessionService.updateState(sessionId, 'HR_QUEUE');

    await this.prisma.chatMessage.create({
      data: {
        sessionId,
        direction: MessageDirection.OUTBOUND,
        messageType: MessageType.SYSTEM,
        content: `ESCALATION:${reason}:QUEUE_POSITION:${queueStatus.queuePosition ?? 'IN_PROGRESS'}`,
      },
    });

    /**
     * This means the employee's escalation has already
     * been picked up by HR.
     */
    if (queueStatus.status === 'IN_PROGRESS') {
      return {
        success: true,
        escalated: true,
        escalationId: queueStatus.escalationId,
        escalation: {
          id: queueStatus.escalationId,
          status: 'IN_PROGRESS',
        },
        sessionId,
        previousState: currentState,
        state: 'HR_QUEUE',
        action: 'talk_to_hr',
        status: 'IN_PROGRESS',
        message: 'An HR representative is currently attending to your request.',
        replies: [
          {
            type: 'text',
            text: 'An HR representative is currently attending to your request.',
          },
        ],
      };
    }

    const queuePosition = queueStatus.queuePosition ?? 1;

    /**
     * There is currently an HR request being handled.
     */
    if (queueStatus.hrBusy) {
      return {
        success: true,
        escalated: true,
        escalationId: queueStatus.escalationId,
        escalation: {
          id: queueStatus.escalationId,
          status: 'OPEN',
          queuePosition,
        },
        sessionId,
        previousState: currentState,
        state: 'HR_QUEUE',
        action: 'talk_to_hr',
        status: 'OPEN',
        queuePosition,
        hrBusy: true,
        message: `HR is currently assisting another employee. You are number ${queuePosition} in the queue. We will attend to you as soon as an HR representative becomes available.`,
        replies: [
          {
            type: 'text',
            text: `HR is currently assisting another employee. You are number ${queuePosition} in the queue. We will attend to you as soon as an HR representative becomes available.`,
          },
        ],
      };
    }

    /**
     * No HR request is currently IN_PROGRESS.
     */
    return {
      success: true,
      escalated: true,
      escalationId: queueStatus.escalationId,
      escalation: {
        id: queueStatus.escalationId,
        status: 'OPEN',
        queuePosition,
      },
      sessionId,
      previousState: currentState,
      state: 'HR_QUEUE',
      action: 'talk_to_hr',
      status: 'OPEN',
      queuePosition,
      hrBusy: false,
      message: `Your request has been added to the HR queue. You are number ${queuePosition} in the queue. An HR representative will attend to you shortly.`,
      replies: [
        {
          type: 'text',
          text: `Your request has been added to the HR queue. You are number ${queuePosition} in the queue. An HR representative will attend to you shortly.`,
        },
      ],
    };
  }

  /* Backward-compatible aliases for Talk to HR. */
  private isTalkToHrAlias(selection: string): boolean {
    return ['talk-to-hr', 'hr', 'escalate'].includes(selection);
  }

  /**
   * Deterministic back navigation.
   */
  private isBack(selection: string): boolean {
    return selection === 'back';
  }

  /**
   * Resolves a conversation state to its configured menu ID.
   *
   * This allows numeric employee input such as "5" for Talk to HR
   * or "6" for Back to use the same deterministic menu configuration
   * as the regular selection handlers.
   */
  private getMenuIdForState(state: string): string | undefined {
    switch (state) {
      case 'MAIN_MENU':
        return MENU_IDS.MAIN;
      case 'POLICY_MENU':
        return MENU_IDS.POLICY;
      case 'LEAVE_MENU':
        return MENU_IDS.LEAVE;
      case 'BENEFITS_MENU':
        return MENU_IDS.BENEFITS;
      case 'VERIFICATION_MENU':
        return MENU_IDS.VERIFICATION;
      case 'DOCUMENT_REQUEST_MENU':
        return MENU_IDS.DOCUMENT_REQUEST;
      default:
        return undefined;
    }
  }

  /* Returns the parent menu for a conversation state.*/
  private getParentMenuId(state: string): string | undefined {
    switch (state) {
      case 'POLICY_MENU':
        return MENU_IDS.MAIN;
      case 'LEAVE_MENU':
        return MENU_IDS.MAIN;
      case 'BENEFITS_MENU':
        return MENU_IDS.MAIN;
      case 'VERIFICATION_MENU':
        return MENU_IDS.MAIN;
      case 'DOCUMENT_REQUEST_MENU':
        return MENU_IDS.VERIFICATION;
      default:
        return undefined;
    }
  }

  /**
   * Resolves a configured menu ID to its conversation state.
   */
  private getMenuState(menuId: string): string | undefined {
    switch (menuId) {
      case MENU_IDS.MAIN:
        return 'MAIN_MENU';
      case MENU_IDS.POLICY:
        return 'POLICY_MENU';
      case MENU_IDS.LEAVE:
        return 'LEAVE_MENU';
      case MENU_IDS.BENEFITS:
        return 'BENEFITS_MENU';
      case MENU_IDS.VERIFICATION:
        return 'VERIFICATION_MENU';
      case MENU_IDS.DOCUMENT_REQUEST:
        return 'DOCUMENT_REQUEST_MENU';
      default:
        return undefined;
    }
  }

  /**
   * Global main-menu navigation.
   */
  private isMainMenu(selection: string): boolean {
    return ['main-menu', 'menu'].includes(selection);
  }
}

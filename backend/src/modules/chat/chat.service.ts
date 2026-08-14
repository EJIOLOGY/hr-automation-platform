import { Injectable } from '@nestjs/common';
import { EmployeeService } from '../employee/employee.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ChatSessionService } from './chat-session.service';
import { MessageDirection, MessageType } from '../../generated/prisma/enums';
import { MENU_IDS, MENU_SELECTION_IDS } from './menu.config';
import { MenuReplyBuilderService } from './menu-reply-builder.service';
import { EscalationService } from '../escalation/escalation.service';

@Injectable()
export class ConversationService {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly prisma: PrismaService,
    private readonly chatSessionService: ChatSessionService,
    private readonly menuReplyBuilder: MenuReplyBuilderService,
    private readonly escalationService: EscalationService,
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
  async handleMessage(phoneNumber: string, message: string) {
    const employee = await this.employeeService.findByPhoneNumber(phoneNumber);

    if (!employee) {
      return {
        success: false,
        message: 'Employee not found.',
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

    const selection = message.trim().toLowerCase();

    /**
     * Talk to HR is a global action and can be selected
     * from the main menu regardless of the current state.
     */
    if (
      selection === MENU_SELECTION_IDS.TALK_TO_HR ||
      this.isTalkToHrAlias(selection)
    ) {
      return this.escalateToHr(
        employee.id,
        session.id,
        session.currentState,
        'Employee selected Talk to HR.',
      );
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
        return this.handleLeaveSelection(session.id, selection);

      case 'BENEFITS_MENU':
        return this.handleBenefitsSelection(session.id, selection);

      case 'VERIFICATION_MENU':
        return this.handleVerificationSelection(session.id, selection);

      case 'HR_QUEUE':
        return this.handleHrQueueState(
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
  private async handleMainMenuSelection(sessionId: string, selection: string) {
    const menuSelection = this.menuReplyBuilder.getSelection(
      MENU_IDS.MAIN,
      selection,
    );

    if (!menuSelection) {
      return this.handleUnknownSelection(sessionId, 'MAIN_MENU', MENU_IDS.MAIN);
    }

    switch (menuSelection.action) {
      case 'open_policy_faq':
        return this.transitionAndRespond(
          sessionId,
          'POLICY_MENU',
          'policy_menu',
        );

      case 'open_leave_balance':
        return this.transitionAndRespond(sessionId, 'LEAVE_MENU', 'leave_menu');

      case 'open_benefits':
        return this.transitionAndRespond(
          sessionId,
          'BENEFITS_MENU',
          'benefits_menu',
        );

      case 'open_employment_verification':
        return this.transitionAndRespond(
          sessionId,
          'VERIFICATION_MENU',
          'verification_menu',
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
   * Policy FAQ state.
   *
   * Actual policy content will be connected through the
   * Policy module in its own integration step.
   */
  private async handlePolicySelection(sessionId: string, selection: string) {
    switch (selection) {
      default:
        return this.handleUnknownSelection(sessionId, 'POLICY_MENU');
    }
  }

  /**
   * Leave state.
   *
   * The actual LeaveService integration will be connected
   * separately.
   */
  private async handleLeaveSelection(sessionId: string, selection: string) {
    switch (selection) {
      case MENU_SELECTION_IDS.LEAVE_BALANCE:
        return this.createResponse(sessionId, 'LEAVE_MENU', 'leave_balance');

      default:
        return this.handleUnknownSelection(sessionId, 'LEAVE_MENU');
    }
  }

  /**
   * Benefits state.
   */
  private async handleBenefitsSelection(sessionId: string, selection: string) {
    switch (selection) {
      default:
        return this.handleUnknownSelection(sessionId, 'BENEFITS_MENU');
    }
  }

  /**
   * Employment verification state.
   */
  private async handleVerificationSelection(
    sessionId: string,
    selection: string,
  ) {
    switch (selection) {
      case 'request_verification':
        return this.transitionAndRespond(
          sessionId,
          'VERIFICATION_CONFIRM',
          'verification_request',
        );

      default:
        return this.handleUnknownSelection(sessionId, 'VERIFICATION_MENU');
    }
  }

  /**
   * Handles an employee who is currently waiting for HR.
   *
   * The employee can continue using the bot by typing "menu".
   * Their existing escalation remains active in the background.
   */
  private async handleHrQueueState(
    employeeId: string,
    sessionId: string,
    currentState: string,
    selection: string,
  ) {
    /**
     * "menu" is handled globally before this method.
     * If the employee sends another unsupported message while
     * waiting, we simply remind them that their HR request
     * remains in the queue.
     */
    if (selection === MENU_SELECTION_IDS.TALK_TO_HR) {
      return this.escalateToHr(
        employeeId,
        sessionId,
        currentState,
        'Employee checked the HR queue.',
      );
    }

    return {
      success: true,
      sessionId,
      state: 'HR_QUEUE',
      action: 'hr_queue',
      message:
        'Your request is still in the HR queue. Type "menu" to continue using the HR assistant.',
      escalationAvailable: true,
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
  ) {
    await this.chatSessionService.touch(sessionId);

    const response = {
      success: true,
      sessionId,
      state: currentState,
      action: 'fallback',
      message:
        'I could not match that selection. Please choose one of the available options.',
      escalationAvailable: true,
    };

    if (menuId) {
      const menu = this.menuReplyBuilder.buildMenuReply(menuId);

      if (menu) {
        return {
          ...response,
          menu,
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
  ) {
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
  private createMenuResponse(sessionId: string, menuId: string, state: string) {
    const menu = this.menuReplyBuilder.buildMenuReply(menuId);

    if (!menu) {
      return {
        success: false,
        sessionId,
        state,
        message: 'Menu configuration could not be loaded.',
      };
    }

    return {
      success: true,
      sessionId,
      state,
      action: 'main_menu',
      menu,
      escalationAvailable: true,
    };
  }

  /**
   * Creates a standard conversation response.
   */
  private createResponse(sessionId: string, state: string, action: string) {
    return {
      success: true,
      sessionId,
      state,
      action,
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
  ) {
    const queueStatus =
      await this.escalationService.createOrGetActiveEscalation(
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
        sessionId,
        previousState: currentState,
        state: 'HR_QUEUE',
        action: 'talk_to_hr',
        status: 'IN_PROGRESS',
        message: 'An HR representative is currently attending to your request.',
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
        sessionId,
        previousState: currentState,
        state: 'HR_QUEUE',
        action: 'talk_to_hr',
        status: 'OPEN',
        queuePosition,
        hrBusy: true,
        message: `HR is currently assisting another employee. You are number ${queuePosition} in the queue. We will attend to you as soon as an HR representative becomes available.`,
      };
    }

    /**
     * No HR request is currently IN_PROGRESS.
     */
    return {
      success: true,
      escalated: true,
      escalationId: queueStatus.escalationId,
      sessionId,
      previousState: currentState,
      state: 'HR_QUEUE',
      action: 'talk_to_hr',
      status: 'OPEN',
      queuePosition,
      hrBusy: false,
      message: `Your request has been added to the HR queue. You are number ${queuePosition} in the queue. An HR representative will attend to you shortly.`,
    };
  }

  /**
   * Backward-compatible aliases for Talk to HR.
   *
   * The configured menu ID remains the canonical value.
   */
  private isTalkToHrAlias(selection: string): boolean {
    return ['talk-to-hr', 'hr', 'escalate'].includes(selection);
  }

  /**
   * Global main-menu navigation.
   */
  private isMainMenu(selection: string): boolean {
    return ['main-menu', 'menu'].includes(selection);
  }
}

import { Injectable } from '@nestjs/common';
import { EmployeeService } from '../employee/employee.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ChatSessionService } from './chat-session.service';
import { MessageDirection, MessageType } from '../../generated/prisma/enums';

@Injectable()
export class ConversationService {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly prisma: PrismaService,
    private readonly chatSessionService: ChatSessionService,
  ) {}

  /**
   * Handles an inbound employee message.
   *
   * MVP rules:
   * - Employee is identified by registered phone number.
   * - Conversation state is persisted in ChatSession.
   * - User input is treated as a menu selection, not natural language intent.
   * - Every inbound message is logged.
   * - Every state transition is persisted.
   * - Unknown input is escalated rather than interpreted.
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
     * Only active employees should be allowed to use the HR assistant.
     */
    if (employee.status !== 'ACTIVE') {
      return {
        success: false,
        message: 'Your employee account is not active. Please contact HR.',
      };
    }

    /**
     * Get the employee's active conversation session,
     * or create one starting at the main menu.
     */
    const session = await this.chatSessionService.getOrCreateSession(
      employee.id,
      'MAIN_MENU',
    );

    /**
     * Log every inbound message.
     *
     * We intentionally keep the message content because ChatMessage.content
     * is the source-of-record for the MVP conversation history.
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
     * Global navigation / escalation options.
     *
     * These IDs are intended to correspond to WhatsApp button/list
     * reply IDs rather than arbitrary natural-language messages.
     */
    if (this.isTalkToHr(selection)) {
      return this.escalateToHr(
        employee.id,
        session.id,
        session.currentState,
        'Employee selected Talk to HR.',
      );
    }

    if (this.isMainMenu(selection)) {
      await this.chatSessionService.updateState(session.id, 'MAIN_MENU');

      return this.createResponse(session.id, 'MAIN_MENU', 'main_menu');
    }

    /**
     * Deterministic state machine.
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

      default:
        /**
         * Unknown state is a system-level failure rather than something
         * that should be guessed around.
         */
        return this.escalateToHr(
          employee.id,
          session.id,
          session.currentState,
          'Unknown conversation state encountered.',
        );
    }
  }

  /**
   * MAIN MENU
   *
   * The actual WhatsApp UI should send stable IDs such as:
   * policy
   * leave
   * benefits
   * verification
   * talk_to_hr
   */
  private async handleMainMenuSelection(sessionId: string, selection: string) {
    switch (selection) {
      case 'policy':
        return this.transitionAndRespond(
          sessionId,
          'POLICY_MENU',
          'policy_menu',
        );

      case 'leave':
        return this.transitionAndRespond(sessionId, 'LEAVE_MENU', 'leave_menu');

      case 'benefits':
        return this.transitionAndRespond(
          sessionId,
          'BENEFITS_MENU',
          'benefits_menu',
        );

      case 'verification':
        return this.transitionAndRespond(
          sessionId,
          'VERIFICATION_MENU',
          'verification_menu',
        );

      default:
        return this.handleUnknownSelection(sessionId, 'MAIN_MENU');
    }
  }

  /**
   * POLICY FAQ MENU
   *
   * The actual policy options/content should eventually come from
   * the externalized HR content configuration rather than being
   * hardcoded inside this service.
   */
  private async handlePolicySelection(sessionId: string, selection: string) {
    switch (selection) {
      /*
       * Add approved policy IDs here when the policy content
       * configuration is wired.
       *
       * Example:
       *
       * case 'leave_policy':
       *   return this.respondWithContent(...);
       */

      default:
        return this.handleUnknownSelection(sessionId, 'POLICY_MENU');
    }
  }

  /**
   * LEAVE MENU
   *
   * Leave balance lookup is deliberately kept outside this
   * conversation service. The leave data adapter/service should
   * own the spreadsheet lookup.
   */
  private async handleLeaveSelection(sessionId: string, selection: string) {
    switch (selection) {
      case 'leave_balance':
        /**
         * The LeaveService should be connected here once its
         * public lookup contract is confirmed.
         *
         * We deliberately do not invent a LeaveService API here.
         */
        return this.createResponse(sessionId, 'LEAVE_MENU', 'leave_balance');

      default:
        return this.handleUnknownSelection(sessionId, 'LEAVE_MENU');
    }
  }

  /**
   * BENEFITS MENU
   *
   * Benefits answers should come from the externalized HR
   * content layer.
   */
  private async handleBenefitsSelection(sessionId: string, selection: string) {
    switch (selection) {
      default:
        return this.handleUnknownSelection(sessionId, 'BENEFITS_MENU');
    }
  }

  /**
   * EMPLOYMENT VERIFICATION MENU
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
   * Handles unrecognized input.
   *
   * The MVP requirement is explicit:
   * unrecognized free text must NOT be interpreted as intent.
   * It should fall back to the current menu / escalation path.
   */
  private async handleUnknownSelection(
    sessionId: string,
    currentState: string,
  ) {
    await this.chatSessionService.touch(sessionId);

    return {
      success: true,
      sessionId,
      state: currentState,
      action: 'fallback',
      message:
        'I could not match that selection. Please choose one of the available options.',
      escalationAvailable: true,
    };
  }

  /**
   * Persists a state transition and returns the next action.
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

    /**
     * State transitions are required audit events for the MVP.
     *
     * We store the transition in the ChatMessage table as SYSTEM
     * because the current schema does not contain a dedicated
     * StateTransition table.
     */
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
   * Creates the orchestration response.
   *
   * The WhatsApp adapter/controller can later translate the action
   * into the appropriate List Message or Reply Button payload.
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
   * Rule-based HR escalation.
   */
  private async escalateToHr(
    employeeId: string,
    sessionId: string,
    currentState: string,
    reason: string,
  ) {
    const escalation = await this.prisma.escalation.create({
      data: {
        employeeId,
        sessionId,
        reason,
      },
    });

    await this.chatSessionService.updateState(sessionId, 'ESCALATED');

    /**
     * Log escalation as a system event.
     */
    await this.prisma.chatMessage.create({
      data: {
        sessionId,
        direction: MessageDirection.OUTBOUND,
        messageType: MessageType.SYSTEM,
        content: `ESCALATION:${reason}`,
      },
    });

    return {
      success: true,
      escalated: true,
      escalationId: escalation.id,
      sessionId,
      previousState: currentState,
      state: 'ESCALATED',
      action: 'talk_to_hr',
      message:
        'Your request has been referred to HR. An HR representative will assist you.',
    };
  }

  private isTalkToHr(selection: string): boolean {
    return ['talk_to_hr', 'talk-to-hr', 'hr', 'escalate'].includes(selection);
  }

  private isMainMenu(selection: string): boolean {
    return ['main_menu', 'main-menu', 'menu'].includes(selection);
  }
}

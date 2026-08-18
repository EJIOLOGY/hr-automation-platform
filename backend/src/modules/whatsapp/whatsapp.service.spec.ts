import { Test, TestingModule } from '@nestjs/testing';
import { CONVERSATION_PORT } from '../chat/conversation.contracts';
import { WhatsappMessageMapper } from './whatsapp-message.mapper';
import { WhatsappService } from './whatsapp.service';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let conversationService: {
    handleMessage: jest.Mock;
  };

  beforeEach(async () => {
    conversationService = {
      handleMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        WhatsappMessageMapper,
        { provide: CONVERSATION_PORT, useValue: conversationService },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
  });

  it('maps a text inbound message and passes it to the conversation service', async () => {
    conversationService.handleMessage.mockResolvedValue({
      success: true,
      replies: [{ type: 'text', text: 'Hello there' }],
    });

    const result = await service.handleInbound({
      from: '07044965784',
      type: 'text',
      text: { body: 'hello' },
      id: 'wamid.text-001',
    });

    expect(conversationService.handleMessage).toHaveBeenCalledWith({
      senderPhoneNumber: '+2347044965784',
      externalMessageId: 'wamid.text-001',
      receivedAt: undefined,
      input: { kind: 'text', value: 'hello' },
    });
    expect(result).toEqual([{ type: 'text', text: 'Hello there' }]);
  });

  it('maps a button inbound message as a selection input', async () => {
    conversationService.handleMessage.mockResolvedValue({
      success: true,
      replies: [{ type: 'text', text: 'Selected' }],
    });

    await service.handleInbound({
      from: '07044965784',
      type: 'button',
      button: { payload: 'leave_balance' },
      id: 'wamid.button-001',
    });

    expect(conversationService.handleMessage).toHaveBeenCalledWith({
      senderPhoneNumber: '+2347044965784',
      externalMessageId: 'wamid.button-001',
      receivedAt: undefined,
      input: { kind: 'selection', value: 'leave_balance' },
    });
  });

  it('maps a list inbound message as a selection input', async () => {
    conversationService.handleMessage.mockResolvedValue({
      success: true,
      replies: [{ type: 'text', text: 'Selected' }],
    });

    await service.handleInbound({
      from: '07044965784',
      type: 'list',
      list: { id: 'policy_faq' },
      id: 'wamid.list-001',
    });

    expect(conversationService.handleMessage).toHaveBeenCalledWith({
      senderPhoneNumber: '+2347044965784',
      externalMessageId: 'wamid.list-001',
      receivedAt: undefined,
      input: { kind: 'selection', value: 'policy_faq' },
    });
  });

  it('maps a conversation text reply to a WhatsApp text message', async () => {
    conversationService.handleMessage.mockResolvedValue({
      success: true,
      replies: [{ type: 'text', text: 'Your request has been received.' }],
    });

    await expect(
      service.handleInbound({
        from: '07044965784',
        type: 'text',
        text: { body: 'menu' },
      }),
    ).resolves.toEqual([
      { type: 'text', text: 'Your request has been received.' },
    ]);
  });

  it('maps a conversation menu reply to a WhatsApp menu message', async () => {
    conversationService.handleMessage.mockResolvedValue({
      success: true,
      replies: [
        {
          type: 'menu',
          menuId: 'main_menu',
          title: 'HR Services',
          prompt: 'Please choose an option.',
          options: [
            { id: 'leave_balance', label: 'Leave Balance' },
            { id: 'talk_to_hr', label: 'Talk to HR' },
          ],
        },
      ],
    });

    await expect(
      service.handleInbound({
        from: '07044965784',
        type: 'text',
        text: { body: 'menu' },
      }),
    ).resolves.toEqual([
      {
        type: 'menu',
        menuId: 'main_menu',
        title: 'HR Services',
        prompt: 'Please choose an option.',
        options: [
          { id: 'leave_balance', label: 'Leave Balance' },
          { id: 'talk_to_hr', label: 'Talk to HR' },
        ],
      },
    ]);
  });

  it('maps multiple replies in order', async () => {
    conversationService.handleMessage.mockResolvedValue({
      success: true,
      replies: [
        { type: 'text', text: 'One' },
        { type: 'text', text: 'Two' },
      ],
    });

    await expect(
      service.handleInbound({
        from: '07044965784',
        type: 'text',
        text: { body: 'hello' },
      }),
    ).resolves.toEqual([
      { type: 'text', text: 'One' },
      { type: 'text', text: 'Two' },
    ]);
  });

  it('works through Nest dependency injection', async () => {
    expect(service).toBeDefined();
  });
});

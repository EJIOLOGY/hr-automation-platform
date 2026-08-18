import { WhatsappMessageMapper } from './whatsapp-message.mapper';

describe('WhatsappMessageMapper', () => {
  let mapper: WhatsappMessageMapper;

  beforeEach(() => {
    mapper = new WhatsappMessageMapper();
  });

  describe('toInbound', () => {
    it('should map a text message to a text conversation input', () => {
      const result = mapper.toInbound({
        from: '07044965784',
        type: 'text',
        text: {
          body: 'How many leave days do I have?',
        },
        id: 'wamid.text-001',
      });

      expect(result).toEqual({
        senderPhoneNumber: '+2347044965784',
        externalMessageId: 'wamid.text-001',
        receivedAt: undefined,
        input: {
          kind: 'text',
          value: 'How many leave days do I have?',
        },
      });
    });

    it('should map a button message to a selection input', () => {
      const result = mapper.toInbound({
        from: '07044965784',
        type: 'button',
        button: {
          payload: 'leave_balance',
        },
        id: 'wamid.button-001',
      });

      expect(result).toEqual({
        senderPhoneNumber: '+2347044965784',
        externalMessageId: 'wamid.button-001',
        receivedAt: undefined,
        input: {
          kind: 'selection',
          value: 'leave_balance',
        },
      });
    });

    it('should map a list message to a selection input', () => {
      const result = mapper.toInbound({
        from: '07044965784',
        type: 'list',
        list: {
          id: 'policy_faq',
        },
        id: 'wamid.list-001',
      });

      expect(result).toEqual({
        senderPhoneNumber: '+2347044965784',
        externalMessageId: 'wamid.list-001',
        receivedAt: undefined,
        input: {
          kind: 'selection',
          value: 'policy_faq',
        },
      });
    });

    it('should preserve the external message id and timestamp', () => {
      const timestamp = new Date('2026-08-18T08:00:00.000Z');

      const result = mapper.toInbound({
        from: '07044965784',
        type: 'text',
        text: {
          body: 'menu',
        },
        id: 'wamid.text-002',
        timestamp,
      });

      expect(result.externalMessageId).toBe('wamid.text-002');
      expect(result.receivedAt).toBe(timestamp);
    });
  });

  describe('toOutbound', () => {
    it('should map a text reply to a WhatsApp text message', () => {
      const result = mapper.toOutbound({
        type: 'text',
        text: 'An HR representative is currently attending to your request.',
      });

      expect(result).toEqual({
        type: 'text',
        text: 'An HR representative is currently attending to your request.',
      });
    });

    it('should map a menu reply to a WhatsApp menu message', () => {
      const result = mapper.toOutbound({
        type: 'menu',
        menuId: 'main_menu',
        title: 'HR Services',
        prompt: 'Please choose an option.',
        options: [
          {
            id: 'leave_balance',
            label: 'Leave Balance',
          },
          {
            id: 'talk_to_hr',
            label: 'Talk to HR',
          },
        ],
      });

      expect(result).toEqual({
        type: 'menu',
        menuId: 'main_menu',
        title: 'HR Services',
        prompt: 'Please choose an option.',
        options: [
          {
            id: 'leave_balance',
            label: 'Leave Balance',
          },
          {
            id: 'talk_to_hr',
            label: 'Talk to HR',
          },
        ],
      });
    });
  });
});

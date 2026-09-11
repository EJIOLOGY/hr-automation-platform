import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { WhatsappGraphClient } from './whatsapp-graph-client.service';

describe('WhatsappGraphClient', () => {
  const buildConfig = (values: Record<string, string | undefined>) => ({
    get: jest.fn((key: string) => values[key]),
  });

  it('does nothing and logs when credentials are not configured', async () => {
    const post = jest.fn();
    const client = new WhatsappGraphClient(
      { post } as any,
      buildConfig({}) as any,
    );

    await client.sendMessage('2348000000000', {
      type: 'text',
      text: 'Hello',
    });

    expect(post).not.toHaveBeenCalled();
  });

  it('sends a text message with the correct Graph API payload and auth header', async () => {
    const post = jest.fn().mockReturnValue(of({ data: {} }));
    const client = new WhatsappGraphClient(
      { post } as any,
      buildConfig({
        WHATSAPP_ACCESS_TOKEN: 'token-123',
        WHATSAPP_PHONE_NUMBER_ID: 'PHONE_ID',
      }) as any,
    );

    await client.sendMessage('2348000000000', {
      type: 'text',
      text: 'Hello there',
    });

    expect(post).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/PHONE_ID/messages',
      {
        messaging_product: 'whatsapp',
        to: '2348000000000',
        type: 'text',
        text: { body: 'Hello there' },
      },
      {
        headers: {
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        },
      },
    );
  });

  it('sends a list menu reply as a Graph API interactive list message', async () => {
    const post = jest.fn().mockReturnValue(of({ data: {} }));
    const client = new WhatsappGraphClient(
      { post } as any,
      buildConfig({
        WHATSAPP_ACCESS_TOKEN: 'token-123',
        WHATSAPP_PHONE_NUMBER_ID: 'PHONE_ID',
      }) as any,
    );

    await client.sendMessage('2348000000000', {
      type: 'menu',
      menuId: 'main-menu',
      title: 'HR Menu',
      prompt: 'How can we help?',
      presentation: 'list',
      options: [{ id: 'leave', label: 'Leave Balance' }],
    });

    const [, body] = post.mock.calls[0] as [string, Record<string, unknown>];

    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '2348000000000',
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: 'HR Menu',
        },
        body: {
          text: 'How can we help?',
        },
        action: {
          button: 'Select',
          sections: [
            {
              title: 'HR Menu',
              rows: [
                {
                  id: 'leave',
                  title: 'Leave Balance',
                },
              ],
            },
          ],
        },
      },
    });
  });

  it('sends a text menu reply as a plain WhatsApp text message', async () => {
    const post = jest.fn().mockReturnValue(of({ data: {} }));
    const client = new WhatsappGraphClient(
      { post } as any,
      buildConfig({
        WHATSAPP_ACCESS_TOKEN: 'token-123',
        WHATSAPP_PHONE_NUMBER_ID: 'PHONE_ID',
      }) as any,
    );

    await client.sendMessage('2348000000000', {
      type: 'menu',
      menuId: 'leave-menu',
      title: 'Leave & Time Off',
      prompt: 'How can we assist you with your leave?',
      presentation: 'text',
      options: [
        {
          id: 'leave_balance',
          label: '[1] Check My Leave Balance',
        },
        {
          id: 'talk_to_hr',
          label: '[2] Talk to HR',
        },
      ],
    });

    const [, body] = post.mock.calls[0] as [string, Record<string, unknown>];

    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '2348000000000',
      type: 'text',
      text: {
        body:
          'Leave & Time Off\n\nHow can we assist you with your leave?\n\n' +
          '[1] Check My Leave Balance\n' +
          '[2] Talk to HR',
      },
    });
  });

  it('sends multiple messages to the same recipient sequentially', async () => {
    const calls: string[] = [];
    const post = jest.fn((_url: string, body: { type: string }) => {
      calls.push(body.type);
      return of({ data: {} });
    });

    const client = new WhatsappGraphClient(
      { post } as any,
      buildConfig({
        WHATSAPP_ACCESS_TOKEN: 'token-123',
        WHATSAPP_PHONE_NUMBER_ID: 'PHONE_ID',
      }) as any,
    );

    await client.sendMessages('2348000000000', [
      { type: 'text', text: 'First' },
      { type: 'text', text: 'Second' },
    ]);

    expect(post).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(['text', 'text']);
  });

  it('swallows and logs errors from the Graph API instead of throwing', async () => {
    const axiosError = new AxiosError('Request failed');

    axiosError.response = {
      data: { error: 'invalid token' },
    } as AxiosError['response'];

    const post = jest.fn().mockReturnValue(throwError(() => axiosError));

    const client = new WhatsappGraphClient(
      { post } as any,
      buildConfig({
        WHATSAPP_ACCESS_TOKEN: 'token-123',
        WHATSAPP_PHONE_NUMBER_ID: 'PHONE_ID',
      }) as any,
    );

    await expect(
      client.sendMessage('2348000000000', {
        type: 'text',
        text: 'Hello',
      }),
    ).resolves.toBeUndefined();
  });
});

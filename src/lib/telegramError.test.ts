import { describe, expect, it } from 'vitest';
import { getTelegramErrorMessage } from './telegramError';

describe('getTelegramErrorMessage', () => {
  it('reads the Edge Function response instead of showing the generic non-2xx error', async () => {
    const error = {
      message: 'Edge Function returned a non-2xx status code',
      context: {
        json: async () => ({ success: false, error: 'Bad Request: chat not found' }),
      },
    };

    await expect(getTelegramErrorMessage(error)).resolves.toBe(
      'Open @ADDFD3BOT in Telegram and tap Start, then try again.',
    );
  });

  it('explains the group setup when Telegram rejects a group destination', async () => {
    await expect(getTelegramErrorMessage(new Error('Forbidden: bot is not a member of the channel'))).resolves.toBe(
      'Add @ADDFD3BOT to the Telegram group and send /start, then try again.',
    );
  });

  it('keeps a useful non-generic error message', async () => {
    await expect(getTelegramErrorMessage(new Error('Maximum 2 Telegram chats connected'))).resolves.toBe(
      'Maximum 2 Telegram chats connected',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { getTelegramChatIdCandidates } from '../../supabase/functions/_shared/telegramChatId';

describe('Telegram Chat ID candidates', () => {
  it('keeps a canonical group ID unchanged', () => {
    expect(getTelegramChatIdCandidates('-1004424684106')).toEqual(['-1004424684106']);
  });

  it('normalizes a group ID when the leading minus was omitted', () => {
    expect(getTelegramChatIdCandidates('1004424684106', { group: true })).toEqual(['-1004424684106']);
  });

  it('does not rewrite a personal Chat ID', () => {
    expect(getTelegramChatIdCandidates('1004437513848')).toEqual(['1004437513848']);
  });
});

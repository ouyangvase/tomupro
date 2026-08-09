function isGenericEdgeFunctionMessage(message: string) {
  return /edge function returned a non-2xx status code/i.test(message)
    || /failed to send a request to the edge function/i.test(message);
}

function friendlyTelegramMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('chat not found')) {
    return 'Open @ADDFD3BOT in Telegram and tap Start, then try again.';
  }
  if (normalized.includes('bot was blocked')) {
    return 'Unblock @ADDFD3BOT in Telegram, then try again.';
  }
  if (normalized.includes('not a member') || normalized.includes('have no rights')) {
    return 'Add @ADDFD3BOT to the Telegram group and send /start, then try again.';
  }

  return message;
}

export async function getTelegramErrorMessage(
  error: unknown,
  fallback = 'Telegram request failed. Please try again.',
) {
  let message = '';

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    for (const key of ['message', 'error_description', 'error', 'details', 'hint']) {
      if (typeof record[key] === 'string' && record[key].trim()) {
        message = record[key] as string;
        break;
      }
    }
  }

  const context = error && typeof error === 'object'
    ? (error as Record<string, unknown>).context
    : null;

  if (context && typeof context === 'object') {
    try {
      const responseContext = context as {
        json?: () => Promise<unknown>;
        text?: () => Promise<string>;
      };
      let payload: unknown;
      if (typeof responseContext.json === 'function') {
        payload = await responseContext.json();
      } else if (typeof responseContext.text === 'function') {
        const text = await responseContext.text();
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }
      }

      if (payload && typeof payload === 'object') {
        const payloadRecord = payload as Record<string, unknown>;
        for (const key of ['error', 'message', 'error_description', 'details']) {
          if (typeof payloadRecord[key] === 'string' && payloadRecord[key].trim()) {
            message = payloadRecord[key] as string;
            break;
          }
        }
      } else if (typeof payload === 'string' && payload.trim()) {
        message = payload;
      }
    } catch {
      // Keep the original error when the Edge Function response cannot be read.
    }
  }

  if (!message || isGenericEdgeFunctionMessage(message)) {
    return fallback;
  }

  return friendlyTelegramMessage(message);
}

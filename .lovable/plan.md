

## Problem Analysis

From console logs, the login flow takes 40+ seconds because:

1. **8-second timeout per profile fetch attempt** -- too long
2. **4 total attempts** (1 + 3 retries) with exponential backoff (1s, 2s, 4s delays) = up to 40s worst case
3. **Duplicate fetches**: `TOKEN_REFRESHED`, `INITIAL_SESSION`, and `initializeAuth()` all trigger independent profile fetches concurrently
4. **10-second safety timeout** fires mid-retry, causing inconsistent state

## Plan

### 1. Reduce profile fetch timeouts and retries (AuthContext.tsx)
- Reduce `fetchTimeout` from 8000ms to 3000ms
- Reduce `maxRetries` from 3 to 1 (2 total attempts max)
- Reduce safety loading timeout from 10000ms to 5000ms

### 2. Prevent duplicate concurrent profile fetches (AuthContext.tsx)
- Add an `AbortController`-style guard (a ref `isFetchingRef`) so only one profile fetch runs at a time
- In `onAuthStateChange`, skip profile fetch if one is already in progress for the same user ID

### 3. Skip redundant initializeAuth fetch (AuthContext.tsx)
- In `initializeAuth`, after setting user/session, check if `onAuthStateChange` already triggered the fetch (via the ref) before calling `fetchProfile` again

These changes target the auth context only and keep all existing error/retry UI intact. Expected login-to-dashboard time: under 3 seconds on normal connections.


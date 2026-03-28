/**
 * Firebase Integration Barrel Export
 *
 * All Firebase hooks are conditional — they check isFirebaseEnabled internally.
 * When Firebase is disabled (VITE_FIREBASE_ENABLED !== 'true'), hooks return
 * empty/default states and perform no network operations.
 */

// Config
export { isFirebaseEnabled, firebaseDb, firebaseApp } from './client';

// Hooks (re-exported for convenience)
export { useFirebasePresence, useUserPresence } from '@/hooks/useFirebasePresence';
export { useFirebaseLocationWriter, useFirebaseDriverLocations, useFirebaseSingleDriverLocation } from '@/hooks/useFirebaseLocations';
export { useFirebaseNotifications } from '@/hooks/useFirebaseNotifications';
export { useFirebaseActivityFeed } from '@/hooks/useFirebaseActivityFeed';

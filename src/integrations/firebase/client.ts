/**
 * Firebase Configuration & Initialization
 *
 * TOMUPRO uses Firebase for lightweight, ephemeral UI state only:
 * - Push notifications (FCM)
 * - User presence (online/offline indicators)
 * - Live driver locations (realtime map updates)
 * - Activity feed (team-level realtime events)
 *
 * All core business data (orders, inventory, claims, profit) stays in Supabase.
 *
 * To activate Firebase:
 * 1. Create a Firebase project at https://console.firebase.google.com
 * 2. Enable Firestore, Cloud Messaging
 * 3. Fill in the config values below (or set via environment variables)
 * 4. Set VITE_FIREBASE_ENABLED=true in .env
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDGixMsnl9EPbswsl0rLsHnuK0UMXP2cY8',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'tomupro-430df.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tomupro-430df',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'tomupro-430df.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '221859973249',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:221859973249:web:82ff73a8f8b941d86fe580',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-QZS8G5N2QT',
};

/** Whether Firebase is configured and enabled */
export const isFirebaseEnabled =
  (import.meta.env.VITE_FIREBASE_ENABLED !== 'false') &&
  !!firebaseConfig.projectId;

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

if (isFirebaseEnabled) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  } catch (err) {
    // Firebase initialization is optional; failure is non-fatal
  }
}

export { app as firebaseApp, db as firebaseDb };

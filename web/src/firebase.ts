// Firebase initialisation. The project config is supplied at runtime by the
// user (pasted into the setup screen) and stored in localStorage, so no secrets
// live in the repo. Any Firebase project with Realtime Database enabled works.

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';
import { getAuth, signInAnonymously, Auth } from 'firebase/auth';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

const STORAGE_KEY = 'holdem.firebaseConfig';

let app: FirebaseApp | null = null;
let db: Database | null = null;
let auth: Auth | null = null;

export function getStoredConfig(): FirebaseConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: FirebaseConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isInitialised(): boolean {
  return db !== null;
}

export async function initFirebase(cfg: FirebaseConfig): Promise<Database> {
  app = initializeApp(cfg);
  db = getDatabase(app);
  auth = getAuth(app);
  try {
    await signInAnonymously(auth);
  } catch (e) {
    // Anonymous auth is optional; DB may allow open access. Log and continue.
    console.warn('Anonymous sign-in failed (continuing):', e);
  }
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error('Firebase가 초기화되지 않았습니다.');
  return db;
}

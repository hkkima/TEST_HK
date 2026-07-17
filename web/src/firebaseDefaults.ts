import { FirebaseConfig } from './firebase';

// Built-in Firebase project config so players don't have to paste anything.
// A Firebase web config is meant to ship in the client — it is not a secret;
// access is governed by Realtime Database rules (test mode here). Users can
// still override this via the in-app setup screen (stored in localStorage).
export const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: 'AIzaSyCsGkEK3hnDguONptOWRUGW8n02Ft2_8ac',
  authDomain: 'texas-holdem-hk.firebaseapp.com',
  databaseURL: 'https://texas-holdem-hk-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'texas-holdem-hk',
  storageBucket: 'texas-holdem-hk.firebasestorage.app',
  messagingSenderId: '928609534152',
  appId: '1:928609534152:web:3d346becccfd2cadf0e5fd',
  measurementId: 'G-H2WJ7PM632',
};

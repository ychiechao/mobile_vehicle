"use client";

import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = pruneFirebaseConfig({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId,
  );
}

export function getFirebaseAuth() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase configuration is incomplete.");
  }

  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return getAuth(app);
}

function pruneFirebaseConfig(config: FirebaseOptions) {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => Boolean(value)),
  ) as FirebaseOptions;
}

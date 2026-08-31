"use client";

import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = pruneFirebaseConfig({
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
    "AIzaSyCHGKxFx4obYI0rLPuSsDfw4B_-tl49q8o",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    "app-member-eddea.firebaseapp.com",
  databaseURL:
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ??
    "https://app-member-eddea-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "app-member-eddea",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
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

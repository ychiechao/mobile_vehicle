"use client";

import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

export type FirebaseRuntimeSettings = {
  configured: boolean;
  config: FirebaseOptions | null;
  superAdminEmail: string;
};

const DEFAULT_SUPER_ADMIN_EMAIL = "ychao@tmail.ilc.edu.tw";
const FALLBACK_SETTINGS: FirebaseRuntimeSettings = {
  configured: false,
  config: null,
  superAdminEmail: DEFAULT_SUPER_ADMIN_EMAIL,
};

let settingsPromise: Promise<FirebaseRuntimeSettings> | null = null;
let authPromise: Promise<Auth> | null = null;

export function loadFirebaseRuntimeSettings() {
  settingsPromise ??= fetch("/api/firebase-config", {
    cache: "no-store",
    headers: { accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) {
        return FALLBACK_SETTINGS;
      }

      return parseFirebaseRuntimeSettings(await response.json());
    })
    .catch(() => FALLBACK_SETTINGS);

  return settingsPromise;
}

export async function getFirebaseAuth() {
  authPromise ??= loadFirebaseRuntimeSettings().then((settings) => {
    if (!settings.configured || !settings.config) {
      throw new Error("Firebase configuration is incomplete.");
    }

    const app = getApps()[0] ?? initializeApp(settings.config);
    return getAuth(app);
  });

  return authPromise;
}

function parseFirebaseRuntimeSettings(value: unknown): FirebaseRuntimeSettings {
  if (!value || typeof value !== "object") {
    return FALLBACK_SETTINGS;
  }

  const payload = value as {
    configured?: unknown;
    config?: unknown;
    superAdminEmail?: unknown;
  };
  const config = isFirebaseConfig(payload.config)
    ? pruneFirebaseConfig(payload.config)
    : null;
  const configured =
    payload.configured === true &&
    Boolean(config?.apiKey && config.authDomain && config.projectId);
  const superAdminEmail =
    typeof payload.superAdminEmail === "string" &&
    payload.superAdminEmail.trim()
      ? payload.superAdminEmail.trim()
      : DEFAULT_SUPER_ADMIN_EMAIL;

  return {
    configured,
    config: configured ? config : null,
    superAdminEmail,
  };
}

function isFirebaseConfig(value: unknown): value is FirebaseOptions {
  if (!value || typeof value !== "object") {
    return false;
  }

  const config = value as FirebaseOptions;
  return (
    typeof config.apiKey === "string" &&
    typeof config.authDomain === "string" &&
    typeof config.projectId === "string"
  );
}

function pruneFirebaseConfig(config: FirebaseOptions) {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => Boolean(value)),
  ) as FirebaseOptions;
}

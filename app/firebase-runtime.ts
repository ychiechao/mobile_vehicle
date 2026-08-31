import type { FirebaseOptions } from "firebase/app";

const DEFAULT_SUPER_ADMIN_EMAIL = "ychao@tmail.ilc.edu.tw";

export type FirebaseRuntimeEnv = Partial<
  Record<
    | "FIREBASE_API_KEY"
    | "FIREBASE_AUTH_DOMAIN"
    | "FIREBASE_DATABASE_URL"
    | "FIREBASE_PROJECT_ID"
    | "FIREBASE_APP_ID"
    | "SUPER_ADMIN_EMAIL",
    string
  >
>;

export function getFirebaseRuntimeSettings(
  request: Request,
  env?: FirebaseRuntimeEnv,
) {
  const firebaseAuthDomain = getRequiredEnv("FIREBASE_AUTH_DOMAIN", env);
  const appAuthDomain = new URL(request.url).host;
  const config = pruneFirebaseConfig({
    apiKey: getRequiredEnv("FIREBASE_API_KEY", env),
    authDomain: appAuthDomain,
    databaseURL: getRequiredEnv("FIREBASE_DATABASE_URL", env),
    projectId: getRequiredEnv("FIREBASE_PROJECT_ID", env),
    appId: getRequiredEnv("FIREBASE_APP_ID", env),
  });
  const configured = Boolean(
    config.apiKey && config.authDomain && config.projectId && firebaseAuthDomain,
  );

  return {
    configured,
    config: configured ? config : null,
    firebaseAuthDomain,
    superAdminEmail:
      getRequiredEnv("SUPER_ADMIN_EMAIL", env) || DEFAULT_SUPER_ADMIN_EMAIL,
  };
}

export function getFirebaseAuthProxyDomain(env?: FirebaseRuntimeEnv) {
  return getRequiredEnv("FIREBASE_AUTH_DOMAIN", env);
}

function getRequiredEnv(name: keyof FirebaseRuntimeEnv, env?: FirebaseRuntimeEnv) {
  const value = (env?.[name] ?? process.env[name])?.trim();
  return value || "";
}

function pruneFirebaseConfig(config: FirebaseOptions) {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => Boolean(value)),
  ) as FirebaseOptions;
}

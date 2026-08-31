import type { FirebaseOptions } from "firebase/app";

const DEFAULT_SUPER_ADMIN_EMAIL = "ychao@tmail.ilc.edu.tw";

export async function GET() {
  const config = pruneFirebaseConfig({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    appId: process.env.FIREBASE_APP_ID,
  });
  const configured = Boolean(
    config.apiKey && config.authDomain && config.projectId,
  );

  return Response.json(
    {
      configured,
      config: configured ? config : null,
      superAdminEmail:
        process.env.SUPER_ADMIN_EMAIL ?? DEFAULT_SUPER_ADMIN_EMAIL,
    },
    {
      headers: {
        "cache-control": "no-store, no-cache, max-age=0",
      },
    },
  );
}

function pruneFirebaseConfig(config: FirebaseOptions) {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => Boolean(value)),
  ) as FirebaseOptions;
}

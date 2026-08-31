import { getFirebaseRuntimeSettings } from "../../firebase-runtime";

export async function GET() {
  const settings = getFirebaseRuntimeSettings();

  return Response.json(
    {
      configured: settings.configured,
      config: settings.config,
      superAdminEmail: settings.superAdminEmail,
    },
    {
      headers: {
        "cache-control": "no-store, no-cache, max-age=0",
      },
    },
  );
}

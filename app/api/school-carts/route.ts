import {
  FirebaseAuthError,
  requireFirebaseUser,
} from "../../firebase-admin";
import {
  GoogleSheetsError,
  SCHOOL_CARTS_SHEET_NAME,
  normalizeSheetCart,
  readCartsFromGoogleSheet,
  writeCartsToGoogleSheet,
} from "../../google-sheets";

type SchoolCartsRequestBody = {
  adminEmail?: unknown;
  carts?: unknown;
  sheetUrl?: unknown;
};

class SchoolCartsApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SchoolCartsApiError";
    this.status = status;
  }
}

const MAX_CART_SYNC_BYTES = 160_000;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    const url = new URL(request.url);
    const sheetUrl = url.searchParams.get("sheetUrl") ?? "";
    const adminEmail = url.searchParams.get("adminEmail") ?? "";
    assertRequesterEmail(user.email, adminEmail);

    const carts = await readCartsFromGoogleSheet(sheetUrl);

    return jsonResponse({
      carts,
      ok: true,
      sheetName: SCHOOL_CARTS_SHEET_NAME,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    assertSmallJsonRequest(request);

    const body = await readRequestBody(request);
    const sheetUrl = assertString(body.sheetUrl, "請提供學校 Google Sheet 網址。");
    const adminEmail = assertString(body.adminEmail, "請先使用 Google 帳號登入。");
    assertRequesterEmail(user.email, adminEmail);

    const carts = parseCarts(body.carts);
    const result = await writeCartsToGoogleSheet(sheetUrl, carts);

    return jsonResponse({
      ok: true,
      sheetName: SCHOOL_CARTS_SHEET_NAME,
      ...result,
    });
  } catch (error) {
    return jsonError(error);
  }
}

async function readRequestBody(request: Request): Promise<SchoolCartsRequestBody> {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object") {
      throw new Error("Request body is not an object.");
    }

    return payload as SchoolCartsRequestBody;
  } catch {
    throw new SchoolCartsApiError(400, "推車同步資料格式不正確。");
  }
}

function parseCarts(value: unknown) {
  if (!Array.isArray(value)) {
    throw new SchoolCartsApiError(400, "推車清單格式不正確。");
  }

  return value.map((item, index) => {
    const cart = normalizeSheetCart(item);
    if (!cart) {
      throw new SchoolCartsApiError(
        400,
        `第 ${index + 1} 筆推車資料格式不正確。`,
      );
    }

    return cart;
  });
}

function assertSmallJsonRequest(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_CART_SYNC_BYTES) {
    throw new SchoolCartsApiError(413, "推車同步資料太大，請分批處理。");
  }
}

function assertRequesterEmail(userEmail: string, adminEmail: string) {
  if (!userEmail || userEmail.toLowerCase() !== adminEmail.toLowerCase()) {
    throw new SchoolCartsApiError(
      403,
      "登入帳號與學校管理者信箱不一致，請重新登入。",
    );
  }
}

function assertString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new SchoolCartsApiError(400, message);
  }

  return value.trim();
}

function jsonResponse(payload: Record<string, unknown>) {
  return Response.json(payload, {
    headers: {
      "cache-control": "no-store, no-cache, max-age=0",
    },
  });
}

function jsonError(error: unknown) {
  const status = getErrorStatus(error);
  const message =
    error instanceof Error
      ? error.message
      : "Google Sheet 同步失敗，請稍後再試。";

  return Response.json(
    {
      error: message,
      ok: false,
    },
    {
      headers: {
        "cache-control": "no-store, no-cache, max-age=0",
      },
      status,
    },
  );
}

function getErrorStatus(error: unknown) {
  if (
    error instanceof SchoolCartsApiError ||
    error instanceof FirebaseAuthError ||
    error instanceof GoogleSheetsError
  ) {
    return error.status;
  }

  return 500;
}

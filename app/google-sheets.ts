type GoogleSheetsRuntimeEnv = Partial<
  Record<
    "GOOGLE_SERVICE_ACCOUNT_EMAIL" | "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
    string
  >
>;

export type SheetCartStatus = "可借用" | "需檢查" | "停用";
export type SheetSlotStatus = "ok" | "warning" | "offline";

export type SheetCart = {
  id: string;
  label: string;
  room: string;
  health: number;
  battery: number;
  offline: number;
  slots: SheetSlotStatus[];
  status: SheetCartStatus;
};

type GoogleAccessTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
};

type GoogleSpreadsheetMetadata = {
  sheets?: Array<{
    properties?: {
      title?: string;
    };
  }>;
};

type GoogleValuesResponse = {
  values?: unknown;
};

export class GoogleSheetsError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GoogleSheetsError";
    this.status = status;
  }
}

export const SCHOOL_CARTS_SHEET_NAME = "推車資料";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const CART_DEVICE_COUNT = 36;
const CART_BASE_COLUMN_COUNT = 9;
const CART_RANGE_END_COLUMN = "AS";
const MIN_SHEET_ROWS = 250;
const CART_HEADERS = [
  "推車編號",
  "推車位置",
  "教室或保管位置",
  "推車狀態",
  "健康度",
  "平均電量",
  "離線設備",
  "平板數量",
  "更新時間",
  ...Array.from({ length: CART_DEVICE_COUNT }, (_, index) =>
    `設備${String(index + 1).padStart(2, "0")}`,
  ),
];

export async function readCartsFromGoogleSheet(
  sheetUrl: string,
  env?: GoogleSheetsRuntimeEnv,
) {
  const spreadsheetId = getSpreadsheetId(sheetUrl);
  const accessToken = await createGoogleAccessToken(env);
  await ensureSchoolCartSheet(spreadsheetId, accessToken);

  const range = `${quoteSheetName(SCHOOL_CARTS_SHEET_NAME)}!A2:${CART_RANGE_END_COLUMN}`;
  const payload = await fetchGoogleJson<GoogleValuesResponse>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}?majorDimension=ROWS`,
    {
      headers: createGoogleHeaders(accessToken),
    },
    "讀取 Google Sheet 推車資料",
  );
  const rows = Array.isArray(payload.values) ? payload.values : [];

  return rows
    .map((row) => parseCartRow(Array.isArray(row) ? row : []))
    .filter((cart): cart is SheetCart => Boolean(cart));
}

export async function writeCartsToGoogleSheet(
  sheetUrl: string,
  carts: SheetCart[],
  env?: GoogleSheetsRuntimeEnv,
) {
  const spreadsheetId = getSpreadsheetId(sheetUrl);
  const accessToken = await createGoogleAccessToken(env);
  await ensureSchoolCartSheet(spreadsheetId, accessToken);

  const rows = createCartSheetRows(carts);
  const range = `${quoteSheetName(
    SCHOOL_CARTS_SHEET_NAME,
  )}!A1:${CART_RANGE_END_COLUMN}${rows.length}`;

  await fetchGoogleJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}?valueInputOption=RAW`,
    {
      body: JSON.stringify({
        majorDimension: "ROWS",
        range,
        values: rows,
      }),
      headers: createGoogleHeaders(accessToken),
      method: "PUT",
    },
    "寫入 Google Sheet 推車資料",
  );

  return {
    range,
    rows: carts.length,
    syncedAt: new Date().toISOString(),
  };
}

export function normalizeSheetCart(value: unknown): SheetCart | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const cart = value as Partial<Record<keyof SheetCart, unknown>>;
  const id = getText(cart.id);
  const label = getText(cart.label) || id;
  const room = getText(cart.room) || "待設定位置";
  const status = parseCartStatus(cart.status);
  const tabletCount = clampInteger(
    typeof cart.slots === "object" && Array.isArray(cart.slots)
      ? cart.slots.length
      : CART_DEVICE_COUNT,
    1,
    CART_DEVICE_COUNT,
    CART_DEVICE_COUNT,
  );
  const offline = clampInteger(cart.offline, 0, tabletCount, 0);

  if (!id) {
    return null;
  }

  return {
    id,
    label,
    room,
    health: clampInteger(cart.health, 0, 100, 100),
    battery: clampInteger(cart.battery, 0, 100, 100),
    offline,
    slots: normalizeSlotList(cart.slots, tabletCount, status, offline),
    status,
  };
}

function createCartSheetRows(carts: SheetCart[]) {
  const rowCount = Math.max(MIN_SHEET_ROWS, carts.length + 1);
  const rows = [
    CART_HEADERS,
    ...carts.map((cart) => createCartSheetRow(cart)),
  ];

  while (rows.length < rowCount) {
    rows.push(Array.from({ length: CART_HEADERS.length }, () => ""));
  }

  return rows;
}

function createCartSheetRow(cart: SheetCart) {
  const row = [
    cart.id,
    cart.label,
    cart.room,
    cart.status,
    cart.health,
    cart.battery,
    cart.offline,
    cart.slots.length,
    new Date().toISOString(),
  ];

  return [
    ...row,
    ...Array.from({ length: CART_DEVICE_COUNT }, (_, index) =>
      index < cart.slots.length ? getSlotStatusText(cart.slots[index]) : "",
    ),
  ];
}

function parseCartRow(row: unknown[]) {
  const id = getText(row[0]);
  if (!id) {
    return null;
  }

  const status = parseCartStatus(row[3]);
  const tabletCount = clampInteger(row[7], 1, CART_DEVICE_COUNT, CART_DEVICE_COUNT);
  const offline = clampInteger(row[6], 0, tabletCount, 0);
  const rawSlots = row.slice(CART_BASE_COLUMN_COUNT);

  return {
    id,
    label: getText(row[1]) || id,
    room: getText(row[2]) || "待設定位置",
    status,
    health: clampInteger(row[4], 0, 100, 100),
    battery: clampInteger(row[5], 0, 100, 100),
    offline,
    slots: normalizeSlotList(rawSlots, tabletCount, status, offline),
  };
}

async function ensureSchoolCartSheet(spreadsheetId: string, accessToken: string) {
  const metadata = await fetchGoogleJson<GoogleSpreadsheetMetadata>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    {
      headers: createGoogleHeaders(accessToken),
    },
    "確認 Google Sheet 分頁",
  );
  const sheetNames = new Set(
    (metadata.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title)),
  );

  if (sheetNames.has(SCHOOL_CARTS_SHEET_NAME)) {
    return;
  }

  await fetchGoogleJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                gridProperties: {
                  columnCount: CART_HEADERS.length,
                  frozenRowCount: 1,
                  rowCount: MIN_SHEET_ROWS,
                },
                title: SCHOOL_CARTS_SHEET_NAME,
              },
            },
          },
        ],
      }),
      headers: createGoogleHeaders(accessToken),
      method: "POST",
    },
    "建立 Google Sheet 推車資料分頁",
  );
}

async function createGoogleAccessToken(env?: GoogleSheetsRuntimeEnv) {
  const serviceAccountEmail = getEnvValue("GOOGLE_SERVICE_ACCOUNT_EMAIL", env);
  const privateKey = getEnvValue("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", env);

  if (!serviceAccountEmail || !privateKey) {
    throw new GoogleSheetsError(
      503,
      "Google Sheet 同步尚未設定服務帳號，請先設定 GOOGLE_SERVICE_ACCOUNT_EMAIL 與 GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY。",
    );
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3500;
  const assertion = await signJwt(
    {
      alg: "RS256",
      typ: "JWT",
    },
    {
      aud: GOOGLE_TOKEN_URL,
      exp: expiresAt,
      iat: issuedAt,
      iss: serviceAccountEmail,
      scope: GOOGLE_SHEETS_SCOPE,
    },
    privateKey,
  );
  const response = await fetch(GOOGLE_TOKEN_URL, {
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new GoogleSheetsError(
      502,
      "Google 服務帳號驗證失敗，請確認服務帳號信箱與私密金鑰有效。",
    );
  }

  const payload = (await response.json()) as GoogleAccessTokenResponse;
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new GoogleSheetsError(502, "Google 未回傳可用的存取權杖。");
  }

  return payload.access_token;
}

async function signJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: string,
) {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function fetchGoogleJson<T>(
  url: string,
  init: RequestInit,
  action: string,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw await createGoogleSheetsError(response, action);
  }

  return (await response.json()) as T;
}

async function createGoogleSheetsError(response: Response, action: string) {
  const detail = await safeGoogleErrorDetail(response);
  const details = detail ? `（${detail}）` : "";

  if (response.status === 401) {
    return new GoogleSheetsError(
      502,
      `${action}失敗：Google 服務帳號驗證失敗${details}`,
    );
  }

  if (response.status === 403) {
    return new GoogleSheetsError(
      403,
      `${action}失敗：這份 Sheet 尚未授權服務帳號編輯，請把學校 Sheet 分享給服務帳號${details}`,
    );
  }

  if (response.status === 404) {
    return new GoogleSheetsError(
      404,
      `${action}失敗：找不到這份 Google Sheet，請確認網址${details}`,
    );
  }

  return new GoogleSheetsError(
    502,
    `${action}失敗：Google Sheets API 暫時無法完成${details}`,
  );
}

async function safeGoogleErrorDetail(response: Response) {
  try {
    const payload = await response.json();
    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error &&
      typeof payload.error === "object" &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
    ) {
      return payload.error.message;
    }
  } catch {
    return "";
  }

  return "";
}

function createGoogleHeaders(accessToken: string) {
  return {
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
}

function getSpreadsheetId(sheetUrl: string) {
  try {
    const url = new URL(sheetUrl.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== "docs.google.com" ||
      !url.pathname.startsWith("/spreadsheets/d/")
    ) {
      throw new Error("Invalid Google Sheet URL.");
    }

    const id = url.pathname.split("/")[3] ?? "";
    if (!id) {
      throw new Error("Missing Google Sheet ID.");
    }

    return id;
  } catch {
    throw new GoogleSheetsError(400, "請提供正確的 Google Sheets 網址。");
  }
}

function quoteSheetName(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

function getEnvValue(
  name: keyof GoogleSheetsRuntimeEnv,
  env?: GoogleSheetsRuntimeEnv,
) {
  return (env?.[name] ?? process.env[name] ?? "")
    .replace(/\\n/g, "\n")
    .trim();
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  if (!base64) {
    throw new GoogleSheetsError(503, "Google 服務帳號私密金鑰格式不正確。");
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function base64UrlEncode(value: string | Uint8Array) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function normalizeSlotList(
  value: unknown,
  tabletCount: number,
  status: SheetCartStatus,
  offline: number,
) {
  const fallback = createSlotsForCart(tabletCount, status, offline);
  const slots = Array.isArray(value)
    ? value.map((slot) => parseSlotStatus(slot))
    : [];

  return Array.from(
    { length: tabletCount },
    (_, index) => slots[index] ?? fallback[index] ?? "ok",
  );
}

function createSlotsForCart(
  count: number,
  status: SheetCartStatus,
  offline: number,
): SheetSlotStatus[] {
  const safeCount = clampInteger(count, 1, CART_DEVICE_COUNT, CART_DEVICE_COUNT);
  const safeOffline = clampInteger(offline, 0, safeCount, 0);
  const warningCount =
    status === "可借用"
      ? 0
      : status === "需檢查"
        ? Math.min(
            safeCount - safeOffline,
            Math.max(1, Math.ceil(safeCount * 0.16)),
          )
        : safeCount - safeOffline;

  return Array.from({ length: safeCount }, (_, index) => {
    if (index < safeOffline) {
      return "offline";
    }

    if (index < safeOffline + warningCount) {
      return "warning";
    }

    return "ok";
  });
}

function parseCartStatus(value: unknown): SheetCartStatus {
  const text = getText(value);

  if (text === "需檢查") {
    return "需檢查";
  }

  if (text === "停用") {
    return "停用";
  }

  return "可借用";
}

function parseSlotStatus(value: unknown): SheetSlotStatus | null {
  const text = getText(value).toLowerCase();

  if (!text) {
    return null;
  }

  if (["offline", "停用", "離線", "維修", "維修/離線"].includes(text)) {
    return "offline";
  }

  if (["warning", "需檢查", "異常", "待修"].includes(text)) {
    return "warning";
  }

  if (["ok", "可用", "正常", "可借用"].includes(text)) {
    return "ok";
  }

  return null;
}

function getSlotStatusText(status: SheetSlotStatus | undefined) {
  if (status === "offline") {
    return "維修/離線";
  }

  if (status === "warning") {
    return "需檢查";
  }

  return "可用";
}

function getText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function clampInteger(
  value: number | string | unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(parsed), min), max);
}

"use client";

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { toDataURL } from "qrcode";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { getFirebaseAuth, loadFirebaseRuntimeSettings } from "./firebase-client";

type Role = "hub" | "user" | "school-admin" | "super-admin";
type Priority = "高" | "中" | "低";
type TicketStatus = "待派工" | "維修中" | "待料" | "已完成";
type SlotStatus = "ok" | "warning" | "offline";
type CartStatus = "可借用" | "需檢查" | "停用";
type UserRecordType = "開始使用檢查" | "未照號碼擺放" | "新增異常回報";

type Ticket = {
  id: string;
  cartId: string;
  cart: string;
  room: string;
  issue: string;
  priority: Priority;
  status: TicketStatus;
  reportedAt: string;
  owner: string;
};

type Cart = {
  id: string;
  label: string;
  room: string;
  health: number;
  battery: number;
  offline: number;
  slots: SlotStatus[];
  status: CartStatus;
};

type CartForm = {
  id: string;
  label: string;
  room: string;
  tabletCount: string;
};

type CartEditForm = {
  label: string;
  room: string;
  status: CartStatus;
  health: string;
  battery: string;
  offline: string;
  tabletCount: string;
};

type ApplicationStatus = "待審核" | "已啟用" | "退回補件";

type SchoolApplication = {
  id: string;
  schoolName: string;
  adminEmail: string;
  sheetUrl: string;
  submittedAt: string;
  status: ApplicationStatus;
  note: string;
};

type SchoolApplicationForm = {
  schoolName: string;
  sheetUrl: string;
};

type AuthForm = {
  email: string;
  password: string;
};

type AuthSession = {
  uid: string;
  email: string;
};

type PhotoEvidence = {
  name: string;
  url: string;
};

type Metric = {
  label: string;
  value: string;
  detail: string;
};

type SchoolStatus = {
  id: string;
  name: string;
  district: string;
  admins: number;
  carts: number;
  warningCarts: number;
  activeTickets: number;
  highPriority: number;
  uptime: string;
  status: "正常" | "需協助" | "待設定";
};

const STORAGE_KEY = "tablet-cart-repair-system:carts";
const APPLICATION_STORAGE_KEY = "tablet-cart-repair-system:school-applications";
const MAIN_DATABASE_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1baE1-6fXpTfNQT59VdHJ2FuecaSy5OmbR392ODrdaTA/edit?usp=sharing";
const MAIN_DATABASE_SHEET_NAME = "工作表1";
const DEFAULT_SUPER_ADMIN_EMAIL = "ychao@tmail.ilc.edu.tw";

const seedCartFingerprints = [
  { id: "A3-01", label: "A 棟 3F", room: "301 自然教室" },
  { id: "B2-02", label: "B 棟 2F", room: "204 英語教室" },
  { id: "ADM-01", label: "行政樓", room: "設備室" },
];

const initialTickets: Ticket[] = [];

const initialCarts: Cart[] = [];

const initialSchoolApplications: SchoolApplication[] = [];

const userRecordTypes: UserRecordType[] = [
  "開始使用檢查",
  "未照號碼擺放",
  "新增異常回報",
];
const cartStatuses: CartStatus[] = ["可借用", "需檢查", "停用"];
const filters: Array<"全部" | TicketStatus> = [
  "全部",
  "待派工",
  "維修中",
  "待料",
  "已完成",
];

const roleLinks: Array<{ href: string; label: string; role: Role }> = [
  { href: "/", label: "入口總覽", role: "hub" },
  { href: "/user", label: "使用者頁面", role: "user" },
  {
    href: "/school-admin",
    label: "各校系統管理者頁面",
    role: "school-admin",
  },
  { href: "/super-admin", label: "超管頁面", role: "super-admin" },
];

const roleCopy: Record<
  Role,
  {
    eyebrow: string;
    title: string;
    description: string;
    cardLabel: string;
    cardTitle: string;
    cardDetail: string;
  }
> = {
  hub: {
    eyebrow: "角色入口",
    title: "平板推車報修系統",
    description:
      "第一版已分成一般使用者、各校系統管理者、超級管理者三個頁面，並以 Google Sheet 作為主要資料庫方向。",
    cardLabel: "目前版本",
    cardTitle: "三種角色頁面已啟用",
    cardDetail: "QR Code 會導向使用者頁面並自動帶入推車資訊。",
  },
  user: {
    eyebrow: "使用者頁面",
    title: "掃描 QR 後查看推車狀態與上傳紀錄",
    description:
      "借用老師先確認推車數量、維修狀態與已回報異常；若狀態相同就不用重複回報，發現異常再拍照寫紀錄。",
    cardLabel: "報修入口",
    cardTitle: "掃碼先看狀態",
    cardDetail: "拍照與文字紀錄會自動帶入推車和回報時間。",
  },
  "school-admin": {
    eyebrow: "各校系統管理者頁面",
    title: "學校申請、推車與 QR Code 管理",
    description:
      "學校端先用 Google 帳號驗證，再貼上學校設備 Google Sheet 送出申請，超管啟用後再進入推車與案件管理。",
    cardLabel: "帳號流程",
    cardTitle: "等待超管啟用",
    cardDetail: "Google 帳號與 Sheet 網址都完成後，才會送出申請。",
  },
  "super-admin": {
    eyebrow: "超管頁面",
    title: "Google Sheet 主資料庫與帳號啟用",
    description:
      "超級管理者可審核學校端申請、啟用管理者帳號，並追蹤各校設備表與跨校維修案件。",
    cardLabel: "超管帳號",
    cardTitle: "主資料庫已指定",
    cardDetail: "目前尚無學校申請，學校端送出後才會進入待審核清單。",
  },
};

export function RoleWorkspace({ activeRole }: { activeRole: Role }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [managedCarts, setManagedCarts] = useState(initialCarts);
  const [schoolApplications, setSchoolApplications] = useState(
    initialSchoolApplications,
  );
  const [applicationForm, setApplicationForm] =
    useState<SchoolApplicationForm>(createEmptyApplicationForm());
  const [authForm, setAuthForm] = useState<AuthForm>(createEmptyAuthForm());
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [superAdminEmail, setSuperAdminEmail] = useState(
    DEFAULT_SUPER_ADMIN_EMAIL,
  );
  const [authMessage, setAuthMessage] = useState("");
  const [selectedCartId, setSelectedCartId] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("全部");
  const [room, setRoom] = useState("");
  const [issue, setIssue] = useState(
    "學生取用後發現第 12 號設備無法正常開機，已先拍照留存。",
  );
  const [userRecordType, setUserRecordType] =
    useState<UserRecordType>("開始使用檢查");
  const [photoEvidence, setPhotoEvidence] = useState<PhotoEvidence | null>(
    null,
  );
  const [runtimeOrigin, setRuntimeOrigin] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [copiedCartId, setCopiedCartId] = useState<string | null>(null);
  const [downloadedCartId, setDownloadedCartId] = useState<string | null>(null);
  const [generatedCartId, setGeneratedCartId] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [cartForm, setCartForm] = useState<CartForm>({
    id: "D4-01",
    label: "D 棟 4F",
    room: "402 多功能教室",
    tabletCount: "30",
  });
  const [editingCartId, setEditingCartId] = useState<string | null>(null);
  const [cartEditForm, setCartEditForm] =
    useState<CartEditForm>(createEmptyCartEditForm());
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );

  const origin = runtimeOrigin;
  const selectedCart =
    managedCarts.find((item) => item.id === selectedCartId) ??
    managedCarts[0] ??
    null;
  const generatedCart =
    managedCarts.find((item) => item.id === generatedCartId) ??
    managedCarts[0] ??
    null;
  const isSuperAdmin =
    authSession?.email.toLowerCase() === superAdminEmail.toLowerCase();
  const currentSchoolApplication = getCurrentSchoolApplication(
    schoolApplications,
    authSession,
  );
  const hasEnabledSchoolAccess =
    currentSchoolApplication?.status === "已啟用";
  const schoolAdminCarts = hasEnabledSchoolAccess ? managedCarts : [];
  const schoolAdminTickets = hasEnabledSchoolAccess ? tickets : [];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storedCarts = readStoredCarts();
      const storedApplications = readStoredSchoolApplications();
      let nextCarts = storedCarts;
      const nextApplications = storedApplications;

      const params = new URLSearchParams(window.location.search);
      const cartId = params.get("cartId");
      const cartLabel = params.get("cart");
      const cartRoom = params.get("room");

      if (cartId && cartLabel) {
        const scannedCart: Cart = {
          id: cartId,
          label: cartLabel,
          room: cartRoom || "掃碼帶入位置",
          health: 100,
          battery: 100,
          offline: 0,
          status: "可借用",
          slots: createSlots(30),
        };

        nextCarts = [
          scannedCart,
          ...nextCarts.filter((item) => item.id !== scannedCart.id),
        ];
        setSelectedCartId(scannedCart.id);
        setGeneratedCartId(scannedCart.id);
        setRoom(scannedCart.room);
        setIssue("");
        setScanMessage(`${scannedCart.label} 已從 QR Code 帶入紀錄頁面。`);
      } else if (nextCarts[0]) {
        setSelectedCartId(nextCarts[0].id);
        setGeneratedCartId(nextCarts[0].id);
        setRoom(nextCarts[0].room);
      }

      setManagedCarts(nextCarts);
      setSchoolApplications(nextApplications);
      setRuntimeOrigin(window.location.origin);
      setStorageReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    return () => {
      if (photoEvidence?.url) {
        window.URL.revokeObjectURL(photoEvidence.url);
      }
    };
  }, [photoEvidence]);

  useEffect(() => {
    let isActive = true;
    let unsubscribe: (() => void) | undefined;

    void loadFirebaseRuntimeSettings()
      .then(async (settings) => {
        if (!isActive) {
          return;
        }

        setSuperAdminEmail(settings.superAdminEmail);
        setFirebaseReady(settings.configured);

        if (!settings.configured) {
          setAuthLoading(false);
          return;
        }

        const auth = await getFirebaseAuth();
        if (!isActive) {
          return;
        }

        unsubscribe = onAuthStateChanged(auth, (user) => {
          setAuthSession(user ? createAuthSession(user) : null);
          setAuthLoading(false);
        });
      })
      .catch(() => {
        if (isActive) {
          setFirebaseReady(false);
          setAuthSession(null);
          setAuthLoading(false);
        }
      });

    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(managedCarts));
    window.localStorage.setItem(
      APPLICATION_STORAGE_KEY,
      JSON.stringify(schoolApplications),
    );
  }, [managedCarts, schoolApplications, storageReady]);

  const hubMetrics = useMemo(
    () => getSchoolMetrics(tickets, managedCarts),
    [managedCarts, tickets],
  );
  const schoolAdminMetrics = useMemo(
    () =>
      getSchoolMetrics(
        hasEnabledSchoolAccess ? tickets : [],
        hasEnabledSchoolAccess ? managedCarts : [],
      ),
    [hasEnabledSchoolAccess, managedCarts, tickets],
  );
  const userMetrics = useMemo(
    () => getUserMetrics(tickets, managedCarts),
    [managedCarts, tickets],
  );
  const superMetrics = useMemo(
    () => getSuperMetrics(schoolApplications),
    [schoolApplications],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCart) {
      setScanMessage("請先掃描推車 QR Code，或由管理者新增推車後再上傳紀錄。");
      return;
    }

    const description = issue.trim();
    if (!description && !photoEvidence) {
      setScanMessage("請先拍照或撰寫紀錄內容。");
      return;
    }

    const reportedAt = createCurrentReportTime();
    const priority = getUserRecordPriority(userRecordType);
    const nextTicket: Ticket = {
      id: createReportId(tickets.length + 1),
      cartId: selectedCart.id,
      cart: `${selectedCart.label} 平板推車`,
      room,
      issue: createUserRecordIssue(
        userRecordType,
        description || "已拍照上傳紀錄，等待學校管理者確認。",
        photoEvidence?.name,
      ),
      priority,
      status: "待派工",
      reportedAt,
      owner: "借用老師",
    };

    setTickets((current) => [nextTicket, ...current]);
    setIssue("");
    setPhotoEvidence(null);
    setScanMessage(
      `${nextTicket.cart} 已於 ${reportedAt} 上傳${userRecordType}紀錄。`,
    );
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setPhotoEvidence({
      name: file.name,
      url: window.URL.createObjectURL(file),
    });
  }

  function handleCreateCart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const id = normalizeCartId(cartForm.id || cartForm.label);
    const label = cartForm.label.trim() || id;
    const nextCart: Cart = {
      id,
      label,
      room: cartForm.room.trim() || "待設定位置",
      health: 100,
      battery: 100,
      offline: 0,
      status: "可借用",
      slots: createSlots(Number(cartForm.tabletCount)),
    };

    setManagedCarts((current) => [
      nextCart,
      ...current.filter((item) => item.id !== nextCart.id),
    ]);
    setSelectedCartId(nextCart.id);
    setGeneratedCartId(nextCart.id);
    setRoom(nextCart.room);
    setScanMessage(`${nextCart.label} 已建立，報修網址與 QR Code 已自動產生。`);
    setCartForm({
      id: suggestNextCartId(id),
      label: "",
      room: "",
      tabletCount: cartForm.tabletCount,
    });
  }

  async function handleSubmitSchoolApplication(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const safeSheetUrl = getSafeSheetUrl(applicationForm.sheetUrl);
    if (!safeSheetUrl) {
      setScanMessage("請提供 Google Sheets 的 https 網址。");
      return;
    }

    const schoolName = applicationForm.schoolName.trim();
    const adminEmail = authSession?.email.trim() ?? "";

    if (!schoolName) {
      setScanMessage("請輸入學校名稱。");
      return;
    }

    if (!authSession || !adminEmail || adminEmail === "未提供信箱") {
      setAuthMessage("請先使用 Google 帳號驗證，系統會用登入信箱送出申請。");
      setScanMessage("學校端申請需要先完成 Google 帳號驗證。");
      return;
    }

    const nextApplication: SchoolApplication = {
      id: createApplicationId(schoolApplications.length + 1),
      schoolName,
      adminEmail,
      sheetUrl: safeSheetUrl,
      submittedAt: "剛剛",
      status: "待審核",
      note: "Google 帳號已驗證，等待超管啟用",
    };

    setSchoolApplications((current) => [
      nextApplication,
      ...current.filter(
        (item) =>
          item.adminEmail.toLowerCase() !== adminEmail.toLowerCase() ||
          item.schoolName !== schoolName,
      ),
    ]);
    setApplicationForm(createEmptyApplicationForm());
    setAuthMessage(`${adminEmail} 已完成 Google 驗證，申請已送出。`);
    setScanMessage(`${schoolName} 已送出申請，等待超管啟用帳號。`);
  }

  async function handleFirebaseLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!firebaseReady) {
      setAuthMessage("Firebase 設定尚未完成，請補上 Web App 設定值。");
      return;
    }

    setAuthLoading(true);
    try {
      const auth = await getFirebaseAuth();
      const credential = await signInWithEmailAndPassword(
        auth,
        authForm.email.trim(),
        authForm.password,
      );
      setAuthSession(createAuthSession(credential.user));
      setAuthForm(createEmptyAuthForm());
      setAuthMessage(`${credential.user.email ?? authForm.email} 已登入。`);
    } catch (error) {
      setAuthMessage(getFirebaseAuthErrorMessage(error));
    }
    setAuthLoading(false);
  }

  async function handleSchoolGoogleLogin() {
    if (!firebaseReady) {
      setAuthMessage("Firebase 設定尚未完成，請補上 Web App 設定值。");
      return;
    }

    setAuthLoading(true);
    try {
      const auth = await getFirebaseAuth();
      const credential = await signInWithPopup(auth, createGoogleProvider());
      const email = credential.user.email ?? "";
      setAuthSession(createAuthSession(credential.user));
      setAuthMessage(
        `${email || "目前帳號"} 已完成 Google 驗證，請貼上學校設備 Google Sheet 網址。`,
      );
    } catch (error) {
      setAuthMessage(getFirebaseAuthErrorMessage(error));
    }
    setAuthLoading(false);
  }

  async function handleSuperAdminGoogleLogin() {
    if (!firebaseReady) {
      setAuthMessage("Firebase 設定尚未完成，請補上 Web App 設定值。");
      return;
    }

    setAuthLoading(true);
    try {
      const auth = await getFirebaseAuth();
      const credential = await signInWithPopup(
        auth,
        createGoogleProvider(superAdminEmail),
      );
      const email = credential.user.email ?? "";
      setAuthSession(createAuthSession(credential.user));
      setAuthMessage(
        email.toLowerCase() === superAdminEmail.toLowerCase()
          ? `${email} 已用 Google 登入。`
          : `${email || "目前帳號"} 已登入，但不是超管白名單帳號。`,
      );
    } catch (error) {
      setAuthMessage(getFirebaseAuthErrorMessage(error));
    }
    setAuthLoading(false);
  }

  async function handleFirebaseSignOut() {
    if (!firebaseReady) {
      setAuthSession(null);
      return;
    }

    setAuthLoading(true);
    try {
      const auth = await getFirebaseAuth();
      await signOut(auth);
      setAuthSession(null);
      setAuthMessage("已登出 Firebase。");
    } catch (error) {
      setAuthMessage(getFirebaseAuthErrorMessage(error));
    }
    setAuthLoading(false);
  }

  function updateSchoolApplicationStatus(
    applicationId: string,
    status: ApplicationStatus,
  ) {
    const application = schoolApplications.find(
      (item) => item.id === applicationId,
    );
    if (!application) {
      return;
    }

    setSchoolApplications((current) =>
      current.map((item) =>
        item.id === applicationId
          ? {
              ...item,
              status,
              note: getApplicationStatusNote(status),
            }
          : item,
      ),
    );
    setScanMessage(
      `${application.schoolName} 已${
        status === "已啟用" ? "啟用帳號" : "退回補件"
      }。`,
    );
  }

  function beginEditCart(cart: Cart) {
    setEditingCartId(cart.id);
    setCartEditForm(createCartEditForm(cart));
    setGeneratedCartId(cart.id);
    setDeleteCandidateId(null);
  }

  function cancelEditCart() {
    setEditingCartId(null);
    setDeleteCandidateId(null);
  }

  function handleUpdateCart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingCartId) {
      return;
    }

    const existingCart = managedCarts.find((item) => item.id === editingCartId);
    if (!existingCart) {
      setEditingCartId(null);
      return;
    }

    const updatedCart = updateCartFromEditForm(existingCart, cartEditForm);
    setManagedCarts((current) =>
      current.map((item) => (item.id === editingCartId ? updatedCart : item)),
    );
    setTickets((current) =>
      current.map((ticket) =>
        ticket.cartId === editingCartId
          ? {
              ...ticket,
              cart: `${updatedCart.label} 平板推車`,
              room: updatedCart.room,
            }
          : ticket,
      ),
    );
    setSelectedCartId((current) =>
      current === editingCartId ? updatedCart.id : current,
    );
    setGeneratedCartId(updatedCart.id);
    setRoom((current) =>
      selectedCartId === editingCartId ? updatedCart.room : current,
    );
    setEditingCartId(null);
    setDeleteCandidateId(null);
    setScanMessage(
      `${updatedCart.label} 已更新，新的報修網址與 QR Code 已同步套用。`,
    );
  }

  function updateCartStatus(cartId: string, status: CartStatus) {
    const existingCart = managedCarts.find((item) => item.id === cartId);
    if (!existingCart) {
      return;
    }

    const updatedCart = applyQuickCartStatus(existingCart, status);
    setManagedCarts((current) =>
      current.map((item) => (item.id === cartId ? updatedCart : item)),
    );

    if (editingCartId === cartId) {
      setCartEditForm(createCartEditForm(updatedCart));
    }

    setGeneratedCartId(cartId);
    setDeleteCandidateId(null);
    setScanMessage(`${updatedCart.label} 狀態已調整為「${status}」。`);
  }

  function deleteCart(cartId: string) {
    const cartToDelete = managedCarts.find((item) => item.id === cartId);
    if (!cartToDelete) {
      return;
    }

    const relatedTicketCount = countTicketsForCart(tickets, cartToDelete);

    if (deleteCandidateId !== cartId) {
      setDeleteCandidateId(cartId);
      setScanMessage(
        `再按一次刪除即可移除 ${cartToDelete.label}，並同步刪除 ${relatedTicketCount} 件關聯案件。`,
      );
      return;
    }

    const nextCarts = managedCarts.filter((item) => item.id !== cartId);
    const fallbackCart = nextCarts[0] ?? null;

    setManagedCarts(nextCarts);
    setTickets((current) =>
      current.filter((ticket) => !ticketBelongsToCart(ticket, cartToDelete)),
    );

    if (selectedCartId === cartId) {
      setSelectedCartId(fallbackCart?.id ?? "");
      setRoom(fallbackCart?.room ?? "");
    }

    if (generatedCartId === cartId) {
      setGeneratedCartId(fallbackCart?.id ?? "");
    }

    if (editingCartId === cartId) {
      setEditingCartId(null);
    }

    setDeleteCandidateId(null);
    setScanMessage(
      `${cartToDelete.label} 已刪除，並移除 ${relatedTicketCount} 件關聯案件。`,
    );
  }

  function advanceTicket(id: string) {
    const statusFlow: Record<TicketStatus, TicketStatus> = {
      待派工: "維修中",
      維修中: "待料",
      待料: "已完成",
      已完成: "已完成",
    };

    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === id
          ? { ...ticket, status: statusFlow[ticket.status] }
          : ticket,
      ),
    );
  }

  async function copyCartUrl(cartItem: Cart) {
    const url = createRepairUrl(cartItem, origin);
    if (!url) {
      return;
    }

    try {
      await window.navigator.clipboard.writeText(url);
      setCopiedCartId(cartItem.id);
      window.setTimeout(() => setCopiedCartId(null), 1800);
    } catch {
      setCopiedCartId(null);
    }
  }

  async function downloadCartQr(cartItem: Cart) {
    const url = createRepairUrl(cartItem, origin);
    if (!url) {
      return;
    }

    try {
      const qrDataUrl = await createQrDataUrl(url);
      const link = document.createElement("a");
      link.href = qrDataUrl;
      link.download = `${cartItem.id}-repair-qr.png`;
      document.body.append(link);
      link.click();
      link.remove();
      setDownloadedCartId(cartItem.id);
      window.setTimeout(() => setDownloadedCartId(null), 1800);
      setScanMessage(`${cartItem.label} 的 QR Code PNG 已下載。`);
    } catch {
      setScanMessage("QR Code 下載失敗，請稍後再試一次。");
    }
  }

  return (
    <main className="app-shell">
      <RoleHeader activeRole={activeRole} />

      {scanMessage && <p className="scan-message">{scanMessage}</p>}

      {activeRole === "hub" && (
        <HubPage metrics={hubMetrics} carts={managedCarts} />
      )}

      {activeRole === "user" && (
        <UserPage
          issue={issue}
          managedCarts={managedCarts}
          metrics={userMetrics}
          photoEvidence={photoEvidence}
          room={room}
          selectedCartId={selectedCartId}
          setIssue={setIssue}
          setUserRecordType={setUserRecordType}
          setRoom={setRoom}
          setSelectedCartId={setSelectedCartId}
          tickets={tickets}
          userRecordType={userRecordType}
          onPhotoChange={handlePhotoChange}
          onSubmit={handleSubmit}
        />
      )}

      {activeRole === "school-admin" && (
        <SchoolAdminPage
          applicationForm={applicationForm}
          authForm={authForm}
          authLoading={authLoading}
          authMessage={authMessage}
          authSession={authSession}
          cartForm={cartForm}
          cartEditForm={cartEditForm}
          copiedCartId={copiedCartId}
          deleteCandidateId={deleteCandidateId}
          downloadedCartId={downloadedCartId}
          editingCartId={editingCartId}
          firebaseReady={firebaseReady}
          filter={filter}
          generatedCart={generatedCart}
          managedCarts={schoolAdminCarts}
          metrics={schoolAdminMetrics}
          origin={origin}
          setCartForm={setCartForm}
          setCartEditForm={setCartEditForm}
          setFilter={setFilter}
          setGeneratedCartId={setGeneratedCartId}
          setApplicationForm={setApplicationForm}
          setAuthForm={setAuthForm}
          schoolApplications={schoolApplications}
          currentApplication={currentSchoolApplication}
          superAdminEmail={superAdminEmail}
          tickets={schoolAdminTickets}
          onAdvanceTicket={advanceTicket}
          onBeginEditCart={beginEditCart}
          onCancelEditCart={cancelEditCart}
          onCopyCartUrl={copyCartUrl}
          onCreateCart={handleCreateCart}
          onDeleteCart={deleteCart}
          onDownloadCartQr={downloadCartQr}
          onFirebaseGoogleLogin={handleSchoolGoogleLogin}
          onFirebaseLogin={handleFirebaseLogin}
          onFirebaseSignOut={handleFirebaseSignOut}
          onSubmitSchoolApplication={handleSubmitSchoolApplication}
          onUpdateCart={handleUpdateCart}
          onUpdateCartStatus={updateCartStatus}
        />
      )}

      {activeRole === "super-admin" && (
        <SuperAdminPage
          authForm={authForm}
          authLoading={authLoading}
          authMessage={authMessage}
          authSession={authSession}
          firebaseReady={firebaseReady}
          filter={filter}
          isSuperAdmin={isSuperAdmin}
          metrics={superMetrics}
          schoolApplications={schoolApplications}
          setAuthForm={setAuthForm}
          setFilter={setFilter}
          superAdminEmail={superAdminEmail}
          onAdvanceTicket={advanceTicket}
          onFirebaseGoogleLogin={handleSuperAdminGoogleLogin}
          onFirebaseLogin={handleFirebaseLogin}
          onFirebaseSignOut={handleFirebaseSignOut}
          onUpdateApplicationStatus={updateSchoolApplicationStatus}
        />
      )}
    </main>
  );
}

function RoleHeader({ activeRole }: { activeRole: Role }) {
  const copy = roleCopy[activeRole];

  return (
    <header className="topbar">
      <div className="brand-block">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
        <nav className="role-nav" aria-label="角色頁面">
          {roleLinks.map((link) => (
            <a
              aria-current={activeRole === link.role ? "page" : undefined}
              className={activeRole === link.role ? "active" : ""}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="shift-card" aria-label="頁面狀態">
        <span>{copy.cardLabel}</span>
        <strong>{copy.cardTitle}</strong>
        <small>{copy.cardDetail}</small>
      </div>
    </header>
  );
}

function HubPage({ metrics, carts }: { metrics: Metric[]; carts: Cart[] }) {
  return (
    <>
      <section className="role-card-grid" aria-label="角色入口">
        <RoleEntry
          href="/user"
          label="使用者頁面"
          title="掃 QR 填報修"
          description="老師掃描推車上的 QR Code 後，推車位置會自動帶入，只要補上問題描述即可送出。"
        />
        <RoleEntry
          href="/school-admin"
          label="各校系統管理者頁面"
          title="申請啟用與推車管理"
          description="學校資訊組先完成 Google 帳號驗證並貼上設備 Google Sheet，超管啟用後再管理推車與案件。"
        />
        <RoleEntry
          href="/super-admin"
          label="超管頁面"
          title="主資料庫與帳號啟用"
          description="超級管理者掌握主 Google Sheet、審核學校申請，並追蹤跨校案件與權限狀態。"
        />
      </section>

      <MetricGrid metrics={metrics} label="平台今日概況" />

      <section className="operations-grid">
        <section className="panel flow-panel" aria-label="第一版流程">
          <PanelHeader eyebrow="流程" title="第一版本完整動線" />
          <ol className="flow-list">
            <li>
              <strong>學校端送出使用申請</strong>
              <p>
                學校管理者使用 Google 帳號驗證，並提供學校設備 Google Sheet
                網址。
              </p>
            </li>
            <li>
              <strong>超管啟用學校帳號</strong>
              <p>申請進入待審核清單後，由超管確認資料並啟用帳號。</p>
            </li>
            <li>
              <strong>學校管理者新增推車</strong>
              <p>輸入推車編號、位置、平板數量後，自動產生報修網址與 QR Code。</p>
            </li>
            <li>
              <strong>使用者掃碼報修</strong>
              <p>QR Code 開啟 `/user`，推車資訊自動帶入報修表單。</p>
            </li>
            <li>
              <strong>學校管理者派工</strong>
              <p>案件進入看板後可從待派工、維修中、待料一路更新到已完成。</p>
            </li>
            <li>
              <strong>超管跨校追蹤</strong>
              <p>集中查看各校系統狀態，找出需要協助上線或權限補齊的學校。</p>
            </li>
          </ol>
        </section>

        <aside className="panel timeline-panel" aria-label="推車狀態摘要">
          <PanelHeader eyebrow="設備" title="目前推車摘要" />
          <div className="status-list">
            {carts.length === 0 ? (
              <div className="empty-state">
                <strong>目前沒有推車資料</strong>
                <p>學校啟用後會依設備資料表顯示推車。</p>
              </div>
            ) : (
              carts.map((cart) => (
                <div className="status-line" key={cart.id}>
                  <div>
                    <strong>{cart.label}</strong>
                    <span>{cart.room}</span>
                  </div>
                  <StatusPill status={cart.status} />
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </>
  );
}

function UserPage({
  issue,
  managedCarts,
  metrics,
  photoEvidence,
  room,
  selectedCartId,
  setIssue,
  setRoom,
  setSelectedCartId,
  setUserRecordType,
  tickets,
  userRecordType,
  onPhotoChange,
  onSubmit,
}: {
  issue: string;
  managedCarts: Cart[];
  metrics: Metric[];
  photoEvidence: PhotoEvidence | null;
  room: string;
  selectedCartId: string;
  setIssue: (value: string) => void;
  setRoom: (value: string) => void;
  setSelectedCartId: (value: string) => void;
  setUserRecordType: (value: UserRecordType) => void;
  tickets: Ticket[];
  userRecordType: UserRecordType;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const selectedCart =
    managedCarts.find((item) => item.id === selectedCartId) ??
    managedCarts[0] ??
    null;
  const selectedCartTickets = selectedCart
    ? tickets.filter((ticket) => ticketBelongsToCart(ticket, selectedCart))
    : [];

  return (
    <>
      <MetricGrid metrics={metrics} label="使用者紀錄概況" />

      <section className="workspace-grid user-scan-grid">
        {selectedCart ? (
          <UserCartStatusPanel cart={selectedCart} tickets={tickets} />
        ) : (
          <UserScanEmptyPanel />
        )}

        {selectedCart ? (
          <UserRecordPanel
            cart={selectedCart}
            issue={issue}
            managedCarts={managedCarts}
            photoEvidence={photoEvidence}
            room={room}
            selectedCartId={selectedCartId}
            setIssue={setIssue}
            setRoom={setRoom}
            setSelectedCartId={setSelectedCartId}
            setUserRecordType={setUserRecordType}
            userRecordType={userRecordType}
            onPhotoChange={onPhotoChange}
            onSubmit={onSubmit}
          />
        ) : (
          <UserRecordLockedPanel />
        )}
      </section>

      <section className="operations-grid user-operations">
        <section className="panel" aria-label="最近回報紀錄">
          <PanelHeader
            eyebrow="紀錄"
            title="最近回報紀錄"
            action={
              <span className="status-chip success">管理端可追蹤</span>
            }
          />
          <div className="user-ticket-list">
            {selectedCartTickets.length === 0 ? (
              <div className="empty-state">
                <strong>目前沒有這台推車的回報紀錄</strong>
                <p>拍照並送出後，紀錄會依回報時間出現在這裡。</p>
              </div>
            ) : (
              selectedCartTickets.slice(0, 4).map((ticket) => (
                <article className="mini-ticket" key={ticket.id}>
                  <div className="ticket-meta">
                    <span>{ticket.id}</span>
                    <PriorityBadge priority={ticket.priority} />
                    <StatusBadge status={ticket.status} />
                  </div>
                  <h3>{ticket.cart}</h3>
                  <p>{ticket.issue}</p>
                  <small>
                    {ticket.room}｜{ticket.reportedAt}
                  </small>
                </article>
              ))
            )}
          </div>
        </section>

        <aside className="panel timeline-panel" aria-label="借用紀錄流程">
          <PanelHeader eyebrow="提醒" title="借用老師流程" />
          <ol className="timeline">
            <li>
              <span>第 1 步</span>
              <strong>掃 QR 先看推車狀態</strong>
              <p>先確認數量、維修中、待修與目前已回報異常。</p>
            </li>
            <li>
              <span>第 2 步</span>
              <strong>重複異常不用回報</strong>
              <p>若現場狀態與已回報異常相同，借用老師不用再送一次。</p>
            </li>
            <li>
              <span>第 3 步</span>
              <strong>有新狀況就拍照紀錄</strong>
              <p>未照號碼擺放或學生取用後發現異常，都先拍照再補描述。</p>
            </li>
            <li>
              <span>第 4 步</span>
              <strong>管理者完成後重置</strong>
              <p>維修或整理完成後，由學校管理者重置本推車狀態。</p>
            </li>
          </ol>
        </aside>
      </section>
    </>
  );
}

function UserScanEmptyPanel() {
  return (
    <section className="panel cart-status-panel" aria-label="掃描推車狀態">
      <PanelHeader
        eyebrow="掃描推車"
        title="請掃描推車 QR Code"
        action={<span className="status-chip status-待派工">等待掃碼</span>}
      />
      <div className="empty-state">
        <strong>目前尚未帶入推車資料</strong>
        <p>
          掃描推車上的 QR Code 後，這裡會顯示該台推車的數量、維修狀態與目前異常。
        </p>
      </div>
    </section>
  );
}

function UserRecordLockedPanel() {
  return (
    <section className="panel repair-panel" aria-label="拍照撰寫紀錄">
      <PanelHeader
        eyebrow="借用老師紀錄"
        title="等待推車資料"
        action={<span className="status-chip">尚未可上傳</span>}
      />
      <div className="empty-state">
        <strong>掃 QR 後才能拍照撰寫紀錄</strong>
        <p>系統需要先知道是哪一台推車，才能把照片、文字與回報時間存到正確紀錄。</p>
      </div>
    </section>
  );
}

function UserCartStatusPanel({
  cart,
  tickets,
}: {
  cart: Cart;
  tickets: Ticket[];
}) {
  const slotSummary = getCartSlotSummary(cart);
  const activeTickets = getActiveTicketsForCart(tickets, cart);
  const repairingCount = activeTickets.filter(
    (ticket) => ticket.status === "維修中",
  ).length;
  const pendingCount = activeTickets.filter(
    (ticket) => ticket.status === "待派工" || ticket.status === "待料",
  ).length;

  return (
    <section className="panel cart-status-panel" aria-label="掃描推車狀態">
      <PanelHeader
        eyebrow="掃描推車"
        title={`${cart.label} 狀態總覽`}
        action={<StatusPill status={cart.status} />}
      />

      <div className="cart-status-hero">
        <div>
          <span>{cart.id}</span>
          <strong>{cart.room}</strong>
          <p>掃描 QR Code 後先確認目前狀態；若異常已列在下方，不需重複回報。</p>
        </div>
        <div className="status-counter-grid">
          <article>
            <span>平板數量</span>
            <strong>{slotSummary.total}</strong>
            <small>{slotSummary.available} 台目前可用</small>
          </article>
          <article>
            <span>維修中</span>
            <strong>{repairingCount}</strong>
            <small>管理端已處理中</small>
          </article>
          <article>
            <span>待修/待確認</span>
            <strong>{pendingCount}</strong>
            <small>含待派工與待料</small>
          </article>
          <article>
            <span>目前異常</span>
            <strong>{activeTickets.length}</strong>
            <small>已回報未結案</small>
          </article>
        </div>
      </div>

      <div className="cart-condition-grid">
        <Meter label="推車健康度" value={cart.health} />
        <Meter label="平均電量" value={cart.battery} />
        <div className="condition-line">
          <strong>{slotSummary.warning}</strong>
          <span>台需檢查</span>
        </div>
        <div className="condition-line">
          <strong>{slotSummary.offline}</strong>
          <span>台離線或不可用</span>
        </div>
      </div>

      <div className="active-abnormal-list">
        <div className="section-subhead">
          <strong>目前回報異常狀態</strong>
          <span>若與現場看到的狀態相同，這次借用不用重複回報。</span>
        </div>
        {activeTickets.length === 0 ? (
          <div className="empty-state">
            <strong>目前沒有未結案異常</strong>
            <p>學生取用前仍請快速檢查設備，發現新狀況再拍照上傳。</p>
          </div>
        ) : (
          <div className="abnormal-ticket-list">
            {activeTickets.map((ticket) => (
              <article className="abnormal-ticket" key={ticket.id}>
                <div>
                  <span>{ticket.reportedAt}</span>
                  <strong>{ticket.issue}</strong>
                </div>
                <StatusBadge status={ticket.status} />
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function UserRecordPanel({
  cart,
  issue,
  managedCarts,
  photoEvidence,
  room,
  selectedCartId,
  setIssue,
  setRoom,
  setSelectedCartId,
  setUserRecordType,
  userRecordType,
  onPhotoChange,
  onSubmit,
}: {
  cart: Cart;
  issue: string;
  managedCarts: Cart[];
  photoEvidence: PhotoEvidence | null;
  room: string;
  selectedCartId: string;
  setIssue: (value: string) => void;
  setRoom: (value: string) => void;
  setSelectedCartId: (value: string) => void;
  setUserRecordType: (value: UserRecordType) => void;
  userRecordType: UserRecordType;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="panel repair-panel" aria-label="拍照撰寫紀錄">
      <PanelHeader
        eyebrow="借用老師紀錄"
        title="拍照撰寫紀錄"
        action={<span className="status-chip success">自動記錄時間</span>}
      />

      <form className="repair-form user-record-form" onSubmit={onSubmit}>
        <label>
          推車
          <select
            value={selectedCartId}
            onChange={(event) => {
              const nextCart = managedCarts.find(
                (item) => item.id === event.target.value,
              );
              setSelectedCartId(event.target.value);
              setRoom(nextCart?.room ?? room);
            }}
          >
            {managedCarts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          目前位置
          <input value={room} onChange={(event) => setRoom(event.target.value)} />
        </label>

        <div className="field-group">
          <span>紀錄類型</span>
          <div className="choice-grid">
            {userRecordTypes.map((type) => (
              <button
                aria-pressed={userRecordType === type}
                className={userRecordType === type ? "choice active" : "choice"}
                key={type}
                onClick={() => setUserRecordType(type)}
                type="button"
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <label className="photo-upload-field">
          拍照上傳照片
          <input
            accept="image/*"
            capture="environment"
            onChange={onPhotoChange}
            type="file"
          />
          <span>拍攝未照號碼擺放、學生取用後的異常畫面或設備外觀。</span>
        </label>

        {photoEvidence && (
          <div className="photo-preview">
            <div
              aria-label={`${cart.label} 上傳照片預覽`}
              className="photo-preview-image"
              role="img"
              style={{ backgroundImage: `url(${photoEvidence.url})` }}
            />
            <div>
              <strong>{photoEvidence.name}</strong>
              <small>送出後會與這台推車的紀錄一起保存。</small>
            </div>
          </div>
        )}

        <label>
          紀錄內容
          <textarea
            placeholder="例如：第 12 號設備無法開機，或第 3、4 號未照號碼放回。"
            value={issue}
            onChange={(event) => setIssue(event.target.value)}
          />
        </label>

        <button className="primary-action" type="submit">
          上傳紀錄
        </button>
      </form>
    </section>
  );
}

function SchoolAdminPage({
  applicationForm,
  authForm,
  authLoading,
  authMessage,
  authSession,
  cartForm,
  cartEditForm,
  copiedCartId,
  currentApplication,
  deleteCandidateId,
  downloadedCartId,
  editingCartId,
  firebaseReady,
  filter,
  generatedCart,
  managedCarts,
  metrics,
  origin,
  setCartForm,
  setCartEditForm,
  setFilter,
  setGeneratedCartId,
  setApplicationForm,
  setAuthForm,
  schoolApplications,
  superAdminEmail,
  tickets,
  onAdvanceTicket,
  onBeginEditCart,
  onCancelEditCart,
  onCopyCartUrl,
  onCreateCart,
  onDeleteCart,
  onDownloadCartQr,
  onFirebaseGoogleLogin,
  onFirebaseLogin,
  onFirebaseSignOut,
  onSubmitSchoolApplication,
  onUpdateCart,
  onUpdateCartStatus,
}: {
  applicationForm: SchoolApplicationForm;
  authForm: AuthForm;
  authLoading: boolean;
  authMessage: string;
  authSession: AuthSession | null;
  cartForm: CartForm;
  cartEditForm: CartEditForm;
  copiedCartId: string | null;
  currentApplication: SchoolApplication | null;
  deleteCandidateId: string | null;
  downloadedCartId: string | null;
  editingCartId: string | null;
  firebaseReady: boolean;
  filter: (typeof filters)[number];
  generatedCart: Cart | null;
  managedCarts: Cart[];
  metrics: Metric[];
  origin: string;
  setCartForm: (updater: (current: CartForm) => CartForm) => void;
  setCartEditForm: (updater: (current: CartEditForm) => CartEditForm) => void;
  setFilter: (value: (typeof filters)[number]) => void;
  setGeneratedCartId: (value: string) => void;
  setApplicationForm: (
    updater: (current: SchoolApplicationForm) => SchoolApplicationForm,
  ) => void;
  setAuthForm: (updater: (current: AuthForm) => AuthForm) => void;
  schoolApplications: SchoolApplication[];
  superAdminEmail: string;
  tickets: Ticket[];
  onAdvanceTicket: (id: string) => void;
  onBeginEditCart: (cart: Cart) => void;
  onCancelEditCart: () => void;
  onCopyCartUrl: (cart: Cart) => void;
  onCreateCart: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteCart: (cartId: string) => void;
  onDownloadCartQr: (cart: Cart) => void;
  onFirebaseGoogleLogin: () => void;
  onFirebaseLogin: (event: FormEvent<HTMLFormElement>) => void;
  onFirebaseSignOut: () => void;
  onSubmitSchoolApplication: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateCart: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateCartStatus: (cartId: string, status: CartStatus) => void;
}) {
  const hasEnabledSchoolAccess = currentApplication?.status === "已啟用";

  return (
    <>
      <MetricGrid metrics={metrics} label="學校管理概況" />

      <FirebaseAuthPanel
        authForm={authForm}
        authLoading={authLoading}
        authMessage={authMessage}
        authSession={authSession}
        firebaseReady={firebaseReady}
        isSuperAdmin={false}
        loginMethod="google"
        panelTitle="學校 Google 帳號驗證"
        setAuthForm={setAuthForm}
        superAdminEmail={superAdminEmail}
        usage="school"
        onGoogleLogin={onFirebaseGoogleLogin}
        onLogin={onFirebaseLogin}
        onSignOut={onFirebaseSignOut}
      />

      <SchoolApplicationPanel
        applicationForm={applicationForm}
        applications={schoolApplications}
        authSession={authSession}
        currentApplication={currentApplication}
        setApplicationForm={setApplicationForm}
        onSubmit={onSubmitSchoolApplication}
      />

      {!hasEnabledSchoolAccess && (
        <SchoolAccessNotice
          application={currentApplication}
          authSession={authSession}
        />
      )}

      {hasEnabledSchoolAccess && currentApplication && (
        <>
          <SchoolDataSourcePanel
            application={currentApplication}
            cartCount={managedCarts.length}
            ticketCount={tickets.length}
          />

      <section className="admin-section panel" aria-label="推車 QR Code 管理">
        <div className="admin-layout">
          <div>
            <PanelHeader
              eyebrow="管理端"
              title="新增推車並自動產生 QR Code"
              action={<span className="status-chip success">可列印張貼</span>}
            />
            <form className="admin-form" onSubmit={onCreateCart}>
              <div className="admin-form-grid">
                <label>
                  推車編號
                  <input
                    required
                    value={cartForm.id}
                    onChange={(event) =>
                      setCartForm((current) => ({
                        ...current,
                        id: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  推車位置
                  <input
                    required
                    placeholder="例如：D 棟 4F"
                    value={cartForm.label}
                    onChange={(event) =>
                      setCartForm((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  教室或保管位置
                  <input
                    required
                    placeholder="例如：402 多功能教室"
                    value={cartForm.room}
                    onChange={(event) =>
                      setCartForm((current) => ({
                        ...current,
                        room: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  平板數量
                  <input
                    min="1"
                    max="60"
                    type="number"
                    value={cartForm.tabletCount}
                    onChange={(event) =>
                      setCartForm((current) => ({
                        ...current,
                        tabletCount: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <button className="primary-action" type="submit">
                新增推車並產生 QR
              </button>
            </form>
          </div>

          {generatedCart ? (
            <CartQrCard
              cart={generatedCart}
              copied={copiedCartId === generatedCart.id}
              onCopy={() => onCopyCartUrl(generatedCart)}
              url={createRepairUrl(generatedCart, origin)}
            />
          ) : (
            <EmptyQrCard />
          )}
        </div>

        <div className="managed-cart-list" aria-label="推車管理清單">
          <PanelHeader
            eyebrow="推車管理清單"
            title="編輯、刪除與調整推車狀態"
            action={<span className="status-chip success">推車清單</span>}
          />
          <p className="management-note">
            刪除推車會同步移除案件看板中的關聯案件。
          </p>
          {managedCarts.length === 0 ? (
            <div className="empty-state">
              <strong>目前沒有推車資料</strong>
              <p>
                學校設備 Google Sheet 尚未同步到推車資料；新增或同步後會顯示在這裡。
              </p>
            </div>
          ) : (
            managedCarts.map((item) => (
            <article className="managed-cart-row" key={item.id}>
              <div>
                <span>{item.id}</span>
                <strong>{item.label}</strong>
                <small>{item.room}</small>
                <small>{countTicketsForCart(tickets, item)} 件關聯案件</small>
              </div>
              <label className="inline-status-control">
                推車狀態
                <select
                  value={item.status}
                  onChange={(event) =>
                    onUpdateCartStatus(item.id, event.target.value as CartStatus)
                  }
                >
                  {cartStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <code>{createRepairUrl(item, origin) || "網址載入中"}</code>
              <div className="managed-cart-actions">
                <button
                  className="ghost-action"
                  onClick={() => onBeginEditCart(item)}
                  type="button"
                >
                  編輯推車
                </button>
                <button
                  className="ghost-action"
                  disabled={!origin}
                  onClick={() => {
                    setGeneratedCartId(item.id);
                    onCopyCartUrl(item);
                  }}
                  type="button"
                >
                  {copiedCartId === item.id ? "已複製" : "複製網址"}
                </button>
                <button
                  className="qr-download-action"
                  disabled={!origin}
                  onClick={() => {
                    setGeneratedCartId(item.id);
                    onDownloadCartQr(item);
                  }}
                  type="button"
                >
                  {downloadedCartId === item.id ? "已下載" : "下載 QR Code"}
                </button>
                <button
                  className={
                    deleteCandidateId === item.id
                      ? "danger-action pending"
                      : "danger-action"
                  }
                  onClick={() => onDeleteCart(item.id)}
                  type="button"
                >
                  {deleteCandidateId === item.id ? "再按一次刪除" : "刪除推車"}
                </button>
              </div>
              {editingCartId === item.id && (
                <form className="cart-edit-form" onSubmit={onUpdateCart}>
                  <div className="cart-edit-grid">
                    <label>
                      推車位置
                      <input
                        required
                        value={cartEditForm.label}
                        onChange={(event) =>
                          setCartEditForm((current) => ({
                            ...current,
                            label: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      教室或保管位置
                      <input
                        required
                        value={cartEditForm.room}
                        onChange={(event) =>
                          setCartEditForm((current) => ({
                            ...current,
                            room: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      推車狀態
                      <select
                        value={cartEditForm.status}
                        onChange={(event) =>
                          setCartEditForm((current) => ({
                            ...current,
                            status: event.target.value as CartStatus,
                          }))
                        }
                      >
                        {cartStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      健康度
                      <input
                        min="0"
                        max="100"
                        type="number"
                        value={cartEditForm.health}
                        onChange={(event) =>
                          setCartEditForm((current) => ({
                            ...current,
                            health: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      平均電量
                      <input
                        min="0"
                        max="100"
                        type="number"
                        value={cartEditForm.battery}
                        onChange={(event) =>
                          setCartEditForm((current) => ({
                            ...current,
                            battery: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      離線設備
                      <input
                        min="0"
                        max="60"
                        type="number"
                        value={cartEditForm.offline}
                        onChange={(event) =>
                          setCartEditForm((current) => ({
                            ...current,
                            offline: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      平板數量
                      <input
                        min="1"
                        max="60"
                        type="number"
                        value={cartEditForm.tabletCount}
                        onChange={(event) =>
                          setCartEditForm((current) => ({
                            ...current,
                            tabletCount: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="cart-edit-actions">
                    <button className="ghost-action" onClick={onCancelEditCart} type="button">
                      取消
                    </button>
                    <button className="primary-action" type="submit">
                      儲存修改
                    </button>
                  </div>
                </form>
              )}
            </article>
            ))
          )}
        </div>
      </section>

      <section className="operations-grid">
        <TicketBoard
          filter={filter}
          setFilter={setFilter}
          tickets={tickets}
          onAdvanceTicket={onAdvanceTicket}
        />

        <aside className="panel timeline-panel" aria-label="今日維修進度">
          <PanelHeader eyebrow="今日排程" title="維修進度" />
          <MaintenanceTimeline tickets={tickets} />
        </aside>
      </section>

      <section className="operations-grid">
        <section className="cart-section" aria-label="推車健康度">
          <PanelHeader eyebrow="設備狀態" title="推車健康度" />
          <CartGrid carts={managedCarts} />
        </section>

        <aside className="panel governance-panel" aria-label="學校管理設定">
          <PanelHeader eyebrow="設定" title="學校管理權限" />
          <div className="status-list">
            <div className="status-line">
              <div>
                <strong>資訊組管理者</strong>
                <span>3 位已啟用</span>
              </div>
              <span className="status-chip success">正常</span>
            </div>
            <div className="status-line">
              <div>
                <strong>維修廠商窗口</strong>
                <span>1 位等待確認</span>
              </div>
              <span className="status-chip status-待料">待確認</span>
            </div>
            <div className="status-line">
              <div>
                <strong>QR 張貼清單</strong>
                <span>{managedCarts.length} 台推車</span>
              </div>
              <span className="status-chip success">已同步</span>
            </div>
          </div>
        </aside>
      </section>
        </>
      )}
    </>
  );
}

function FirebaseAuthPanel({
  authForm,
  authLoading,
  authMessage,
  authSession,
  firebaseReady,
  isSuperAdmin,
  loginMethod,
  panelTitle,
  setAuthForm,
  superAdminEmail,
  usage = "super",
  onGoogleLogin,
  onLogin,
  onSignOut,
}: {
  authForm: AuthForm;
  authLoading: boolean;
  authMessage: string;
  authSession: AuthSession | null;
  firebaseReady: boolean;
  isSuperAdmin: boolean;
  loginMethod: "google" | "password";
  panelTitle: string;
  setAuthForm: (updater: (current: AuthForm) => AuthForm) => void;
  superAdminEmail: string;
  usage?: "school" | "super";
  onGoogleLogin?: () => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onSignOut: () => void;
}) {
  const statusLabel = authLoading
    ? "確認中"
    : firebaseReady
      ? "已連線"
      : "待設定";
  const statusClass = firebaseReady ? "status-chip success" : "status-chip";
  const accountRoleLabel =
    usage === "super"
      ? isSuperAdmin
        ? "超級管理者"
        : "非超管白名單"
      : "學校申請者";
  const statusLineLabel =
    usage === "super" ? "超管白名單" : "Google 驗證信箱";
  const statusLineValue =
    usage === "super"
      ? superAdminEmail
      : authSession?.email ?? "尚未完成 Google 驗證";
  const statusLineBadge = usage === "super" ? "已設定" : authSession ? "已驗證" : "待驗證";
  const statusLineClass =
    usage === "super" || authSession
      ? "status-chip success"
      : "status-chip status-待派工";
  const googleButtonText =
    usage === "school" ? "使用 Google 驗證帳號" : "使用 Google 登入";

  return (
    <section className="auth-section panel" aria-label={panelTitle}>
      <PanelHeader
        eyebrow="Firebase Auth"
        title={panelTitle}
        action={
          <span className={statusClass}>{statusLabel}</span>
        }
      />

      {authSession ? (
        <div className="auth-account-row">
          <div>
            <span>目前登入</span>
            <strong>{authSession.email}</strong>
            <small>
              {accountRoleLabel}｜UID {authSession.uid}
            </small>
          </div>
          <button
            className="ghost-action"
            disabled={authLoading}
            onClick={onSignOut}
            type="button"
          >
            登出
          </button>
        </div>
      ) : loginMethod === "google" ? (
        <div className="google-auth-box">
          <button
            className="primary-action"
            disabled={!firebaseReady || authLoading}
            onClick={onGoogleLogin}
            type="button"
          >
            {authLoading ? "前往 Google" : googleButtonText}
          </button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={onLogin}>
          <label>
            登入信箱
            <input
              required
              type="email"
              value={authForm.email}
              onChange={(event) =>
                setAuthForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
          </label>
          <label>
            密碼
            <input
              required
              minLength={8}
              type="password"
              value={authForm.password}
              onChange={(event) =>
                setAuthForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
            />
          </label>
          <button
            className="primary-action"
            disabled={!firebaseReady || authLoading}
            type="submit"
          >
            {authLoading ? "登入中" : "登入"}
          </button>
        </form>
      )}

      <div className="auth-status-list">
        <div className="status-line">
          <div>
            <strong>{statusLineLabel}</strong>
            <span>{statusLineValue}</span>
          </div>
          <span className={statusLineClass}>{statusLineBadge}</span>
        </div>
        {authMessage && <p className="auth-message">{authMessage}</p>}
      </div>
    </section>
  );
}

function SchoolApplicationPanel({
  applicationForm,
  applications,
  authSession,
  currentApplication,
  setApplicationForm,
  onSubmit,
}: {
  applicationForm: SchoolApplicationForm;
  applications: SchoolApplication[];
  authSession: AuthSession | null;
  currentApplication: SchoolApplication | null;
  setApplicationForm: (
    updater: (current: SchoolApplicationForm) => SchoolApplicationForm,
  ) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (currentApplication?.status === "已啟用") {
    return null;
  }

  const visibleApplications = authSession
    ? applications.filter(
        (application) =>
          application.adminEmail.toLowerCase() ===
          authSession.email.toLowerCase(),
      )
    : [];
  const recentApplications = visibleApplications.slice(0, 3);
  const sheetReady = Boolean(getSafeSheetUrl(applicationForm.sheetUrl));
  const canSubmit = Boolean(
    authSession && sheetReady && applicationForm.schoolName.trim(),
  );

  if (currentApplication?.status === "待審核") {
    return (
      <section className="application-section panel" aria-label="學校申請狀態">
        <div className="application-layout">
          <div>
            <PanelHeader
              eyebrow="學校端"
              title="申請已送出"
              action={
                <ApplicationStatusBadge status={currentApplication.status} />
              }
            />
            <p className="management-note">
              超管啟用帳號後，推車管理與案件看板才會開放。
            </p>
          </div>

          <aside className="application-status-card" aria-label="目前申請狀態">
            <span>目前狀態</span>
            <h3>等待超管啟用</h3>
            <div className="application-list">
              <article className="application-mini-row">
                <div>
                  <strong>{currentApplication.schoolName}</strong>
                  <small>{currentApplication.adminEmail}</small>
                </div>
                <ApplicationStatusBadge status={currentApplication.status} />
              </article>
            </div>
            <a
              className="sheet-link"
              href={currentApplication.sheetUrl}
              rel="noreferrer"
              target="_blank"
            >
              開啟學校設備表
            </a>
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className="application-section panel" aria-label="學校端申請使用">
      <div className="application-layout">
        <div>
          <PanelHeader
            eyebrow="學校端"
            title="學校端申請使用"
            action={
              <span
                className={canSubmit ? "status-chip success" : "status-chip"}
              >
                {currentApplication?.status === "退回補件"
                  ? "需補件"
                  : canSubmit
                    ? "可送出"
                    : "待完成驗證"}
              </span>
            }
          />
          <p className="management-note">
            {currentApplication?.status === "退回補件"
              ? "請更新學校名稱或 Google Sheet 網址後重新送出。"
              : "Google 帳號驗證與 Sheet 網址都完成後，才會送出申請。"}
          </p>
          <form className="application-form" onSubmit={onSubmit}>
            <div className="application-form-grid">
              <label>
                學校名稱
                <input
                  required
                  value={applicationForm.schoolName}
                  onChange={(event) =>
                    setApplicationForm((current) => ({
                      ...current,
                      schoolName: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Google 驗證信箱
                <input
                  readOnly
                  value={authSession?.email ?? "請先使用 Google 驗證帳號"}
                />
              </label>
              <label>
                學校設備 Google Sheet 網址
                <input
                  required
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  type="url"
                  value={applicationForm.sheetUrl}
                  onChange={(event) =>
                    setApplicationForm((current) => ({
                      ...current,
                      sheetUrl: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <button
              className="primary-action"
              disabled={!canSubmit}
              type="submit"
            >
              送出申請
            </button>
          </form>
        </div>

        <aside className="application-status-card" aria-label="申請狀態">
          <span>申請狀態</span>
          <h3>
            {currentApplication?.status === "退回補件"
              ? "退回補件"
              : "等待超管啟用"}
          </h3>
          <div className="application-list">
            {recentApplications.length === 0 ? (
              <div className="empty-state">
                <strong>尚無送出紀錄</strong>
                <p>送出申請後，最新狀態會顯示在這裡。</p>
              </div>
            ) : (
              recentApplications.map((application) => (
                <article className="application-mini-row" key={application.id}>
                  <div>
                    <strong>{application.schoolName}</strong>
                    <small>{application.adminEmail}</small>
                  </div>
                  <ApplicationStatusBadge status={application.status} />
                </article>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function SchoolAccessNotice({
  application,
  authSession,
}: {
  application: SchoolApplication | null;
  authSession: AuthSession | null;
}) {
  const title = !authSession
    ? "請先完成 Google 帳號驗證"
    : application?.status === "待審核"
      ? "等待超管啟用帳號"
      : application?.status === "退回補件"
        ? "請補齊申請資料"
        : "請先送出學校申請";
  const detail = !authSession
    ? "使用學校管理者的 Google 帳號登入後，再提供學校設備 Google Sheet 網址。"
    : application?.status === "待審核"
      ? "申請通過前，不會顯示推車管理、QR Code 或案件看板。"
      : application?.status === "退回補件"
        ? "請依超管退回原因修正資料，重新送出後再等待啟用。"
        : "Google 帳號驗證與學校設備表網址完成後，送出申請讓超管審核。";

  return (
    <section className="panel school-access-panel" aria-label="學校管理啟用狀態">
      <PanelHeader
        eyebrow="管理權限"
        title={title}
        action={
          application ? (
            <ApplicationStatusBadge status={application.status} />
          ) : (
            <span className="status-chip status-待派工">尚未啟用</span>
          )
        }
      />
      <div className="empty-state">
        <strong>管理畫面已鎖定</strong>
        <p>{detail}</p>
      </div>
    </section>
  );
}

function SchoolDataSourcePanel({
  application,
  cartCount,
  ticketCount,
}: {
  application: SchoolApplication;
  cartCount: number;
  ticketCount: number;
}) {
  const isEmpty = cartCount === 0 && ticketCount === 0;

  return (
    <section className="panel school-source-panel" aria-label="學校資料來源">
      <PanelHeader
        eyebrow="資料來源"
        title={`${application.schoolName} 已啟用`}
        action={<span className="status-chip success">依資料表顯示</span>}
      />
      <div className="status-list">
        <div className="status-line">
          <div>
            <strong>學校設備 Google Sheet</strong>
            <span>{application.adminEmail}</span>
          </div>
          <a
            className="sheet-link"
            href={application.sheetUrl}
            rel="noreferrer"
            target="_blank"
          >
            開啟資料表
          </a>
        </div>
        <div className="status-line">
          <div>
            <strong>{cartCount} 台推車</strong>
            <span>{ticketCount} 件案件</span>
          </div>
          <span
            className={
              isEmpty ? "status-chip status-待料" : "status-chip success"
            }
          >
            {isEmpty ? "目前空白" : "已載入"}
          </span>
        </div>
      </div>
    </section>
  );
}

function SuperAdminPage({
  authForm,
  authLoading,
  authMessage,
  authSession,
  firebaseReady,
  filter,
  isSuperAdmin,
  metrics,
  schoolApplications,
  setAuthForm,
  setFilter,
  superAdminEmail,
  onAdvanceTicket,
  onFirebaseGoogleLogin,
  onFirebaseLogin,
  onFirebaseSignOut,
  onUpdateApplicationStatus,
}: {
  authForm: AuthForm;
  authLoading: boolean;
  authMessage: string;
  authSession: AuthSession | null;
  firebaseReady: boolean;
  filter: (typeof filters)[number];
  isSuperAdmin: boolean;
  metrics: Metric[];
  schoolApplications: SchoolApplication[];
  setAuthForm: (updater: (current: AuthForm) => AuthForm) => void;
  setFilter: (value: (typeof filters)[number]) => void;
  superAdminEmail: string;
  onAdvanceTicket: (id: string) => void;
  onFirebaseGoogleLogin: () => void;
  onFirebaseLogin: (event: FormEvent<HTMLFormElement>) => void;
  onFirebaseSignOut: () => void;
  onUpdateApplicationStatus: (
    applicationId: string,
    status: ApplicationStatus,
  ) => void;
}) {
  const pendingCount = schoolApplications.filter(
    (application) => application.status === "待審核",
  ).length;
  const enabledCount = schoolApplications.filter(
    (application) => application.status === "已啟用",
  ).length;
  const schoolStatusRows = getSchoolStatusRows(schoolApplications);
  const crossSchoolTickets: Ticket[] = [];
  const accessNotice = getSuperAdminAccessNotice({
    authLoading,
    authSession,
    firebaseReady,
    isSuperAdmin,
  });

  return (
    <>
      <FirebaseAuthPanel
        authForm={authForm}
        authLoading={authLoading}
        authMessage={authMessage}
        authSession={authSession}
        firebaseReady={firebaseReady}
        isSuperAdmin={isSuperAdmin}
        loginMethod="google"
        panelTitle="超管 Firebase 登入"
        setAuthForm={setAuthForm}
        superAdminEmail={superAdminEmail}
        onGoogleLogin={onFirebaseGoogleLogin}
        onLogin={onFirebaseLogin}
        onSignOut={onFirebaseSignOut}
      />

      {accessNotice ? (
        <section className="super-guard-panel panel" aria-label="超管登入保護">
          <PanelHeader
            eyebrow={accessNotice.eyebrow}
            title={accessNotice.title}
            action={
              <span className={accessNotice.badgeClass}>
                {accessNotice.badge}
              </span>
            }
          />
          <div className="empty-state">
            <strong>{accessNotice.heading}</strong>
            <p>{accessNotice.detail}</p>
          </div>
        </section>
      ) : (
        <>
          <MetricGrid metrics={metrics} label="超管平台概況" />

          <section className="super-layout">
            <section
              className="panel application-review-panel"
              aria-label="學校申請審核"
            >
              <PanelHeader
                eyebrow="學校申請"
                title="學校申請審核"
                action={
                  <span className="status-chip status-待派工">
                    {pendingCount} 件待審核
                  </span>
                }
              />
              <div className="application-review-list">
                {schoolApplications.length === 0 ? (
                  <div className="empty-state">
                    <strong>目前尚無學校申請</strong>
                    <p>
                      學校管理者完成 Google 帳號驗證並送出設備 Google Sheet
                      後，申請才會出現在這裡。
                    </p>
                  </div>
                ) : (
                  schoolApplications.map((application) => {
                    const sheetUrl = getSafeSheetUrl(application.sheetUrl);

                    return (
                      <article
                        className="application-review-row"
                        key={application.id}
                      >
                        <div>
                          <span>{application.id}</span>
                          <h3>{application.schoolName}</h3>
                          <p>{application.adminEmail}</p>
                          <small>{application.submittedAt}</small>
                        </div>
                        <div>
                          <ApplicationStatusBadge status={application.status} />
                          <p>{application.note}</p>
                          <a
                            className="sheet-link"
                            href={sheetUrl || MAIN_DATABASE_SHEET_URL}
                            rel="noreferrer"
                            target="_blank"
                          >
                            開啟設備表
                          </a>
                        </div>
                        <div className="application-actions">
                          <button
                            className="primary-action"
                            disabled={application.status === "已啟用"}
                            onClick={() =>
                              onUpdateApplicationStatus(application.id, "已啟用")
                            }
                            type="button"
                          >
                            啟用帳號
                          </button>
                          <button
                            className="ghost-action"
                            disabled={application.status === "退回補件"}
                            onClick={() =>
                              onUpdateApplicationStatus(
                                application.id,
                                "退回補件",
                              )
                            }
                            type="button"
                          >
                            退回補件
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>

            <aside
              className="panel data-source-panel"
              aria-label="Google Sheet 主資料庫"
            >
              <PanelHeader
                eyebrow="資料庫"
                title="Google Sheet 主資料庫"
                action={<span className="status-chip success">已指定</span>}
              />
              <div className="status-list">
                <div className="status-line">
                  <div>
                    <strong>超管帳號</strong>
                    <span>目前身分：超級管理者</span>
                  </div>
                  <span className="status-chip success">啟用中</span>
                </div>
                <div className="status-line">
                  <div>
                    <strong>主資料分頁</strong>
                    <span>{MAIN_DATABASE_SHEET_NAME}</span>
                  </div>
                  <span className="status-chip success">已讀取</span>
                </div>
                <div className="status-line">
                  <div>
                    <strong>主資料庫網址</strong>
                    <a
                      className="sheet-link"
                      href={MAIN_DATABASE_SHEET_URL}
                      rel="noreferrer"
                      target="_blank"
                    >
                      開啟主資料庫
                    </a>
                  </div>
                  <span className="status-chip status-待料">待接寫入</span>
                </div>
              </div>
            </aside>
          </section>

          <section className="super-layout">
            <section
              className="panel school-status-panel"
              aria-label="各校系統狀態"
            >
              <PanelHeader
                eyebrow="跨校總覽"
                title="各校系統狀態"
                action={
                  <span className="status-chip success">
                    {enabledCount} 校已啟用
                  </span>
                }
              />
              {schoolStatusRows.length === 0 ? (
                <div className="empty-state">
                  <strong>尚無已啟用學校</strong>
                  <p>
                    學校申請通過後，這裡才會顯示該校設備表讀取狀態、
                    推車數與管理者狀態。
                  </p>
                </div>
              ) : (
                <div className="school-table-wrap">
                  <table className="school-table">
                    <thead>
                      <tr>
                        <th>學校</th>
                        <th>區域</th>
                        <th>管理者</th>
                        <th>推車</th>
                        <th>待處理</th>
                        <th>高優先</th>
                        <th>可用率</th>
                        <th>狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schoolStatusRows.map((school) => (
                        <tr key={school.id}>
                          <td>
                            <strong>{school.name}</strong>
                            <span>{school.id}</span>
                          </td>
                          <td>{school.district}</td>
                          <td>{school.admins} 位</td>
                          <td>
                            {school.carts} 台
                            <small>{school.warningCarts} 台需檢查</small>
                          </td>
                          <td>{school.activeTickets} 件</td>
                          <td>{school.highPriority} 件</td>
                          <td>{school.uptime}</td>
                          <td>
                            <span
                              className={`status-chip status-${school.status}`}
                            >
                              {school.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <aside className="panel governance-panel" aria-label="平台治理">
              <PanelHeader eyebrow="治理" title="平台管理清單" />
              <div className="status-list">
                <div className="status-line">
                  <div>
                    <strong>全域角色</strong>
                    <span>超管、學校管理者、使用者</span>
                  </div>
                  <span className="status-chip success">已建立</span>
                </div>
                <div className="status-line">
                  <div>
                    <strong>待補管理者</strong>
                    <span>
                      {enabledCount === 0
                        ? "尚無學校帳號啟用"
                        : "依各校設備表檢查校內管理員"}
                    </span>
                  </div>
                  <span className="status-chip status-待派工">
                    {enabledCount === 0 ? "等待申請" : "需處理"}
                  </span>
                </div>
                <div className="status-line">
                  <div>
                    <strong>QR 規則</strong>
                    <span>所有 QR 統一導向使用者頁面</span>
                  </div>
                  <span className="status-chip success">已套用</span>
                </div>
              </div>
            </aside>
          </section>

          <section className="operations-grid">
            <TicketBoard
              filter={filter}
              setFilter={setFilter}
              tickets={crossSchoolTickets}
              title="跨校案件看板"
              onAdvanceTicket={onAdvanceTicket}
            />

            <aside className="panel timeline-panel" aria-label="超管處理建議">
              <PanelHeader eyebrow="優先事項" title="今日需要追蹤" />
              {schoolApplications.length === 0 ? (
                <div className="empty-state">
                  <strong>尚無追蹤事項</strong>
                  <p>
                    學校端送出申請後，這裡會整理待審核、啟用與資料接入提醒。
                  </p>
                </div>
              ) : (
                <ol className="timeline">
                  <li>
                    <span>審核</span>
                    <strong>{pendingCount} 件學校申請待確認</strong>
                    <p>請確認管理者信箱與學校設備 Google Sheet 權限。</p>
                  </li>
                  <li>
                    <span>資料</span>
                    <strong>{enabledCount} 校已啟用</strong>
                    <p>設備表讀寫功能接上後，跨校狀態會從主資料庫同步。</p>
                  </li>
                </ol>
              )}
            </aside>
          </section>
        </>
      )}
    </>
  );
}

function getSuperAdminAccessNotice({
  authLoading,
  authSession,
  firebaseReady,
  isSuperAdmin,
}: {
  authLoading: boolean;
  authSession: AuthSession | null;
  firebaseReady: boolean;
  isSuperAdmin: boolean;
}) {
  if (authLoading) {
    return {
      badge: "確認中",
      badgeClass: "status-chip status-待料",
      detail: "登入狀態確認完成前，超管儀表板與跨校資料會保持隱藏。",
      eyebrow: "登入保護",
      heading: "正在確認超管登入狀態",
      title: "請稍候",
    };
  }

  if (!firebaseReady) {
    return {
      badge: "待設定",
      badgeClass: "status-chip status-待設定",
      detail:
        "Firebase Auth 尚未連線，請先完成 Firebase Web App 設定後再登入超管帳號。",
      eyebrow: "登入保護",
      heading: "超管頁面需要先登入",
      title: "請先完成登入設定",
    };
  }

  if (!authSession) {
    return {
      badge: "已鎖定",
      badgeClass: "status-chip status-待派工",
      detail:
        "請使用超管信箱登入。登入通過前，不會顯示學校申請、各校狀態或跨校案件。",
      eyebrow: "登入保護",
      heading: "超管功能需要登入後才能使用",
      title: "請先登入超管帳號",
    };
  }

  if (!isSuperAdmin) {
    return {
      badge: "無權限",
      badgeClass: "status-chip status-待設定",
      detail:
        "目前登入信箱不在超管白名單內，請登出後改用超管信箱登入。",
      eyebrow: "權限檢查",
      heading: "此帳號沒有超管權限",
      title: "無法進入超管功能",
    };
  }

  return null;
}

function MaintenanceTimeline({ tickets }: { tickets: Ticket[] }) {
  const activeTickets = tickets
    .filter((ticket) => ticket.status !== "已完成")
    .slice(0, 4);

  if (activeTickets.length === 0) {
    return (
      <div className="empty-state">
        <strong>目前沒有待處理維修案件</strong>
        <p>案件看板若沒有待派工、維修中或待料項目，這裡會保持清空。</p>
      </div>
    );
  }

  return (
    <ol className="timeline">
      {activeTickets.map((ticket) => (
        <li key={ticket.id}>
          <span>{formatTimelineTime(ticket.reportedAt)}</span>
          <strong>{getTimelineTitle(ticket)}</strong>
          <p>{getTimelineDetail(ticket)}</p>
        </li>
      ))}
    </ol>
  );
}

function TicketBoard({
  filter,
  setFilter,
  tickets,
  title = "案件看板",
  onAdvanceTicket,
}: {
  filter: (typeof filters)[number];
  setFilter: (value: (typeof filters)[number]) => void;
  tickets: Ticket[];
  title?: string;
  onAdvanceTicket: (id: string) => void;
}) {
  const filteredTickets =
    filter === "全部"
      ? tickets
      : tickets.filter((ticket) => ticket.status === filter);

  return (
    <section className="panel ticket-panel" aria-label={title}>
      <PanelHeader
        eyebrow={title}
        title={`${filteredTickets.length} 件案件`}
        action={
          <button className="ghost-action" type="button">
            匯出清單
          </button>
        }
      />

      <div className="filter-row" aria-label="案件篩選">
        {filters.map((item) => (
          <button
            aria-pressed={filter === item}
            className={filter === item ? "active" : ""}
            key={item}
            onClick={() => setFilter(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      <div className="ticket-list">
        {filteredTickets.length === 0 ? (
          <div className="empty-state">
            <strong>
              {filter === "全部" ? "目前沒有案件" : "沒有符合篩選的案件"}
            </strong>
            <p>
              新案件建立或同步進主資料庫後，會依狀態出現在這個看板。
            </p>
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <article className="ticket-row" key={ticket.id}>
              <div className="ticket-main">
                <div className="ticket-meta">
                  <span>{ticket.id}</span>
                  <PriorityBadge priority={ticket.priority} />
                  <StatusBadge status={ticket.status} />
                </div>
                <h3>{ticket.cart}</h3>
                <p>{ticket.issue}</p>
              </div>
              <div className="ticket-side">
                <span>{ticket.room}</span>
                <span>{ticket.reportedAt}</span>
                <strong>{ticket.owner}</strong>
                <button
                  disabled={ticket.status === "已完成"}
                  onClick={() => onAdvanceTicket(ticket.id)}
                  type="button"
                >
                  {ticket.status === "已完成" ? "已結案" : "更新進度"}
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function MetricGrid({ label, metrics }: { label: string; metrics: Metric[] }) {
  return (
    <section className="metric-grid" aria-label={label}>
      {metrics.map((metric) => (
        <article className="metric-card" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <p>{metric.detail}</p>
        </article>
      ))}
    </section>
  );
}

function RoleEntry({
  description,
  href,
  label,
  title,
}: {
  description: string;
  href: string;
  label: string;
  title: string;
}) {
  return (
    <article className="role-card">
      <span>{label}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <a className="card-link" href={href}>
        進入頁面
      </a>
    </article>
  );
}

function PanelHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-header">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function CartQrCard({
  cart,
  copied,
  onCopy,
  url,
}: {
  cart: Cart;
  copied: boolean;
  onCopy: () => void;
  url: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let isActive = true;

    if (!url) {
      return () => {
        isActive = false;
      };
    }

    void createQrDataUrl(url).then((nextUrl) => {
      if (isActive) {
        setQrDataUrl(nextUrl);
      }
    });

    return () => {
      isActive = false;
    };
  }, [url]);

  return (
    <article className="qr-card">
      <div>
        <span>最新 QR Code</span>
        <h3>{cart.label}</h3>
        <p>{cart.room}</p>
      </div>
      <div className="qr-frame">
        {qrDataUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- QR is a client-generated data URL. */
          <img alt={`${cart.label} 報修 QR Code`} src={qrDataUrl} />
        ) : (
          <span>產生中</span>
        )}
      </div>
      <div className="url-box">{url || "網址載入中"}</div>
      <div className="qr-actions">
        <button className="ghost-action" onClick={onCopy} type="button">
          {copied ? "已複製網址" : "複製網址"}
        </button>
        <a
          aria-disabled={!qrDataUrl}
          className={qrDataUrl ? "download-link" : "download-link disabled"}
          download={`${cart.id}-repair-qr.png`}
          href={qrDataUrl || undefined}
        >
          下載 QR
        </a>
      </div>
    </article>
  );
}

function EmptyQrCard() {
  return (
    <article className="qr-card empty-qr-card">
      <div>
        <span>最新 QR Code</span>
        <h3>尚無推車</h3>
        <p>資料表尚未提供推車資料，或尚未新增第一台推車。</p>
      </div>
      <div className="qr-frame">
        <span>等待推車資料</span>
      </div>
      <div className="url-box">新增推車後會自動產生網址</div>
      <div className="qr-actions">
        <button className="ghost-action" disabled type="button">
          複製網址
        </button>
        <span aria-disabled="true" className="download-link disabled">
          下載 QR
        </span>
      </div>
    </article>
  );
}

function CartGrid({ carts }: { carts: Cart[] }) {
  if (carts.length === 0) {
    return (
      <div className="cart-grid">
        <div className="empty-state">
          <strong>目前沒有推車資料</strong>
          <p>學校設備 Google Sheet 沒有資料時，這裡會保持空白。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-grid">
      {carts.map((item) => (
        <article className="cart-tile" key={item.id}>
          <div className="cart-tile-header">
            <div>
              <span>{item.id}</span>
              <h3>{item.label}</h3>
            </div>
            <StatusPill status={item.status} />
          </div>
          <div className="slot-map" aria-label={`${item.label} 插槽狀態`}>
            {item.slots.map((slot, index) => (
              <span className={slot} key={`${item.id}-${index}`} />
            ))}
          </div>
          <Meter label="健康度" value={item.health} />
          <Meter label="平均電量" value={item.battery} />
          <p>離線設備：{item.offline} 台</p>
        </article>
      ))}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priority-badge priority-${priority}`}>{priority}</span>;
}

function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`status-chip status-${status}`}>{status}</span>;
}

function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return <span className={`status-chip status-${status}`}>{status}</span>;
}

function StatusPill({ status }: { status: Cart["status"] }) {
  return <span className={`status-pill status-${status}`}>{status}</span>;
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter">
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <progress max="100" value={value}>
        {value}%
      </progress>
    </div>
  );
}

function formatTimelineTime(reportedAt: string) {
  const timeMatch = reportedAt.match(/\d{2}:\d{2}/);
  return timeMatch?.[0] ?? reportedAt;
}

function getTimelineTitle(ticket: Ticket) {
  const statusAction: Record<TicketStatus, string> = {
    待派工: "等待派工確認",
    維修中: "維修處理中",
    待料: "等待零件或廠商",
    已完成: "已完成結案",
  };

  return `${ticket.cartId} ${statusAction[ticket.status]}`;
}

function getTimelineDetail(ticket: Ticket) {
  return `${ticket.cart}｜${ticket.room}｜${ticket.issue}`;
}

function getCartSlotSummary(cart: Cart) {
  const warning = cart.slots.filter((slot) => slot === "warning").length;
  const offline = cart.slots.filter((slot) => slot === "offline").length;
  const total = cart.slots.length;

  return {
    available: Math.max(total - warning - offline, 0),
    offline,
    total,
    warning,
  };
}

function getActiveTicketsForCart(tickets: Ticket[], cart: Cart) {
  return tickets.filter(
    (ticket) =>
      ticket.status !== "已完成" && ticketBelongsToCart(ticket, cart),
  );
}

function createReportId(nextIndex: number) {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `R-${year}-${month}${day}-${String(nextIndex).padStart(3, "0")}`;
}

function createCurrentReportTime() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");

  return `${month}/${day} ${hour}:${minute}`;
}

function createUserRecordIssue(
  recordType: UserRecordType,
  description: string,
  photoName?: string,
) {
  return [
    recordType,
    description,
    photoName ? `照片：${photoName}` : "未附照片",
  ].join("｜");
}

function getUserRecordPriority(recordType: UserRecordType): Priority {
  return recordType === "未照號碼擺放" ? "低" : "中";
}

function getSchoolMetrics(tickets: Ticket[], carts: Cart[]): Metric[] {
  const active = tickets.filter((ticket) => ticket.status !== "已完成");
  return [
    {
      label: "待處理案件",
      value: active.length.toString(),
      detail: "今日值班：資訊組",
    },
    {
      label: "高優先級",
      value: tickets
        .filter(
          (ticket) => ticket.priority === "高" && ticket.status !== "已完成",
        )
        .length.toString(),
      detail: "需先派工確認",
    },
    {
      label: "可借用推車",
      value: carts.filter((item) => item.status === "可借用").length.toString(),
      detail: `全校 ${carts.length} 台`,
    },
    {
      label: "平均回應",
      value: "1.8h",
      detail: "近 7 日",
    },
  ];
}

function getUserMetrics(tickets: Ticket[], carts: Cart[]): Metric[] {
  const active = tickets.filter((ticket) => ticket.status !== "已完成");
  return [
    {
      label: "目前異常",
      value: active.length.toString(),
      detail: "掃 QR 先確認是否已回報",
    },
    {
      label: "可借用推車",
      value: carts.filter((item) => item.status === "可借用").length.toString(),
      detail: `全校 ${carts.length} 台`,
    },
    {
      label: "維修完成",
      value: tickets
        .filter((ticket) => ticket.status === "已完成")
        .length.toString(),
      detail: "管理者完成後可重置",
    },
    {
      label: "照片紀錄",
      value: tickets
        .filter((ticket) => ticket.issue.includes("照片："))
        .length.toString(),
      detail: "拍照後自動帶入時間",
    },
  ];
}

function getSuperMetrics(applications: SchoolApplication[]): Metric[] {
  const schoolStatusRows = getSchoolStatusRows(applications);
  const activeTickets = schoolStatusRows.reduce(
    (sum, school) => sum + school.activeTickets,
    0,
  );
  const warningCarts = schoolStatusRows.reduce(
    (sum, school) => sum + school.warningCarts,
    0,
  );
  const totalCarts = schoolStatusRows.reduce(
    (sum, school) => sum + school.carts,
    0,
  );
  const highPriority = schoolStatusRows.reduce(
    (sum, school) => sum + school.highPriority,
    0,
  );
  const pendingApplications = applications.filter(
    (application) => application.status === "待審核",
  ).length;
  const enabledApplications = applications.filter(
    (application) => application.status === "已啟用",
  ).length;

  return [
    {
      label: "待審核申請",
      value: pendingApplications.toString(),
      detail: "學校端註冊等待超管",
    },
    {
      label: "已啟用學校",
      value: enabledApplications.toString(),
      detail: "已登錄設備 Google Sheet",
    },
    {
      label: "總推車數",
      value: totalCarts.toString(),
      detail: `${warningCarts} 台需檢查`,
    },
    {
      label: "跨校待處理",
      value: activeTickets.toString(),
      detail: "含待派工、維修中、待料",
    },
    {
      label: "高優先案件",
      value: highPriority.toString(),
      detail: "今日需追蹤",
    },
  ];
}

function getSchoolStatusRows(
  applications: SchoolApplication[],
): SchoolStatus[] {
  return applications
    .filter((application) => application.status === "已啟用")
    .map((application) => ({
      id: application.id.replace(/^APP-/, "SCH-"),
      name: application.schoolName,
      district: "待同步",
      admins: 1,
      carts: 0,
      warningCarts: 0,
      activeTickets: 0,
      highPriority: 0,
      uptime: "待同步",
      status: "待設定",
    }));
}

function createEmptyApplicationForm(): SchoolApplicationForm {
  return {
    schoolName: "",
    sheetUrl: "",
  };
}

function createEmptyAuthForm(): AuthForm {
  return {
    email: "",
    password: "",
  };
}

function createAuthSession(user: User): AuthSession {
  return {
    uid: user.uid,
    email: user.email ?? "未提供信箱",
  };
}

function createGoogleProvider(loginHint?: string) {
  const provider = new GoogleAuthProvider();
  const customParameters: Record<string, string> = {
    prompt: "select_account",
  };

  if (loginHint) {
    customParameters.login_hint = loginHint;
  }

  provider.setCustomParameters(customParameters);
  return provider;
}

function getCurrentSchoolApplication(
  applications: SchoolApplication[],
  authSession: AuthSession | null,
) {
  const email = authSession?.email.toLowerCase();
  if (!email) {
    return null;
  }

  const matches = applications.filter(
    (application) => application.adminEmail.toLowerCase() === email,
  );

  return (
    matches.find((application) => application.status === "已啟用") ??
    matches.find((application) => application.status === "待審核") ??
    matches[0] ??
    null
  );
}

function createApplicationId(nextIndex: number) {
  return `APP-ILC-${String(nextIndex).padStart(3, "0")}`;
}

function getApplicationStatusNote(status: ApplicationStatus) {
  const notes: Record<ApplicationStatus, string> = {
    待審核: "等待超管啟用帳號",
    已啟用: "帳號已啟用，設備表已登錄",
    退回補件: "退回學校端補齊資料",
  };

  return notes[status];
}

function getFirebaseAuthErrorMessage(error: unknown) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";

  const messages: Record<string, string> = {
    "auth/email-already-in-use": "這個信箱已經註冊，請改用登入。",
    "auth/invalid-email": "信箱格式不正確。",
    "auth/invalid-credential": "登入資料不正確，請確認信箱與密碼。",
    "auth/missing-password": "請輸入密碼。",
    "auth/operation-not-allowed": "Firebase 尚未啟用這個登入方式。",
    "auth/popup-blocked": "瀏覽器封鎖了 Google 登入視窗，請允許彈出視窗後再試。",
    "auth/popup-closed-by-user": "Google 登入視窗已關閉，請再試一次。",
    "auth/redirect-cancelled-by-user": "Google 登入流程已取消，請再試一次。",
    "auth/unauthorized-domain":
      "Firebase 尚未允許目前網站網域登入，請把 Cloudflare 網域加入 Authorized domains。",
    "auth/weak-password": "密碼強度不足，請至少使用 8 個字元。",
  };

  return messages[code] ?? "Firebase 登入發生錯誤，請稍後再試。";
}

function createCartEditForm(cart: Cart): CartEditForm {
  return {
    label: cart.label,
    room: cart.room,
    status: cart.status,
    health: String(cart.health),
    battery: String(cart.battery),
    offline: String(cart.offline),
    tabletCount: String(cart.slots.length),
  };
}

function createEmptyCartEditForm(): CartEditForm {
  return {
    label: "",
    room: "",
    status: "可借用",
    health: "100",
    battery: "100",
    offline: "0",
    tabletCount: "30",
  };
}

function updateCartFromEditForm(cart: Cart, form: CartEditForm): Cart {
  const tabletCount = clampInteger(
    form.tabletCount,
    1,
    60,
    cart.slots.length,
  );
  const offline = clampInteger(form.offline, 0, tabletCount, cart.offline);
  const status = isCartStatus(form.status) ? form.status : cart.status;

  return {
    ...cart,
    label: form.label.trim() || cart.label,
    room: form.room.trim() || cart.room,
    status,
    health: clampInteger(form.health, 0, 100, cart.health),
    battery: clampInteger(form.battery, 0, 100, cart.battery),
    offline,
    slots: createSlotsForCart(tabletCount, status, offline),
  };
}

function countTicketsForCart(tickets: Ticket[], cart: Pick<Cart, "id" | "label">) {
  return tickets.filter((ticket) => ticketBelongsToCart(ticket, cart)).length;
}

function ticketBelongsToCart(
  ticket: Ticket,
  cart: Pick<Cart, "id" | "label">,
) {
  return (
    ticket.cartId === cart.id ||
    ticket.cart === `${cart.label} 平板推車` ||
    ticket.cart === `${cart.label}備用推車`
  );
}

function applyQuickCartStatus(cart: Cart, status: CartStatus): Cart {
  const tabletCount = cart.slots.length;

  if (status === "可借用") {
    return {
      ...cart,
      status,
      health: Math.max(cart.health, 90),
      battery: Math.max(cart.battery, 80),
      offline: 0,
      slots: createSlotsForCart(tabletCount, status, 0),
    };
  }

  if (status === "停用") {
    const offline = Math.min(
      tabletCount,
      Math.max(cart.offline, Math.ceil(tabletCount * 0.4)),
    );

    return {
      ...cart,
      status,
      health: Math.min(cart.health, 35),
      offline,
      slots: createSlotsForCart(tabletCount, status, offline),
    };
  }

  const offline = Math.min(tabletCount, Math.max(cart.offline, 1));
  return {
    ...cart,
    status,
    health: Math.min(cart.health, 84),
    offline,
    slots: createSlotsForCart(tabletCount, status, offline),
  };
}

function createRepairUrl(
  cart: Pick<Cart, "id" | "label" | "room">,
  origin: string,
) {
  if (!origin) {
    return "";
  }

  const url = new URL("/user", origin);
  url.searchParams.set("cartId", cart.id);
  url.searchParams.set("cart", cart.label);
  url.searchParams.set("room", cart.room);
  url.searchParams.set("source", "qr");
  return url.toString();
}

function createSlots(count: number): SlotStatus[] {
  const safeCount = Number.isFinite(count)
    ? Math.min(Math.max(Math.round(count), 1), 60)
    : 30;

  return Array.from({ length: safeCount }, () => "ok");
}

function createSlotsForCart(
  count: number,
  status: CartStatus,
  offline: number,
): SlotStatus[] {
  const safeCount = clampInteger(count, 1, 60, 30);
  const safeOffline = clampInteger(offline, 0, safeCount, 0);
  const warningCount =
    status === "可借用"
      ? 0
      : status === "需檢查"
        ? Math.min(safeCount - safeOffline, Math.max(1, Math.ceil(safeCount * 0.16)))
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

function clampInteger(
  value: number | string,
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

function normalizeCartId(value: string) {
  const normalized = value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^0-9A-Za-z-]/g, "")
    .toUpperCase();

  return normalized || `CART-${Date.now().toString().slice(-4)}`;
}

function suggestNextCartId(currentId: string) {
  const match = currentId.match(/^(.*?)(\d+)$/);
  if (!match) {
    return `${currentId}-02`;
  }

  const [, prefix, numberText] = match;
  const nextNumber = String(Number(numberText) + 1).padStart(
    numberText.length,
    "0",
  );
  return `${prefix}${nextNumber}`;
}

function readStoredCarts() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isCart).filter((cart) => !isSeedCart(cart));
  } catch {
    return [];
  }
}

function readStoredSchoolApplications() {
  try {
    const stored = window.localStorage.getItem(APPLICATION_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(isSchoolApplication)
      .filter((application) => !isSeedSchoolApplication(application));
  } catch {
    return [];
  }
}

function isSeedSchoolApplication(application: SchoolApplication) {
  return (
    application.adminEmail === "school-admin@example.edu.tw" ||
    application.adminEmail === "ict-admin@example.edu.tw"
  );
}

function isSeedCart(cart: Cart) {
  return seedCartFingerprints.some(
    (seedCart) =>
      seedCart.id === cart.id &&
      seedCart.label === cart.label &&
      seedCart.room === cart.room,
  );
}

function isCart(value: unknown): value is Cart {
  if (!value || typeof value !== "object") {
    return false;
  }

  const cart = value as Cart;
  return (
    typeof cart.id === "string" &&
    typeof cart.label === "string" &&
    typeof cart.room === "string" &&
    typeof cart.health === "number" &&
    typeof cart.battery === "number" &&
    typeof cart.offline === "number" &&
    Array.isArray(cart.slots) &&
    isCartStatus(cart.status)
  );
}

function isSchoolApplication(value: unknown): value is SchoolApplication {
  if (!value || typeof value !== "object") {
    return false;
  }

  const application = value as SchoolApplication;
  return (
    typeof application.id === "string" &&
    typeof application.schoolName === "string" &&
    typeof application.adminEmail === "string" &&
    typeof application.sheetUrl === "string" &&
    typeof application.submittedAt === "string" &&
    typeof application.note === "string" &&
    isApplicationStatus(application.status)
  );
}

function isCartStatus(value: unknown): value is CartStatus {
  return cartStatuses.includes(value as CartStatus);
}

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return ["待審核", "已啟用", "退回補件"].includes(value as ApplicationStatus);
}

function getSafeSheetUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== "docs.google.com" ||
      !url.pathname.startsWith("/spreadsheets/d/")
    ) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function createQrDataUrl(url: string) {
  return toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 7,
    color: {
      dark: "#18201d",
      light: "#ffffff",
    },
  });
}

"use client";

import { toDataURL } from "qrcode";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

type Priority = "高" | "中" | "低";
type TicketStatus = "待派工" | "維修中" | "待料" | "已完成";
type SlotStatus = "ok" | "warning" | "offline";
type CartStatus = "可借用" | "需檢查" | "停用";

type Ticket = {
  id: string;
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

const STORAGE_KEY = "tablet-cart-repair-system:carts";
const publishedOrigin = "https://tablet-cart-repair-system.ychao-ilc.chatgpt.site";

const initialTickets: Ticket[] = [
  {
    id: "R-2026-0830-018",
    cart: "A 棟 3F 平板推車",
    room: "301 自然教室",
    issue: "第 12 台無法充電，充電座燈號未亮",
    priority: "高",
    status: "待派工",
    reportedAt: "今日 09:42",
    owner: "資訊組",
  },
  {
    id: "R-2026-0830-017",
    cart: "B 棟 2F 平板推車",
    room: "204 英語教室",
    issue: "推車門鎖鬆動，借還時不易關閉",
    priority: "中",
    status: "維修中",
    reportedAt: "今日 08:15",
    owner: "總務處",
  },
  {
    id: "R-2026-0829-033",
    cart: "行政樓備用推車",
    room: "設備室",
    issue: "2 台平板 Wi-Fi 連線不穩",
    priority: "中",
    status: "待料",
    reportedAt: "昨日 16:28",
    owner: "廠商",
  },
  {
    id: "R-2026-0829-026",
    cart: "C 棟 1F 平板推車",
    room: "資訊教室",
    issue: "已更換充電線並完成檢測",
    priority: "低",
    status: "已完成",
    reportedAt: "昨日 11:05",
    owner: "資訊組",
  },
];

const initialCarts: Cart[] = [
  {
    id: "A3-01",
    label: "A 棟 3F",
    room: "301 自然教室",
    health: 82,
    battery: 91,
    offline: 1,
    status: "需檢查",
    slots: [
      "ok",
      "ok",
      "ok",
      "warning",
      "ok",
      "ok",
      "offline",
      "ok",
      "ok",
      "ok",
      "ok",
      "warning",
    ],
  },
  {
    id: "B2-02",
    label: "B 棟 2F",
    room: "204 英語教室",
    health: 74,
    battery: 64,
    offline: 3,
    status: "需檢查",
    slots: [
      "warning",
      "ok",
      "offline",
      "ok",
      "ok",
      "offline",
      "ok",
      "warning",
      "ok",
      "ok",
      "offline",
      "ok",
    ],
  },
  {
    id: "ADM-01",
    label: "行政樓",
    room: "設備室",
    health: 96,
    battery: 88,
    offline: 0,
    status: "可借用",
    slots: [
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
    ],
  },
];

const repairTypes = ["充電異常", "設備損壞", "網路異常", "借還問題"];
const priorities: Priority[] = ["高", "中", "低"];
const filters: Array<"全部" | TicketStatus> = [
  "全部",
  "待派工",
  "維修中",
  "待料",
  "已完成",
];

export default function Home() {
  const [tickets, setTickets] = useState(initialTickets);
  const [managedCarts, setManagedCarts] = useState(initialCarts);
  const [selectedCartId, setSelectedCartId] = useState(initialCarts[0].id);
  const [filter, setFilter] = useState<(typeof filters)[number]>("全部");
  const [room, setRoom] = useState(initialCarts[0].room);
  const [repairType, setRepairType] = useState(repairTypes[0]);
  const [priority, setPriority] = useState<Priority>("中");
  const [issue, setIssue] = useState(
    "第 12 台平板放回推車後未顯示充電，已更換插槽仍無反應。",
  );
  const [runtimeOrigin, setRuntimeOrigin] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [copiedCartId, setCopiedCartId] = useState<string | null>(null);
  const [generatedCartId, setGeneratedCartId] = useState(initialCarts[0].id);
  const [scanMessage, setScanMessage] = useState("");
  const [cartForm, setCartForm] = useState<CartForm>({
    id: "D4-01",
    label: "D 棟 4F",
    room: "402 多功能教室",
    tabletCount: "30",
  });

  const origin = runtimeOrigin || publishedOrigin;
  const selectedCart =
    managedCarts.find((item) => item.id === selectedCartId) ?? managedCarts[0];
  const generatedCart =
    managedCarts.find((item) => item.id === generatedCartId) ?? managedCarts[0];

  useEffect(() => {
    const storedCarts = readStoredCarts();
    let nextCarts = storedCarts.length > 0 ? storedCarts : initialCarts;

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
      setScanMessage(`${scannedCart.label} 已從 QR Code 帶入報修表單。`);
    } else if (!nextCarts.some((item) => item.id === initialCarts[0].id)) {
      setSelectedCartId(nextCarts[0].id);
      setRoom(nextCarts[0].room);
    }

    setManagedCarts(nextCarts);
    setRuntimeOrigin(window.location.origin);
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(managedCarts));
  }, [managedCarts, storageReady]);

  const filteredTickets = useMemo(
    () =>
      filter === "全部"
        ? tickets
        : tickets.filter((ticket) => ticket.status === filter),
    [filter, tickets],
  );

  const metrics = useMemo(() => {
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
        value: managedCarts
          .filter((item) => item.status === "可借用")
          .length.toString(),
        detail: `全校 ${managedCarts.length} 台`,
      },
      {
        label: "平均回應",
        value: "1.8h",
        detail: "近 7 日",
      },
    ];
  }, [managedCarts, tickets]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextTicket: Ticket = {
      id: `R-2026-0830-${String(tickets.length + 19).padStart(3, "0")}`,
      cart: `${selectedCart?.label ?? "未指定"} 平板推車`,
      room,
      issue: `${repairType}｜${issue.trim() || "待補充故障描述"}`,
      priority,
      status: "待派工",
      reportedAt: "剛剛",
      owner: priority === "高" ? "資訊組" : "值班人員",
    };

    setTickets((current) => [nextTicket, ...current]);
    setIssue("");
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

    try {
      await window.navigator.clipboard.writeText(url);
      setCopiedCartId(cartItem.id);
      window.setTimeout(() => setCopiedCartId(null), 1800);
    } catch {
      setCopiedCartId(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="eyebrow">校園設備維護中心</span>
          <h1>平板推車報修系統</h1>
          <p>
            老師報修、資訊組派工、維修廠商回報，集中在同一個工作台。
          </p>
        </div>
        <div className="shift-card" aria-label="今日維護資訊">
          <span>今日值班</span>
          <strong>資訊組 08:00-17:00</strong>
          <small>緊急案件先處理充電、離線與無法借用狀況</small>
        </div>
      </header>

      {scanMessage && <p className="scan-message">{scanMessage}</p>}

      <section className="metric-grid" aria-label="今日概況">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="workspace-grid">
        <section className="panel repair-panel" aria-labelledby="repair-title">
          <PanelHeader
            eyebrow="報修登錄"
            title="新增報修單"
            action={<span className="status-chip success">掃碼可帶入</span>}
          />

          <form className="repair-form" onSubmit={handleSubmit}>
            <label>
              推車位置
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
              教室或保管位置
              <input
                value={room}
                onChange={(event) => setRoom(event.target.value)}
              />
            </label>

            <div className="field-group">
              <span>問題類型</span>
              <div className="choice-grid">
                {repairTypes.map((type) => (
                  <button
                    aria-pressed={repairType === type}
                    className={repairType === type ? "choice active" : "choice"}
                    key={type}
                    onClick={() => setRepairType(type)}
                    type="button"
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <span>優先級</span>
              <div className="segment-control">
                {priorities.map((item) => (
                  <button
                    aria-pressed={priority === item}
                    className={priority === item ? "active" : ""}
                    key={item}
                    onClick={() => setPriority(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <label>
              故障描述
              <textarea
                value={issue}
                onChange={(event) => setIssue(event.target.value)}
              />
            </label>

            <button className="primary-action" type="submit">
              建立報修單
            </button>
          </form>
        </section>

        <section className="panel ticket-panel" aria-labelledby="tickets-title">
          <PanelHeader
            eyebrow="案件看板"
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
            {filteredTickets.map((ticket) => (
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
                    onClick={() => advanceTicket(ticket.id)}
                    type="button"
                  >
                    {ticket.status === "已完成" ? "已結案" : "更新進度"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="admin-section panel" aria-labelledby="admin-title">
        <div className="admin-layout">
          <div>
            <PanelHeader
              eyebrow="管理端"
              title="新增推車並自動產生 QR Code"
              action={<span className="status-chip success">可列印張貼</span>}
            />
            <form className="admin-form" onSubmit={handleCreateCart}>
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

          {generatedCart && (
            <CartQrCard
              cart={generatedCart}
              copied={copiedCartId === generatedCart.id}
              onCopy={() => copyCartUrl(generatedCart)}
              url={createRepairUrl(generatedCart, origin)}
            />
          )}
        </div>

        <div className="managed-cart-list" aria-label="推車 QR Code 清單">
          {managedCarts.map((item) => (
            <article className="managed-cart-row" key={item.id}>
              <div>
                <span>{item.id}</span>
                <strong>{item.label}</strong>
                <small>{item.room}</small>
              </div>
              <code>{createRepairUrl(item, origin)}</code>
              <button
                className="ghost-action"
                onClick={() => {
                  setGeneratedCartId(item.id);
                  void copyCartUrl(item);
                }}
                type="button"
              >
                {copiedCartId === item.id ? "已複製" : "複製網址"}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="operations-grid">
        <section className="cart-section" aria-labelledby="cart-title">
          <PanelHeader eyebrow="設備狀態" title="推車健康度" />
          <div className="cart-grid">
            {managedCarts.map((item) => (
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
        </section>

        <aside className="panel timeline-panel" aria-labelledby="timeline-title">
          <PanelHeader eyebrow="今日排程" title="維修進度" />
          <ol className="timeline">
            <li>
              <span>09:50</span>
              <strong>A3-01 充電座檢查</strong>
              <p>優先確認第 12 台插槽與電源模組。</p>
            </li>
            <li>
              <span>11:20</span>
              <strong>B2-02 門鎖零件更換</strong>
              <p>總務處協助備料，午休前完成。</p>
            </li>
            <li>
              <span>14:00</span>
              <strong>行政樓 Wi-Fi 測試</strong>
              <p>廠商遠端查看 AP 與平板連線紀錄。</p>
            </li>
          </ol>
        </aside>
      </section>
    </main>
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

    void toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 2,
      scale: 7,
      color: {
        dark: "#18201d",
        light: "#ffffff",
      },
    }).then((nextUrl) => {
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
          <img alt={`${cart.label} 報修 QR Code`} src={qrDataUrl} />
        ) : (
          <span>產生中</span>
        )}
      </div>
      <div className="url-box">{url}</div>
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

function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priority-badge priority-${priority}`}>{priority}</span>;
}

function StatusBadge({ status }: { status: TicketStatus }) {
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

function createRepairUrl(cart: Pick<Cart, "id" | "label" | "room">, origin: string) {
  const url = new URL("/", origin);
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
  const nextNumber = String(Number(numberText) + 1).padStart(numberText.length, "0");
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

    return parsed.filter(isCart);
  } catch {
    return [];
  }
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
    typeof cart.status === "string"
  );
}

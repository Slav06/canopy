"use client";
import { useEffect, useRef, useState, ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Headphones,
  Home,
  LayoutDashboard,
  Leaf,
  ListFilter,
  Loader2,
  Menu,
  MoreHorizontal,
  Phone,
  PhoneOff,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sprout,
  TrendingUp,
  Upload,
  Users,
  X,
  Building2,
  Columns3,
  CircleDot,
  AlertCircle,
  LogOut,
  Plug,
  BarChart3,
} from "lucide-react";
import {
  State,
  User,
  Lead,
  Deal,
  Buyer,
  CallReview,
  statuses,
  stages,
  uid,
  sellerMAO,
  detailedMAO,
  matchBuyer,
} from "@/lib/model";
import {
  can,
  canBookAppointment,
  roleLabel,
  capabilityLabels,
} from "@/lib/permissions";
import {
  conditions,
  timelines,
  pendingReview,
  requiresReview,
  validatePostCall,
  postCallOutcomes,
} from "@/lib/post-call";
import { propertyAddress } from "@/lib/property-map";
import { parseCSV, ImportRow } from "@/lib/imports";
type Integration = {
  dialerrKey?: string;
  embedEnabled?: boolean;
  dialerr: boolean;
  liveCalling: boolean;
  roleVerified: boolean;
  calendar: boolean;
};
type DialerrAPI = {
  loadLead: (lead: { phone: string; name: string; externalId: string }) => void;
  startCall: (phone: string, name: string) => void;
  inCall: boolean;
  float: () => boolean;
  open: () => void;
};
declare global {
  interface Window {
    Dialerr?: DialerrAPI;
  }
}
const nav = [
  { name: "Today", icon: LayoutDashboard },
  { name: "Leads", icon: Users },
  { name: "Calling", icon: Headphones },
  { name: "Deals", icon: Building2 },
  { name: "Buyers", icon: Users },
  { name: "Calendar", icon: CalendarDays },
];
const secondary = [
  { name: "Reports", icon: BarChart3 },
  { name: "Team", icon: Users },
  { name: "Integrations", icon: Plug },
  { name: "Settings", icon: Settings },
  { name: "Scripts", icon: FileText },
];
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
const date = (s?: string) =>
  s
    ? new Date(s).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "—";
const time = (s?: string) =>
  s
    ? new Date(s).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "No time set";
const localInput = (s?: string) => {
  const d = s ? new Date(s) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
async function api(route: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/" + route, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? "Request failed");
  return data;
}
function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
  locked = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  locked?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [modalError, setModalError] = useState("");
  useEffect(() => {
    const listener = (event: Event) =>
      setModalError((event as CustomEvent<string>).detail);
    window.addEventListener("canopy:error", listener);
    const d = ref.current!;
    d.showModal();
    return () => {
      window.removeEventListener("canopy:error", listener);
      d.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        if (locked) e.preventDefault();
        else onClose();
      }}
      className={wide ? "wide" : ""}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        {!locked && (
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        )}
      </div>
      {modalError && (
        <p className="error" role="alert">
          {modalError}
        </p>
      )}
      {children}
    </dialog>
  );
}
export default function CRM() {
  const [s, setS] = useState<State>();
  const [user, setUser] = useState<User>();
  const [mode, setMode] = useState("demo");
  const [integration, setIntegration] = useState<Integration>({
    dialerr: false,
    liveCalling: false,
    roleVerified: false,
    calendar: false,
  });
  const [view, setView] = useState("Today");
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All statuses");
  const [pipeline, setPipeline] = useState(true);
  const [dragging, setDragging] = useState<string>();
  const [dropStage, setDropStage] = useState<string>();
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [login, setLogin] = useState(false);
  const [modal, setModal] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [call, setCall] = useState<{
    leadId: string;
    name: string;
    phone: string;
    status: string;
  } | null>(null);
  const callLock = useRef(false);
  const [mobileTab, setMobileTab] = useState("Lead");
  const scroll = useRef<Record<string, number>>({});
  const main = useRef<HTMLElement>(null);
  const reportId = useRef<string | undefined>(undefined);
  const preparedLead = useRef<string | undefined>(undefined);
  const reportQueue = useRef<Promise<unknown>>(Promise.resolve());
  async function refresh() {
    try {
      const d = await api("state");
      setS(d.state);
      setUser(d.user);
      setMode(d.mode);
      const pending = (d.state.callReviews ?? []).find(
        (r: CallReview) => r.userId === d.user.id && r.phase !== "submitted",
      );
      if (pending) reportId.current = pending.id;
      setIntegration(d.integration);
      setLogin(false);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("Sign in")) setLogin(true);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    const p = new URLSearchParams(location.search);
    setView(p.get("view") ?? "Today");
    try {
      const state = JSON.parse(sessionStorage.getItem("canopy-view") ?? "{}");
      if (state.view && !p.has("view")) setView(state.view);
      if (state.selected) setSelected(state.selected);
      if (state.filter) setFilter(state.filter);
    } catch {}
  }, []);
  useEffect(() => {
    sessionStorage.setItem(
      "canopy-view",
      JSON.stringify({ view, selected, filter }),
    );
    if (main.current) main.current.scrollTop = scroll.current[view] ?? 0;
  }, [view, selected, filter]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!integration.embedEnabled) return;
    const existing = document.getElementById("dialerr-sdk");
    if (existing) {
      if (window.Dialerr && !window.Dialerr.inCall) {
        window.Dialerr.float();
        window.Dialerr.open();
      }
      return;
    }
    const script = document.createElement("script");
    script.id = "dialerr-sdk";
    script.src = "https://dialerr.com/embed.js";
    if (integration.dialerrKey) script.dataset.key = integration.dialerrKey;
    script.dataset.mode = "floating";
    script.dataset.surface = "toolbar";
    script.dataset.position = "bottom-right";
    script.dataset.width = "400";
    script.dataset.height = "640";
    script.dataset.autoOpen = "true";
    script.onerror = () =>
      setError(
        "Dialerr toolbar could not load. Check the connection or reload the page.",
      );
    document.body.appendChild(script);
    const connected = () =>
      setCall((c) =>
        c
          ? { ...c, status: "Connected" }
          : {
              leadId: "",
              name: "Dialerr call",
              phone: "Managed inside toolbar",
              status: "Connected",
            },
      );
    const ended = () => {
      callLock.current = false;
      setCall((c) =>
        c ? { ...c, status: "Call ended · record the outcome in Canopy" } : c,
      );
    };
    const invalid = () => {
      callLock.current = false;
      setError("Dialerr session expired. Reconnect before calling.");
    };
    window.addEventListener("dialerr:call_connected", connected);
    window.addEventListener("dialerr:call_ended", ended);
    window.addEventListener("dialerr:auth_invalid", invalid);
    return () => {
      window.removeEventListener("dialerr:call_connected", connected);
      window.removeEventListener("dialerr:call_ended", ended);
      window.removeEventListener("dialerr:auth_invalid", invalid);
    };
  }, [integration.embedEnabled, integration.dialerrKey]);
  useEffect(() => {
    if (!user || !requiresReview(user)) return;
    const start = () => {
      const id = reportId.current ?? uid();
      reportId.current = id;
      reportQueue.current = reportQueue.current
        .catch(() => {})
        .then(() =>
          api("call-reviews/start", "POST", {
            id,
            leadId: preparedLead.current,
            source: "browser_event",
          }),
        )
        .then(() => refresh())
        .catch((e) => setError((e as Error).message));
    };
    const end = () => {
      const existing = reportId.current;
      const id = existing ?? uid();
      reportId.current = id;
      reportQueue.current = reportQueue.current
        .catch(() => {})
        .then(async () => {
          if (!existing)
            await api("call-reviews/start", "POST", {
              id,
              leadId: preparedLead.current,
              source: "browser_event",
              ended: true,
            });
          else await api("call-reviews/" + id + "/end", "POST", {});
          await refresh();
        })
        .catch((e) => setError((e as Error).message));
    };
    window.addEventListener("dialerr:call_connected", start);
    window.addEventListener("dialerr:call_ended", end);
    return () => {
      window.removeEventListener("dialerr:call_connected", start);
      window.removeEventListener("dialerr:call_ended", end);
    };
  }, [user?.id, user?.role]);
  function selectLead(id: string | undefined) {
    const r =
      s && user && requiresReview(user) ? pendingReview(s, user) : undefined;
    if (r && id !== r.leadId) {
      setError("Complete the current call form before moving to another lead.");
      return;
    }
    setSelected(id);
  }
  function navigate(name: string) {
    if (main.current) scroll.current[view] = main.current.scrollTop;
    setView(name);
    setSidebar(false);
  }
  async function act(
    route: string,
    method = "POST",
    body?: unknown,
    msg?: string,
  ) {
    try {
      const data = await api(route, method, body);
      await refresh();
      if (msg) setNotice(msg);
      return data;
    } catch (e) {
      setError((e as Error).message);
      window.dispatchEvent(
        new CustomEvent("canopy:error", { detail: (e as Error).message }),
      );
      throw e;
    }
  }
  async function moveLead(id: string, status: string) {
    if (
      !user ||
      !can(user, "editLeads") ||
      moving ||
      !s?.leads.some((l) => l.id === id && l.status !== status)
    )
      return;
    setMoving(true);
    try {
      await act("leads/" + id, "PATCH", { status }, "Lead moved to " + status);
    } catch {
    } finally {
      setMoving(false);
    }
  }
  function openLead(id: string, destination = "Leads") {
    selectLead(id);
    navigate(destination);
  }
  async function startCall(l: Lead) {
    if (
      callLock.current ||
      (call && call.status === "Simulated call in progress")
    ) {
      setError("Finish the current call first.");
      return;
    }
    callLock.current = true;
    try {
      const d = await api("dialerr/prepare", "POST", { leadId: l.id });
      if (d.simulated) {
        throw Error(
          "CRM demo records cannot be dialed. Sign into the toolbar and use an approved test number manually.",
        );
      } else {
        if (!window.Dialerr)
          throw Error(
            "Dialerr is disconnected. Wait for the panel to connect.",
          );
        if (window.Dialerr.inCall) throw Error("Agent is already in a call");
        preparedLead.current = l.id;
        window.Dialerr.loadLead(d);
        // Calls begin only when the agent presses Call inside the toolbar.
        callLock.current = false;
        setCall({
          leadId: l.id,
          name: d.name,
          phone: d.phone,
          status: "Lead loaded · press Call in the Dialerr toolbar",
        });
      }
      navigate("Calling");
      setSelected(l.id);
    } catch (e) {
      callLock.current = false;
      setError((e as Error).message);
    }
  }
  const c = (l: Lead) => s!.contacts.find((c) => c.id === l.contactId)!;
  const p = (l: Lead) => s!.properties.find((p) => p.id === l.propertyId)!;
  const u = (id: string) =>
    s?.users.find((u) => u.id === id)?.name ?? "Unassigned";
  const chosen = s?.leads.find((l) => l.id === selected);
  const visible =
    s?.leads.filter((l) => {
      const contact = c(l),
        prop = p(l);
      return (
        [
          contact.name,
          contact.email,
          ...contact.phones.map((p) => p.number),
          prop.address,
          prop.city,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === "All statuses" || l.status === filter)
      );
    }) ?? [];
  if (login)
    return (
      <div className="login">
        <div className="brand">
          <Sprout />
          canopy<span>REAL ESTATE</span>
        </div>
        <div className="panel">
          <h1>Welcome back.</h1>
          <p>Sign in to your Canopy workspace.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api("auth/login", "POST", Object.fromEntries(f));
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Field label="Email">
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
              />
            </Field>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary">Sign in</button>
          </form>
        </div>
      </div>
    );
  if (loading || !s || !user)
    return (
      <div className="loading">
        <Sprout size={36} />
        <h2>{error ? "Workspace unavailable" : "Opening your workspace…"}</h2>
        {error && (
          <>
            <p role="alert">{error}</p>
            <button
              onClick={() => {
                setError("");
                refresh();
              }}
            >
              Retry
            </button>
          </>
        )}
      </div>
    );
  const owner = user.role === "owner";
  const active = s.leads.filter((l) => !["Closed", "Dead"].includes(l.status));
  const overdue = active.filter(
    (l) => l.dueAt && new Date(l.dueAt) < new Date(),
  );
  const today = s.appointments.filter(
    (a) =>
      a.status === "scheduled" &&
      new Date(a.start).toDateString() === new Date().toDateString(),
  );
  const missing = active.filter(
    (l) => !l.assignedTo || !l.nextAction || !l.dueAt,
  );
  const collected = s.deals.reduce((t, d) => t + d.collectedFee, 0);
  const taskRow = (l: Lead, priority: string) => (
    <div className="task-row" key={l.id}>
      <button
        className="task-check"
        disabled={!can(user, "editLeads")}
        aria-label={"Complete action for " + c(l).name}
        onClick={() =>
          act(
            "leads/" + l.id + "/complete-action",
            "POST",
            {},
            "Action completed. Set the next step when ready.",
          ).catch(() => {})
        }
      >
        <CircleDot size={19} />
      </button>
      <div className="task-person">
        <button className="text-button" onClick={() => openLead(l.id)}>
          {c(l).name}
        </button>
        <span>
          {p(l).address} <span className="dim">· {p(l).city}</span>
        </span>
      </div>
      <div className="task-context">
        <span>{l.nextAction || "Add a next action"}</span>
        <small>{l.motivation || "Not qualified yet"}</small>
      </div>
      <div className="task-owner">
        <span className="avatar tiny">
          {u(l.assignedTo)
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")}
        </span>
        <span>{u(l.assignedTo).split(" ")[0]}</span>
      </div>
      <div className={"task-due " + (priority === "overdue" ? "danger" : "")}>
        <Clock3 size={13} />
        {priority === "overdue" ? "Overdue" : time(l.dueAt)}
      </div>
      <button
        className="subtle small"
        onClick={() => openLead(l.id, "Calling")}
      >
        Open lead <ArrowUpRight size={14} />
      </button>
    </div>
  );
  return (
    <div className="app">
      <aside className={"sidebar " + (sidebar ? "expanded" : "")}>
        <button className="brand" onClick={() => navigate("Today")}>
          <span className="brand-icon">
            <Sprout size={30} />
          </span>
          <div>
            canopy<small>REAL ESTATE</small>
          </div>
        </button>
        <button className="workspace" onClick={() => setModal("workspace")}>
          <span className="workspace-icon">C</span>
          <div>
            Canopy workspace
            <small>
              {mode === "demo" ? "Demo workspace" : "Live workspace"}
            </small>
          </div>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav
            .filter((n) =>
              n.name === "Deals"
                ? can(user, "manageDeals")
                : n.name === "Buyers"
                  ? can(user, "manageBuyers")
                  : true,
            )
            .map((n) => (
              <button
                key={n.name}
                className={view === n.name ? "active" : ""}
                onClick={() => navigate(n.name)}
              >
                <n.icon size={18} />
                {n.name}
                {n.name === "Today" && overdue.length > 0 && (
                  <span className="nav-count">{overdue.length}</span>
                )}
                {n.name === "Calling" && call && <i className="live-dot" />}
              </button>
            ))}
        </nav>
        <div className="nav-label secondary-label">MANAGE</div>
        <nav>
          {secondary
            .filter((n) =>
              n.name === "Scripts"
                ? can(user, "editScripts")
                : n.name === "Reports"
                  ? can(user, "viewReports")
                  : owner || n.name === "Integrations",
            )
            .map((n) => (
              <button
                key={n.name}
                className={view === n.name ? "active" : ""}
                onClick={() => navigate(n.name)}
              >
                <n.icon size={18} />
                {n.name}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="team-note">
            <span className="tiny-leaf">
              <Leaf size={16} />
            </span>
            <div>
              Canopy acquisition team
              <small>Your wholesale workspace</small>
            </div>
          </div>
          <button className="profile" onClick={() => setModal("workspace")}>
            <span className="avatar">{owner ? "AG" : "MS"}</span>
            <div>
              {user.name}
              <small>{roleLabel(user)}</small>
            </div>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>
      <div className="body">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setSidebar(!sidebar)}
            aria-label="Toggle navigation"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>{view}</strong>
          </div>
          <div className="global-search">
            <Search size={16} />
            <input
              aria-label="Search sellers, phone, address or email"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value) navigate("Leads");
              }}
              placeholder="Search anything…"
            />
            <kbd>⌕</kbd>
          </div>
          <Badge tone={mode === "demo" ? "amber" : "green"}>
            <span className="dot" />
            {mode === "demo" ? "Demo workspace" : "Live workspace"}
          </Badge>
          <button
            className="icon-button notification"
            aria-label="Show overdue follow-ups"
            onClick={() => {
              navigate("Today");
              setNotice(
                `${overdue.length} overdue follow-ups, ${missing.length} leads need a next action`,
              );
            }}
          >
            <Bell size={19} />
            {overdue.length > 0 && <i />}
          </button>
          <span className="avatar top-avatar">{owner ? "AG" : "MS"}</span>
        </header>
        <div className="demo-banner">
          {mode === "demo" ? (
            <>
              <ShieldCheck size={14} />
              <strong>You’re in the demo workspace.</strong>
              <span>
                Sample CRM records only. Dialerr is a separate live toolbar;
                calls require your deliberate action.
              </span>
            </>
          ) : (
            <>
              <ShieldCheck size={14} />
              <strong>Live workspace</strong>
              <span>
                Provider actions require connected integrations and verified
                permissions.
              </span>
            </>
          )}
        </div>
        {error && (
          <div className="alert error" role="alert">
            <AlertCircle size={17} />
            {error}
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <CheckCircle2 size={17} />
            {notice}
          </div>
        )}
        <div
          className={
            "content-row " + (view === "Calling" ? "calling-layout" : "")
          }
        >
          <main ref={main}>
            {requiresReview(user) && (
              <div className="inline-alert">
                <FileText size={17} />
                <span>
                  Complete a post-call form after every call.{" "}
                  {pendingReview(s, user)
                    ? "A call form is pending."
                    : "Choose the correct lead before reporting a call."}
                </span>
                <button
                  disabled={!chosen && !pendingReview(s, user)}
                  onClick={async () => {
                    try {
                      const r = pendingReview(s, user);
                      if (r)
                        await act("call-reviews/" + r.id + "/end", "POST", {});
                      else
                        await act("call-reviews/start", "POST", {
                          id: uid(),
                          leadId: chosen?.id,
                          ended: true,
                          source: "manual",
                        });
                    } catch {}
                  }}
                >
                  Call ended · complete form
                </button>
              </div>
            )}
            {view === "Today" && (
              <>
                <div className="page-head">
                  <div>
                    <div className="eyebrow">ACQUISITIONS OVERVIEW</div>
                    <h1>Today’s dashboard</h1>
                    <p>
                      Your follow-ups, appointments, and acquisition priorities.
                    </p>
                  </div>
                  <div className="head-right">
                    <span className="today-date">
                      <CalendarDays size={15} />
                      {new Date().toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <button
                      className="primary"
                      onClick={() => {
                        setSelected(overdue[0]?.id ?? active[0]?.id);
                        navigate("Calling");
                      }}
                    >
                      <Phone size={16} />
                      Start calling <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
                <div className="stats">
                  <div className="stat">
                    <span>
                      Follow-ups to handle <Clock3 size={17} />
                    </span>
                    <strong>
                      {active.filter((l) => l.nextAction).length}
                      <small className="danger">{overdue.length} overdue</small>
                    </strong>
                    <p>A conversation worth continuing</p>
                  </div>
                  <div className="stat">
                    <span>
                      Qualified sellers <Users size={17} />
                    </span>
                    <strong>
                      {s.leads.filter((l) => l.status === "Qualified").length}
                      <small className="green-text">Ready for review</small>
                    </strong>
                    <p>Your next opportunity starts here</p>
                  </div>
                  <div className="stat">
                    <span>
                      Appointments today <CalendarDays size={17} />
                    </span>
                    <strong>
                      {today.length}
                      <small>
                        {today.length ? "On the calendar" : "A clear schedule"}
                      </small>
                    </strong>
                    <p>Make time for the right sellers</p>
                  </div>
                  {owner && (
                    <div className="stat">
                      <span>
                        Collected assignment fees <TrendingUp size={17} />
                      </span>
                      <strong>
                        {money(collected)}
                        <small>Recorded actuals</small>
                      </strong>
                      <p>
                        {mode === "demo"
                          ? "Demo records · not business earnings"
                          : "Payments recorded as received"}
                      </p>
                    </div>
                  )}
                </div>
                <div className="today-grid">
                  <section className="panel action-panel">
                    <div className="section-head">
                      <div>
                        <h2>
                          Your next actions{" "}
                          <span className="count">
                            {active.filter((l) => l.nextAction).length}
                          </span>
                        </h2>
                        <p>The right things, in the right order.</p>
                      </div>
                      <button
                        className="text-link"
                        onClick={() => navigate("Leads")}
                      >
                        View all leads <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <div className="section-tabs">
                      <button className="selected">
                        Needs attention <span>{overdue.length}</span>
                      </button>
                      <button onClick={() => navigate("Calendar")}>
                        Appointments
                      </button>
                    </div>
                    {overdue.length > 0 && (
                      <>
                        <div className="group-label">
                          <span className="status-dot red" />
                          OVERDUE FOLLOW-UPS{" "}
                          <Badge tone="red">{overdue.length}</Badge>
                        </div>
                        {overdue.map((l) => taskRow(l, "overdue"))}
                      </>
                    )}
                    {active
                      .filter((l) => !overdue.includes(l) && l.nextAction)
                      .sort((a, b) => {
                        const priority = (l: Lead) =>
                          l.status === "Follow-Up"
                            ? 0
                            : l.status === "Qualified"
                              ? 1
                              : l.status === "Appointment Set"
                                ? 2
                                : l.status === "Offer Made"
                                  ? 3
                                  : 4;
                        return (
                          priority(a) - priority(b) ||
                          Date.parse(a.dueAt ?? "") - Date.parse(b.dueAt ?? "")
                        );
                      })
                      .map((l, i) => (
                        <div key={l.id}>
                          {i === 0 && (
                            <div className="group-label">
                              <span className="status-dot green" />
                              UP NEXT
                            </div>
                          )}
                          {taskRow(l, "next")}
                        </div>
                      ))}
                    {s.deals
                      .filter((d) => d.inspectionDate || d.closingDate)
                      .map((d) => (
                        <div className="task-row" key={d.id}>
                          <CalendarDays size={18} />
                          <div>
                            <strong>
                              {
                                p(
                                  [...s.leads, ...(s.archivedLeads ?? [])].find(
                                    (l) => l.id === d.leadId,
                                  )!,
                                ).address
                              }
                            </strong>
                            <p>
                              Inspection {date(d.inspectionDate)} · Closing{" "}
                              {date(d.closingDate)}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setSelected(d.leadId);
                              navigate("Deals");
                            }}
                          >
                            Review deal
                          </button>
                        </div>
                      ))}
                    {!active.length && (
                      <Empty
                        title="A fresh start"
                        text="Add or import sellers to build your next-action list."
                      />
                    )}
                    <div className="panel-footer">
                      <CheckCircle2 size={15} />
                      <span>
                        Reminders are managed in Canopy. No automatic dialing.
                      </span>
                    </div>
                  </section>
                  <aside className="today-aside">
                    <section className="panel appointments-card">
                      <div className="section-head">
                        <h2>On your calendar</h2>
                        <CalendarDays size={18} />
                      </div>
                      <div className="calendar-day">
                        <strong>{new Date().getDate()}</strong>
                        <div>
                          {new Date().toLocaleDateString("en-US", {
                            weekday: "long",
                          })}
                          <small>
                            {new Date().toLocaleDateString("en-US", {
                              month: "long",
                              year: "numeric",
                            })}
                          </small>
                        </div>
                        <Badge>
                          {today.length} appointment
                          {today.length === 1 ? "" : "s"}
                        </Badge>
                      </div>
                      {today.map((a) => {
                        const l = s.leads.find((l) => l.id === a.leadId)!;
                        return (
                          <button
                            className="appointment-preview"
                            key={a.id}
                            onClick={() => openLead(l.id)}
                          >
                            <div className="appointment-time">
                              {time(a.start)}
                              <span>Local browser time</span>
                            </div>
                            <h3>{a.title}</h3>
                            <p>{c(l).name}</p>
                            <small>
                              <Home size={13} />
                              {p(l).address}
                            </small>
                            <span className="appointment-assignee">
                              <span className="avatar tiny">
                                {u(a.assignedTo)[0]}
                              </span>
                              {u(a.assignedTo)}
                            </span>
                          </button>
                        );
                      })}
                      {!today.length && (
                        <p className="muted">No appointments today.</p>
                      )}
                      <button
                        className="text-link calendar-link"
                        onClick={() => navigate("Calendar")}
                      >
                        Open calendar <ArrowRight size={15} />
                      </button>
                    </section>
                    <section className="care-card">
                      <div className="care-icon">
                        <Sprout size={24} />
                      </div>
                      <h3>Lead follow-up coverage</h3>
                      <p>
                        {missing.length
                          ? `${missing.length} active lead${missing.length === 1 ? " needs" : "s need"} an owner, a date, or a next action.`
                          : "Every active seller has an owner and a next action. You’re ready to move forward."}
                      </p>
                      <button
                        className="text-link"
                        onClick={() => {
                          navigate("Leads");
                          if (missing[0]) setSelected(missing[0].id);
                        }}
                      >
                        {missing.length ? "Review leads" : "See your pipeline"}{" "}
                        <ArrowRight size={15} />
                      </button>
                    </section>
                    <div className="quiet-note">
                      <ShieldCheck size={16} />
                      <span>
                        Built for thoughtful conversations.
                        <br />
                        No automatic dialing or sending.
                      </span>
                    </div>
                  </aside>
                </div>
              </>
            )}
            {view === "Leads" && (
              <>
                <PageHead
                  title="Leads"
                  description={`${s.leads.length} opportunities · every property keeps its own story.`}
                  action={
                    can(user, "createLeads") ? (
                      <button
                        className="primary"
                        onClick={() => setModal("new-lead")}
                      >
                        <Plus size={16} />
                        Add lead
                      </button>
                    ) : undefined
                  }
                />
                <div className="toolbar">
                  <div className="filter-search">
                    <Search size={16} />
                    <input
                      aria-label="Filter leads"
                      placeholder="Name, phone, address or email"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="Filter by status"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option>All statuses</option>
                    {statuses.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <button onClick={() => setPipeline(!pipeline)}>
                    {pipeline ? <Users size={16} /> : <Columns3 size={16} />}{" "}
                    {pipeline ? "Table" : "Pipeline"}
                  </button>
                  {can(user, "importLeads") && (
                    <button onClick={() => setModal("import")}>
                      <Upload size={16} />
                      Import CSV
                    </button>
                  )}
                </div>
                {pipeline ? (
                  <>
                    <p className="pipeline-help">
                      {can(user, "editLeads")
                        ? "Drag a tile to update its stage, or use Move to stage on the tile. Open a tile for seller details and property views."
                        : "Your assigned leads by stage. Open a tile to add call information. Stage changes are managed by your admin."}{" "}
                      Stage moves update the lead only; contracts, deal records
                      and payments are managed separately.
                    </p>
                    <div
                      className="pipeline"
                      aria-label="Wholesale lead pipeline"
                      aria-busy={moving}
                    >
                      {statuses.map((status, index) => (
                        <section
                          key={status}
                          className={dropStage === status ? "drop-active" : ""}
                          onDragOver={(e) => {
                            if (dragging && can(user, "editLeads") && !moving) {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              setDropStage(status);
                            }
                          }}
                          onDragLeave={(e) => {
                            if (
                              !e.currentTarget.contains(e.relatedTarget as Node)
                            )
                              setDropStage(undefined);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const id = dragging;
                            setDragging(undefined);
                            setDropStage(undefined);
                            if (id) void moveLead(id, status);
                          }}
                        >
                          <h3>
                            <span className="stage-number">{index + 1}</span>
                            {status}
                            <span>
                              {
                                visible.filter((l) => l.status === status)
                                  .length
                              }
                            </span>
                          </h3>
                          {visible
                            .filter((l) => l.status === status)
                            .map((l) => (
                              <article
                                className={
                                  "lead-card " +
                                  (dragging === l.id ? "dragging" : "")
                                }
                                key={l.id}
                                draggable={can(user, "editLeads") && !moving}
                                onDragStart={(e) => {
                                  setDragging(l.id);
                                  e.dataTransfer.effectAllowed = "move";
                                  e.dataTransfer.setData("text/plain", l.id);
                                }}
                                onDragEnd={() => {
                                  setDragging(undefined);
                                  setDropStage(undefined);
                                }}
                              >
                                <button
                                  className="tile-open"
                                  onClick={() => selectLead(l.id)}
                                >
                                  <span className="tile-property">
                                    <Home size={18} />
                                    <span>
                                      {p(l).city}, {p(l).state}
                                    </span>
                                    <ArrowUpRight size={14} />
                                  </span>
                                  <strong>{c(l).name}</strong>
                                  <span>{p(l).address}</span>
                                  <small>
                                    {l.motivation || "Motivation not captured"}
                                  </small>
                                </button>
                                <div className="tile-next">
                                  <Clock3 size={12} />
                                  {l.nextAction || "Needs next action"}
                                </div>
                                <div className="tile-footer">
                                  <Badge>{u(l.assignedTo).split(" ")[0]}</Badge>
                                  <small>{l.source || "CRM lead"}</small>
                                </div>
                                {can(user, "editLeads") && (
                                  <select
                                    aria-label={
                                      "Move " + c(l).name + " to stage"
                                    }
                                    value={l.status}
                                    disabled={moving}
                                    onChange={(e) =>
                                      void moveLead(l.id, e.target.value)
                                    }
                                  >
                                    {statuses.map((x) => (
                                      <option key={x}>{x}</option>
                                    ))}
                                  </select>
                                )}
                              </article>
                            ))}
                          {!visible.some((l) => l.status === status) && (
                            <div className="stage-empty">
                              {can(user, "editLeads")
                                ? "Drop a lead here"
                                : "No leads"}
                            </div>
                          )}
                        </section>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="panel table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {[
                            "Seller",
                            "Property",
                            "Status",
                            "Motivation",
                            "Assigned caller",
                            "Last contact",
                            "Next action",
                          ].map((x) => (
                            <th key={x}>{x}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((l) => (
                          <tr
                            key={l.id}
                            className={selected === l.id ? "selected-row" : ""}
                            onClick={() => selectLead(l.id)}
                          >
                            <td>
                              <button
                                className="seller-name"
                                onClick={() => selectLead(l.id)}
                              >
                                <span className="avatar seller">
                                  {c(l)
                                    .name.split(" ")
                                    .map((n) => n[0])
                                    .join("")}
                                </span>
                                <span>
                                  {c(l).name}
                                  <small>
                                    {c(l).dnc
                                      ? "Do Not Contact"
                                      : (c(l).phones[0]?.number ?? "No phone")}
                                  </small>
                                </span>
                              </button>
                            </td>
                            <td>
                              {p(l).address}
                              <small>
                                {p(l).city}, {p(l).state} {p(l).zip}
                              </small>
                            </td>
                            <td>
                              <Badge
                                tone={
                                  l.status === "Qualified"
                                    ? "green"
                                    : l.status === "Dead"
                                      ? "red"
                                      : ""
                                }
                              >
                                {l.status}
                              </Badge>
                            </td>
                            <td>{l.motivation || "—"}</td>
                            <td>{u(l.assignedTo)}</td>
                            <td>{date(l.lastContact)}</td>
                            <td>
                              {l.nextAction || (
                                <span className="danger">
                                  Missing next action
                                </span>
                              )}
                              <small>{date(l.dueAt)}</small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!visible.length && (
                      <Empty
                        title="No leads here yet"
                        text="Try another search or add a seller."
                      />
                    )}
                    <div className="table-footer">
                      {visible.length} of {s.leads.length} opportunities{" "}
                      <span>Contact and property records stay separate.</span>
                    </div>
                  </div>
                )}
                {chosen && (
                  <LeadDetail
                    key={chosen.id}
                    lead={chosen}
                    s={s}
                    user={user}
                    act={act}
                    onClose={() => setSelected(undefined)}
                    onCall={() => startCall(chosen)}
                    onFollow={() => setModal("followup")}
                    onBook={() => setModal("appointment")}
                  />
                )}
              </>
            )}
            {view === "Calling" && (
              <>
                <PageHead
                  title="Calling workspace"
                  description="Work your queue here. Dialerr floats in the bottom-right corner."
                />
                <div className="mobile-tabs">
                  {["Queue", "Lead", "Dialer"].map((x) => (
                    <button
                      className={mobileTab === x ? "selected" : ""}
                      onClick={() => {
                        if (x === "Dialer") {
                          window.Dialerr?.open();
                          return;
                        }
                        setMobileTab(x);
                      }}
                      key={x}
                    >
                      {x}
                    </button>
                  ))}
                </div>
                <div className="call-workspace">
                  <section
                    className={
                      "queue panel " +
                      (mobileTab === "Queue" ? "mobile-visible" : "")
                    }
                  >
                    <div className="section-head">
                      <h2>Your calling queue</h2>
                      <Badge>{active.length}</Badge>
                    </div>
                    {active.map((l) => (
                      <button
                        className={
                          "queue-item " +
                          (chosen?.id === l.id ? "selected" : "")
                        }
                        key={l.id}
                        onClick={() => {
                          selectLead(l.id);
                          setMobileTab("Lead");
                        }}
                      >
                        <span className="queue-name">
                          {c(l).name}
                          <ChevronRight size={14} />
                        </span>
                        <span>{p(l).address}</span>
                        <small>{l.nextAction ?? "Add a next action"}</small>
                        <Badge tone={overdue.includes(l) ? "red" : ""}>
                          {overdue.includes(l) ? "Overdue" : l.status}
                        </Badge>
                      </button>
                    ))}
                    {!active.length && (
                      <Empty
                        title="Queue is clear"
                        text="Assigned active leads appear here."
                      />
                    )}
                  </section>
                  <section
                    className={
                      "call-center " +
                      (mobileTab === "Lead" ? "mobile-visible" : "")
                    }
                  >
                    {chosen ? (
                      <LeadDetail
                        key={chosen.id}
                        inline
                        lead={chosen}
                        s={s}
                        user={user}
                        act={act}
                        onCall={() => startCall(chosen)}
                        onFollow={() => setModal("followup")}
                        onBook={() => setModal("appointment")}
                        onNext={() => {
                          const i = active.findIndex((l) => l.id === chosen.id);
                          selectLead(active[(i + 1) % active.length]?.id);
                        }}
                      />
                    ) : (
                      <Empty
                        title="Choose a seller to get started"
                        text="Open a lead from your queue. Calling begins only when you press Call."
                      />
                    )}
                  </section>
                </div>
              </>
            )}
            {view === "Deals" && (
              <Deals s={s} user={user} act={act} selectedLeadId={selected} />
            )}
            {view === "Buyers" && <Buyers s={s} act={act} />}
            {view === "Calendar" && (
              <CalendarView
                s={s}
                user={user}
                act={act}
                onBook={(id) => {
                  setSelected(id);
                  setModal("appointment");
                }}
                setError={setError}
              />
            )}
            {view === "Reports" && (
              <>
                <PageHead
                  title="Reports"
                  description="Expected fees and money received are always separate."
                />
                <div className="stats">
                  <div className="stat">
                    <span>Collected assignment fees</span>
                    <strong>{money(collected)}</strong>
                    <p>Recorded payments received</p>
                  </div>
                  <div className="stat">
                    <span>Expected assignment fees</span>
                    <strong>
                      {money(
                        s.deals
                          .filter(
                            (d) => !["Closed", "Canceled"].includes(d.stage),
                          )
                          .reduce((t, d) => t + d.expectedFee, 0),
                      )}
                    </strong>
                    <p>Pipeline estimate · not collected revenue</p>
                  </div>
                  <div className="stat">
                    <span>Net collected after recorded costs</span>
                    <strong>
                      {money(
                        collected -
                          s.deals.reduce(
                            (t, d) => t + d.jvSplit + d.expenses,
                            0,
                          ),
                      )}
                    </strong>
                    <p>Collected less JV payments and expenses</p>
                  </div>
                </div>
                <section className="panel">
                  <h2>Opportunity pipeline</h2>
                  {statuses.map((status) => (
                    <div className="report-row" key={status}>
                      <span>{status}</span>
                      <div>
                        <i
                          style={{
                            width:
                              (s.leads.length
                                ? (s.leads.filter((l) => l.status === status)
                                    .length /
                                    s.leads.length) *
                                  100
                                : 0) + "%",
                          }}
                        />
                      </div>
                      <strong>
                        {s.leads.filter((l) => l.status === status).length}
                      </strong>
                    </div>
                  ))}
                  <p className="muted">
                    {mode === "demo"
                      ? "All figures come from demo records. They do not represent Canopy business results."
                      : "Figures reflect user-entered records, not bank verification."}
                  </p>
                </section>
              </>
            )}
            {view === "Team" && (
              <>
                <PageHead
                  title="Team management"
                  description="Admin and agent permissions are enforced on every request."
                />
                <section className="panel">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Team member</th>
                          <th>Role</th>
                          <th>Assigned active leads</th>
                          <th>Access</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.users.map((member) => (
                          <tr key={member.id}>
                            <td>
                              <strong>{member.name}</strong>
                              <small>{member.email}</small>
                            </td>
                            <td>
                              <Badge>{roleLabel(member)}</Badge>
                            </td>
                            <td>
                              {
                                active.filter((l) => l.assignedTo === member.id)
                                  .length
                              }
                            </td>
                            <td>
                              {member.role === "owner"
                                ? "All records & financials"
                                : member.role === "manager"
                                  ? "Admin-enabled capabilities"
                                  : "Assigned leads · add-only information · calling"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="muted">
                    Create individual CRM logins under Team. Each agent signs
                    into their own Dialerr account inside the toolbar.
                  </p>
                </section>
              </>
            )}
            {view === "Integrations" && (
              <>
                <PageHead
                  title="Integrations"
                  description="The CRM works on its own. Connect services when you’re ready."
                />
                <div className="integration-grid">
                  <section className="panel">
                    <div className="integration-icon">
                      <Phone size={24} />
                    </div>
                    <h2>Floating Dialerr toolbar</h2>
                    <Badge tone="green">
                      Embedded · sign in inside toolbar
                    </Badge>
                    <p>
                      The official Dialerr toolbar stays mounted while you
                      navigate Canopy. Sign into your Dialerr account inside the
                      panel. Calling and messaging happen in the toolbar.
                    </p>
                    <ul className="checklist">
                      <li>
                        <Check size={15} />
                        No Dialerr Data API token or embed secret required
                      </li>
                      <li>
                        <Check size={15} />
                        No server-side agent token exchange
                      </li>
                      <li>
                        <Check size={15} />
                        Calls start only inside the toolbar
                      </li>
                      <li>
                        <AlertCircle size={15} />
                        Dialerr account permissions and calling restrictions
                        must be verified separately
                      </li>
                    </ul>
                    <p className="muted">
                      Optional publishable embed key: restrict its allowed
                      origins. Without a key, Dialerr presents its own login.
                      Call logs and messages are managed in Dialerr; Canopy
                      notes and outcomes are manual.
                    </p>
                    <button onClick={() => navigate("Calling")}>
                      Open calling workspace
                    </button>
                  </section>
                  <section className="panel">
                    <div className="integration-icon">
                      <CalendarDays size={24} />
                    </div>
                    <h2>Google Calendar</h2>
                    <Badge tone="amber">
                      {integration.calendar
                        ? "OAuth configured · connection required"
                        : "Not connected"}
                    </Badge>
                    <p>
                      Owner-scoped OAuth, explicit calendar selection,
                      availability checks, and CRM-managed appointments.
                    </p>
                    <ul className="checklist">
                      <li>
                        <Check size={15} />
                        Encrypted tokens at rest
                      </li>
                      <li>
                        <Check size={15} />
                        Stable event IDs prevent duplicate retries
                      </li>
                      <li>
                        <Check size={15} />
                        No attendee invitations sent
                      </li>
                      <li>
                        <AlertCircle size={15} />
                        Edits in Google do not sync back automatically
                      </li>
                    </ul>
                    {owner && (
                      <a className="button" href="/api/calendar/connect">
                        Connect Google Calendar <ArrowUpRight size={14} />
                      </a>
                    )}
                    <p className="muted">
                      Demo appointments stay in Canopy. OAuth configuration and
                      a live PostgreSQL database are required.
                    </p>
                  </section>
                </div>
              </>
            )}
            {view === "Integrations" && owner && <LaunchReadiness />}
            {view === "Team" && owner && (
              <TeamControls mode={mode} act={act} s={s} />
            )}

            {view === "Settings" && <SettingsView s={s} act={act} />}
            {view === "Scripts" && can(user, "editScripts") && (
              <ScriptPermissionsEditor s={s} act={act} />
            )}
            <footer className="page-footer">
              <span>
                <Sprout size={13} /> CANOPY REAL ESTATE
              </span>
              <span>Acquisitions · Dispositions · Closing</span>
            </footer>
          </main>
          <div
            className={
              "persistent-dialer " +
              (view === "Calling" ? "on-calling" : "") +
              (mobileTab === "Dialer" ? " mobile-visible" : "") +
              (call ? " has-call" : "")
            }
            aria-label="Persistent Dialerr session"
          >
            <div className="dialer-head">
              <div className="dialerr-logo">
                <span>◒</span> Dialerr
              </div>
              <Badge tone={mode === "demo" ? "amber" : "green"}>
                Embedded toolbar
              </Badge>
            </div>
            <div
              id="dialerr-panel"
              style={{
                display: integration.embedEnabled ? "block" : "none",
                minHeight: 440,
              }}
            />
            {!integration.embedEnabled && (
              <>
                <div className="dialer-status">
                  <span className="status-dot green" />{" "}
                  {mode === "demo"
                    ? "Demo agent ready"
                    : "Dialerr disconnected"}
                </div>
                <div className="dialer-avatar">
                  <Phone size={30} />
                </div>
                <h3>{call?.name ?? "Ready when you are"}</h3>
                <p className="dialer-number">
                  {call?.phone ?? "Choose a seller from your queue."}
                </p>
                <div className="dialer-state" role="status">
                  {call?.status ?? "No active call"}
                </div>
                <div className="keypad" aria-hidden="true">
                  {"123456789*0#".split("").map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </div>
                {call?.status === "Simulated call in progress" ? (
                  <button
                    className="end-call"
                    onClick={() => {
                      setCall({
                        ...call,
                        status: "Simulation ended · record an outcome",
                      });
                      callLock.current = false;
                    }}
                  >
                    <PhoneOff size={17} />
                    End simulation
                  </button>
                ) : (
                  <button
                    className="primary full"
                    disabled={
                      !chosen || (!!chosen && c(chosen).dnc) || mode !== "demo"
                    }
                    onClick={() => chosen && startCall(chosen)}
                  >
                    <Phone size={16} />
                    {mode === "demo"
                      ? "Simulate call"
                      : "Connect Dialerr first"}
                  </button>
                )}
                <div className="dialer-disclaimer">
                  <ShieldCheck size={15} />
                  {mode === "demo"
                    ? "This is a simulator. No phone connection is made."
                    : "Live calling remains gated until credentials and permissions are verified."}
                </div>
              </>
            )}
            {call && view !== "Calling" && (
              <button className="text-link" onClick={() => navigate("Calling")}>
                Return to calling <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
      {s &&
        user &&
        requiresReview(user) &&
        (s.callReviews ?? []).some(
          (r) => r.userId === user.id && r.phase === "required",
        ) && (
          <PostCallForm
            key={
              (s.callReviews ?? []).find(
                (r) => r.userId === user.id && r.phase === "required",
              )!.id
            }
            review={(s.callReviews ?? []).find(
              (r) => r.userId === user.id && r.phase === "required",
            )!}
            s={s}
            onComplete={async () => {
              reportId.current = undefined;
              preparedLead.current = undefined;
              await refresh();
              setNotice(
                "Post-call form completed. You can move to the next lead.",
              );
            }}
          />
        )}
      {modal === "workspace" && (
        <Modal title="Your workspace" onClose={() => setModal("")}>
          <p>
            {mode === "demo"
              ? "Demo data is stored separately from your live workspace. Switch roles to try the caller experience."
              : "You are signed into the live workspace."}
          </p>
          {mode === "demo" ? (
            <div className="form-actions">
              <button
                onClick={async () => {
                  await act("demo/role", "POST", { role: "owner" });
                  setSelected(undefined);
                  setModal("");
                  navigate("Today");
                }}
              >
                Admin mode
              </button>
              <button
                className="primary"
                onClick={async () => {
                  await act("demo/role", "POST", { role: "caller" });
                  setSelected(undefined);
                  setModal("");
                  navigate("Today");
                }}
              >
                Basic Agent mode
              </button>
              <button
                onClick={async () => {
                  await act("demo/role", "POST", { role: "manager" });
                  setSelected(undefined);
                  setModal("");
                  navigate("Today");
                }}
              >
                Upper Management mode
              </button>
            </div>
          ) : (
            <button
              onClick={async () => {
                await api("auth/logout", "POST", {});
                location.reload();
              }}
            >
              <LogOut size={16} />
              Sign out
            </button>
          )}
          <p className="muted">
            Live workspace setup is in README. Demo roles are not a live
            authentication mechanism.
          </p>
        </Modal>
      )}
      {modal === "new-lead" && (
        <Modal title="Add a seller" onClose={() => setModal("")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              try {
                const lead = await act("leads", "POST", data, "Lead added");
                setSelected(lead.id);
                setModal("");
              } catch {}
            }}
          >
            <div className="form-grid">
              {[
                ["name", "Seller name"],
                ["phone", "Phone (E.164)"],
                ["email", "Email"],
                ["address", "Property address"],
                ["city", "City"],
                ["state", "State"],
                ["zip", "ZIP"],
                ["timezone", "Property timezone"],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    name={key}
                    required={key === "name" || key === "address"}
                    defaultValue={
                      key === "timezone" ? "America/Chicago" : undefined
                    }
                  />
                </Field>
              ))}
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => setModal("")}>
                Cancel
              </button>
              <button className="primary">Add lead</button>
            </div>
          </form>
        </Modal>
      )}
      {(modal === "followup" || modal === "appointment") && chosen && (
        <ScheduleModal
          key={modal + chosen.id}
          kind={modal}
          lead={chosen}
          s={s}
          user={user}
          act={act}
          close={() => setModal("")}
        />
      )}
      {modal === "import" && (
        <ImportModal s={s} act={act} close={() => setModal("")} />
      )}
    </div>
  );
}
function PageHead({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <Sprout size={28} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
type Act = (
  route: string,
  method?: string,
  body?: unknown,
  msg?: string,
) => Promise<any>;
function PropertyViews({
  property: p,
  editable,
  act,
}: {
  property: State["properties"][number];
  editable: boolean;
  act: Act;
}) {
  const streetEnabled = process.env.NEXT_PUBLIC_MAPILLARY_ENABLED === "true";
  const [mode, setMode] = useState("Satellite");
  const [streetStatus, setStreetStatus] = useState<{
    status: string;
    message?: string;
    image?: string;
    date?: string;
    copyright?: string;
    link?: string;
    distance?: number;
    matchedAddress?: string;
  }>({ status: "loading" });
  const addressKey = propertyAddress(p);
  useEffect(() => {
    if (!streetEnabled || mode !== "Street View") return;
    const controller = new AbortController();
    setStreetStatus({ status: "loading" });
    fetch("/api/property-streetview/" + encodeURIComponent(p.id), {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Street View could not load");
        return data;
      })
      .then((data) => {
        setStreetStatus(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setStreetStatus({ status: "error", message: e.message });
      });
    return () => controller.abort();
  }, [p.id, addressKey, streetEnabled, mode]);
  const address = propertyAddress(p);
  const search =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(address);
  const map =
    "https://maps.google.com/maps?q=" +
    encodeURIComponent(address) +
    "&z=19&output=embed" +
    (mode === "Satellite" ? "&t=k" : "");
  return (
    <section className="property-views" aria-label="Property imagery and maps">
      <div className="property-view-head">
        <strong>
          <Home size={15} />
          Property view
        </strong>
        <a href={search} target="_blank" rel="noreferrer">
          Open Google Maps ↗
        </a>
      </div>
      <div className="property-view-tabs">
        {(streetEnabled
          ? ["Satellite", "Map", "Street View"]
          : ["Satellite", "Map"]
        ).map((x) => (
          <button
            key={x}
            className={mode === x ? "active" : ""}
            onClick={() => setMode(x)}
          >
            {x}
          </button>
        ))}
      </div>
      {mode !== "Street View" ? (
        <iframe
          key={map}
          title={mode + " of " + address}
          src={map}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : streetStatus.status === "ready" ? (
        <div className="automatic-streetview">
          <a
            href={streetStatus.link || search}
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={streetStatus.image}
              alt={"Mapillary street-level imagery near " + address}
              onError={() =>
                setStreetStatus({
                  status: "error",
                  message:
                    "Street View image could not load. Try reopening this lead or switch to Satellite.",
                })
              }
            />
            <span>Explore on Mapillary ↗</span>
          </a>
          <small>
            {streetStatus.date ? "Imagery: " + streetStatus.date + " · " : ""}
            {streetStatus.copyright} · {streetStatus.distance}m from matched
            address
          </small>
        </div>
      ) : streetStatus.status === "loading" ? (
        <div className="street-placeholder" role="status">
          <Loader2 size={28} />
          <strong>Finding nearby Mapillary imagery…</strong>
        </div>
      ) : (
        <div className="street-fallback">
          <p role="status">{streetStatus.message}</p>
          {editable && streetStatus.status === "setup_required" && (
            <a
              href="https://www.mapillary.com/dashboard/developers"
              target="_blank"
              rel="noreferrer"
            >
              Connect free Mapillary account ↗
            </a>
          )}
          <iframe
            title={"Satellite fallback for " + address}
            src={map + "&t=k"}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      )}

      <small>
        {address} · Nearby street imagery may show adjacent properties. Verify
        the location before relying on it.
      </small>
    </section>
  );
}

function LeadDetail({
  lead: l,
  s,
  user,
  act,
  onClose,
  onCall,
  onFollow,
  onBook,
  onNext,
  inline = false,
}: {
  lead: Lead;
  s: State;
  user: User;
  act: Act;
  onClose?: () => void;
  onCall: () => void;
  onFollow: () => void;
  onBook: () => void;
  onNext?: () => void;
  inline?: boolean;
}) {
  const editable = can(user, "editLeads");
  const [newNote, setNewNote] = useState("");
  const c = s.contacts.find((c) => c.id === l.contactId)!;
  const p = s.properties.find((p) => p.id === l.propertyId)!;
  const [notes, setNotes] = useState(l.notes);
  const [answers, setAnswers] = useState(l.answers);
  const [saved, setSaved] = useState("Saved");
  const [tab, setTab] = useState("Script");
  const [compact, setCompact] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<Promise<unknown> | null>(null);
  const version =
    s.scripts.find((v) => v.version === l.scriptVersion) ?? s.scripts[0];
  const latest = useRef({ notes: l.notes, answers: l.answers });
  const dirty = useRef(false);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current)
        void save(latest.current.notes, latest.current.answers);
    },
    [],
  );
  async function save(n: string, a: Record<string, string>) {
    setSaved("Saving…");
    setSaving(true);
    const job = writes.current
      .catch(() => {})
      .then(async () => {
        try {
          await act("leads/" + l.id, "PATCH", { notes: n, answers: a });
          if (latest.current.notes === n && latest.current.answers === a) {
            dirty.current = false;
            setSaved("Saved");
          }
          return true;
        } catch {
          setSaved("Save failed · retry");
          return false;
        }
      });
    writes.current = job;
    const ok = await job;
    setSaving(false);
    return ok;
  }
  function change(n: string, a: Record<string, string>) {
    latest.current = { notes: n, answers: a };
    dirty.current = true;
    setNotes(n);
    setAnswers(a);
    setSaved("Unsaved");
    if (!editable) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = save(n, a);
    }, 650);
  }
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) await pending.current;
    if (dirty.current)
      return await save(latest.current.notes, latest.current.answers);
    return true;
  }
  const content = (
    <>
      <div className="lead-detail-head">
        <div>
          <div className="eyebrow">SELLER OPPORTUNITY</div>
          <h2>{c.name}</h2>
          <p>
            <Home size={14} />
            {p.address}
          </p>
          <small>
            {p.city}, {p.state} {p.zip} · {p.facts}
          </small>
        </div>
        {onClose && (
          <button
            className="icon-button"
            aria-label="Close lead"
            onClick={async () => {
              if (await flush()) onClose();
            }}
          >
            <X size={20} />
          </button>
        )}
      </div>
      <div className="lead-meta">
        <Badge tone={l.status === "Qualified" ? "green" : ""}>{l.status}</Badge>
        {c.dnc && <Badge tone="red">Do Not Contact</Badge>}
        <span>
          <Clock3 size={13} />
          {new Intl.DateTimeFormat("en-US", {
            timeZone: p.timezone,
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          }).format(new Date())}
        </span>
      </div>
      <div className="lead-actions">
        <button className="primary" disabled={c.dnc} onClick={onCall}>
          <Phone size={15} />
          Call
        </button>
        <button disabled={!can(user, "manageAppointments")} onClick={onFollow}>
          <Clock3 size={15} />
          Follow up
        </button>
        <button
          disabled={!canBookAppointment(user, s.settings.bookingAllowed)}
          onClick={onBook}
        >
          <CalendarDays size={15} />
          Book appointment
        </button>
      </div>
      {!l.nextAction && (
        <div className="inline-alert">
          This lead needs a next action. You can still take notes.
        </div>
      )}
      <div className="contact-strip">
        <span>
          {c.phones.find((p) => p.state === "preferred")?.number ??
            c.phones[0]?.number ??
            "No phone"}{" "}
          · {c.phones[0]?.state ?? "—"}
        </span>
        <span>{c.email}</span>
      </div>
      <PropertyViews key={p.id} property={p} editable={editable} act={act} />
      <div className="lead-controls">
        <Field label="Status">
          <select
            disabled={!editable}
            value={l.status}
            onChange={(e) =>
              act("leads/" + l.id, "PATCH", { status: e.target.value }).catch(
                () => {},
              )
            }
          >
            {statuses.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        {can(user, "assignLeads") && (
          <Field label="Assigned to">
            <select
              value={l.assignedTo}
              onChange={(e) =>
                act("leads/" + l.id, "PATCH", {
                  assignedTo: e.target.value,
                }).catch(() => {})
              }
            >
              {s.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Motivation">
          <input
            readOnly={!editable && !!l.motivation}
            defaultValue={l.motivation}
            onBlur={(e) => {
              if (e.target.value !== l.motivation)
                act("leads/" + l.id, "PATCH", {
                  motivation: e.target.value,
                }).catch(() => {});
            }}
          />
        </Field>
      </div>
      <div className="section-tabs">
        <button
          className={tab === "Script" ? "selected" : ""}
          onClick={() => setTab("Script")}
        >
          Script & answers
        </button>
        <button
          className={tab === "Notes" ? "selected" : ""}
          onClick={() => setTab("Notes")}
        >
          Notes
        </button>
        <button
          className={tab === "Messages" ? "selected" : ""}
          onClick={() => setTab("Messages")}
        >
          Messages
        </button>
        <button
          className={tab === "Activity" ? "selected" : ""}
          onClick={() => setTab("Activity")}
        >
          Activity{" "}
          <span>{s.activities.filter((a) => a.leadId === l.id).length}</span>
        </button>
      </div>
      <div className="save-line">
        <span className={saved.includes("failed") ? "danger" : "green-text"}>
          {saving ? (
            <Loader2 size={13} className="spin" />
          ) : (
            <CheckCircle2 size={13} />
          )}{" "}
          {saved}
        </span>
        {saved.includes("failed") && (
          <button className="text-link" onClick={() => save(notes, answers)}>
            Retry save
          </button>
        )}
        {tab === "Script" && (
          <button className="text-link" onClick={() => setCompact(!compact)}>
            {compact ? "Read script" : "Compact questionnaire"}
          </button>
        )}
      </div>
      {tab === "Script" && (
        <>
          <div className="script-title">
            <strong>{version.title}</strong>
            <Badge>Version {version.version}</Badge>
          </div>
          {version.questions.map((q, i) => (
            <div
              className={"script-question " + (compact ? "compact" : "")}
              key={q.key}
            >
              <div>
                <label htmlFor={l.id + q.key}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {q.label}
                </label>
                {!compact && <p>{q.prompt}</p>}
              </div>
              <textarea
                id={l.id + q.key}
                rows={2}
                readOnly={!editable && !!l.answers[q.key]}
                value={answers[q.key] ?? ""}
                placeholder="Capture the seller’s answer…"
                onChange={(e) =>
                  change(notes, { ...answers, [q.key]: e.target.value })
                }
                onBlur={() => {
                  if (!editable) return;
                  if (timer.current) clearTimeout(timer.current);
                  pending.current = save(notes, answers);
                }}
              />
            </div>
          ))}
        </>
      )}
      {!editable && tab === "Script" && (
        <button className="primary" onClick={() => save(notes, answers)}>
          Add qualification answers
        </button>
      )}
      {tab === "Notes" && (
        <>
          <Field label="Property-specific notes">
            <textarea
              rows={10}
              readOnly={!editable}
              value={notes}
              onChange={(e) => change(e.target.value, answers)}
              onBlur={() => {
                if (timer.current) clearTimeout(timer.current);
                pending.current = save(notes, answers);
              }}
              placeholder="What should the next person know?"
            />
          </Field>
          {!editable && (
            <>
              <Field label="Add information · append-only note">
                <textarea
                  rows={4}
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="New information to add; existing notes stay unchanged."
                />
              </Field>
              <button
                disabled={!newNote.trim()}
                onClick={async () => {
                  try {
                    const updated = await act(
                      "leads/" + l.id + "/notes",
                      "POST",
                      { text: newNote },
                      "Information added",
                    );
                    setNotes(updated.notes);
                    latest.current = {
                      notes: updated.notes,
                      answers: latest.current.answers,
                    };
                    setNewNote("");
                  } catch {}
                }}
              >
                Add note
              </button>
            </>
          )}
        </>
      )}
      {tab === "Messages" && (
        <div className="inline-alert">
          Use the Messages tab inside the embedded Dialerr toolbar. Canopy does
          not send or fetch messages through the Dialerr API. Record important
          conversation details in Notes.
        </div>
      )}
      {tab === "Activity" && (
        <>
          <div className="timeline">
            {s.activities
              .filter((a) => a.leadId === l.id)
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((a) => (
                <div key={a.id}>
                  <span className="timeline-dot" />
                  <strong>{a.kind}</strong>
                  <small>
                    {date(a.at)} at {time(a.at)}
                  </small>
                  <p style={{ whiteSpace: "pre-wrap" }}>{a.text}</p>
                </div>
              ))}
            {!s.activities.some((a) => a.leadId === l.id) && (
              <Empty
                title="The story starts here"
                text="Notes, outcomes and appointments will appear on this property’s timeline."
              />
            )}
          </div>
        </>
      )}
      {requiresReview(user) && (
        <button
          className="primary full"
          onClick={() =>
            act("call-reviews/start", "POST", {
              id: uid(),
              leadId: l.id,
              ended: true,
              source: "manual",
            }).catch(() => {})
          }
        >
          <FileText size={16} />
          Complete required post-call form
        </button>
      )}
      <div className="outcomes">
        <h3>Record an outcome</h3>
        <p>Manual record only. This does not dial or send anything.</p>
        <div>
          {[
            "No answer",
            "Voicemail",
            "Interested",
            "Not interested",
            "Wrong number",
            "Do Not Contact",
          ].map((outcome) => (
            <button
              key={outcome}
              className={outcome === "Interested" ? "positive" : ""}
              onClick={async () => {
                await flush();
                await act(
                  "leads/" + l.id + "/outcome",
                  "POST",
                  { outcome },
                  "Outcome saved",
                ).catch(() => {});
              }}
            >
              {outcome}
            </button>
          ))}
        </div>
      </div>
      {onNext && (
        <button
          className="primary full"
          disabled={saving}
          onClick={async () => {
            if (await flush()) {
              try {
                await act("call-reviews/ready", "POST", {});
                onNext();
              } catch {}
            }
          }}
        >
          Save & Next <ArrowRight size={16} />
        </button>
      )}
      {user.role === "owner" && (
        <button
          className="danger"
          onClick={async () => {
            if (
              !window.confirm(
                "Delete this CRM lead? It will move to Deleted leads and can be restored by an admin.",
              )
            )
              return;
            if (await flush()) {
              await act(
                "leads/" + l.id,
                "DELETE",
                {},
                "Lead moved to Deleted leads",
              );
              onClose?.();
              onNext?.();
            }
          }}
        >
          Delete lead
        </button>
      )}
      <details className="advanced">
        <summary>Contact & source details</summary>
        <p>
          Source: {l.source} · List: {l.list} · Campaign: {l.campaign} · Market:{" "}
          {l.market}
        </p>
        <p>Internal opportunity: {l.id}</p>
        {editable && (
          <>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await act(
                  "contacts/" + c.id,
                  "PATCH",
                  Object.fromEntries(new FormData(e.currentTarget)),
                  "Seller corrections saved",
                ).catch(() => {});
              }}
            >
              <div className="form-grid">
                <Field label="Seller name">
                  <input name="name" defaultValue={c.name} required />
                </Field>
                <Field label="Seller email">
                  <input name="email" type="email" defaultValue={c.email} />
                </Field>
              </div>
              <button>Save seller corrections</button>
            </form>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const body = Object.fromEntries(f);
                await act(
                  "properties/" + p.id,
                  "PATCH",
                  { ...body, ownerIds: f.getAll("ownerIds") },
                  "Property corrections saved",
                ).catch(() => {});
              }}
            >
              <div className="form-grid">
                {[
                  ["address", "Property address"],
                  ["city", "City"],
                  ["state", "State"],
                  ["zip", "ZIP"],
                  ["timezone", "Property timezone"],
                  ["facts", "Property facts & evidence"],
                ].map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      name={key}
                      defaultValue={p[key as "address"]}
                      required={key !== "facts"}
                    />
                  </Field>
                ))}
              </div>
              <Field label="Owners on this property (select all confirmed owners)">
                <select name="ownerIds" multiple defaultValue={p.ownerIds}>
                  {s.contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button>Save property corrections</button>
            </form>
          </>
        )}
        {c.phones.map((phone) => (
          <div className="phone-row" key={phone.id}>
            <span>{phone.number}</span>
            <select
              aria-label={"Phone state for " + phone.number}
              disabled={!editable}
              value={phone.state}
              onChange={(e) =>
                act("contacts/" + c.id, "PATCH", {
                  phones: c.phones.map((x) =>
                    x.id === phone.id ? { ...x, state: e.target.value } : x,
                  ),
                }).catch(() => {})
              }
            >
              {[
                "preferred",
                "valid",
                "invalid",
                "wrong-number",
                "opted-out",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
        ))}
        {editable && (
          <button
            onClick={() => {
              const number = prompt(
                "Add phone in E.164 format (e.g. +12025550100)",
              );
              if (number && /^\+[1-9]\d{7,14}$/.test(number))
                act("contacts/" + c.id, "PATCH", {
                  phones: [...c.phones, { id: uid(), number, state: "valid" }],
                }).catch(() => {});
            }}
          >
            Add phone number
          </button>
        )}
        <button
          onClick={() =>
            act(
              "contacts/" + c.id,
              "PATCH",
              { dnc: true },
              "Contact suppressed",
            ).catch(() => {})
          }
        >
          Mark contact Do Not Contact
        </button>
      </details>
    </>
  );
  return inline ? (
    <div className="panel lead-detail inline">{content}</div>
  ) : (
    <div className="detail-overlay">
      <div
        className="detail-backdrop"
        onClick={async () => {
          if (await flush()) onClose?.();
        }}
      />
      <section
        className="lead-detail panel drawer"
        aria-label={"Lead " + c.name}
      >
        {content}
      </section>
    </div>
  );
}
function ScheduleModal({
  kind,
  lead,
  s,
  user,
  act,
  close,
}: {
  kind: string;
  lead: Lead;
  s: State;
  user: User;
  act: Act;
  close: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [calendarAgent, setCalendarAgent] = useState(
    s.users.some((u) => u.id === lead.assignedTo && !u.disabled)
      ? lead.assignedTo
      : user.id,
  );
  const [calendarDay, setCalendarDay] = useState(
    localInput(lead.dueAt).slice(0, 10) ||
      new Date().toLocaleDateString("en-CA"),
  );
  const requestId = useRef(uid());
  const [err, setErr] = useState("");
  return (
    <Modal
      title={
        kind === "followup" ? "Schedule a follow-up" : "Book an appointment"
      }
      onClose={close}
    >
      <p>
        {s.contacts.find((c) => c.id === lead.contactId)?.name} ·{" "}
        {s.properties.find((p) => p.id === lead.propertyId)?.address}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const f = Object.fromEntries(new FormData(e.currentTarget));
          try {
            if (kind === "followup")
              await act(
                "followups",
                "POST",
                {
                  leadId: lead.id,
                  dueAt: new Date(String(f.start)).toISOString(),
                  assignedTo: f.assignedTo,
                  reason: f.title,
                  notes: f.notes,
                },
                "Follow-up saved",
              );
            else
              await act(
                "appointments",
                "POST",
                {
                  id: requestId.current,
                  leadId: lead.id,
                  assignedTo: f.assignedTo,
                  title: f.title,
                  start: new Date(String(f.start)).toISOString(),
                  end: new Date(String(f.end)).toISOString(),
                  timezone: f.timezone,
                },
                "Appointment saved in Canopy",
              );
            close();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label={kind === "followup" ? "Reason" : "Appointment title"}>
          <input
            name="title"
            required
            defaultValue={kind === "appointment" ? "Property walk-through" : ""}
          />
        </Field>
        <div className="form-grid">
          <Field label="Start (your browser’s local time)">
            <input
              type="datetime-local"
              name="start"
              required
              defaultValue={localInput(lead.dueAt)}
              onChange={(e) => setCalendarDay(e.target.value.slice(0, 10))}
            />
          </Field>
          {kind === "appointment" && (
            <Field label="End (your browser’s local time)">
              <input
                type="datetime-local"
                name="end"
                required
                defaultValue={localInput(
                  new Date(
                    Date.parse(lead.dueAt ?? new Date().toISOString()) +
                      3600000,
                  ).toISOString(),
                )}
              />
            </Field>
          )}
          <Field
            label={
              kind === "appointment"
                ? "Book on agent’s calendar"
                : "Assigned to"
            }
          >
            <select
              name="assignedTo"
              defaultValue={kind === "followup" ? user.id : calendarAgent}
              onChange={(e) => setCalendarAgent(e.target.value)}
            >
              {s.users
                .filter(
                  (u) =>
                    !u.disabled &&
                    (kind === "appointment" ||
                      user.role === "owner" ||
                      u.id === user.id),
                )
                .map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </Field>
          {kind === "appointment" && (
            <Field label="Property / event timezone">
              <input
                name="timezone"
                defaultValue={
                  s.properties.find((p) => p.id === lead.propertyId)?.timezone
                }
                required
              />
            </Field>
          )}
        </div>
        {kind === "appointment" && (
          <TeamBusy assignedTo={calendarAgent} day={calendarDay} />
        )}
        {kind === "followup" && (
          <Field label="Notes">
            <textarea name="notes" rows={3} />
          </Field>
        )}
        <div className="inline-alert">
          <ShieldCheck size={16} />
          {kind === "followup"
            ? "This creates a reminder. It will never automatically place a call."
            : "Saved in the CRM. No invitation is sent. Google sync is a separate owner action."}
        </div>
        {err && (
          <p className="error" role="alert">
            {err}
          </p>
        )}
        <div className="form-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={saving}>
            {saving
              ? "Saving…"
              : kind === "followup"
                ? "Save follow-up"
                : "Book appointment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ImportModal({
  s,
  act,
  close,
}: {
  s: State;
  act: Act;
  close: () => void;
}) {
  const [csv, setCSV] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<any[]>([]);
  const [step, setStep] = useState(1);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, number>>();
  const [err, setErr] = useState("");
  const [assigned, setAssigned] = useState(
    s.users.find((u) => u.role === "caller")?.id ?? s.users[0].id,
  );
  const [meta, setMeta] = useState({
    source: "CSV import",
    list: "",
    campaign: "",
    market: "",
  });
  const keys = ["name", "phone", "email", "address", "city", "state", "zip"];
  const normalized = () =>
    rows
      .map((row) =>
        Object.fromEntries(
          keys.map((k) => [k, row[mapping[k]] ?? ""]),
        ).valueOf(),
      )
      .map((row) => ({ ...row, ...meta })) as ImportRow[];
  return (
    <Modal title="Import sellers" onClose={close} wide>
      <p>
        Upload → map columns → review → import. Existing corrections are
        preserved.
      </p>
      <div className="import-steps">
        {["Choose CSV", "Map columns", "Review", "Results"].map((x, i) => (
          <span className={step === i + 1 ? "active" : ""} key={x}>
            {i + 1}. {x}
          </span>
        ))}
      </div>
      {step === 1 && (
        <>
          <label className="upload-zone">
            <Upload size={30} />
            <strong>Choose a CSV file</strong>
            <span>Up to 5,000 rows. Nothing is imported yet.</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setCSV(await file.text());
              }}
            />
          </label>
          <Field label="Or paste CSV">
            <textarea
              rows={5}
              value={csv}
              onChange={(e) => setCSV(e.target.value)}
              placeholder="name,phone,address,city,state,zip"
            />
          </Field>
          <button
            className="primary"
            disabled={!csv}
            onClick={() => {
              const parsed = parseCSV(csv);
              if (parsed.errors.length) {
                setErr(parsed.errors.join("; "));
                return;
              }
              setHeaders(parsed.headers);
              setRows(parsed.rows);
              const aliases: Record<string, string[]> = {
                name: ["seller", "seller name", "name", "owner"],
                phone: ["phone", "phone number"],
                email: ["email"],
                address: ["address", "property address"],
                city: ["city"],
                state: ["state"],
                zip: ["zip", "zip code"],
              };
              setMapping(
                Object.fromEntries(
                  keys.map((k) => [
                    k,
                    parsed.headers.find((h) =>
                      aliases[k].includes(h.toLowerCase()),
                    ) ?? "",
                  ]),
                ),
              );
              setStep(2);
            }}
          >
            Map columns <ArrowRight size={16} />
          </button>
        </>
      )}
      {step === 2 && (
        <>
          <div className="form-grid">
            {keys.map((k) => (
              <Field key={k} label={k}>
                <select
                  value={mapping[k]}
                  onChange={(e) =>
                    setMapping({ ...mapping, [k]: e.target.value })
                  }
                >
                  <option value="">Not mapped</option>
                  {headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
            {Object.keys(meta).map((k) => (
              <Field key={k} label={k}>
                <input
                  value={meta[k as keyof typeof meta]}
                  onChange={(e) => setMeta({ ...meta, [k]: e.target.value })}
                />
              </Field>
            ))}
            <Field label="Assign new leads to">
              <select
                value={assigned}
                onChange={(e) => setAssigned(e.target.value)}
              >
                {s.users.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const d = await act("imports/preview", "POST", {
                  rows: normalized(),
                });
                setPreview(d);
                setStep(3);
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Preview {rows.length} rows
          </button>
        </>
      )}
      {step === 3 && (
        <>
          <p>
            {preview.filter((r) => r.errors.length).length} invalid ·{" "}
            {preview.filter((r) => r.duplicate).length} possible duplicates ·{" "}
            {preview.filter((r) => r.ambiguous).length} ambiguous contacts
          </p>
          <div className="table-wrap import-preview">
            <table>
              <thead>
                <tr>
                  <th>Seller</th>
                  <th>Property</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.index}>
                    <td>
                      {r.row.name}
                      <small>{r.row.phone}</small>
                    </td>
                    <td>
                      {r.row.address}
                      <small>
                        {r.row.city}, {r.row.state} {r.row.zip}
                      </small>
                    </td>
                    <td>
                      {r.errors.length ? (
                        <span className="danger">{r.errors.join("; ")}</span>
                      ) : r.ambiguous ? (
                        "Ambiguous · will skip"
                      ) : r.duplicate ? (
                        "Duplicate review · existing fields retained"
                      ) : (
                        "Ready"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I reviewed duplicates. Keep existing records and corrections; skip
            ambiguous ownership and existing opportunities. Create separate
            opportunities for distinct properties.
          </label>
          <button
            className="primary"
            disabled={!reviewed || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const d = await act("imports/commit", "POST", {
                  rows: normalized(),
                  assignedTo: assigned,
                  reviewed,
                });
                setResult(d);
                setStep(4);
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Importing…" : "Import reviewed rows"}
          </button>
        </>
      )}
      {step === 4 && (
        <>
          <div className="stats">
            {Object.entries(result ?? {}).map(([k, v]) => (
              <div className="stat" key={k}>
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <p>
            Updates never overwrite corrected fields. Existing opportunities are
            skipped, and distinct properties stay separate.
          </p>
          <button className="primary" onClick={close}>
            Done
          </button>
        </>
      )}
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </Modal>
  );
}
function Deals({
  s,
  act,
  selectedLeadId,
}: {
  s: State;
  user: User;
  act: Act;
  selectedLeadId?: string;
}) {
  const [id, setId] = useState(
    s.deals.find((d) => d.leadId === selectedLeadId)?.id ?? s.deals[0]?.id,
  );
  const [creating, setCreating] = useState(false);
  const [packageText, setPackageText] = useState("");
  const deal = s.deals.find((d) => d.id === id);
  return (
    <>
      <PageHead
        title="Deals & opportunities"
        description="Analyze the property. Track the agreement. Record what’s actually collected."
        action={
          <button className="primary" onClick={() => setCreating(true)}>
            <Plus size={16} />
            Analyze a deal
          </button>
        }
      />
      <div className="deal-layout">
        <div className="deal-list">
          {s.deals.map((d) => {
            const l = [...s.leads, ...(s.archivedLeads ?? [])].find(
              (l) => l.id === d.leadId,
            )!;
            const p = s.properties.find((p) => p.id === l.propertyId)!;
            return (
              <button
                key={d.id}
                className={"panel deal-item " + (id === d.id ? "selected" : "")}
                onClick={() => setId(d.id)}
              >
                <div className="property-illustration">
                  <Home size={36} />
                  <Badge>{d.stage}</Badge>
                </div>
                <h3>{p.address}</h3>
                <p>
                  {p.city}, {p.state} {p.zip}
                </p>
                <div>
                  <span>
                    Expected fee<strong>{money(d.expectedFee)}</strong>
                  </span>
                  <span>
                    Collected<strong>{money(d.collectedFee)}</strong>
                  </span>
                </div>
              </button>
            );
          })}
          {!s.deals.length && (
            <Empty
              title="Your next deal starts here"
              text="Choose a seller opportunity to begin underwriting."
            />
          )}
        </div>
        {deal && (
          <DealEditor
            key={deal.id}
            deal={deal}
            s={s}
            act={act}
            prepare={setPackageText}
          />
        )}
      </div>
      {creating && (
        <Modal
          title="Analyze an opportunity"
          onClose={() => setCreating(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const leadId = new FormData(e.currentTarget).get("leadId");
              try {
                const d = await act("deals", "POST", { leadId });
                setId(d.id);
                setCreating(false);
              } catch {}
            }}
          >
            <Field label="Seller property">
              <select name="leadId">
                {s.leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {s.contacts.find((c) => c.id === l.contactId)?.name} ·{" "}
                    {s.properties.find((p) => p.id === l.propertyId)?.address}
                  </option>
                ))}
              </select>
            </Field>
            <button className="primary">Create analysis</button>
          </form>
        </Modal>
      )}
      {packageText && (
        <Modal
          title="Deal package · review draft"
          onClose={() => setPackageText("")}
          wide
        >
          <p>
            Review and verify all facts before sharing. Nothing has been sent.
          </p>
          <textarea rows={18} readOnly value={packageText} />
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([packageText], { type: "text/plain" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "canopy-deal-package.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download size={16} />
            Download draft
          </button>
        </Modal>
      )}
    </>
  );
}
function DealEditor({
  deal: d,
  s,
  act,
  prepare,
}: {
  deal: Deal;
  s: State;
  act: Act;
  prepare: (text: string) => void;
}) {
  const [draft, setDraft] = useState(d);
  const [saved, setSaved] = useState("Saved");
  const [method, setMethod] = useState("screening");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingPatch = useRef<Partial<Deal>>({});
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const l = [...s.leads, ...(s.archivedLeads ?? [])].find(
    (l) => l.id === d.leadId,
  )!;
  const p = s.properties.find((p) => p.id === l.propertyId)!;
  const c = s.contacts.find((c) => c.id === l.contactId)!;
  function update(patch: Partial<Deal>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setSaved("Saving…");
    Object.assign(pendingPatch.current, patch);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const saving = { ...pendingPatch.current };
      writes.current = writes.current
        .catch(() => {})
        .then(async () => {
          try {
            await act("deals/" + d.id, "PATCH", saving);
            for (const key of Object.keys(saving) as (keyof Deal)[]) {
              if (pendingPatch.current[key] === saving[key])
                delete pendingPatch.current[key];
            }
            setSaved(
              Object.keys(pendingPatch.current).length ? "Saving…" : "Saved",
            );
          } catch {
            setSaved("Save failed · edit field to retry");
          }
        });
    }, 550);
  }
  const numeric = (key: keyof Deal, label: string) => (
    <Field key={key} label={label}>
      <input
        type="number"
        min="0"
        value={draft[key] as number}
        onChange={(e) => update({ [key]: Number(e.target.value) })}
      />
    </Field>
  );
  const text = (key: keyof Deal, label: string, type = "text") => (
    <Field key={key} label={label}>
      <input
        type={type}
        value={draft[key] as string}
        onChange={(e) => update({ [key]: e.target.value })}
      />
    </Field>
  );
  return (
    <section className="panel deal-editor">
      <div className="section-head">
        <div>
          <h2>{p.address}</h2>
          <p>
            {c.name} · {p.facts}
          </p>
        </div>
        <span
          className={saved.includes("failed") ? "danger" : "green-text"}
          role="status"
        >
          {saved}
        </span>
      </div>
      <Field label="Deal stage">
        <select
          value={draft.stage}
          onChange={(e) => update({ stage: e.target.value })}
        >
          {stages.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </Field>
      <div className="section-tabs">
        <button
          className={method === "screening" ? "selected" : ""}
          onClick={() => setMethod("screening")}
        >
          Screening calculator
        </button>
        <button
          className={method === "detailed" ? "selected" : ""}
          onClick={() => setMethod("detailed")}
        >
          Detailed buyer costs
        </button>
      </div>
      <div className="form-grid">
        {numeric("asking", "Seller asking price")}
        {numeric("arv", "After repair value (ARV)")}
        <Field label="Evidence type">
          <select
            value={draft.evidenceType}
            onChange={(e) => update({ evidenceType: e.target.value })}
          >
            {[
              "Unverified",
              "Actual closed comp",
              "Reported price range",
              "Asking price",
              "Automated estimate",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        {text("arvSource", "Source / evidence URL or notes")}
        {method === "screening"
          ? numeric("buyerPercent", "Buyer acquisition percentage")
          : numeric("buyerProfit", "Target buyer profit")}
        {numeric("targetFee", "Target assignment fee")}
        {numeric("contingency", "Repair contingency")}
        {method === "detailed" && (
          <>
            {numeric("holding", "Buyer holding costs")}
            {numeric("closingCosts", "Buyer closing costs")}
          </>
        )}
      </div>
      <div className="repair-items">
        <h3>Repair line items</h3>
        {draft.repairs.map((r, i) => (
          <div className="repair-row" key={i}>
            <input
              aria-label={"Repair " + (i + 1)}
              value={r.label}
              onChange={(e) =>
                update({
                  repairs: draft.repairs.map((x, j) =>
                    i === j ? { ...x, label: e.target.value } : x,
                  ),
                })
              }
            />
            <input
              aria-label={"Repair amount " + (i + 1)}
              type="number"
              min="0"
              value={r.amount}
              onChange={(e) =>
                update({
                  repairs: draft.repairs.map((x, j) =>
                    i === j ? { ...x, amount: Number(e.target.value) } : x,
                  ),
                })
              }
            />
            <button
              aria-label={"Remove repair " + (i + 1)}
              className="icon-button"
              onClick={() =>
                update({ repairs: draft.repairs.filter((_, j) => j !== i) })
              }
            >
              <X size={15} />
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            update({
              repairs: [...draft.repairs, { label: "New repair", amount: 0 }],
            })
          }
        >
          <Plus size={14} />
          Add repair
        </button>
      </div>
      <div className="mao">
        <span>
          {method === "screening"
            ? "Screening seller MAO"
            : "Detailed buyer-cost seller MAO"}
          <small>
            {method === "screening"
              ? "ARV × acquisition % − repairs − contingency − assignment fee"
              : "ARV − repairs − contingency − holding − closing − profit − assignment fee"}
          </small>
        </span>
        <strong>
          {money(
            method === "screening" ? sellerMAO(draft) : detailedMAO(draft),
          )}
        </strong>
      </div>
      <p className="muted">
        These are separate screening methods. Do not add detailed costs to the
        percentage method. No verified comps are supplied; Texas estimates are
        not verified sold prices.
      </p>
      <details open>
        <summary>Offer history</summary>
        {d.offers.map((o) => (
          <div className="report-row" key={o.id}>
            <strong>{money(o.amount)}</strong>
            <span>{date(o.at)}</span>
            <Badge>{o.status}</Badge>
          </div>
        ))}
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = e.currentTarget;
            await act(
              "deals/" + d.id + "/offers",
              "POST",
              { amount: new FormData(f).get("amount") },
              "Draft offer recorded; nothing sent",
            ).catch(() => {});
            f.reset();
          }}
        >
          <input
            type="number"
            name="amount"
            min="1"
            placeholder="Draft offer amount"
            required
          />
          <button>Make offer draft</button>
        </form>
      </details>
      <details>
        <summary>Contract, title & closing</summary>
        <div className="form-grid">
          {numeric("contractPrice", "Contract price")}
          {text("contractDate", "Contract date", "date")}
          {text("inspectionDate", "Inspection / option deadline", "date")}
          {text("closingDate", "Closing date", "date")}
          {numeric("earnest", "Earnest money")}
          {text("titleCompany", "Title company")}
          {text("titleIssues", "Title issues")}
          <Field label="Assigned buyer">
            <select
              value={draft.buyerId}
              onChange={(e) => update({ buyerId: e.target.value })}
            >
              <option value="">Not assigned</option>
              {s.buyers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </details>
      <details open>
        <summary>Assignment fee & actual receipts</summary>
        <div className="form-grid">
          {numeric("expectedFee", "Expected fee · not revenue")}
          {numeric("collectedFee", "Collected fee · payment received")}
          {numeric("jvSplit", "JV split paid")}
          {numeric("expenses", "Expenses paid")}
        </div>
        <p className="muted">
          Only record a collected fee after payment is received.
        </p>
      </details>
      <details>
        <summary>Documents & property photos</summary>
        <p>
          Private uploads · PDF, DOCX, PNG, JPEG · 10 MB maximum. Upload
          attorney-approved templates; no legal compliance claim is made.
        </p>
        <input
          aria-label="Upload deal document or photo"
          type="file"
          accept=".pdf,.docx,.jpg,.jpeg,.png"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const data = new FormData();
            data.set("file", f);
            data.set("dealId", d.id);
            await act(
              "documents",
              "POST",
              data,
              "Private document uploaded",
            ).catch(() => {});
          }}
        />
        {s.documents
          .filter((doc) => doc.dealId === d.id)
          .map((doc) => (
            <a
              key={doc.id}
              href={"/api/documents/" + doc.id}
              className="document-link"
            >
              <FileText size={15} />
              {doc.name}
              <Download size={14} />
            </a>
          ))}
      </details>
      <details open>
        <summary>Matching buyers</summary>
        {s.buyers.map((b) => {
          const reasons = matchBuyer(b, p, draft);
          return reasons.length ? (
            <div className="buyer-match" key={b.id}>
              <strong>{b.name}</strong>
              <small>{reasons.join(" · ")}</small>
              <Badge tone="amber">Funding: {b.funding}</Badge>
            </div>
          ) : null;
        })}
        <p className="muted">
          Initial matching checks market/ZIP, purchase range and assignment
          acceptance. Review size, beds, property type, strategy and rehab
          tolerance manually.
        </p>
        <button
          onClick={() =>
            prepare(
              `CANOPY REAL ESTATE — REVIEW DRAFT\n\n${p.address}, ${p.city}, ${p.state} ${p.zip}\n${p.facts}\n\nContract price: ${money(draft.contractPrice)}\nExpected assignment fee: ${money(draft.expectedFee)}\nARV: ${money(draft.arv)}\nEvidence classification: ${draft.evidenceType}\nSource: ${draft.arvSource || "No source recorded"}\nRepairs: ${money(draft.repairs.reduce((a, r) => a + r.amount, 0))}\nContingency: ${money(draft.contingency)}\nClosing: ${draft.closingDate || "Not set"}\n\nVerify all facts, title and assignment rights before sharing. No fictional or verified sold comps are supplied by this CRM.\nNothing has been sent.`,
            )
          }
        >
          <FileText size={15} />
          Prepare deal package
        </button>
      </details>
    </section>
  );
}
function Buyers({ s, act }: { s: State; act: Act }) {
  const [selected, setSelected] = useState<Buyer>();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHead
        title="Buyer directory"
        description="Keep buy boxes and funding evidence close to every deal."
        action={
          <button className="primary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            Add buyer
          </button>
        }
      />
      <div className="buyer-grid">
        {s.buyers.map((b) => (
          <button
            className="panel buyer-card"
            key={b.id}
            onClick={() => setSelected(b)}
          >
            <span className="avatar buyer-avatar">
              <Building2 size={23} />
            </span>
            <h2>{b.name}</h2>
            <p>{b.markets || "Markets not recorded"}</p>
            <div className="buyer-range">
              {money(b.min)} – {money(b.max)}
            </div>
            <div className="buyer-tags">
              <Badge>{b.types}</Badge>
              <Badge>{b.strategy || "Strategy not set"}</Badge>
              <Badge>
                {b.assignments
                  ? "Accepts assignments"
                  : "Assignments unconfirmed"}
              </Badge>
            </div>
            <div className="buyer-funding">
              <ShieldCheck size={15} />
              {b.funding} {b.fundingDate && " · " + date(b.fundingDate)}
            </div>
          </button>
        ))}
      </div>
      {!s.buyers.length && (
        <Empty
          title="Build your buyer list"
          text="Save a buyer’s criteria to find relevant matches."
        />
      )}
      {(adding || selected) && (
        <Modal
          title={selected ? "Edit buyer criteria" : "Add a buyer"}
          onClose={() => {
            setSelected(undefined);
            setAdding(false);
          }}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              const body = {
                ...f,
                min: Number(f.min),
                max: Number(f.max),
                minBeds: Number(f.minBeds),
                minSize: Number(f.minSize),
                assignments: f.assignments === "on",
              };
              try {
                await act(
                  selected ? "buyers/" + selected.id : "buyers",
                  selected ? "PATCH" : "POST",
                  body,
                  "Buyer saved",
                );
                setSelected(undefined);
                setAdding(false);
              } catch {}
            }}
          >
            <div className="form-grid">
              {[
                ["name", "Buyer name"],
                ["email", "Email"],
                ["markets", "Markets (comma separated)"],
                ["zips", "ZIP codes"],
                ["types", "Property types"],
                ["min", "Minimum purchase price"],
                ["max", "Maximum purchase price"],
                ["minBeds", "Minimum bedrooms"],
                ["minSize", "Minimum square feet"],
                ["rehab", "Rehab tolerance"],
                ["strategy", "Rental / flipping strategy"],
                ["funding", "Funding verification evidence"],
                ["fundingDate", "Funding verified date"],
                ["recentPurchases", "Recent purchases & sources"],
                ["communication", "Communication preferences"],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    name={key}
                    required={key === "name"}
                    type={
                      ["min", "max", "minBeds", "minSize"].includes(key)
                        ? "number"
                        : key === "fundingDate"
                          ? "date"
                          : "text"
                    }
                    defaultValue={
                      (selected?.[key as keyof Buyer] as string) ?? ""
                    }
                  />
                </Field>
              ))}
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                name="assignments"
                defaultChecked={selected?.assignments}
              />
              Accepts assignments
            </label>
            <div className="form-actions">
              <button
                type="button"
                onClick={() => {
                  setSelected(undefined);
                  setAdding(false);
                }}
              >
                Cancel
              </button>
              <button className="primary">Save buyer</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function TeamBusy({ assignedTo, day }: { assignedTo: string; day: string }) {
  const [busy, setBusy] = useState<{ start: string; end: string }[]>([]);
  const [status, setStatus] = useState("Loading calendar…");
  useEffect(() => {
    let active = true;
    const start = new Date(day + "T00:00:00");
    const end = new Date(day + "T00:00:00");
    end.setDate(end.getDate() + 1);
    if (!assignedTo || !Number.isFinite(start.getTime())) return;
    setStatus("Loading calendar…");
    api("calendar/team-availability", "POST", {
      assignedTo,
      start: start.toISOString(),
      end: end.toISOString(),
    })
      .then((r) => {
        if (active) {
          setBusy(r.busy);
          setStatus("");
        }
      })
      .catch((e) => {
        if (active) setStatus(e.message);
      });
    return () => {
      active = false;
    };
  }, [assignedTo, day]);
  return (
    <div className="inline-alert" role="status">
      <div>
        <strong>Agent availability · {day}</strong>
        <p>
          Times below use your browser’s local timezone. CRM bookings only;
          external calendar events are not included.
        </p>
        {status ? (
          <p>{status}</p>
        ) : busy.length ? (
          busy.map((a, i) => (
            <p key={i}>
              Busy: {time(a.start)} – {time(a.end)}
            </p>
          ))
        ) : (
          <p>No CRM appointments booked for this day.</p>
        )}
      </div>
    </div>
  );
}

function CalendarView({
  s,
  user,
  act,
  onBook,
  setError,
}: {
  s: State;
  user: User;
  act: Act;
  onBook: (id: string) => void;
  setError: (msg: string) => void;
}) {
  const [calendars, setCalendars] = useState<
    { id: string; summary: string; accessRole: string }[]
  >([]);
  const [calendarId, setCalendarId] = useState("");
  const [availability, setAvailability] = useState("");
  const [editing, setEditing] = useState<string>();
  const [teamAgent, setTeamAgent] = useState(user.id);
  const [teamDay, setTeamDay] = useState(
    new Date().toLocaleDateString("en-CA"),
  );
  const [showCanceled, setShowCanceled] = useState(false);
  const appointments = s.appointments
    .filter((a) => showCanceled || a.status !== "canceled")
    .sort((a, b) => a.start.localeCompare(b.start));
  return (
    <>
      <PageHead
        title="Calendar & appointments"
        description="Appointment times display in your browser’s timezone. Property timezone stays with each event."
        action={
          <button
            className="primary"
            disabled={
              !s.leads.length ||
              !canBookAppointment(user, s.settings.bookingAllowed)
            }
            onClick={() => onBook(s.leads[0].id)}
          >
            <Plus size={16} />
            Book appointment
          </button>
        }
      />
      {canBookAppointment(user, s.settings.bookingAllowed) && (
        <section className="panel" style={{ padding: 20, marginBottom: 20 }}>
          <h2>Team calendars</h2>
          <p>Choose an agent and day to see their booked times.</p>
          <div className="form-grid">
            <Field label="Agent calendar">
              <select
                value={teamAgent}
                onChange={(e) => setTeamAgent(e.target.value)}
              >
                {s.users
                  .filter((u) => !u.disabled)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Calendar day">
              <input
                type="date"
                value={teamDay}
                onChange={(e) => setTeamDay(e.target.value)}
              />
            </Field>
          </div>
          <TeamBusy assignedTo={teamAgent} day={teamDay} />
        </section>
      )}
      <div className="calendar-toolbar panel">
        <div>
          <h2>CRM-managed calendar</h2>
          <p>
            Google changes do not sync back. No attendee invitations are sent.
          </p>
        </div>
        {user.role === "owner" && (
          <>
            <button
              onClick={async () => {
                try {
                  const d = await api("calendar/calendars");
                  setCalendars(d.items ?? []);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Load Google calendars
            </button>
            {calendars.length > 0 && (
              <select
                aria-label="Choose permitted Google calendar"
                value={calendarId}
                onChange={async (e) => {
                  try {
                    await act("calendar/permit", "POST", {
                      calendarId: e.target.value,
                    });
                    setCalendarId(e.target.value);
                  } catch {}
                }}
              >
                <option value="">Select permitted calendar</option>
                {calendars
                  .filter((c) => c.accessRole === "owner")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.summary}
                    </option>
                  ))}
              </select>
            )}
          </>
        )}
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={showCanceled}
          onChange={(e) => setShowCanceled(e.target.checked)}
        />
        Show canceled appointments
      </label>
      <div className="calendar-list">
        {appointments.map((a) => {
          const l = s.leads.find((l) => l.id === a.leadId)!;
          const p = s.properties.find((p) => p.id === l.propertyId)!;
          return (
            <section className="panel calendar-event" key={a.id}>
              <div className="date-block">
                <small>
                  {new Date(a.start).toLocaleDateString("en-US", {
                    month: "short",
                  })}
                </small>
                <strong>{new Date(a.start).getDate()}</strong>
              </div>
              <div className="event-detail">
                <Badge tone={a.status === "canceled" ? "red" : "green"}>
                  {a.status}
                </Badge>
                <h2>{a.title}</h2>
                <p>
                  {s.contacts.find((c) => c.id === l.contactId)?.name} ·{" "}
                  {p.address}
                </p>
                <small>
                  {time(a.start)} – {time(a.end)} browser time ·{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone: a.timezone,
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                  }).format(new Date(a.start))}{" "}
                  at property
                </small>
                <small>
                  {s.users.find((u) => u.id === a.assignedTo)?.name} ·{" "}
                  {a.googleEventId ? "Linked to Google" : "CRM only"}
                </small>
              </div>
              <div className="event-actions">
                <button
                  disabled={!can(user, "manageAppointments")}
                  onClick={() => setEditing(a.id)}
                >
                  Reschedule
                </button>
                {a.status !== "canceled" && can(user, "manageAppointments") && (
                  <button
                    onClick={() =>
                      act(
                        "appointments/" + a.id,
                        "PATCH",
                        { status: "canceled" },
                        "Canceled in CRM; sync Google separately",
                      ).catch(() => {})
                    }
                  >
                    Cancel
                  </button>
                )}
                {user.role === "owner" && calendarId && (
                  <>
                    <button
                      onClick={async () => {
                        try {
                          const d = await api("calendar/availability", "POST", {
                            calendarId,
                            start: a.start,
                            end: a.end,
                          });
                          setAvailability(JSON.stringify(d.calendars, null, 2));
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Check availability
                    </button>
                    <button
                      onClick={() =>
                        act(
                          "calendar/sync",
                          "POST",
                          { id: a.id, calendarId },
                          "Google event synchronized; no invitations sent",
                        ).catch(() => {})
                      }
                    >
                      Sync to Google
                    </button>
                  </>
                )}
              </div>
            </section>
          );
        })}
        {!appointments.length && (
          <Empty
            title="Your calendar is clear"
            text="Book a lead-linked appointment when a seller is ready."
          />
        )}
      </div>
      {editing && (
        <Modal
          title="Reschedule appointment"
          onClose={() => setEditing(undefined)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await act(
                  "appointments/" + editing,
                  "PATCH",
                  {
                    start: new Date(String(f.get("start"))).toISOString(),
                    end: new Date(String(f.get("end"))).toISOString(),
                  },
                  "Rescheduled in CRM; sync Google separately",
                );
                setEditing(undefined);
              } catch {}
            }}
          >
            <Field label="Start in browser timezone">
              <input
                type="datetime-local"
                name="start"
                required
                defaultValue={localInput(
                  s.appointments.find((a) => a.id === editing)!.start,
                )}
              />
            </Field>
            <Field label="End in browser timezone">
              <input
                type="datetime-local"
                name="end"
                required
                defaultValue={localInput(
                  s.appointments.find((a) => a.id === editing)!.end,
                )}
              />
            </Field>
            <button className="primary">Save new time</button>
          </form>
        </Modal>
      )}
      {availability && (
        <Modal
          title="Google availability evidence"
          onClose={() => setAvailability("")}
        >
          <p>
            Review busy intervals before scheduling. An empty busy list
            indicates no busy intervals returned for that request.
          </p>
          <pre>{availability}</pre>
        </Modal>
      )}
    </>
  );
}
function SettingsView({ s, act }: { s: State; act: Act }) {
  const [script, setScript] = useState(s.scripts.at(-1)!);
  return (
    <>
      <PageHead
        title="Workspace settings"
        description="Compliance-support tools assist your process; they are not legal guarantees."
      />
      <div className="settings-grid">
        <section className="panel">
          <h2>Calling & booking</h2>
          <p>Calling windows apply in each property’s recorded timezone.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await act(
                "settings",
                "POST",
                {
                  callStart: Number(f.get("callStart")),
                  callEnd: Number(f.get("callEnd")),
                  bookingAllowed: f.get("bookingAllowed") === "on",
                },
                "Controls saved",
              ).catch(() => {});
            }}
          >
            <div className="form-grid">
              <Field label="Calling starts (24-hour)">
                <input
                  name="callStart"
                  type="number"
                  min="0"
                  max="23"
                  defaultValue={s.settings.callStart}
                />
              </Field>
              <Field label="Calling ends (24-hour)">
                <input
                  name="callEnd"
                  type="number"
                  min="1"
                  max="24"
                  defaultValue={s.settings.callEnd}
                />
              </Field>
            </div>
            <label className="checkbox">
              <input
                name="bookingAllowed"
                type="checkbox"
                defaultChecked={s.settings.bookingAllowed}
              />
              Callers may book CRM appointments for assigned leads
            </label>
            <button className="primary">Save controls</button>
          </form>
          <hr />
          <h2>Export & backups</h2>
          <p>
            Export includes sensitive contact and deal records. Owner access
            only.
          </p>
          <a
            href="/api/export"
            download="canopy-workspace.json"
            className="button"
          >
            <Download size={16} />
            Export workspace
          </a>
          <p className="muted">
            Backup and restore instructions are in README. Exports exclude
            credentials. Private file uploads require a separate backup.
          </p>
        </section>
        <section className="panel">
          <h2>Seller script</h2>
          <p>
            Publishing creates a new version. Existing lead answers and script
            versions stay intact.
          </p>
          <Field label="Template title">
            <input
              value={script.title}
              onChange={(e) => setScript({ ...script, title: e.target.value })}
            />
          </Field>
          {script.questions.map((q, i) => (
            <Field key={q.key} label={q.label}>
              <textarea
                rows={2}
                value={q.prompt}
                onChange={(e) =>
                  setScript({
                    ...script,
                    questions: script.questions.map((x, j) =>
                      j === i ? { ...x, prompt: e.target.value } : x,
                    ),
                  })
                }
              />
            </Field>
          ))}
          <button
            onClick={() =>
              act(
                "scripts",
                "POST",
                { title: script.title, questions: script.questions },
                "New script version published",
              ).catch(() => {})
            }
          >
            Publish version {s.scripts.at(-1)!.version + 1}
          </button>
        </section>
      </div>
      <section className="panel audit">
        <h2>Audit history</h2>
        {s.audit
          .slice(-30)
          .reverse()
          .map((a) => (
            <div key={a.id}>
              <time>
                {date(a.at)} {time(a.at)}
              </time>
              <span>
                {s.users.find((u) => u.id === a.userId)?.name ?? a.userId}
              </span>
              <p>{a.action}</p>
            </div>
          ))}
        {!s.audit.length && (
          <p className="muted">
            Changes made in this workspace will appear here.
          </p>
        )}
      </section>
    </>
  );
}
function LaunchReadiness() {
  const [report, setReport] = useState<{
    readyForTeam: boolean;
    mode: string;
    checks: { name: string; ok: boolean; detail: string; required: boolean }[];
  }>();
  const [error, setError] = useState("");
  async function check() {
    try {
      setReport(await api("readiness"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void check();
  }, []);
  return (
    <section className="panel audit">
      <div className="section-head">
        <h2>Launch readiness</h2>
        <button onClick={check}>Check setup</button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <>
          <p>
            {report.readyForTeam
              ? "Core team setup checks pass. Provider testing and deployment acceptance still need verification."
              : "Team launch is not ready yet. Complete the required setup checks below."}
          </p>
          {report.checks.map((c) => (
            <div key={c.name}>
              <Badge tone={c.ok ? "green" : c.required ? "red" : "amber"}>
                {c.ok ? "Configured" : c.required ? "Required" : "Integration"}
              </Badge>
              <strong>{c.name}</strong>
              <p>{c.detail}</p>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
function TeamControls({ mode, act, s }: { mode: string; act: Act; s: State }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel audit">
      <AgentPermissions s={s} act={act} />
      <h2>Add an agent</h2>
      <p>
        Create an individual login with assigned-lead access. Share access
        details privately. No invitation is sent.
      </p>
      {mode === "demo" ? (
        <div className="inline-alert">
          Demo role switching is available from the workspace menu. Real login
          accounts require PostgreSQL and a live workspace.
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            setBusy(true);
            try {
              await act(
                "team/users",
                "POST",
                Object.fromEntries(new FormData(form)),
                "Agent login created",
              );
              form.reset();
              setError("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <Field label="Access level">
              <select name="role">
                <option value="caller">Basic Agent</option>
                <option value="manager">
                  Upper Management · all toggles off
                </option>
              </select>
            </Field>
            <Field label="Caller name">
              <input name="name" required />
            </Field>
            <Field label="Login email">
              <input name="email" type="email" required autoComplete="off" />
            </Field>
            <Field label="Temporary password (14+ characters)">
              <input
                name="password"
                type="password"
                minLength={14}
                required
                autoComplete="new-password"
              />
            </Field>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Creating…" : "Create agent login"}
          </button>
        </form>
      )}
    </section>
  );
}

function AgentPermissions({ s, act }: { s: State; act: Act }) {
  return (
    <>
      <h2>Agent modes & permissions</h2>
      <div className="inline-alert">
        These roles protect Canopy CRM records. Dialerr uses its own signed-in
        account; configure matching restrictions in Dialerr separately.
      </div>
      {s.users
        .filter((u) => u.role !== "owner")
        .map((u) => (
          <section className="panel" key={u.id} style={{ margin: "16px 0" }}>
            <div className="section-head">
              <div>
                <h3>{u.name}</h3>
                <p>{u.email}</p>
              </div>
              <Badge>{roleLabel(u)}</Badge>
            </div>
            <Field label={"Access level for " + u.name}>
              <select
                value={u.role}
                onChange={(e) =>
                  act(
                    "team/users/" + u.id,
                    "PATCH",
                    { role: e.target.value },
                    "Agent mode updated",
                  ).catch(() => {})
                }
              >
                <option value="caller">
                  Basic Agent · add information and call
                </option>
                <option value="manager">Upper Management · configurable</option>
              </select>
            </Field>
            {u.role === "manager" && (
              <div className="permission-grid">
                {Object.entries(capabilityLabels).map(([key, label]) => (
                  <label className="checkbox" key={key}>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={
                        !!u.capabilities?.[key as keyof typeof capabilityLabels]
                      }
                      onChange={(e) =>
                        act(
                          "team/users/" + u.id,
                          "PATCH",
                          { capabilities: { [key]: e.target.checked } },
                          "Management capability updated",
                        ).catch(() => {})
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
            <p className="muted">
              Lead deletion, role configuration, integration credentials, and
              workspace settings remain Admin only.
            </p>
            <button
              onClick={() =>
                act(
                  "team/users/" + u.id,
                  "PATCH",
                  { disabled: !u.disabled },
                  "Account access updated",
                ).catch(() => {})
              }
            >
              {u.disabled ? "Enable account" : "Revoke account access"}
            </button>
          </section>
        ))}
      <details>
        <summary>Deleted leads · Admin recovery</summary>
        {(s.archivedLeads ?? [])
          .filter((l) => l.deletedAt)
          .map((l) => (
            <div className="report-row" key={l.id}>
              <span>
                {s.contacts.find((c) => c.id === l.contactId)?.name} ·{" "}
                {s.properties.find((p) => p.id === l.propertyId)?.address}
              </span>
              <button
                onClick={() =>
                  act(
                    "leads/" + l.id + "/restore",
                    "POST",
                    {},
                    "Lead restored",
                  ).catch(() => {})
                }
              >
                Restore lead
              </button>
            </div>
          ))}
        {!(s.archivedLeads ?? []).some((l) => l.deletedAt) && (
          <p>No deleted leads.</p>
        )}
      </details>
    </>
  );
}

function ScriptPermissionsEditor({ s, act }: { s: State; act: Act }) {
  const [template, setTemplate] = useState(s.scripts.at(-1)!);
  return (
    <>
      <PageHead
        title="Seller scripts"
        description="Publish new script versions without changing previously captured answers."
      />
      <section className="panel">
        <Field label="Script title">
          <input
            value={template.title}
            onChange={(e) =>
              setTemplate({ ...template, title: e.target.value })
            }
          />
        </Field>
        {template.questions.map((q, i) => (
          <Field key={q.key} label={q.label}>
            <textarea
              rows={2}
              value={q.prompt}
              onChange={(e) =>
                setTemplate({
                  ...template,
                  questions: template.questions.map((x, j) =>
                    j === i ? { ...x, prompt: e.target.value } : x,
                  ),
                })
              }
            />
          </Field>
        ))}
        <button
          className="primary"
          onClick={() =>
            act(
              "scripts",
              "POST",
              { title: template.title, questions: template.questions },
              "New script version published",
            ).catch(() => {})
          }
        >
          Publish script version {s.scripts.at(-1)!.version + 1}
        </button>
      </section>
    </>
  );
}

function PostCallForm({
  review,
  s,
  onComplete,
}: {
  review: CallReview;
  s: State;
  onComplete: () => Promise<void>;
}) {
  const linked = s.leads.find((l) => l.id === review.leadId);
  const contact = s.contacts.find((c) => c.id === linked?.contactId);
  const property = s.properties.find((p) => p.id === linked?.propertyId);
  const [leadId, setLeadId] = useState(review.leadId ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>({
    sellerName: contact?.name ?? "",
    sellerPhone:
      contact?.phones.find((p) => p.state === "preferred")?.number ??
      contact?.phones[0]?.number ??
      "",
    sellerAddress: property
      ? [property.address, property.city, property.state, property.zip].join(
          ", ",
        )
      : "",
    appointmentTimezone: property?.timezone ?? "America/Chicago",
    ...review.answers,
  });
  const [saving, setSaving] = useState("Draft saved");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const latest = useRef({ answers, leadId });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  function persist(a: Record<string, string>, id: string) {
    setSaving("Saving draft…");
    const job = writes.current
      .catch(() => {})
      .then(() =>
        api("call-reviews/" + review.id + "/draft", "POST", {
          leadId: id || undefined,
          answers: a,
        }),
      )
      .then(() => setSaving("Draft saved"))
      .catch((e) => {
        setSaving("Draft save failed");
        setError((e as Error).message);
      });
    writes.current = job;
    return job;
  }
  function change(key: string, value: string) {
    const updated = { ...latest.current.answers, [key]: value };
    latest.current = { ...latest.current, answers: updated };
    setAnswers(updated);
    setSaving("Unsaved draft");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => persist(updated, latest.current.leadId),
      500,
    );
  }
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("beforeunload", before);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const connected = answers.outcome === "Seller conversation";
  const text = (
    key: string,
    label: string,
    required = false,
    type = "text",
  ) => (
    <Field key={key} label={label + (required ? " *" : "")}>
      <input
        name={key}
        type={type}
        value={answers[key] ?? ""}
        onChange={(e) => change(key, e.target.value)}
        required={required}
        aria-invalid={!!errors[key]}
      />
      {errors[key] && <small className="danger">{errors[key]}</small>}
    </Field>
  );
  const area = (key: string, label: string, required = false) => (
    <Field key={key} label={label + (required ? " *" : "")}>
      <textarea
        rows={3}
        name={key}
        value={answers[key] ?? ""}
        onChange={(e) => change(key, e.target.value)}
        required={required}
        aria-invalid={!!errors[key]}
      />
      {errors[key] && <small className="danger">{errors[key]}</small>}
    </Field>
  );
  return (
    <Modal title="Required post-call form" onClose={() => {}} locked wide>
      <p>
        HOT LEADS · Complete this report before moving to the next lead. Answers
        are saved as a new call record; existing seller information stays
        unchanged.
      </p>
      <div className="save-line">
        <span
          role="status"
          className={saving.includes("failed") ? "danger" : "green-text"}
        >
          {saving}
        </span>
        <span>Form version 1</span>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const validation = validatePostCall(latest.current.answers);
          if (!latest.current.leadId)
            validation.leadId = "Select the correct CRM lead";
          setErrors(validation);
          if (Object.keys(validation).length) {
            setError("Complete the highlighted required questions.");
            return;
          }
          setBusy(true);
          setError("");
          if (timer.current) clearTimeout(timer.current);
          await writes.current;
          try {
            await api("call-reviews/" + review.id + "/submit", "POST", {
              leadId: latest.current.leadId,
              answers: latest.current.answers,
            });
            await onComplete();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Confirm the CRM seller/property for this call *">
          <select
            value={leadId}
            required
            onChange={(e) => {
              const id = e.target.value;
              setLeadId(id);
              const l = s.leads.find((l) => l.id === id);
              const c = s.contacts.find((c) => c.id === l?.contactId);
              const p = s.properties.find((p) => p.id === l?.propertyId);
              const updated = {
                ...answers,
                sellerName: c?.name ?? "",
                sellerPhone: c?.phones[0]?.number ?? "",
                sellerAddress: p
                  ? [p.address, p.city, p.state, p.zip].join(", ")
                  : "",
                appointmentTimezone: p?.timezone ?? "America/Chicago",
              };
              setAnswers(updated);
              latest.current = { leadId: id, answers: updated };
              void persist(updated, id);
            }}
          >
            <option value="">Choose the correct lead — never guess</option>
            {s.leads.map((l) => (
              <option key={l.id} value={l.id}>
                {s.contacts.find((c) => c.id === l.contactId)?.name} ·{" "}
                {s.properties.find((p) => p.id === l.propertyId)?.address}
              </option>
            ))}
          </select>
          {errors.leadId && <small className="danger">{errors.leadId}</small>}
        </Field>
        <Field label="Call outcome *">
          <select
            value={answers.outcome ?? ""}
            required
            onChange={(e) => change("outcome", e.target.value)}
          >
            <option value="">Choose outcome</option>
            {postCallOutcomes.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Field>
        {connected && (
          <>
            <div className="form-grid">
              {text("sellerName", "Seller full name", true)}
              {text("sellerPhone", "Seller phone number", true)}
              {text("sellerAddress", "Seller full address", true)}
              <Field label="Overall condition *">
                <select
                  value={answers.condition ?? ""}
                  required
                  onChange={(e) => change("condition", e.target.value)}
                >
                  <option value="">Choose condition</option>
                  {conditions.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>
            {area("conditionDetails", "Details on condition", true)}
            {area("motivation", "Motivation", true)}
            <div className="form-grid">
              {text(
                "askingPrice",
                "Seller asking price · enter Unknown if not provided",
                true,
              )}
              <Field label="Timeline *">
                <select
                  value={answers.timeline ?? ""}
                  required
                  onChange={(e) => change("timeline", e.target.value)}
                >
                  <option value="">Choose timeline</option>
                  {timelines.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Appointment agreed during this call? *">
                <select
                  value={answers.appointmentSet ?? ""}
                  required
                  onChange={(e) => change("appointmentSet", e.target.value)}
                >
                  <option value="">Choose Yes or No</option>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </Field>
            </div>
            {answers.appointmentSet === "Yes" && (
              <>
                <div className="form-grid">
                  {text(
                    "appointmentDate",
                    "Appointment date set",
                    true,
                    "date",
                  )}
                  {text("appointmentTime", "Appointment time", true, "time")}
                  {text("appointmentTimezone", "Appointment timezone", true)}
                </div>
                <p className="muted">
                  These details go into the call report for management review.
                  This form does not send invitations or create an external
                  calendar event.
                </p>
              </>
            )}
          </>
        )}
        {area(
          "summary",
          connected
            ? "Conversation summary"
            : "Attempt summary · what happened?",
          true,
        )}
        {area("notes", "Notes")}
        {text("nextAction", "Recommended next step")}
        {!connected && (
          <p className="muted">
            No-answer and unsuccessful attempts require an outcome and summary.
            Do not invent seller condition, motivation, price, or appointment
            details.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              persist(latest.current.answers, latest.current.leadId)
            }
          >
            Save draft
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Submitting…" : "Submit post-call form"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

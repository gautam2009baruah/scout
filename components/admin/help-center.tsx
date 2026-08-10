"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowRight, BarChart3, Bot, Building2, CheckCircle2, ChevronRight, CircleHelp,
  Command, Compass, Database, Eye, Filter, FolderTree, GitBranch, KeyRound, LayoutDashboard,
  Lightbulb, ListChecks, Mail, MapPinned, MousePointerClick, PanelLeftClose, Pencil, Play,
  Plus, RefreshCcw, Save, Search, ShieldCheck, SlidersHorizontal, Sparkles, TableProperties,
  Trash2, Upload, UsersRound, Zap, type LucideIcon
} from "lucide-react";

type ControlDoc = { icon: LucideIcon; name: string; how: string };
type PageDoc = { name: string; path?: string; summary: string; controls: ControlDoc[]; tips?: string[] };
type Accent = "blue" | "sky" | "emerald" | "violet" | "amber" | "rose" | "slate";
type CategoryDoc = { key: string; label: string; icon: LucideIcon; accent: Accent; blurb: string; pages: PageDoc[] };

const ACCENTS: Record<Accent, { icon: string; soft: string; ring: string; text: string; bar: string; dot: string }> = {
  blue: { icon: "bg-blue-700", soft: "bg-blue-50", ring: "ring-blue-200", text: "text-blue-700", bar: "bg-blue-700", dot: "bg-blue-500" },
  sky: { icon: "bg-sky-600", soft: "bg-sky-50", ring: "ring-sky-200", text: "text-sky-700", bar: "bg-sky-600", dot: "bg-sky-500" },
  emerald: { icon: "bg-emerald-600", soft: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700", bar: "bg-emerald-600", dot: "bg-emerald-500" },
  violet: { icon: "bg-violet-600", soft: "bg-violet-50", ring: "ring-violet-200", text: "text-violet-700", bar: "bg-violet-600", dot: "bg-violet-500" },
  amber: { icon: "bg-amber-500", soft: "bg-amber-50", ring: "ring-amber-200", text: "text-amber-700", bar: "bg-amber-500", dot: "bg-amber-500" },
  rose: { icon: "bg-rose-600", soft: "bg-rose-50", ring: "ring-rose-200", text: "text-rose-700", bar: "bg-rose-600", dot: "bg-rose-500" },
  slate: { icon: "bg-slate-700", soft: "bg-slate-100", ring: "ring-slate-300", text: "text-slate-700", bar: "bg-slate-700", dot: "bg-slate-500" }
};

const CATEGORIES: CategoryDoc[] = [
  {
    key: "getting-around",
    label: "Getting Around",
    icon: Compass,
    accent: "slate",
    blurb: "The controls that appear on every screen — navigation, context, and your account.",
    pages: [
      {
        name: "Global navigation & shell",
        summary: "Every Control Panel page shares the same frame: a left sidebar of modules, a top header with your context, and the main content area.",
        controls: [
          { icon: MapPinned, name: "Sidebar module links", how: "Click any item in the left rail to open that module. The active page is highlighted." },
          { icon: PanelLeftClose, name: "Collapse sidebar", how: "Toggle the sidebar between full and icon-only to give the content more room. Your choice is remembered." },
          { icon: ChevronRight, name: "Breadcrumb", how: "Shows Company › (Section) › Page so you always know where you are." },
          { icon: Building2, name: "Company context switcher", how: "If you manage more than one company, switch the active tenant here — all data reloads for that company." },
          { icon: UsersRound, name: "User menu", how: "Your name in the top-right opens account actions including sign out." },
          { icon: CircleHelp, name: "Help", how: "Opens this Help Center from the header on any page." }
        ],
        tips: ["Press / anywhere on this page to jump straight to search."]
      }
    ]
  },
  {
    key: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    accent: "blue",
    blurb: "Your landing dashboard — a map of every module and quick jump-off points.",
    pages: [
      {
        name: "Dashboard",
        path: "/control-panel",
        summary: "The home screen. Cards summarize each area you have access to and route you straight into it.",
        controls: [
          { icon: MousePointerClick, name: "Module cards", how: "Each card is a shortcut into a module. Click to open it." },
          { icon: Zap, name: "Quick actions", how: "Common tasks (create a workflow, open the designer) are surfaced for one-click access." }
        ]
      }
    ]
  },
  {
    key: "guided-workflows",
    label: "Guided Workflows",
    icon: MapPinned,
    accent: "sky",
    blurb: "Record, publish, and monitor step-by-step in-app guides that walk users through any UI.",
    pages: [
      {
        name: "Guided Workflows console",
        path: "/control-panel/guided-workflows",
        summary: "Create and manage the guides your users see. Each workflow is an ordered list of steps anchored to real controls on a target app.",
        controls: [
          { icon: Plus, name: "New workflow", how: "Start a new guide, give it a name, and choose the target application it runs on." },
          { icon: Pencil, name: "Edit steps", how: "Reorder, rename, or rewrite the tooltip content for each step." },
          { icon: Eye, name: "Preview", how: "Play the workflow to see exactly what the end user experiences before publishing." },
          { icon: Upload, name: "Publish / status", how: "Move a workflow between draft and published so only ready guides go live." }
        ],
        tips: ["Give every step a short title and one clear instruction — the tooltip reads best when concise."]
      },
      {
        name: "Workflow Training Setup",
        summary: "Configure how the recorder captures controls so steps reliably re-find their targets later.",
        controls: [
          { icon: SlidersHorizontal, name: "Capture settings", how: "Tune how strictly a step matches its control (id, text, siblings) for resilient playback." },
          { icon: ShieldCheck, name: "Target application", how: "Bind training to the correct app so recorded selectors resolve on the right site." }
        ]
      },
      {
        name: "Self-Healing Review",
        summary: "When a step's control moves or changes, Scout proposes a fix. Review and approve those suggestions here.",
        controls: [
          { icon: Sparkles, name: "Suggested fixes", how: "See AI-proposed selector updates with before/after context." },
          { icon: CheckCircle2, name: "Approve / reject", how: "Accept a healing suggestion to keep the guide working, or reject to keep the original." }
        ]
      },
      {
        name: "Workflow Analytics",
        summary: "Understand adoption: which guides run, where users drop off, and completion rates.",
        controls: [
          { icon: Filter, name: "Date & workflow filters", how: "Scope the charts to a time range or a specific guide." },
          { icon: BarChart3, name: "Completion & drop-off", how: "Read step-by-step funnels to find the steps that lose users." }
        ]
      }
    ]
  },
  {
    key: "content-structure",
    label: "Content Structure",
    icon: FolderTree,
    accent: "emerald",
    blurb: "Organize the knowledge base that powers answers — topics, documents, and their hierarchy.",
    pages: [
      {
        name: "Content Structure",
        path: "/control-panel/content-structure",
        summary: "Curate the topics and documents the assistant retrieves from. A clean structure means sharper answers.",
        controls: [
          { icon: Plus, name: "Add topic", how: "Create a topic (a folder of related knowledge) to group documents." },
          { icon: Upload, name: "Upload / attach documents", how: "Add source documents to a topic so they become retrievable knowledge." },
          { icon: Pencil, name: "Rename & organize", how: "Rename topics and move items to keep the hierarchy meaningful." },
          { icon: Trash2, name: "Remove", how: "Delete topics or documents that are outdated so they stop influencing answers." }
        ],
        tips: ["Group documents by intent, not by file type — retrieval works best when a topic answers one kind of question."]
      }
    ]
  },
  {
    key: "orchestration",
    label: "Orchestration Designer",
    icon: GitBranch,
    accent: "violet",
    blurb: "Visually compose automations: chain nodes like chatbot, AI extraction, knowledge, database, and notifications.",
    pages: [
      {
        name: "Orchestration Designer",
        path: "/control-panel/orchestration-designer",
        summary: "A drag-and-drop canvas where you build a flow node by node and connect them into an end-to-end automation.",
        controls: [
          { icon: Plus, name: "Add node", how: "Drop nodes (chatbot, AI extraction, knowledge base, database, notification, end) onto the canvas." },
          { icon: GitBranch, name: "Connect nodes", how: "Draw links between nodes to define the order data flows through the automation." },
          { icon: SlidersHorizontal, name: "Node properties panel", how: "Select a node to configure its inputs — queries, prompts, credentials, and outputs." },
          { icon: Play, name: "Run / test", how: "Execute the flow to validate each node passes the right data to the next." },
          { icon: Save, name: "Save", how: "Persist the orchestration so it can be triggered and reused." }
        ],
        tips: ["Build left-to-right and test after each node so you catch a broken hand-off early."]
      },
      {
        name: "Pending AI Plans",
        path: "/control-panel/pending-ai-plans",
        summary: "When the AI drafts an orchestration for you, it lands here for human review before it becomes active.",
        controls: [
          { icon: Eye, name: "Review plan", how: "Open a proposed plan to inspect the nodes and logic the AI generated." },
          { icon: CheckCircle2, name: "Approve", how: "Accept a plan to open it in the designer and put it to work." },
          { icon: Trash2, name: "Discard", how: "Reject a plan that isn't what you intended." }
        ]
      }
    ]
  },
  {
    key: "administration",
    label: "Administration",
    icon: Building2,
    accent: "amber",
    blurb: "Company setup, users, AI settings, chatbot, database schema, email, and platform monitoring.",
    pages: [
      {
        name: "Company & Role Setup",
        summary: "Define the company profile and the roles that gate what each user can see and do.",
        controls: [
          { icon: TableProperties, name: "Roles & permissions", how: "Create roles and assign module permissions to control access." },
          { icon: Save, name: "Save changes", how: "Apply company and role edits so they take effect for users." }
        ]
      },
      {
        name: "User Management",
        path: "/control-panel/administration/user-management",
        summary: "Invite, edit, and deactivate the people who use the Control Panel.",
        controls: [
          { icon: Plus, name: "Add user", how: "Register a new user with a name, email, and role." },
          { icon: Search, name: "Search & filter", how: "Find a user quickly by name or email." },
          { icon: KeyRound, name: "Reset password", how: "Issue a password reset when a user is locked out." },
          { icon: ShieldCheck, name: "Activate / deactivate", how: "Enable or disable access without deleting the account." }
        ]
      },
      {
        name: "AI Configuration",
        summary: "Choose and tune the AI models that power chat, extraction, and orchestration.",
        controls: [
          { icon: Bot, name: "Model selection", how: "Pick the provider/model used for generation and embeddings." },
          { icon: SlidersHorizontal, name: "Parameters", how: "Adjust behavior settings that shape responses." },
          { icon: Save, name: "Save configuration", how: "Store the AI settings for the company." }
        ]
      },
      {
        name: "Chatbot Settings",
        summary: "Control the look and behavior of the embeddable chatbot widget.",
        controls: [
          { icon: SlidersHorizontal, name: "Appearance & theme", how: "Set brand colors, header, and launcher so the widget matches your site." },
          { icon: KeyRound, name: "API keys", how: "Generate and rotate the browser keys customer sites use to load the widget." }
        ]
      },
      {
        name: "Database Schema Manager",
        path: "/control-panel/administration/database-schema",
        summary: "Register the database schemas that orchestration database nodes are allowed to read and write.",
        controls: [
          { icon: Database, name: "Add schema", how: "Register a schema/connection the database node can target." },
          { icon: ShieldCheck, name: "Activate schema", how: "Mark a schema active so it appears as a choice inside orchestrations." }
        ]
      },
      {
        name: "Email Credentials",
        summary: "Store the mailbox credentials that notification and email-trigger flows use.",
        controls: [
          { icon: Mail, name: "Add credential", how: "Save an email account so flows can send and poll messages." },
          { icon: ShieldCheck, name: "Test connection", how: "Verify the credential works before flows depend on it." }
        ]
      },
      {
        name: "Triggers & Monitoring",
        path: "/control-panel/triggers-monitoring",
        summary: "Watch scheduled, email, and API triggers and inspect their recent runs.",
        controls: [
          { icon: Activity, name: "Run history", how: "See each trigger execution with status and timing." },
          { icon: Filter, name: "Filters", how: "Narrow by trigger type or status to focus on failures." }
        ]
      },
      {
        name: "Search Analytics",
        summary: "Measure retrieval quality — what users search for and how well the knowledge base answers.",
        controls: [
          { icon: BarChart3, name: "Query trends", how: "See top queries and volumes over time." },
          { icon: Filter, name: "Date range", how: "Scope analytics to a period." }
        ]
      }
    ]
  },
  {
    key: "approvals",
    label: "Approvals",
    icon: ListChecks,
    accent: "rose",
    blurb: "Human-in-the-loop checkpoints where you approve or reject items a flow paused for.",
    pages: [
      {
        name: "Approvals",
        path: "/control-panel/approvals",
        summary: "A queue of items awaiting your decision. Open one to see its context, then approve or reject.",
        controls: [
          { icon: Eye, name: "Open request", how: "View the full details an automation submitted for approval." },
          { icon: CheckCircle2, name: "Approve", how: "Approve to let the flow continue past the checkpoint." },
          { icon: Trash2, name: "Reject", how: "Reject to stop the flow and record the reason." }
        ]
      }
    ]
  },
  {
    key: "account",
    label: "Account & Security",
    icon: KeyRound,
    accent: "slate",
    blurb: "Manage your own credentials and session.",
    pages: [
      {
        name: "Change Password",
        path: "/control-panel/change-password",
        summary: "Update the password for your account.",
        controls: [
          { icon: KeyRound, name: "Current & new password", how: "Enter your current password, then the new one twice to confirm." },
          { icon: Save, name: "Update password", how: "Save to apply the new password immediately." }
        ]
      },
      {
        name: "Session",
        summary: "For security, sessions expire after inactivity.",
        controls: [
          { icon: RefreshCcw, name: "Extend session", how: "When a warning appears, choose to stay signed in to keep working." },
          { icon: ShieldCheck, name: "Sign out", how: "End your session from the user menu at any time." }
        ]
      }
    ]
  }
];

const QUICK_START = [
  { icon: Search, title: "Search everything", body: "Use the search box to jump to any page or control by name — no scrolling required." },
  { icon: Compass, title: "Browse by area", body: "Pick a category on the left to see every page in that area and what each control does." },
  { icon: Lightbulb, title: "Read the tips", body: "Yellow tips share the fastest, most reliable way to use a screen." }
];

export function HelpCenter() {
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState(CATEGORIES[0].key);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const out: { cat: CategoryDoc; page: PageDoc; controls: ControlDoc[] }[] = [];
    for (const cat of CATEGORIES) {
      for (const page of cat.pages) {
        const pageMatch = `${page.name} ${page.summary}`.toLowerCase().includes(q);
        const controlMatches = page.controls.filter((c) => `${c.name} ${c.how}`.toLowerCase().includes(q));
        if (pageMatch || controlMatches.length) out.push({ cat, page, controls: pageMatch ? page.controls : controlMatches });
      }
    }
    return out;
  }, [query]);

  const activeCategory = CATEGORIES.find((c) => c.key === activeKey) ?? CATEGORIES[0];
  const totalControls = CATEGORIES.reduce((n, c) => n + c.pages.reduce((m, p) => m + p.controls.length, 0), 0);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden border border-slate-300 bg-gradient-to-br from-blue-700 via-blue-700 to-sky-600 text-white">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative px-6 py-8 sm:px-10 sm:py-10">
          <div className="inline-flex items-center gap-2 bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
            <Sparkles className="h-3.5 w-3.5" /> Help Center
          </div>
          <h1 className="mt-4 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
            Everything in Scout, explained where you need it.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-blue-50/90">
            Search {CATEGORIES.length} areas and {totalControls} documented controls. No jargon — just what each screen does and how to use it.
          </p>
          <div className="mt-6 flex max-w-xl items-center gap-2 bg-white px-3 shadow-lg">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages and controls…  (press / )"
              className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              aria-label="Search help"
            />
            {query ? (
              <button onClick={() => setQuery("")} className="shrink-0 px-2 text-xs font-semibold text-slate-400 hover:text-slate-700" type="button">Clear</button>
            ) : (
              <span className="hidden shrink-0 items-center gap-1 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:inline-flex">
                <Command className="h-3 w-3" />/
              </span>
            )}
          </div>
        </div>
      </section>

      {results ? (
        /* Search results */
        <section className="space-y-4">
          <p className="text-sm text-slate-500">
            {results.length === 0 ? "No matches." : `${results.length} page${results.length === 1 ? "" : "s"} match “${query}”.`}
          </p>
          {results.map(({ cat, page, controls }) => {
            const a = ACCENTS[cat.accent];
            return (
              <article key={`${cat.key}-${page.name}`} className="border border-slate-300 bg-white">
                <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
                  <span className={`inline-flex h-6 items-center gap-1.5 ${a.soft} ${a.text} px-2 text-[11px] font-semibold uppercase tracking-wide ring-1 ${a.ring}`}>
                    <cat.icon className="h-3.5 w-3.5" /> {cat.label}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-950">{page.name}</h3>
                </div>
                <ControlList controls={controls} accent={cat.accent} />
              </article>
            );
          })}
        </section>
      ) : (
        <>
          {/* Quick start */}
          <section className="grid gap-4 sm:grid-cols-3">
            {QUICK_START.map((q) => (
              <div key={q.title} className="flex items-start gap-3 border border-slate-300 bg-white p-4">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center bg-slate-900 text-white">
                  <q.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-950">{q.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-600">{q.body}</p>
                </div>
              </div>
            ))}
          </section>

          {/* Browse: rail + detail */}
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <nav aria-label="Help categories" className="h-max border border-slate-300 bg-white lg:sticky lg:top-20">
              {CATEGORIES.map((cat) => {
                const a = ACCENTS[cat.accent];
                const isActive = cat.key === activeKey;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setActiveKey(cat.key)}
                    className={`flex w-full items-center gap-3 border-l-2 px-3 py-3 text-left transition ${isActive ? `border-current ${a.text} ${a.soft}` : "border-l-transparent text-slate-600 hover:bg-slate-50"}`}
                  >
                    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center text-white ${a.icon}`}>
                      <cat.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-950">{cat.label}</span>
                      <span className="block text-[11px] text-slate-500">{cat.pages.length} page{cat.pages.length === 1 ? "" : "s"}</span>
                    </span>
                    {isActive ? <ChevronRight className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </nav>

            <div className="space-y-5">
              <div className="flex items-start gap-3 border border-slate-300 bg-white p-5">
                <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center text-white ${ACCENTS[activeCategory.accent].icon}`}>
                  <activeCategory.icon className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">{activeCategory.label}</h2>
                  <p className="mt-0.5 text-sm leading-6 text-slate-600">{activeCategory.blurb}</p>
                </div>
              </div>

              {activeCategory.pages.map((page) => (
                <article key={page.name} className="border border-slate-300 bg-white">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-950">{page.name}</h3>
                      {page.path ? (
                        <code className="bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">{page.path}</code>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{page.summary}</p>
                  </div>
                  <ControlList controls={page.controls} accent={activeCategory.accent} />
                  {page.tips?.length ? (
                    <div className="flex flex-wrap gap-2 border-t border-slate-200 bg-amber-50/60 px-5 py-3">
                      {page.tips.map((tip) => (
                        <p key={tip} className="inline-flex items-start gap-2 text-xs font-medium text-amber-800">
                          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {tip}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ControlList({ controls, accent }: { controls: ControlDoc[]; accent: Accent }) {
  const a = ACCENTS[accent];
  return (
    <ul className="divide-y divide-slate-100">
      {controls.map((c) => (
        <li key={c.name} className="flex items-start gap-3 px-5 py-3">
          <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center ${a.soft} ${a.text} ring-1 ${a.ring}`}>
            <c.icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{c.name}</p>
            <p className="mt-0.5 text-[13px] leading-6 text-slate-600">{c.how}</p>
          </div>
          <ArrowRight className="ml-auto mt-2 hidden h-4 w-4 shrink-0 text-slate-300 sm:block" />
        </li>
      ))}
    </ul>
  );
}

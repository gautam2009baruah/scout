"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Bell, Bot, Braces, Building2, CheckCircle2,
  ChevronRight, CircleHelp, Clock, Command, Compass, Copy, Cpu, Database, Download, Eye,
  FilePlus2, FileText, Filter, FlaskConical, FolderPlus, FolderTree, Gauge, GitBranch, GitFork,
  Globe, History, KeyRound, Keyboard, Layers, LayoutDashboard, Lightbulb, ListChecks, ListTree,
  Mail, MapPinned, MousePointerClick, MoveVertical, Network, PanelLeftClose, Pencil, Play, Plus,
  Power, RefreshCcw, Rocket, Route, Save, ScrollText, Search, Send, Server, ShieldCheck,
  SlidersHorizontal, Sparkles, Split, Star, TableProperties, Timer, ToggleRight, Trash2, Upload,
  UsersRound, Wand2, XCircle, Zap, type LucideIcon
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
    blurb: "The frame that wraps every screen — navigation, company context, and your account.",
    pages: [
      {
        name: "Global navigation & shell",
        summary: "Every Control Panel page shares one layout: a left sidebar listing the modules you can access, a top header with your company context and account, and the main content area in the middle. The sidebar remembers whether you collapsed it, and the breadcrumb always shows where you are.",
        controls: [
          { icon: MapPinned, name: "Sidebar module links", how: "Click any item in the left rail to open that module. The current page is highlighted, and groups like Administration expand to reveal their sub-modules." },
          { icon: PanelLeftClose, name: "Collapse / expand sidebar", how: "Toggle between the full sidebar and a slim icon-only rail to give the content more room. Your preference is saved for next time." },
          { icon: ChevronRight, name: "Breadcrumb", how: "Reads Company › (Section) › Page. It updates as you navigate so you never lose your place." },
          { icon: Building2, name: "Company context switcher", how: "If your account spans multiple companies, pick the active one here. All data on every page reloads for that tenant." },
          { icon: UsersRound, name: "User menu", how: "Your name in the top-right opens account actions, including Sign out." },
          { icon: CircleHelp, name: "Help", how: "The Help button beside your name opens this Help Center from any page." },
          { icon: Keyboard, name: "Search shortcut", how: "Press / anywhere in the Help Center to jump straight into the search box." }
        ],
        tips: ["Lost? The breadcrumb and the highlighted sidebar item together tell you exactly where you are."]
      }
    ]
  },
  {
    key: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    accent: "blue",
    blurb: "Your landing dashboard — a health check of users, content, AI, workflows, email, and orchestration.",
    pages: [
      {
        name: "Dashboard",
        path: "/control-panel",
        summary: "The first screen after you sign in. It summarizes the state of your deployment in cards and status tiles — how many users are active, how many documents are processed, which AI provider is live, and how many workflows and orchestrations are published. Cards only appear for the areas your role can access.",
        controls: [
          { icon: AlertTriangle, name: "AI configuration warning", how: "If no LLM or embedding provider is set up, a banner appears with a shortcut to configure AI providers — the chatbot can't answer until this is resolved." },
          { icon: UsersRound, name: "Users card", how: "Shows total and active users. The User Status tiles below break this into Active, Invited, and Inactive." },
          { icon: FolderTree, name: "Folders & documents card", how: "Shows how many topic folders and documents exist. Document tiles split them into Available, Processing, and Failed." },
          { icon: Cpu, name: "Active AI provider card", how: "Displays the live LLM provider and model powering chatbot answers." },
          { icon: MapPinned, name: "Guided workflows tiles", how: "Counts of training sessions, drafts, and published guides." },
          { icon: GitBranch, name: "Orchestration tiles", how: "Counts of total, draft, and published orchestrations." },
          { icon: Mail, name: "Registered emails card", how: "Total email credentials, split between inbox (incoming) and sender (outgoing) accounts." }
        ],
        tips: ["A red AI banner means end users can't get answers yet — fix that first."]
      }
    ]
  },
  {
    key: "guided-workflows",
    label: "Guided Workflows",
    icon: MapPinned,
    accent: "sky",
    blurb: "Record, refine, publish, and heal step-by-step in-app guides that walk users through any UI.",
    pages: [
      {
        name: "Guided Workflows Console",
        path: "/control-panel/guided-workflows",
        summary: "The main workspace for turning recorded interactions into polished guides. Sessions and topics are listed on the left; selecting a topic loads its recorded steps and guide on the right, where you edit each step's instruction, reorder or disable steps, add a start message, enable auto-healing, and publish. Guides can be versioned and released to specific environments.",
        controls: [
          { icon: Filter, name: "Target app & title filters", how: "Narrow the session list to one target application, or search sessions by title, then click Filter." },
          { icon: RefreshCcw, name: "Refresh synced actions", how: "Pull in the latest interactions trainers have recorded with the browser extension, in real time." },
          { icon: Save, name: "Save guide draft", how: "Fold newly synced actions and your edits into the working draft. Enabled only when there are unsaved changes." },
          { icon: Rocket, name: "Publish", how: "Mark the guide published so end users can run it. Publishing creates a version (v{major}.{build})." },
          { icon: Pencil, name: "Step description editor", how: "A rich-text editor for the instruction shown in each step's tooltip — keep it to one clear action." },
          { icon: MoveVertical, name: "Reorder / enable / delete steps", how: "Move steps up or down, toggle a step off without deleting it, or remove it entirely." },
          { icon: SlidersHorizontal, name: "Step purpose, URL & trigger", how: "Set a step as Navigation or Main, the URL path it applies to, and what advances it (Click, Change, Blur, Focus, or Manual next)." },
          { icon: ShieldCheck, name: "Auto-healing toggle", how: "Let Scout suggest a replacement control if the recorded one can't be found during playback." },
          { icon: Eye, name: "Start message", how: "Optionally show a confirmation message before the workflow begins; edit its content in a rich-text modal." },
          { icon: Copy, name: "Recorder config", how: "Copy the JSON config a trainer pastes into the browser extension; halt or restart training to rotate the token." },
          { icon: Wand2, name: "Generate documentation", how: "From the ⋮ menu, turn the guide into a searchable knowledge-base document; also access Environments, Version history, and Delete." }
        ],
        tips: ["Publish is only enabled when the draft is clean — save first.", "Short step titles with one instruction read best in the tooltip."]
      },
      {
        name: "Workflow Training Setup",
        summary: "The admin hub for setting up recording. Here you create training sessions and topics, download the recorder browser extension for trainers, share the recorder config, and control per-topic playback logging. Trainers then record interactions that sync back into the Console as guide steps.",
        controls: [
          { icon: Download, name: "Download plugin", how: "Grab the recorder extension for Brave, Chrome, Edge, Firefox, Opera, or Safari; the help icon shows step-by-step install instructions." },
          { icon: Plus, name: "Create training session", how: "Pick a target app, name the session, and create it — the container trainers record into." },
          { icon: FolderPlus, name: "Add topic", how: "Create a topic (one guide) inside a session, with a title and an optional description shown to chatbot users." },
          { icon: Filter, name: "Filter sessions & topics", how: "Filter by target app or session and search topics by title; Clear resets everything." },
          { icon: ToggleRight, name: "Playback logging toggle", how: "Turn analytics event capture on or off per topic — this feeds Workflow Analytics." },
          { icon: Copy, name: "Recorder config", how: "Open a topic's config, copy the JSON, and hand it to the trainer for the extension." },
          { icon: Pencil, name: "Edit / delete session or topic", how: "Rename sessions and topics or remove them (with confirmation). Titles must be unique." }
        ],
        tips: ["Sequence: create session → add topics → download plugin → share config → trainer records → publish in the Console."]
      },
      {
        name: "Self-Healing Review",
        summary: "When a guide step's control can't be found during playback, Scout proposes alternative selectors. This page is the review queue: inspect each suggestion's control identity, selector candidates, and confidence, then approve, edit-and-approve, reject, or delete. Pending, Approved, and Rejected are separate tabs.",
        controls: [
          { icon: Filter, name: "App / session / topic filters", how: "Scope the suggestion list to a target app, training session, or topic." },
          { icon: ListChecks, name: "Status tabs", how: "Switch between Pending (awaiting decision), Approved, and Rejected." },
          { icon: CheckCircle2, name: "Approve", how: "Accept a suggested fix immediately so the guide keeps working." },
          { icon: Pencil, name: "Edit & approve", how: "Open the editor to adjust selector type, value, confidence, and reason, then save as approved." },
          { icon: XCircle, name: "Reject", how: "Decline a suggestion and keep the original control; it moves to the Rejected tab." },
          { icon: Trash2, name: "Delete", how: "Remove a suggestion record entirely (with confirmation)." },
          { icon: Eye, name: "Control & selector details", how: "Expand a suggestion to read the captured control identity, every candidate selector with its confidence, and playback attempt history." }
        ],
        tips: ["Confidence scores and playback attempts help you judge whether a proposed selector is safe to accept."]
      },
      {
        name: "Workflow Analytics",
        summary: "Adoption reporting for your published guides — which guides run, where users drop off, and completion rates by step. The data comes from the per-topic Playback logging toggle in Training Setup, so enable logging on the topics you want to measure.",
        controls: [
          { icon: Filter, name: "Date & workflow filters", how: "Scope the charts to a time range or a specific guide." },
          { icon: BarChart3, name: "Completion & drop-off", how: "Read step-by-step funnels to see exactly which steps lose users." },
          { icon: ToggleRight, name: "Requires playback logging", how: "Only topics with Playback logging enabled (in Training Setup) produce analytics data." }
        ]
      }
    ]
  },
  {
    key: "content-structure",
    label: "Content Structure",
    icon: FolderTree,
    accent: "emerald",
    blurb: "Govern the knowledge base — topic folders, document ingestion, access control, and versions.",
    pages: [
      {
        name: "Content Structure",
        path: "/control-panel/content-structure",
        summary: "Organize everything the chatbot retrieves from. Build a hierarchy of topic folders, ingest documents from many sources (upload, web, crawler, sitemap, RSS, Google Drive, SharePoint), choose how much of each document to store, and control which roles, users, and environments can see it. Every document runs through a processing pipeline and keeps a version history.",
        controls: [
          { icon: Network, name: "Diagram / List view", how: "See the topic hierarchy as an interactive tree, or switch to a flat list of folders and documents." },
          { icon: FolderPlus, name: "Create / edit / delete folder", how: "Add a topic folder under any parent, rename it, or remove it and its documents (with confirmation)." },
          { icon: ShieldCheck, name: "Folder access control", how: "Grant a folder to all roles/users or pick specific ones. Documents inherit this unless overridden." },
          { icon: Globe, name: "Environment release", how: "Release a folder or document to specific target apps/environments to make it active there." },
          { icon: Upload, name: "Upload document", how: "Add files by drag-and-drop or picker across tabs: Upload, Web URL, Website crawler, Sitemap, RSS feed, Google Drive, SharePoint." },
          { icon: Layers, name: "Storage mode", how: "Choose Managed (keep the original + processed data), External reference (keep processed data only), or Strict (keep just retrieval-ready data)." },
          { icon: FilePlus2, name: "Crawler / feed settings", how: "For crawls set max pages and depth; for cloud sources choose browser login or API credentials and test the connection." },
          { icon: Search, name: "Search, filter & sort", how: "Find documents by name, filter by file type or processing status, and sort by any column." },
          { icon: ShieldCheck, name: "Per-document access", how: "Override folder access for an individual document via its access button." },
          { icon: History, name: "Version history & compare", how: "View every version of a document, compare any two to see added/removed content, and optionally generate an AI summary of the changes." }
        ],
        tips: ["Documents move through uploaded → queued → processing → parsed → chunked → embedded → indexed — only indexed docs answer questions.", "Group documents by the question they answer, not by file type."]
      }
    ]
  },
  {
    key: "orchestration",
    label: "Orchestration Designer",
    icon: GitBranch,
    accent: "violet",
    blurb: "Build automations visually: chain trigger, AI, knowledge, database, approval, and notification nodes.",
    pages: [
      {
        name: "Orchestration Designer",
        path: "/control-panel/orchestration-designer",
        summary: "A drag-and-drop canvas for building automations without code. Add nodes from the palette, connect them into a flow, configure each in its properties panel, then save, test, and publish. Published orchestrations are triggered by chat, schedule, email, HTTP, or a manual form. Validation runs on save/publish to catch orphan nodes and unconnected routes.",
        controls: [
          { icon: Plus, name: "New / All Orchestrations", how: "Start a fresh orchestration (name, description, target app) or open the library modal to load, edit metadata, or delete a saved one." },
          { icon: MousePointerClick, name: "Node palette", how: "Click a node type to drop it on the canvas; incompatible types are greyed out for the current trigger. Drag nodes to arrange them." },
          { icon: Network, name: "Connect nodes", how: "Drag from a node's right handle to another's left handle. Branching nodes expose labeled outputs (e.g. TRUE/FALSE)." },
          { icon: SlidersHorizontal, name: "Configure node", how: "Click a node to open its properties panel and set its inputs, then Save." },
          { icon: Trash2, name: "Delete node / edge", how: "Use a node's red trash icon (or select and press Delete) to remove it and its connections." },
          { icon: Save, name: "Save Draft", how: "Persist the layout and config. Validates Switch routes, orphan nodes, and trigger compatibility. Shows 'Save Changes *' when there are unsaved edits." },
          { icon: Rocket, name: "Publish", how: "Lock the draft as a new version. Requires a trigger, a terminal node (End or AI Planner), and every node reachable from the trigger." },
          { icon: Globe, name: "Environments", how: "Release a published orchestration to target-app environments so end users can reach it." },
          { icon: History, name: "Version History", how: "Load any prior published version onto the canvas to compare or re-publish." },
          { icon: Play, name: "Run", how: "For manual-trigger orchestrations, open a form to supply inputs and execute the published flow immediately." },
          { icon: CheckCircle2, name: "Approve / Reject (plan review)", how: "When reviewing an AI-drafted plan, approve it (optionally reusable) or reject it with a reason." }
        ],
        tips: ["Build left-to-right and test after each node so a broken hand-off is caught early.", "Toast messages name the exact validation problem (e.g. an unconnected Switch default)."]
      },
      {
        name: "Node types — the building blocks",
        summary: "Each node is one step. A flow starts with a Trigger and ends at End (or AI Planner). Between them you mix AI, knowledge, database, branching, and delivery nodes. These are the node types you can drop on the canvas.",
        controls: [
          { icon: Zap, name: "Trigger", how: "The entry point — manual form, chatbot message, schedule (cron), incoming email, or HTTP webhook. Exactly one per orchestration." },
          { icon: Route, name: "Workflow", how: "Run an existing published guided workflow as a sub-step, with input mapping and wait-for-completion." },
          { icon: ListTree, name: "Data Capture", how: "Capture data from a live form and optionally show the user a review screen before continuing." },
          { icon: Bot, name: "AI Extraction", how: "Use AI to pull structured fields (name, email, amount…) out of unstructured text." },
          { icon: Wand2, name: "AI Task", how: "An open-ended AI step — summarize, categorize, draft — with plain-text or structured JSON output." },
          { icon: Search, name: "Knowledge Search", how: "Search the knowledge base for passages matching a query and return the top-K ranked results with citations." },
          { icon: GitFork, name: "Condition", how: "Evaluate variable comparisons and branch to a TRUE or FALSE path." },
          { icon: Split, name: "Switch / Router", how: "Route to one of several named outputs by a variable's value; needs a Default route." },
          { icon: ShieldCheck, name: "Human Approval", how: "Pause and email a person for an approve/reject decision, branching accordingly." },
          { icon: Bell, name: "Notification", how: "Send messages over Email, in-app, Teams, Slack, SMS, or WhatsApp, with retry and scheduling." },
          { icon: Network, name: "API Call", how: "Call an external HTTP API (many auth types), map the response into variables, with timeout and retry." },
          { icon: Database, name: "Database", how: "Turn a natural-language request into a safe read-only SELECT against a registered schema (it generates, not executes)." },
          { icon: Braces, name: "Variable", how: "Set or update named context variables using literals or {{expressions}}." },
          { icon: ScrollText, name: "Data Formatter", how: "Reshape data into pretty JSON, an HTML/plain table, CSV, key-value list, or a custom template." },
          { icon: FileText, name: "File Parser", how: "Extract text or rows from an uploaded PDF, Word, Excel, or CSV for later steps." },
          { icon: RefreshCcw, name: "For Each", how: "Repeat an action (e.g. Notification or API Call) once per item in an array and accumulate results." },
          { icon: Compass, name: "AI Planner", how: "Let chat users request new automations; drafts land in Pending AI Plans. Chatbot-trigger only." },
          { icon: CheckCircle2, name: "End", how: "Terminate a path, optionally showing a final message to the user." }
        ]
      },
      {
        name: "Node Properties Panel",
        summary: "The slide-out panel on the right when you select a node. It holds all configuration for that node type, grouped logically, and edits apply when you click Save. Every node has a label and optional description; the fields below change per type.",
        controls: [
          { icon: Pencil, name: "Node label & description", how: "Name the node as it appears on the canvas and add an optional hover description." },
          { icon: Zap, name: "Trigger settings", how: "Choose the trigger type and its specifics — cron + timezone, email inboxes, HTTP short names, or manual input fields." },
          { icon: Bell, name: "Notification channels", how: "Enable one or more of Email/Internal/Teams/Slack/SMS/WhatsApp; each has recipients, message, and retry/delivery options." },
          { icon: Network, name: "API Call config", how: "Set URL, method, auth (API key/Bearer/Basic/OAuth2/mTLS), headers, body, response mapping, success codes, timeout, retries, and failure strategy." },
          { icon: Database, name: "Database config", how: "Pick the schema, output variable, the request variable, max rows, and whether SELECT * is allowed." },
          { icon: ShieldCheck, name: "Human Approval config", how: "Set approver email, title, description, and any fields to show the approver." },
          { icon: Trash2, name: "Cancel / Save / Delete", how: "Save applies edits and closes; Cancel discards; Delete removes the node and its edges after confirmation." }
        ]
      },
      {
        name: "Pending AI Plans",
        path: "/control-panel/pending-ai-plans",
        summary: "A review queue for orchestrations the AI Planner drafts from end-user chat requests. Open a request to read the user's ask and the proposed plan, then continue into the designer to refine and approve, or reject with a reason. Active and Archived (approved/rejected) requests are separate tabs.",
        controls: [
          { icon: Filter, name: "Filters", how: "Filter requests by target app, environment, and requested/resolved date range." },
          { icon: Eye, name: "Expand request", how: "Read the requester, the natural-language ask, and the AI's proposed plan summary." },
          { icon: GitBranch, name: "Review in builder", how: "Open the draft in the Orchestration Designer in approval mode to refine it." },
          { icon: CheckCircle2, name: "Approve", how: "Publish the plan, optionally making it reusable for future similar chat requests." },
          { icon: XCircle, name: "Reject", how: "Decline with an optional reason that's sent back to the requester." }
        ]
      }
    ]
  },
  {
    key: "administration",
    label: "Administration",
    icon: Building2,
    accent: "amber",
    blurb: "Companies, roles, users, AI providers, chatbot keys, database schemas, email, and monitoring.",
    pages: [
      {
        name: "Company & Role Setup",
        summary: "The foundation of a tenant. Create the company, define target applications (each chatbot deployment) and their environments (dev/staging/prod URLs), and build roles that grant specific Control Panel modules. Production environments and activity logging are configured here too.",
        controls: [
          { icon: Building2, name: "Create company", how: "Add a tenant with a name and URL-friendly slug." },
          { icon: TableProperties, name: "Create / update role", how: "Name a role and either mark it Admin (all modules) or select specific modules from the tree; edit or delete existing roles." },
          { icon: MapPinned, name: "Manage target applications", how: "Create the apps the chatbot deploys into (e.g. Customer Portal), then edit or delete them." },
          { icon: Globe, name: "Manage environments", how: "Per target app, add environments with a name and URL, mark one Production, and enable activity logging." },
          { icon: ToggleRight, name: "Log trigger & chat activity", how: "Turn on recording of orchestration runs and chat queries for an environment (off by default for dev/test)." }
        ],
        tips: ["Order: company → target apps → environments → roles → then invite users under User Management."]
      },
      {
        name: "User Management",
        path: "/control-panel/administration/user-management",
        summary: "Manage the people who use the Control Panel. Register users (which emails an invite), assign a role per company, optionally override module access and restrict target apps, and handle the lifecycle — reset passwords, deactivate with a reason, or delete globally.",
        controls: [
          { icon: Plus, name: "Register user & send email", how: "Enter name, email, and a unique user code, pick a role, then send an invitation to set their password." },
          { icon: Filter, name: "Filter & search", how: "Filter by role or status (Active/Inactive/Invited) and search by name, email, or code." },
          { icon: Pencil, name: "Edit user", how: "Change role and module access per company, restrict to specific target apps, and toggle Active/Inactive (a reason is required to deactivate)." },
          { icon: KeyRound, name: "Reset password", how: "Email the user a reset link." },
          { icon: Trash2, name: "Delete user", how: "Remove the user from all companies globally; a reason is required." }
        ]
      },
      {
        name: "AI Configuration",
        summary: "Configure the AI backbone per company: the embedding model (semantic search) and the LLM (chatbot answers). Each config can be company-wide or scoped to a target app/environment, and one of each is marked primary and active. Switching the primary embedding model can re-embed existing documents.",
        controls: [
          { icon: Bot, name: "LLM / Embeddings tabs", how: "Switch between managing language models and embedding models." },
          { icon: Cpu, name: "Provider & model", how: "Pick a provider (OpenAI, Gemini, Anthropic, Ollama, local BGE, custom…) and enter the model name, endpoint, and API key." },
          { icon: Star, name: "Primary & active", how: "Mark a configuration primary (the one in use) and active; toggle these from the saved-configs table too." },
          { icon: RefreshCcw, name: "Re-embed existing documents", how: "When making a new embedding model primary, optionally regenerate embeddings for all existing documents." },
          { icon: Globe, name: "Scope to app / environment", how: "Leave company-wide, or target a specific app and environment so only it uses this config." }
        ],
        tips: ["Embedding dimensions must match the model (e.g. 384 for bge-small, 1536 for OpenAI ada)."]
      },
      {
        name: "Chatbot Settings",
        summary: "Three tabs govern the embeddable chatbot: conversation behavior (context window and inactivity timeout), API keys (create, rotate, suspend, revoke — each scoped to an environment's origin), and the embed package (generate the config, install snippet, and React/HTML samples to drop into a site).",
        controls: [
          { icon: SlidersHorizontal, name: "Conversation settings", how: "Per target app, set max context messages, max context tokens, and the inactivity timeout before a conversation resets." },
          { icon: KeyRound, name: "Create API key", how: "Name a key for a target app + environment; the allowed origin auto-fills from the environment URL. The secret is shown once — copy it immediately." },
          { icon: RefreshCcw, name: "Rotate / suspend / revoke", how: "Generate a fresh secret, temporarily suspend, or permanently revoke a key. Revoked keys move to a read-only list." },
          { icon: Rocket, name: "Generate embed package", how: "Produce the config object, install snippet, and React/HTML samples for a chosen app, environment, and assistant name." },
          { icon: Copy, name: "Copy / download snippets", how: "Copy each snippet or download the config and install scripts to add the widget to a customer site." }
        ]
      },
      {
        name: "Database Schema Manager",
        path: "/control-panel/administration/database-schema",
        summary: "Register the database schemas that orchestration Database nodes are allowed to query. Upload a schema JSON (extracted from the client DB with the provided SQL), edit its metadata, inspect/prune the raw JSON in a tree editor, and sync it with the standalone database executor service you can download here.",
        controls: [
          { icon: Download, name: "Download executor project", how: "Get a ZIP with the standalone database executor service; the help panel covers hosting, .env, Docker, and test endpoints." },
          { icon: Upload, name: "Upload & activate schema", how: "Select a target app, enter a unique database name, choose the DB type, and upload the schema JSON to activate it." },
          { icon: Pencil, name: "Edit schema", how: "Update the description or upload a new JSON (target app and DB type are locked after creation)." },
          { icon: ListTree, name: "JSON tree editor", how: "Open the raw schema as an expandable tree to inspect or delete nodes, then save." },
          { icon: Server, name: "Sync with executor", how: "Re-sync a schema with the running executor to re-extract structure from the live database." },
          { icon: Trash2, name: "Delete schema", how: "Remove a schema after confirmation." }
        ],
        tips: ["Run the provided extraction SQL for your database type first — it produces the JSON you upload."]
      },
      {
        name: "Email Credentials",
        path: "/control-panel/administration/email-credentials",
        summary: "Two credential types on two tabs: Inbox credentials (IMAP) that Email Triggers use to read incoming mail, and Sender credentials (SMTP) that Notification nodes use to send. Each is scoped to a target app and environments, can be tested before use, toggled active, and (for senders) marked primary.",
        controls: [
          { icon: Mail, name: "Inbox vs Sender tabs", how: "Configure inbound mailbox monitoring separately from outbound sending identities." },
          { icon: Plus, name: "Add inbox credential", how: "Set target app, environments, display name, email, IMAP host/port, password, and TLS to poll a mailbox for triggers." },
          { icon: Send, name: "Add sender credential", how: "Set target app, environments, from name/email, and SMTP host/port/username/password for outbound notifications." },
          { icon: FlaskConical, name: "Test connection", how: "Validate a credential before flows rely on it; the result and last-tested time show in the table." },
          { icon: Star, name: "Set primary sender", how: "Choose the default sender used by notifications when none is specified." },
          { icon: Power, name: "Enable / disable", how: "Toggle a credential active or inactive without deleting it." },
          { icon: Trash2, name: "Delete credential", how: "Permanently remove a credential (with confirmation)." }
        ]
      },
      {
        name: "Triggers & Monitoring",
        path: "/control-panel/triggers-monitoring",
        summary: "A live view of every orchestration trigger (Manual, Chatbot, Email, Schedule, HTTP API) with execution stats and history. Filter by app, environment, type, status, and date range, then drill into an individual execution to see each node's output — the place to debug why a trigger did or didn't fire.",
        controls: [
          { icon: Filter, name: "Filters", how: "Narrow by target app, environment, trigger type, and active status." },
          { icon: Clock, name: "Execution date range", how: "Limit history to a from/to datetime window." },
          { icon: Activity, name: "Execution history", how: "Page through recent runs per trigger with status and timing." },
          { icon: Eye, name: "Execution drill-down", how: "Open a run to inspect each orchestration node's inputs and outputs." }
        ]
      },
      {
        name: "Search Analytics",
        summary: "Understand retrieval quality — what users ask the knowledge base and how well it responds. Use the filters to scope trends over a period and spot gaps where content is missing or answers are weak.",
        controls: [
          { icon: BarChart3, name: "Query trends", how: "See top queries and volumes over time." },
          { icon: Filter, name: "Date range", how: "Scope the analytics to a specific period." },
          { icon: Gauge, name: "Retrieval quality", how: "Gauge how often searches return useful results to find content gaps." }
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
        summary: "The queue of items an orchestration's Human Approval node paused for. Open a request to see the context and fields the flow submitted, then approve to let it continue or reject to stop it. Your decision is recorded and the flow resumes on the matching branch.",
        controls: [
          { icon: Eye, name: "Open request", how: "View the full details and any fields the automation submitted for your decision." },
          { icon: CheckCircle2, name: "Approve", how: "Approve to let the flow continue down its APPROVED branch." },
          { icon: XCircle, name: "Reject", how: "Reject to send the flow down its REJECTED branch and record why." },
          { icon: Filter, name: "Filter queue", how: "Narrow the list to find the request you need to act on." }
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
        summary: "Set a permanent password. This appears automatically on first login when you were given a temporary password, and you can also reach it to change your password later. Passwords must be at least 8 characters and match the confirmation.",
        controls: [
          { icon: KeyRound, name: "New & confirm password", how: "Enter the new password twice; both must match and be at least 8 characters." },
          { icon: Save, name: "Change password", how: "Submit to apply the new password; on success you're taken to the dashboard." }
        ]
      },
      {
        name: "Session",
        summary: "For security, sessions expire after a period of inactivity. A warning appears before you're signed out so you can stay logged in without losing work.",
        controls: [
          { icon: RefreshCcw, name: "Extend session", how: "When the inactivity warning appears, choose to stay signed in to reset the timer." },
          { icon: ShieldCheck, name: "Sign out", how: "End your session at any time from the user menu in the header." }
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
  const detailRef = useRef<HTMLDivElement | null>(null);

  function selectCategory(key: string) {
    setActiveKey(key);
    setQuery("");
    requestAnimationFrame(() => {
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

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
          <div className="mt-6 flex max-w-xl items-center gap-2 bg-white px-3 shadow-lg ring-1 ring-transparent transition focus-within:ring-2 focus-within:ring-blue-500/40">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages and controls…  (press / )"
              className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none focus:!outline-none focus-visible:!outline-none placeholder:text-slate-400"
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
                <button
                  type="button"
                  onClick={() => selectCategory(cat.key)}
                  className="flex w-full items-center gap-2 border-b border-slate-200 px-5 py-3 text-left transition hover:bg-slate-50"
                >
                  <span className={`inline-flex h-6 items-center gap-1.5 ${a.soft} ${a.text} px-2 text-[11px] font-semibold uppercase tracking-wide ring-1 ${a.ring}`}>
                    <cat.icon className="h-3.5 w-3.5" /> {cat.label}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-950">{page.name}</h3>
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">Open<ArrowRight className="h-3.5 w-3.5" /></span>
                </button>
                <ControlList controls={controls} accent={cat.accent} href={page.path} />
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
                    onClick={() => selectCategory(cat.key)}
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

            <div ref={detailRef} className="scroll-mt-20 space-y-5">
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
                        <a
                          href={page.path}
                          title="Open this page"
                          className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
                        >
                          Open page<ArrowRight className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{page.summary}</p>
                  </div>
                  <ControlList controls={page.controls} accent={activeCategory.accent} href={page.path} />
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

function ControlList({ controls, accent, href }: { controls: ControlDoc[]; accent: Accent; href?: string }) {
  const a = ACCENTS[accent];
  return (
    <ul className="divide-y divide-slate-100">
      {controls.map((c) => {
        const inner = (
          <>
            <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center ${a.soft} ${a.text} ring-1 ${a.ring}`}>
              <c.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{c.name}</p>
              <p className="mt-0.5 text-[13px] leading-6 text-slate-600">{c.how}</p>
            </div>
            {href ? (
              <span className="ml-auto mt-1.5 hidden items-center gap-1 text-[11px] font-medium text-slate-400 transition group-hover:text-blue-700 sm:inline-flex">
                Open<ArrowRight className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </>
        );
        return href ? (
          <li key={c.name}>
            <a href={href} title="Open this page" className="group flex items-start gap-3 px-5 py-3 transition hover:bg-blue-50/40">
              {inner}
            </a>
          </li>
        ) : (
          <li key={c.name} className="flex items-start gap-3 px-5 py-3">{inner}</li>
        );
      })}
    </ul>
  );
}


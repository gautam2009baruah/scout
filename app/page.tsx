import { ScoutChatbot } from "@/components";
import {
  BotMessageSquare,
  Braces,
  Code2,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  Wand2
} from "lucide-react";

const capabilities = [
  {
    icon: MessagesSquare,
    title: "Embeddable UI",
    description: "A self-contained chat surface ready to drop into dashboards, SaaS tools, or customer portals."
  },
  {
    icon: Braces,
    title: "API-ready state",
    description: "Mock responses are isolated in the component so your future backend can take over cleanly."
  },
  {
    icon: ShieldCheck,
    title: "Production polish",
    description: "Responsive layout, empty states, typing feedback, quick prompts, and accessible controls."
  }
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f6f7fb] text-slate-950">
      <section className="relative flex min-h-screen items-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(14,165,233,0.18),transparent_32%),radial-gradient(circle_at_85%_15%,rgba(244,114,182,0.16),transparent_30%),linear-gradient(135deg,#f8fafc_0%,#eef2ff_48%,#f7fee7_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#f6f7fb] to-transparent" />

        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,520px)] lg:px-8">
          <div className="flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur">
              <Sparkles className="h-4 w-4 text-sky-500" />
              Integration-first chatbot frontend
            </div>

            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-slate-950 sm:text-5xl lg:text-6xl">
              A polished chat widget your customers can install anywhere.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Scout is now a standalone component with typed props for branding, launcher position, quick prompts, starter messages, and your future backend response handler.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {capabilities.map((item) => (
                <article
                  className="rounded-lg border border-white/70 bg-white/70 p-4 shadow-sm backdrop-blur"
                  key={item.title}
                >
                  <item.icon className="h-5 w-5 text-slate-900" />
                  <h2 className="mt-3 text-sm font-semibold text-slate-950">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                </article>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 font-medium text-white shadow-soft-xl">
                <BotMessageSquare className="h-4 w-4" />
                Reusable React component
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700">
                <Wand2 className="h-4 w-4 text-pink-500" />
                API hook ready
              </span>
            </div>

            <div className="mt-8 max-w-2xl rounded-lg border border-slate-200 bg-slate-950 p-4 text-sm text-slate-100 shadow-soft-xl">
              <div className="mb-3 flex items-center gap-2 font-medium">
                <Code2 className="h-4 w-4 text-sky-300" />
                Customer integration
              </div>
              <pre className="overflow-x-auto text-xs leading-6 text-slate-300">
                <code>{`<ScoutChatbot
  variant="floating"
  position="bottom-right"
  assistantName="Acme Assistant"
  theme={{ brandColor: "#111827", accentColor: "#0ea5e9" }}
  onSendMessage={async (message, history) => {
    const res = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, history })
    });
    return res.json();
  }}
/>`}</code>
              </pre>
            </div>
          </div>

          <div className="flex items-center justify-center lg:justify-end">
            <ScoutChatbot
              assistantName="Acme Assistant"
              badge="Widget"
              modeNotice="Standalone component mode: configure this once and mount it inside any customer website or application."
              placeholder="Ask the assistant..."
              quickPrompts={[
                "Show integration options",
                "Customize my brand",
                "Connect my backend"
              ]}
              theme={{
                brandColor: "#111827",
                accentColor: "#0ea5e9"
              }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

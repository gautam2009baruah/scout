# Scout Chatbot

A standalone, configurable chatbot that can be installed on any website.

## Universal HTML Embed

Use this option for clients whose websites are built with WordPress, PHP, Laravel, Django, Rails, plain HTML, Webflow, Shopify, or any other non-React stack.

```html
<div id="scout-chatbot"></div>
<script src="/scout-chatbot-embed.js"></script>
<script>
  ScoutChatbot.init({
    mount: "#scout-chatbot",
    assistantName: "Acme Assistant",
    brandColor: "#111827",
    accentColor: "#0ea5e9",
    position: "bottom-right",
    heightRatio: 0.75,
    apiUrl: "/api/chat"
  });
</script>
```

Open the plain HTML demo at:

```txt
http://localhost:3000/embed-demo.html
```

The universal embed file is [public/scout-chatbot-embed.js](public/scout-chatbot-embed.js). It exposes `window.ScoutChatbot.init(config)` and injects its own CSS, so the client site does not need React, Next.js, or Tailwind.

## React Or Next.js Component

Import the component and mount it near the root of a customer app:

```tsx
import { ScoutChatbot } from "@/components";

export function AppShell() {
  return (
    <>
      <YourApplication />
      <ScoutChatbot
        variant="floating"
        position="bottom-right"
        assistantName="Acme Assistant"
        theme={{ brandColor: "#111827", accentColor: "#0ea5e9" }}
        onSendMessage={async (message, history) => {
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, history })
          });

          return response.json();
        }}
      />
    </>
  );
}
```

## Main React Props

- `variant`: `floating` for a fixed launcher widget, or `inline` for embedding inside a page layout.
- `position`: `bottom-right` or `bottom-left` when using the floating variant.
- `assistantName`, `badge`, `subtitle`, `placeholder`: customer-facing copy.
- `theme`: brand and accent colors.
- `quickPrompts`: suggested prompt buttons.
- `initialMessages`: preloaded conversation messages.
- `onSendMessage`: async handler for your future backend API.
- `modeNotice`: optional message shown at the top of the chat.

## Backend Hook Shape

`onSendMessage` receives the latest user message and the visible message history:

```ts
onSendMessage?: (
  message: string,
  history: ScoutChatMessage[]
) => Promise<ScoutChatMessage | string | void>;
```

Return a string for a simple assistant reply, or a `ScoutChatMessage` if you need richer message metadata.

## Universal Embed Config

- `mount`: CSS selector or DOM element where the widget should mount.
- `assistantName`, `badge`, `subtitle`, `placeholder`: customer-facing copy.
- `brandColor`, `accentColor`: customer branding.
- `position`: `bottom-right` or `bottom-left`.
- `width`: default widget width in pixels.
- `heightRatio`: default widget height as a ratio of viewport height. The default is `0.75`.
- `quickPrompts`: suggested prompt buttons.
- `initialMessages`: preloaded conversation messages.
- `apiUrl`: backend endpoint that receives `{ message, history }`.
- `headers`: optional extra request headers for the API call.
- `modeNotice`: optional message shown at the top of the chat.

The universal widget can be dragged by its header, resized from the bottom-right handle, minimized, closed, and restored to its default size and position.

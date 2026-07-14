# NexusVendor Enterprise Portal

A fictional, data-rich internal enterprise application for browser-agent, workflow, and RAG training. It is intentionally separate from Scout and has no runtime dependencies.

## Run

```bash
cd nexusvendor-enterprise-portal
npm run generate:documents
npm run verify
npm run dev
```

Open `http://localhost:4173`. Routes are deterministic (`/vendors`, `/contracts`, `/invoices`, and so on). All records and organizations are fictional.

## Shared ScoutChatbot

NexusVendor installs the canonical hosted React `ScoutChatbot` through `scout-chatbot.js`; it does not contain another chatbot UI. Run Scout on port `3000`, the standalone chatbot API on `4200`, and configure or rotate the local customer key with:

```bash
npm run configure:chatbot
```

The generated `scout-chatbot-config.local.js` is intentionally ignored. The same universal installation approach works for React and non-React customer applications; see `services/chatbot-api/CUSTOMER_INSTALLATION.md` in the Scout repository.

## Training design

- Stable IDs follow `nv-{module}-{section}-{control}`.
- Role switching changes visible actions without authentication infrastructure.
- Data persists in browser local storage; **Reset demo data** restores the seed state.
- The document generator creates substantive Markdown artifacts under `public/documents/` with an index at `public/documents/index.json`.
- No external services, fonts, analytics, or network calls are required.

## Recorder demonstration workflow

Use the existing pages in this order:

1. **Vendor Registry** — enter the vendor identity and generate the Vendor ID, normalized name, risk tier, and creation date.
2. **Vendor Onboarding** — re-enter the recorded identity, add due-diligence information, and generate the onboarding case, due date, risk score, and review route.
3. **Procurement Requests** — let the trained recorder fill the blank shared fields and create a procurement request.
4. **RFP & Sourcing** — reuse the vendor and procurement references to create a sourcing event.
5. **Purchase Orders** — reuse the recorded vendor, request, and RFP data to generate the purchase order.
6. **Contract Workspace** — reuse all upstream references and generate the final contract dates and ID.

Shared fields retain exactly the same label and HTML ID across pages, for example `Vendor name` / `nv-workflow-vendor-name`. Downstream submissions reject inconsistent recorded values. Use **Reset demo workflow** before presenting a new recording session.

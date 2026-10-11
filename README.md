# domtrack

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_DnhlKHNI1G5AVHTAdtdRsv4ZhcKI)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## OLNOO CRM lead sync

After a Telegram order is saved in DomTrack's own `orders` table (`lib/telegram/flow.ts`'s
`deliver`, right after the admin Telegram notification), `lib/crm-sync.ts` sends the same order as
a commercial-context lead to the shared OLNOO CRM (`POST /api/leads/inbound` in `olnoo-admin`,
`project: "domtrack"`) — name, phone, service, the same order summary already sent to the admin,
and the order's own `source_session_id` (a UUID, not the bigint `orders.id`) reused as the CRM's
`lead_tracking_id`, so a retried sync can never create a second lead or a second owner
notification. Requires server-only `OLNOO_CRM_URL`/`OLNOO_CRM_API_KEY` (see `.env.example`);
without them the sync is skipped (logged) and the DomTrack order still saves normally — this runs
strictly after the order is committed and can never affect it. DomTrack's own `orders` table
remains the source of truth; the CRM only gets enough context to notify the owner and show the
lead. Telegram notification of the owner is centralized in `olnoo-admin`'s `createLeadRecord` —
not implemented here.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.

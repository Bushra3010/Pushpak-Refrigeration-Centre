# Pushpak Refrigeration Centre — AC Service Platform (demo)

Next.js 16 + React 19, same frontend stack and design system as zevto. **All data is demo data** (`app/lib/data.ts`), stored in this browser's localStorage and shared by all three apps. Supabase will replace `app/lib/store.ts` later.

```bash
npm install
npm run dev
```

| App | URL | Demo login |
|---|---|---|
| Customer app | http://localhost:3000 | 9876543210 (Rajesh Sharma) or any new number · OTP 1234 |
| Technician app | /technician | 9871234560 (Rohit Kumar) · OTP 1234 |
| Admin panel | /admin | admin@pushpak.in / pushpak@demo |

Example flow: book in the customer app → assign in Admin → Jobs → accept, diagnose, quote on the technician app → approve in the customer app → complete work → pay → invoice → the AC's service history updates.

- `app/lib/data.ts`: types, seed data, totals and GST, AC history, recommendation engine
- `app/lib/store.ts`: every write action (audit log + notifications)
- `app/components/service.tsx`: shared timeline, quotation, invoice, AC history, questionnaire and screen protection
- `app/customer/`, `app/technician/`, `app/admin/`: the three apps

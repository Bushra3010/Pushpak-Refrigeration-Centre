/** Consistent, lightweight line icons for workspace navigation. */
const paths: Record<string, string> = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  jobs: "M14 6a5 5 0 0 0-6 6L3 17l4 4 5-5a5 5 0 0 0 6-6l-4 3-3-3z",
  customers: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M18 4a4 4 0 0 1 0 7 M22 21v-2a4 4 0 0 0-3-4",
  acs: "M4 4h16v10H4z M7 10h10 M8 17v4 M12 17v4 M16 17v4",
  technicians: "M5 21v-3a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v3 M8 6a4 4 0 0 1 8 0v3H8z M6 9h12",
  inventory: "M3 7l9-4 9 4v12l-9 3-9-3z M3 7l9 4 9-4 M12 11v11 M8 5l9 4",
  notifications: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  audit: "M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6z M8 12l3 3 5-6",
  settings: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
  reports: "M4 3v18h17 M8 16v-5 M13 16V6 M18 16V9",
  timesheets: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20 M12 6v6l4 3",
  calculators: "M5 2h14v20H5z M8 5h8v4H8z M8 13h1 M15 13h1 M8 17h1 M15 17h1",
};
export function WorkspaceIcon({ name }: { name: string }) {
  const path = paths[name] ?? (name.includes("profit") || name === "growth" ? "M3 18l6-6 4 3 8-11 M15 4h6v6" : "M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5");
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}

/* Monochrome line icons — one stroke weight across the app, like the
 * CLATians student view. Colour comes from `c`, size from `s`. */

type P = { c?: string; s?: number; w?: number };

const Svg = ({ c = "currentColor", s = 22, w = 1.8, children, fill = "none" }: P & { children: React.ReactNode; fill?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const BackIcon = (p: P) => <Svg {...p} w={p.w ?? 1.9}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>;
export const ArrowRight = (p: P) => <Svg {...p}><path d="M4 12h15M13 6l6 6-6 6" /></Svg>;
export const ChevronRight = (p: P) => <Svg {...p} w={p.w ?? 2.2}><path d="M9 18l6-6-6-6" /></Svg>;
export const ChevronDown = (p: P) => <Svg {...p} w={p.w ?? 2.2}><path d="M6 9l6 6 6-6" /></Svg>;
export const SearchIcon = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7.5" /><path d="M21 21l-4.6-4.6" /></Svg>;
export const BellIcon = (p: P) => <Svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></Svg>;
export const CartIcon = (p: P) => <Svg {...p}><path d="M3 4h2.2l2.3 11h10.7l2-8H6.3" /><circle cx="9.5" cy="19.5" r="1.4" /><circle cx="17" cy="19.5" r="1.4" /></Svg>;
export const FilterIcon = (p: P) => <Svg {...p}><path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" /></Svg>;
export const HeartIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? "var(--red)" : "none"} c={filled ? "var(--red)" : p.c}>
    <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.6 3.3 4.4 6.7-1.7 4.7-9.2 9.3-9.2 9.3z" />
  </Svg>
);
export const ShareIcon = (p: P) => <Svg {...p}><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1" /></Svg>;
export const CalendarIcon = (p: P) => <Svg {...p}><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M4 10h16" /></Svg>;
export const ClockIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const PhoneIcon = (p: P) => <Svg {...p}><path d="M21 16.4v2.9a1.9 1.9 0 0 1-2.1 1.9A18.8 18.8 0 0 1 2.8 5.1 1.9 1.9 0 0 1 4.7 3h2.9a1.9 1.9 0 0 1 1.9 1.6c.1.9.4 1.8.7 2.7a1.9 1.9 0 0 1-.4 2L8.6 10.5a15.2 15.2 0 0 0 5.9 5.9l1.2-1.2a1.9 1.9 0 0 1 2-.4c.9.3 1.8.6 2.7.7a1.9 1.9 0 0 1 1.6 1.9z" /></Svg>;
export const ChatIcon = (p: P) => <Svg {...p}><path d="M20 12.5a7.5 7.5 0 0 1-11.1 6.6L4 20.5l1.4-4.6A7.5 7.5 0 1 1 20 12.5z" /></Svg>;
export const SendIcon = (p: P) => <Svg {...p}><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" /></Svg>;
export const ClipIcon = (p: P) => <Svg {...p}><path d="M20.5 11.5l-8.3 8.3a5 5 0 0 1-7.1-7.1l8.3-8.3a3.4 3.4 0 0 1 4.8 4.8l-8.3 8.3a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6" /></Svg>;
export const StarIcon = ({ s = 14 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="var(--gold)" aria-hidden="true">
    <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" />
  </svg>
);
export const CheckIcon = (p: P) => <Svg {...p} w={p.w ?? 2.6}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const PlusIcon = (p: P) => <Svg {...p} w={p.w ?? 2.2}><path d="M12 5v14M5 12h14" /></Svg>;
export const MinusIcon = (p: P) => <Svg {...p} w={p.w ?? 2.2}><path d="M5 12h14" /></Svg>;
export const TrashIcon = (p: P) => <Svg {...p}><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" /></Svg>;
export const ShieldIcon = (p: P) => <Svg {...p}><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" /><path d="M8.8 12l2.2 2.2 4.2-4.2" /></Svg>;
export const SunIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></Svg>;
export const LayersIcon = (p: P) => <Svg {...p}><path d="M12 3l9 4.5-9 4.5-9-4.5z" /><path d="M3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5" /></Svg>;
export const PinIcon = (p: P) => <Svg {...p}><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></Svg>;
export const CardIcon = (p: P) => <Svg {...p}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></Svg>;
export const HelpIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.2a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2-2.5 3.7M12 17h.01" /></Svg>;
export const InfoIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8h.01" /></Svg>;
export const BagIcon = (p: P) => <Svg {...p}><path d="M5 8h14l-1 12.5H6z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></Svg>;
export const WrenchIcon = (p: P) => <Svg {...p}><path d="M14.7 6.3a4 4 0 0 0 5 5L21 12.6l-.1.1a6 6 0 0 1-7.6.7L6 20.7a2 2 0 0 1-2.8-2.8l7.3-7.3a6 6 0 0 1 .7-7.6l.1-.1 1.3 1.3a4 4 0 0 0 2.1 2.1z" /></Svg>;
export const HistoryIcon = (p: P) => <Svg {...p}><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3 4v4.5h4.5M12 7.5V12l3 2" /></Svg>;
export const GearIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 15h-.3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.5 8.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" /></Svg>;

export const WalletIcon = (p: P) => <Svg {...p}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" /><path d="M16 13.5h2" /></Svg>;
export const TagIcon = (p: P) => <Svg {...p}><path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1.5 1.5 0 0 1 0 2.1l-6.7 6.7a1.5 1.5 0 0 1-2.1 0z" /><circle cx="8" cy="8" r="1.4" /></Svg>;
export const GiftIcon = (p: P) => <Svg {...p}><rect x="3.5" y="8" width="17" height="4.5" rx="1" /><path d="M5 12.5V20h14v-7.5M12 8v12M12 8S10.8 3.5 8 4.2C5.8 4.8 7 8 12 8zM12 8s1.2-4.5 4-3.8C18.2 4.8 17 8 12 8z" /></Svg>;
export const StarLineIcon = (p: P) => <Svg {...p}><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1-4.5-4.3 6.1-.8z" /></Svg>;
export const EditIcon = (p: P) => <Svg {...p}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Svg>;
export const CopyIcon = (p: P) => <Svg {...p}><rect x="8.5" y="8.5" width="12" height="12" rx="2.5" /><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" /></Svg>;
export const CloseIcon = (p: P) => <Svg {...p} w={p.w ?? 2.2}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const DropIcon = (p: P) => <Svg {...p}><path d="M12 3s-6.5 7.2-6.5 11.5a6.5 6.5 0 0 0 13 0C18.5 10.2 12 3 12 3z" /></Svg>;

/* AC-service glyphs */
export const SnowIcon = (p: P) => <Svg {...p}><path d="M12 2.5v19M4 7l16 10M20 7L4 17" /><path d="M9.5 4.5L12 6.5l2.5-2M9.5 19.5l2.5-2 2.5 2M4.3 10.4l2.9-.9-.6-3M19.7 13.6l-2.9.9.6 3M4.3 13.6l2.9.9-.6 3M19.7 10.4l-2.9-.9.6-3" /></Svg>;
export const AcIcon = (p: P) => <Svg {...p}><rect x="2.5" y="5" width="19" height="9" rx="2.5" /><path d="M5.5 11h13M8 17.5c0 1.5-1 2-1 3M12 17.5c0 1.5-1 2-1 3M16 17.5c0 1.5-1 2-1 3" /></Svg>;
export const UserIcon = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></Svg>;
export const ReceiptIcon = (p: P) => <Svg {...p}><path d="M5.5 3h13v18l-2.2-1.5L14.2 21 12 19.5 9.8 21l-2.1-1.5L5.5 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></Svg>;
export const ClipboardIcon = (p: P) => <Svg {...p}><rect x="5" y="4.5" width="14" height="16.5" rx="2.5" /><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" /></Svg>;
export const CameraIcon = (p: P) => <Svg {...p}><path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h2l1.5-2.5h6L16.5 6.5h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></Svg>;
export const BoxIcon = (p: P) => <Svg {...p}><path d="M3.5 8L12 3.5 20.5 8v8.5L12 21l-8.5-4.5z" /><path d="M3.8 8.2L12 12.5l8.2-4.3M12 12.5V21" /></Svg>;
export const ThermoIcon = (p: P) => <Svg {...p}><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" /><path d="M12 10v7" /></Svg>;
export const LogoutIcon = (p: P) => <Svg {...p}><path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3M10 16.5L5.5 12 10 7.5M5.5 12h10" /></Svg>;
export const LockIcon = (p: P) => <Svg {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></Svg>;
export const AlertIcon = (p: P) => <Svg {...p}><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.3h.01" /></Svg>;
export const SparkIcon = (p: P) => <Svg {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></Svg>;

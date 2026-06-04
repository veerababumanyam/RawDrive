/**
 * iOS-style SVG icons — SF Symbols aesthetic.
 * Consistent 24x24 viewBox, 1.5px stroke, round caps/joins.
 * Used with GlassIconButton for liquid glass UI.
 */

import type { ReactElement, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;
export type LucideIcon = (props: IconProps) => ReactElement;

const defaults: IconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const Icon = (props: IconProps & { children: React.ReactNode }) => (
  <svg {...defaults} {...props}>
    {props.children}
  </svg>
);

// Navigation
export const ChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 19l-7-7 7-7" />
  </Icon>
);
export const ChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);
export const ArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </Icon>
);
export const Home = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 10.5L12 3l9 7.5M5.25 9v10.5a.75.75 0 00.75.75H9.75v-6h4.5v6H18a.75.75 0 00.75-.75V9" />
  </Icon>
);
export const FolderOpen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.75 6.75a1.5 1.5 0 011.5-1.5h3.879a1.5 1.5 0 011.06.44l1.122 1.12a1.5 1.5 0 001.06.44h4.879a1.5 1.5 0 011.5 1.5v1.5M3.75 9.75h15.69a1.5 1.5 0 011.47 1.79l-1.2 6A1.5 1.5 0 0118.24 18.75H5.76a1.5 1.5 0 01-1.47-1.21l-1.2-6A1.5 1.5 0 013.75 9.75z" />
  </Icon>
);
export const Menu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
  </Icon>
);

// Actions
export const XMark = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 18L18 6M6 6l12 12" />
  </Icon>
);
export const Photo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.75 5h14.5A1.75 1.75 0 0121 6.75v10.5A1.75 1.75 0 0119.25 19H4.75A1.75 1.75 0 013 17.25V6.75A1.75 1.75 0 014.75 5z" />
    <circle cx="8.25" cy="9.25" r="1.25" />
    <path d="M4.5 16l4.25-4.25a1.5 1.5 0 012.12 0l1.38 1.38 2.38-2.38a1.5 1.5 0 012.12 0L20.5 14.5" />
  </Icon>
);
export const Plus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const Check = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12l5 5L20 6" />
  </Icon>
);
export const Copy = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8" y="8" width="11" height="11" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </Icon>
);
export const Pencil = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
    <path d="M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </Icon>
);
export const Download = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
  </Icon>
);
export const ArrowUpTray = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v12" />
    <path d="M7 8l5-5 5 5" />
    <path d="M5 21h14" />
  </Icon>
);
export const CreditCard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 10h18" />
  </Icon>
);
export const Coins = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="9" cy="7" rx="5" ry="2.5" />
    <path d="M4 7v4c0 1.38 2.24 2.5 5 2.5s5-1.12 5-2.5V7" />
    <path d="M14 9.5c2.85.12 5 1.18 5 2.5 0 1.38-2.24 2.5-5 2.5-1.1 0-2.1-.18-2.9-.5" />
    <path d="M9 13.5v3c0 1.38 2.24 2.5 5 2.5s5-1.12 5-2.5V12" />
  </Icon>
);
export const Trash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" />
  </Icon>
);
export const Expand = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
  </Icon>
);
export const Compress = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
  </Icon>
);
export const Grid = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4h6v6H4V4zM14 4h6v6h-6V4zM4 14h6v6H4v-6zM14 14h6v6h-6v-6z" />
  </Icon>
);
// Gallery view modes
export const Masonry = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4h6v10H4V4zM4 17h6v3H4v-3zM14 4h6v6h-6V4zM14 13h6v7h-6v-7z" />
  </Icon>
);
export const Justified = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h8v5H4V5zM15 5h5v5h-5V5zM4 14h5v5H4v-5zM12 14h4v5h-4v-5zM19 14h1v5h-1v-5z" />
  </Icon>
);
export const Carousel = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 6h8a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0116 18H8a1.5 1.5 0 01-1.5-1.5v-9A1.5 1.5 0 018 6zM4 8.5v7M20 8.5v7" />
  </Icon>
);
export const Stack = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 8h14a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0119 20H5a1.5 1.5 0 01-1.5-1.5v-9A1.5 1.5 0 015 8zM6.5 5h11M8 2.5h8" />
  </Icon>
);
export const ListBullet = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </Icon>
);

// Zoom
export const ZoomIn = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
  </Icon>
);
export const ZoomOut = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
  </Icon>
);

// Info & Metadata
export const InfoCircle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </Icon>
);

// Communication
export const ChatBubble = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </Icon>
);
export const Envelope = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16v12H4V6z" />
    <path d="M4 7l8 6 8-6" />
  </Icon>
);
export const Bell = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.857 17.082a23.85 23.85 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022 23.85 23.85 0 005.454 1.31m6.715 0a24.255 24.255 0 01-6.715 0m6.715 0a3 3 0 11-6.715 0" />
  </Icon>
);
export const User = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0" />
  </Icon>
);
export const Users = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.75 7.5a3.25 3.25 0 11-6.5 0 3.25 3.25 0 016.5 0zM2.5 20a6 6 0 0111.5 0" />
    <path d="M17 9.25a2.75 2.75 0 11-5.5 0M14.5 14.5A5.5 5.5 0 0121.5 20" />
  </Icon>
);
export const Briefcase = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6V4.75A1.75 1.75 0 0110.75 3h2.5A1.75 1.75 0 0115 4.75V6" />
    <path d="M4.75 6h14.5A1.75 1.75 0 0121 7.75v10.5A1.75 1.75 0 0119.25 20H4.75A1.75 1.75 0 013 18.25V7.75A1.75 1.75 0 014.75 6z" />
    <path d="M3 11.5h18M9.75 11.5v1.25h4.5V11.5" />
  </Icon>
);
export const HardDrive = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.75 5h14.5A1.75 1.75 0 0121 6.75v10.5A1.75 1.75 0 0119.25 19H4.75A1.75 1.75 0 013 17.25V6.75A1.75 1.75 0 014.75 5z" />
    <path d="M3 14h18M7 16.5h.01M10 16.5h.01" />
  </Icon>
);
export const Building2 = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16M2.75 21h18.5" />
    <path d="M8 7h2M8 11h2M8 15h2M14 9h2M14 13h2M14 17h2" />
  </Icon>
);
export const LogOut = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15.75 9V5.25A1.5 1.5 0 0014.25 3.75h-7.5A1.5 1.5 0 005.25 5.25v13.5a1.5 1.5 0 001.5 1.5h7.5a1.5 1.5 0 001.5-1.5V15M18 15l3-3m0 0l-3-3m3 3H9" />
  </Icon>
);
export const Key = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8.5" cy="14.5" r="3.5" />
    <path d="M11 12l7-7 2 2-1.5 1.5 1.5 1.5-2 2-1.5-1.5-3.5 3.5" />
  </Icon>
);
export const Sun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.75v2M12 19.25v2M4.45 4.45l1.4 1.4M18.15 18.15l1.4 1.4M2.75 12h2M19.25 12h2M4.45 19.55l1.4-1.4M18.15 5.85l1.4-1.4" />
  </Icon>
);
export const Moon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.25 14.6A8.5 8.5 0 119.4 3.75a6.75 6.75 0 0010.85 10.85z" />
  </Icon>
);
export const Eye = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.5" />
  </Icon>
);
export const EyeOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.72A9.9 9.9 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17.3 17.3 0 01-2.15 2.86M6.15 6.75A17.2 17.2 0 002.5 12s3.5 6.5 9.5 6.5a9.7 9.7 0 004.22-.98" />
    <path d="M9.88 9.88A2.5 2.5 0 0012 14.5a2.5 2.5 0 002.12-3.82" />
  </Icon>
);

// Proofing
export const CheckCircle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </Icon>
);
export const ThumbsUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM4 21H2V10h2v11z" />
  </Icon>
);
export const XCircle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </Icon>
);

// Star / Favorite
export const Star = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </Icon>
);
// Share — node-and-link "share-to-the-world" glyph matching the iOS 26 SF
// Symbols family. Used by the public gallery lightbox's "Copy share link"
// action and any future surface that needs a Share affordance.
export const Share = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13" />
  </Icon>
);

// Table — Sort & Filter
export const ChevronUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 15l-6-6-6 6" />
  </Icon>
);
export const ChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);
export const ChevronUpDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
  </Icon>
);
export const Search = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </Icon>
);
export const Funnel = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </Icon>
);
export const ChevronDoubleLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18.5 19l-7-7 7-7M11.5 19l-7-7 7-7" />
  </Icon>
);
export const ChevronDoubleRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 5l7 7-7 7M12.5 5l7 7-7 7" />
  </Icon>
);

// QR Code
export const QRCode = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3h7v7H3V3zm1.5 1.5v4h4v-4h-4zM14 3h7v7h-7V3zm1.5 1.5v4h4v-4h-4zM3 14h7v7H3v-7zm1.5 1.5v4h4v-4h-4zM17 14h1.5v1.5H17V14zm3 0h1v3h-3v-1.5h1.5V14zm-3 3h1.5v1.5H17V17zm0 3h1.5v1h-1.5v-1zm3-1.5h1V21h-1v-2.5z" />
  </Icon>
);

// More / Overflow
export const EllipsisVertical = (p: IconProps) => (
  <svg
    width={24}
    height={24}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    {...p}
  >
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
);

// Gear / Settings
export const Gear = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
export const Settings = Gear;
export const BarChart3 = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 19V5M4 19h17M8 16V9M12 16V6M16 16v-4M20 16V8" />
  </Icon>
);
export const Film = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4" />
  </Icon>
);
export const ShoppingBag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 8h12l-1 13H7L6 8z" />
    <path d="M9 8a3 3 0 016 0" />
  </Icon>
);
export const MessageSquare = ChatBubble;

// Sparkle / AI
export const Sparkle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </Icon>
);

// Document / Invoice
export const DocumentText = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </Icon>
);
export const FileText = DocumentText;

// Calendar
export const CalendarDays = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </Icon>
);
export const Clock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Icon>
);
/** Timeout / history — SF "clock.arrow.circlepath" aesthetic (34-6). */
export const ClockArrow = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.49 12A8.5 8.5 0 1 1 18 6.36" />
    <path d="M18.5 3v3.5H15" />
    <path d="M12 8v4l2.5 1.5" />
  </Icon>
);
/** Block / ban — SF "nosign" aesthetic (34-6). */
export const NoSymbol = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </Icon>
);
/** Face detection toggle — SF "face.smiling" aesthetic. */
export const FaceSmile = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9.5h.01M15 9.5h.01" />
    <path d="M8.5 14a4.5 4.5 0 0 0 7 0" />
  </Icon>
);
/** Side-by-side compare — SF "rectangle.split.2x1" aesthetic. */
export const SquareSplit = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M12 5v14" />
  </Icon>
);
export const MapPin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s7-5.2 7-12a7 7 0 10-14 0c0 6.8 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.25" />
  </Icon>
);
export const Mail = Envelope;
export const MessageSquareText = ChatBubble;
export const Smartphone = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7" y="2.75" width="10" height="18.5" rx="2" />
    <path d="M10.5 18.5h3" />
  </Icon>
);
export const Video = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.75 6.5h9.5A2.25 2.25 0 0116.5 8.75v6.5a2.25 2.25 0 01-2.25 2.25h-9.5A2.25 2.25 0 012.5 15.25v-6.5A2.25 2.25 0 014.75 6.5z" />
    <path d="M16.5 10l5-3v10l-5-3" />
  </Icon>
);
export const Cloud = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.25 18.5h10.25a4 4 0 10-.76-7.93 6 6 0 10-11.36 3.02A3.25 3.25 0 007.25 18.5z" />
  </Icon>
);
export const MonitorPlay = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M10 8l4 2.5-4 2.5V8z" fill="currentColor" stroke="none" />
    <path d="M8 21h8M12 16v5" />
  </Icon>
);
export const Wallet = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.75 6h14.5A1.75 1.75 0 0121 7.75v10.5A1.75 1.75 0 0119.25 20H4.75A1.75 1.75 0 013 18.25V7.75A1.75 1.75 0 014.75 6z" />
    <path d="M16 13h5M6 6V4.5A1.5 1.5 0 017.5 3h10" />
  </Icon>
);
export const Server = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="7" rx="2" />
    <rect x="4" y="13" width="16" height="7" rx="2" />
    <path d="M8 7.5h.01M8 16.5h.01M12 7.5h6M12 16.5h6" />
  </Icon>
);
export const Banknote = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 9h.01M18 15h.01" />
  </Icon>
);
export const Tag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4h7l9 9-7 7-9-9V4z" />
    <circle cx="8" cy="8" r="1" />
  </Icon>
);
export const Ticket = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7.5A1.5 1.5 0 015.5 6h13A1.5 1.5 0 0120 7.5v2.25a2.25 2.25 0 010 4.5v2.25A1.5 1.5 0 0118.5 18h-13A1.5 1.5 0 014 16.5v-2.25a2.25 2.25 0 010-4.5V7.5z" />
    <path d="M9 6v12" />
  </Icon>
);

// Phone / WhatsApp
export const Phone = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </Icon>
);
export const Send = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 3L10 14" />
    <path d="M21 3l-7 20-4-9-9-4 20-7z" />
  </Icon>
);
export const Handshake = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 12.5l2.2-2.2a2 2 0 012.8 0l.7.7a2 2 0 002.8 0l.5-.5" />
    <path d="M3.5 10.5l3-3 4 4-3 3-4-4zM20.5 10.5l-3-3-4 4 3 3 4-4z" />
    <path d="M8.5 14.5l2.7 2.7a2 2 0 002.8 0l2.5-2.5" />
  </Icon>
);

// Streaming console tabs
export const Broadcast = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 8.5a7 7 0 010 7M7.5 6a10 10 0 010 12M16.5 6a10 10 0 010 12M19.5 8.5a7 7 0 010 7" />
    <circle cx="12" cy="12" r="2" />
  </Icon>
);
export const Replay = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 109-9v4m0-4L8 7m4-4l4 4" />
    <path d="M10 10l5 3-5 3v-6z" fill="currentColor" stroke="none" />
  </Icon>
);
export const Shield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l8 3v6c0 4.97-3.58 8.5-8 9-4.42-.5-8-4.03-8-9V6l8-3z" />
  </Icon>
);
export const ClipboardList = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1zM8 6H6a2 2 0 00-2 2v11a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-2M9 12h6M9 16h6" />
  </Icon>
);
export const GoogleMark = (p: IconProps) => (
  <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="var(--brand-google-blue)"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="var(--brand-google-green)"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      fill="var(--brand-google-yellow)"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="var(--brand-google-red)"
    />
  </svg>
);
export const InstagramMark = (p: IconProps) => (
  <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <rect
      x="4"
      y="4"
      width="16"
      height="16"
      rx="5"
      fill="none"
      stroke="var(--brand-instagram-primary)"
      strokeWidth="1.75"
    />
    <circle
      cx="12"
      cy="12"
      r="3.5"
      fill="none"
      stroke="var(--brand-instagram-primary)"
      strokeWidth="1.75"
    />
    <circle cx="16.5" cy="7.5" r="1" fill="var(--brand-instagram-primary)" />
  </svg>
);
export const FacebookMark = (p: IconProps) => (
  <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path
      d="M13.3 21v-7.2h2.42l.42-2.85H13.3V9.1c0-.8.25-1.36 1.42-1.36h1.52V5.18A21.1 21.1 0 0014 5.06c-2.24 0-3.76 1.36-3.76 3.86v2.03H7.72v2.85h2.52V21h3.06z"
      fill="var(--brand-facebook-primary)"
    />
  </svg>
);
export const LinkedInMark = (p: IconProps) => (
  <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path
      d="M5.6 9h3.08v9.9H5.6V9zm1.54-4.9a1.78 1.78 0 110 3.56 1.78 1.78 0 010-3.56zM10.6 9h2.95v1.35h.04c.41-.78 1.42-1.6 2.92-1.6 3.12 0 3.7 2.06 3.7 4.74v5.41h-3.08v-4.8c0-1.15-.02-2.62-1.6-2.62-1.6 0-1.85 1.25-1.85 2.53v4.89H10.6V9z"
      fill="var(--brand-linkedin-primary)"
    />
  </svg>
);
export const YouTubeMark = (p: IconProps) => (
  <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path
      d="M21.2 8.18a3 3 0 00-2.12-2.12C17.22 5.56 12 5.56 12 5.56s-5.22 0-7.08.5A3 3 0 002.8 8.18 31.1 31.1 0 002.3 12c0 1.32.16 2.63.5 3.82a3 3 0 002.12 2.12c1.86.5 7.08.5 7.08.5s5.22 0 7.08-.5a3 3 0 002.12-2.12c.34-1.19.5-2.5.5-3.82 0-1.32-.16-2.63-.5-3.82z"
      fill="var(--brand-youtube-primary)"
    />
    <path d="M10.25 15.25v-6.5L15.75 12l-5.5 3.25z" fill="white" />
  </svg>
);
export const Wrench = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.7 6.3a4 4 0 015.5 5.5l-2.1-2.1-2.2.7-.7 2.2 2.1 2.1a4 4 0 01-5.5-5.5L3.6 17l3.4 3.4 9.2-9.1" />
  </Icon>
);
export const SlidersHorizontal = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h7M15 7h5M4 17h5M13 17h7" />
    <circle cx="13" cy="7" r="2" />
    <circle cx="11" cy="17" r="2" />
  </Icon>
);
export const Globe = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.2 2.45 3.3 5.45 3.3 9s-1.1 6.55-3.3 9M12 3C9.8 5.45 8.7 8.45 8.7 12s1.1 6.55 3.3 9" />
  </Icon>
);
export const LineChart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 19V5M4 19h17" />
    <path d="M7 15l4-4 3 3 6-8" />
  </Icon>
);
export const Palette = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3a9 9 0 00-2 17.78 1.75 1.75 0 002-1.7v-.33a1.75 1.75 0 011.75-1.75H15a6 6 0 006-6c0-4.42-4.03-8-9-8z" />
    <circle cx="7.5" cy="11" r="0.75" fill="currentColor" stroke="none" />
    <circle cx="9.5" cy="7.5" r="0.75" fill="currentColor" stroke="none" />
    <circle cx="14" cy="7.5" r="0.75" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="11" r="0.75" fill="currentColor" stroke="none" />
  </Icon>
);
export const PieChart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v9h9A9 9 0 1012 3z" />
    <path d="M14 3.25A9 9 0 0120.75 10H14V3.25z" />
  </Icon>
);
export const Lock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="10" width="15" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 018 0v3" />
  </Icon>
);
export const Crown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 18h16M5 15l1.5-9 5.5 5 5.5-5L19 15H5z" />
  </Icon>
);
export const Zap = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 2L4 14h8l-1 8 9-12h-8l1-8z" />
  </Icon>
);
export const Heart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.5 5.8a5.1 5.1 0 00-7.2 0L12 7.1l-1.3-1.3a5.1 5.1 0 00-7.2 7.2L12 21l8.5-8a5.1 5.1 0 000-7.2z" />
  </Icon>
);
export const UserPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 7.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zM4 20a7 7 0 0112 0M18 8v6M15 11h6" />
  </Icon>
);
export const Cpu = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M9.5 2.75v2.5M14.5 2.75v2.5M9.5 18.75v2.5M14.5 18.75v2.5M2.75 9.5h2.5M2.75 14.5h2.5M18.75 9.5h2.5M18.75 14.5h2.5" />
  </Icon>
);
export const BrainCircuit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 6a4 4 0 00-4 4v4a4 4 0 004 4M16 6a4 4 0 014 4v4a4 4 0 01-4 4M8 6a4 4 0 018 0v12a4 4 0 01-8 0V6z" />
    <path d="M9 10h3m0 0h3m-3 0v4M9 15h2M15 15h-2" />
  </Icon>
);
export const CopyCheck = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8" y="8" width="11" height="11" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1M11 14l2 2 4-4" />
  </Icon>
);
export const FileSignature = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3h7l5 5v13H6V3zM13 3v5h5" />
    <path d="M8 16c2-3 3 3 5 0s3 0 5-2" />
  </Icon>
);
export const ReceiptText = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3l1.5 1.5L9 3l1.5 1.5L12 3l1.5 1.5L15 3l1.5 1.5L18 3v18l-1.5-1.5L15 21l-1.5-1.5L12 21l-1.5-1.5L9 21l-1.5-1.5L6 21V3z" />
    <path d="M9 9h6M9 13h6M9 17h3" />
  </Icon>
);
export const Layers3 = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 12l9 5 9-5M3 16l9 5 9-5" />
  </Icon>
);
export const Loader2 = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 12a9 9 0 10-9 9" />
  </Icon>
);
export const RefreshCw = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 10-2.35 5.65M20 11V5m0 6h-6" />
  </Icon>
);
export const BadgeCheck = CheckCircle;
export const ArrowLeft = ChevronLeft;
export const BriefcaseBusiness = Briefcase;
export const Calendar = CalendarDays;
export const CalendarHeart = CalendarDays;
export const CheckCircle2 = CheckCircle;
export const Clock3 = Clock;
export const Filter = Funnel;
export const Image = Photo;
export const ImageIcon = Photo;
export const KeyRound = Key;
export const LayoutGrid = Grid;
export const MailCheck = Envelope;
export const MapPinned = MapPin;
export const MoreVertical = EllipsisVertical;
export const QrCode = QRCode;
export const ShieldCheck = Shield;
export const Sparkles = Sparkle;
export const Store = ShoppingBag;
export const TrendingUp = LineChart;
export const UploadCloud = ArrowUpTray;
export const UserRound = User;
export const X = XMark;

// People / Face — used by FaceFilter
export const FaceCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="9" cy="10" r="0.5" fill="currentColor" />
    <circle cx="15" cy="10" r="0.5" fill="currentColor" />
    <path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" />
  </Icon>
);

// Camera — used by tethering toggle
export const Camera = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3h6l2 2h3a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1h3L9 3z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

// Slideshow playback & audio — Gallery Enhancements June 2026
export const Play = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 5.5v13l11-6.5-11-6.5z" fill="currentColor" stroke="none" />
  </Icon>
);
export const Pause = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M8 5h2.5v14H8zM13.5 5H16v14h-2.5z"
      fill="currentColor"
      stroke="none"
    />
  </Icon>
);
export const Music = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="16" cy="16" r="3" />
  </Icon>
);
export const Volume = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />
  </Icon>
);
export const VolumeOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M17 9.5l4 5M21 9.5l-4 5" />
  </Icon>
);

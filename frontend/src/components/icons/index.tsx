/**
 * iOS-style SVG icons — SF Symbols aesthetic.
 * Consistent 24x24 viewBox, 1.5px stroke, round caps/joins.
 * Used with GlassIconButton for liquid glass UI.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

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
  <svg {...defaults} {...props}>{props.children}</svg>
);

// Navigation
export const ChevronLeft = (p: IconProps) => <Icon {...p}><path d="M15 19l-7-7 7-7" /></Icon>;
export const ChevronRight = (p: IconProps) => <Icon {...p}><path d="M9 5l7 7-7 7" /></Icon>;

// Actions
export const XMark = (p: IconProps) => <Icon {...p}><path d="M6 18L18 6M6 6l12 12" /></Icon>;
export const Plus = (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const Pencil = (p: IconProps) => <Icon {...p}><path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /><path d="M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></Icon>;
export const Download = (p: IconProps) => <Icon {...p}><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></Icon>;
export const Trash = (p: IconProps) => <Icon {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></Icon>;
export const Expand = (p: IconProps) => <Icon {...p}><path d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></Icon>;
export const Compress = (p: IconProps) => <Icon {...p}><path d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></Icon>;
export const Grid = (p: IconProps) => <Icon {...p}><path d="M4 4h6v6H4V4zM14 4h6v6h-6V4zM4 14h6v6H4v-6zM14 14h6v6h-6v-6z" /></Icon>;
export const ListBullet = (p: IconProps) => <Icon {...p}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></Icon>;

// Zoom
export const ZoomIn = (p: IconProps) => <Icon {...p}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></Icon>;
export const ZoomOut = (p: IconProps) => <Icon {...p}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" /></Icon>;

// Info & Metadata
export const InfoCircle = (p: IconProps) => <Icon {...p}><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></Icon>;

// Communication
export const ChatBubble = (p: IconProps) => <Icon {...p}><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></Icon>;
export const Envelope = (p: IconProps) => <Icon {...p}><path d="M4 6h16v12H4V6z" /><path d="M4 7l8 6 8-6" /></Icon>;

// Proofing
export const CheckCircle = (p: IconProps) => <Icon {...p}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></Icon>;
export const ThumbsUp = (p: IconProps) => <Icon {...p}><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM4 21H2V10h2v11z" /></Icon>;
export const XCircle = (p: IconProps) => <Icon {...p}><path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></Icon>;

// Star / Favorite
export const Star = (p: IconProps) => <Icon {...p}><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></Icon>;
// Share — node-and-link "share-to-the-world" glyph matching the iOS 26 SF
// Symbols family. Used by the public gallery lightbox's "Copy share link"
// action and any future surface that needs a Share affordance.
export const Share = (p: IconProps) => <Icon {...p}><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13" /></Icon>;

// Table — Sort & Filter
export const ChevronUp = (p: IconProps) => <Icon {...p}><path d="M18 15l-6-6-6 6" /></Icon>;
export const ChevronDown = (p: IconProps) => <Icon {...p}><path d="M6 9l6 6 6-6" /></Icon>;
export const ChevronUpDown = (p: IconProps) => <Icon {...p}><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></Icon>;
export const Search = (p: IconProps) => <Icon {...p}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></Icon>;
export const Funnel = (p: IconProps) => <Icon {...p}><path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></Icon>;
export const ChevronDoubleLeft = (p: IconProps) => <Icon {...p}><path d="M18.5 19l-7-7 7-7M11.5 19l-7-7 7-7" /></Icon>;
export const ChevronDoubleRight = (p: IconProps) => <Icon {...p}><path d="M5.5 5l7 7-7 7M12.5 5l7 7-7 7" /></Icon>;

// QR Code
export const QRCode = (p: IconProps) => <Icon {...p}><path d="M3 3h7v7H3V3zm1.5 1.5v4h4v-4h-4zM14 3h7v7h-7V3zm1.5 1.5v4h4v-4h-4zM3 14h7v7H3v-7zm1.5 1.5v4h4v-4h-4zM17 14h1.5v1.5H17V14zm3 0h1v3h-3v-1.5h1.5V14zm-3 3h1.5v1.5H17V17zm0 3h1.5v1h-1.5v-1zm3-1.5h1V21h-1v-2.5z" /></Icon>;

// More / Overflow
export const EllipsisVertical = (p: IconProps) => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
);

// Gear / Settings
export const Gear = (p: IconProps) =><Icon {...p}><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" /><circle cx="12" cy="12" r="3" /></Icon>;

// Sparkle / AI
export const Sparkle = (p: IconProps) => <Icon {...p}><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></Icon>;

// Document / Invoice
export const DocumentText = (p: IconProps) => <Icon {...p}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></Icon>;

// Calendar
export const CalendarDays = (p: IconProps) => <Icon {...p}><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></Icon>;

// Phone / WhatsApp
export const Phone = (p: IconProps) => <Icon {...p}><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></Icon>;

// Streaming console tabs
export const Broadcast = (p: IconProps) => <Icon {...p}><path d="M4.5 8.5a7 7 0 010 7M7.5 6a10 10 0 010 12M16.5 6a10 10 0 010 12M19.5 8.5a7 7 0 010 7" /><circle cx="12" cy="12" r="2" /></Icon>;
export const Replay = (p: IconProps) => <Icon {...p}><path d="M3 12a9 9 0 109-9v4m0-4L8 7m4-4l4 4" /><path d="M10 10l5 3-5 3v-6z" fill="currentColor" stroke="none" /></Icon>;
export const Shield = (p: IconProps) => <Icon {...p}><path d="M12 3l8 3v6c0 4.97-3.58 8.5-8 9-4.42-.5-8-4.03-8-9V6l8-3z" /></Icon>;
export const ClipboardList = (p: IconProps) => <Icon {...p}><path d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1zM8 6H6a2 2 0 00-2 2v11a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-2M9 12h6M9 16h6" /></Icon>;
export const Wrench = (p: IconProps) => <Icon {...p}><path d="M14.7 6.3a4 4 0 015.5 5.5l-2.1-2.1-2.2.7-.7 2.2 2.1 2.1a4 4 0 01-5.5-5.5L3.6 17l3.4 3.4 9.2-9.1" /></Icon>;

// People / Face — used by FaceFilter
export const FaceCircle = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="0.5" fill="currentColor" /><circle cx="15" cy="10" r="0.5" fill="currentColor" /><path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" /></Icon>;

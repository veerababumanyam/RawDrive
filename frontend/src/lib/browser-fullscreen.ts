export type BrowserFullscreenRequestOptions = FullscreenOptions & {
  navigationUI?: "auto" | "hide" | "show";
};

type LegacyFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitCurrentFullScreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitFullScreenEnabled?: boolean;
  mozFullScreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitCancelFullScreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

type LegacyFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

const FULLSCREEN_CHANGE_EVENTS = [
  "fullscreenchange",
  "webkitfullscreenchange",
  "mozfullscreenchange",
  "MSFullscreenChange",
] as const;

const FULLSCREEN_ERROR_EVENTS = [
  "fullscreenerror",
  "webkitfullscreenerror",
  "mozfullscreenerror",
  "MSFullscreenError",
] as const;

function fullscreenDocument(doc?: Document): LegacyFullscreenDocument | null {
  if (doc) return doc as LegacyFullscreenDocument;
  if (typeof document === "undefined") return null;
  return document as LegacyFullscreenDocument;
}

export function getFullscreenElement(doc?: Document): Element | null {
  const target = fullscreenDocument(doc);
  if (!target) return null;
  return (
    target.fullscreenElement ??
    target.webkitFullscreenElement ??
    target.webkitCurrentFullScreenElement ??
    target.mozFullScreenElement ??
    target.msFullscreenElement ??
    null
  );
}

export function isFullscreenEnabled(doc?: Document): boolean {
  const target = fullscreenDocument(doc);
  if (!target) return false;
  return Boolean(
    target.fullscreenEnabled ??
    target.webkitFullscreenEnabled ??
    target.webkitFullScreenEnabled ??
    target.mozFullScreenEnabled ??
    target.msFullscreenEnabled,
  );
}

function fullscreenRequest(
  element: HTMLElement,
):
  | ((options?: BrowserFullscreenRequestOptions) => Promise<void> | void)
  | undefined {
  const target = element as LegacyFullscreenElement;
  if (target.requestFullscreen) {
    return (options?: BrowserFullscreenRequestOptions) =>
      target.requestFullscreen(options);
  }
  if (target.webkitRequestFullscreen) {
    return () => target.webkitRequestFullscreen?.();
  }
  if (target.webkitRequestFullScreen) {
    return () => target.webkitRequestFullScreen?.();
  }
  if (target.mozRequestFullScreen) {
    return () => target.mozRequestFullScreen?.();
  }
  if (target.msRequestFullscreen) {
    return () => target.msRequestFullscreen?.();
  }
  return undefined;
}

export function isFullscreenSupportedForElement(
  element: HTMLElement | null,
  doc?: Document,
): element is HTMLElement {
  return Boolean(
    element && isFullscreenEnabled(doc) && fullscreenRequest(element),
  );
}

export function requestElementFullscreen(
  element: HTMLElement,
  options?: BrowserFullscreenRequestOptions,
): Promise<void> | void {
  return fullscreenRequest(element)?.(options);
}

export function exitFullscreenDocument(doc?: Document): Promise<void> | void {
  const target = fullscreenDocument(doc);
  if (!target || !getFullscreenElement(target)) return;

  const exit =
    target.exitFullscreen ??
    target.webkitExitFullscreen ??
    target.webkitCancelFullScreen ??
    target.mozCancelFullScreen ??
    target.msExitFullscreen;

  return exit?.call(target);
}

export function addFullscreenListeners(
  doc: Document,
  onChange: EventListener,
  onError: EventListener,
) {
  for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
    doc.addEventListener(eventName, onChange);
  }
  for (const eventName of FULLSCREEN_ERROR_EVENTS) {
    doc.addEventListener(eventName, onError);
  }

  return () => {
    for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
      doc.removeEventListener(eventName, onChange);
    }
    for (const eventName of FULLSCREEN_ERROR_EVENTS) {
      doc.removeEventListener(eventName, onError);
    }
  };
}

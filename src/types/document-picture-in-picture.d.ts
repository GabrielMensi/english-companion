// Document Picture-in-Picture API (Chrome/Edge 116+, Firefox 151+), not in lib.dom yet.
// https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API

interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
}

interface DocumentPictureInPictureEvent extends Event {
  readonly window: Window;
}

interface DocumentPictureInPicture extends EventTarget {
  readonly window: Window | null;
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
  onenter: ((this: DocumentPictureInPicture, ev: DocumentPictureInPictureEvent) => unknown) | null;
}

interface Window {
  readonly documentPictureInPicture?: DocumentPictureInPicture;
}

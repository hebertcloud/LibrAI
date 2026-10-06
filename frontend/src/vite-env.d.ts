/// <reference types="vite/client" />

declare global {
  interface Window {
    Hands?: new (config?: { locateFile?: (file: string) => string }) => {
      setOptions: (options: Record<string, unknown>) => void;
      onResults: (listener: (results: import("@mediapipe/hands").Results) => void) => void;
      send: (inputs: { image: HTMLVideoElement }) => Promise<void>;
      close: () => Promise<void>;
    };
    VLibras?: {
      Widget: new (url: string) => unknown;
    };
    VLibrasWidget?: {
      open?: () => void;
      access?: HTMLElement;
      wrapper?: HTMLElement;
    };
  }
}

export {};

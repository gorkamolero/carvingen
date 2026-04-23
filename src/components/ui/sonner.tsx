"use client";

import { Toaster as Sonner } from "sonner";

function LoadingIcon() {
  return (
    <svg
      viewBox="0 0 14 14"
      className="h-3.5 w-3.5 animate-spin"
      aria-hidden
    >
      <circle
        cx="7"
        cy="7"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeDasharray="11 20"
        strokeLinecap="square"
      />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden>
      <path
        d="M3 7 L6 10 L11 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden>
      <path
        d="M3 3 L11 11 M11 3 L3 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      expand
      closeButton
      visibleToasts={5}
      icons={{
        loading: <LoadingIcon />,
        success: <SuccessIcon />,
        error: <ErrorIcon />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group pointer-events-auto flex w-full items-center gap-3 border-[3px] border-black bg-white p-3 text-black shadow-[6px_6px_0_0_#0a0a0a] [&>[data-icon]]:flex [&>[data-icon]]:h-4 [&>[data-icon]]:w-4 [&>[data-icon]]:shrink-0 [&>[data-icon]]:items-center [&>[data-icon]]:justify-center",
          title: "text-[11px] font-black uppercase tracking-[0.16em] text-black",
          description: "font-mono text-[11px] leading-[1.45] text-black/70",
          actionButton:
            "h-8 border-[3px] border-black bg-black px-3 text-[10px] font-black uppercase tracking-[0.14em] text-white transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
          cancelButton:
            "h-8 border-[3px] border-black bg-white px-3 text-[10px] font-black uppercase tracking-[0.14em] text-black transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
          closeButton:
            "border-[3px] border-black bg-white text-black shadow-[3px_3px_0_0_#0a0a0a] transition hover:bg-[#f9f5e8] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
          success: "bg-[#f4ffdf]",
          error: "bg-[#fff0ea]",
          loading: "bg-[#fff7cc]",
          info: "bg-[#eef5ff]",
          warning: "bg-[#fff4d8]",
        },
      }}
    />
  );
}

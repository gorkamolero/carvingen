"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      expand
      closeButton
      visibleToasts={5}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group pointer-events-auto flex w-full items-start gap-3 border-[3px] border-black bg-white p-3 text-black shadow-[6px_6px_0_0_#0a0a0a]",
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

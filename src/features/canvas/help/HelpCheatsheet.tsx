"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

type Section = {
  heading: string;
  accent: string;
  items: Array<{ label: string; keys: string[] }>;
};

const SECTIONS: Section[] = [
  {
    heading: "Canvas navigation",
    accent: "bg-[#3e8cff]",
    items: [
      { label: "Pan", keys: ["Middle drag", "Right drag", "2-finger scroll"] },
      { label: "Zoom in / out", keys: ["Scroll", "Pinch"] },
      { label: "Zoom range", keys: ["5%", "→", "300%"] },
      { label: "Fit to view", keys: ["Controls ↙"] },
    ],
  },
  {
    heading: "Selection",
    accent: "bg-[#8cff3e]",
    items: [
      { label: "Marquee select", keys: ["Left drag on canvas"] },
      { label: "Add to selection", keys: ["Shift", "click"] },
      { label: "Multi-select modifier", keys: ["Shift", "or", "⌘"] },
      { label: "Deselect all", keys: ["Click on empty canvas"] },
    ],
  },
  {
    heading: "Node creation",
    accent: "bg-[#ff6fa8]",
    items: [
      { label: "From palette", keys: ["Drag tile from left sidebar"] },
      { label: "Drop images", keys: ["Drag image files from Finder"] },
      { label: "Multi-image drop", keys: ["Grid layout, up to 4 cols"] },
      { label: "Auto-spawn Prompt", keys: ["Drag handle → empty canvas"] },
    ],
  },
  {
    heading: "Connecting nodes",
    accent: "bg-[#ff8a3d]",
    items: [
      { label: "Connect", keys: ["Drag right handle → left handle"] },
      { label: "Auto-spawn downstream Prompt", keys: ["Drop on empty canvas"] },
      { label: "Fan-in multi-connect", keys: ["Select many → drag one handle"] },
    ],
  },
  {
    heading: "Running a node",
    accent: "bg-[#ffd400]",
    items: [
      { label: "Run", keys: ["Click Run button on node"] },
      { label: "No auto-run", keys: ["Manual trigger only"] },
      { label: "Inputs changed indicator", keys: ["Ping dot on node header"] },
      { label: "Output history (Prompt)", keys: ["Strip below output image"] },
    ],
  },
  {
    heading: "Node controls",
    accent: "bg-[#d8421b]",
    items: [
      { label: "Minimize / expand", keys: ["−", "/", "+", "button in node header"] },
      { label: "Collapsed size", keys: ["192 × auto px"] },
    ],
  },
  {
    heading: "Undo & delete",
    accent: "bg-[#0a0a0a]",
    items: [
      { label: "Undo", keys: ["⌘Z"] },
      { label: "Redo", keys: ["⌘⇧Z"] },
      { label: "Delete selected", keys: ["Backspace", "or", "Delete"] },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  if (children === "→" || children === "/" || children === "or") {
    return (
      <span className="font-mono text-[11px] font-bold text-black/50">
        {children}
      </span>
    );
  }
  return (
    <span className="inline-block border-[2px] border-black bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none">
      {children}
    </span>
  );
}

function SectionCard({ section }: { section: Section }) {
  return (
    <div className="border-[3px] border-black bg-[#f4efdf] shadow-[3px_3px_0_0_#0a0a0a]">
      <div className="flex items-center gap-2 border-b-[3px] border-black px-3 py-2">
        <span className={`inline-block h-3 w-3 shrink-0 ${section.accent} border-[2px] border-black`} aria-hidden />
        <span className="text-[11px] font-black uppercase tracking-[0.18em]">
          {section.heading}
        </span>
      </div>
      <div className="space-y-2 p-3">
        {section.items.map((item) => (
          <div key={item.label} className="flex items-start justify-between gap-4">
            <span className="text-[13px] font-medium leading-[1.5] text-black/70">
              {item.label}
            </span>
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              {item.keys.map((key, i) => (
                <Kbd key={i}>{key}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HelpCheatsheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
      aria-modal="true"
      role="dialog"
      aria-label="Keyboard shortcuts and gestures"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-[760px] flex-col border-[3px] border-black bg-[#f4efdf] shadow-[8px_8px_0_0_#0a0a0a]">
        <div className="flex items-center justify-between border-b-[3px] border-black bg-[#ffd400] px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-black uppercase tracking-[0.18em]">
              Keyboard &amp; Gesture Reference
            </span>
            <span className="border-[2px] border-black bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none">
              CARVINGEN v0
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="flex h-7 w-7 items-center justify-center border-[2px] border-black bg-white text-[15px] font-black leading-none shadow-[2px_2px_0_0_#0a0a0a] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {SECTIONS.map((section) => (
              <SectionCard key={section.heading} section={section} />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

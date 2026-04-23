"use client";

type PaletteItem = {
  type: "image" | "prompt" | "vision" | "mesh";
  label: string;
  accent: string;          // tailwind bg-[color] class for the accent strip
  hoverTint: string;       // tailwind bg-[color] class for the tile hover wash
  Icon: () => React.ReactElement;
};

const Icons = {
  image: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="square" strokeLinejoin="miter" aria-hidden>
      <rect x="3" y="5" width="18" height="14" />
      <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
      <path d="M3 17l5-5 3 3 4-5 6 7" />
    </svg>
  ),
  prompt: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="square" strokeLinejoin="miter" aria-hidden>
      <rect x="3" y="4" width="18" height="13" />
      <path d="M8 17l-2 3v-3" />
      <path d="M7 8.5h10" />
      <path d="M7 12.5h7" />
    </svg>
  ),
  vision: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="square" strokeLinejoin="miter" aria-hidden>
      <path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  // Mesh = generate & view a 3D model (merged from the old Mesh+Viewer pair).
  // Composite sigil: iso cube outline with an eye peering out of it.
  mesh: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="square" strokeLinejoin="miter" aria-hidden>
      <path d="M12 2.5 L21.5 7.75 L21.5 16.25 L12 21.5 L2.5 16.25 L2.5 7.75 Z" />
      <path d="M4 12 c2 -2.5 5 -3.6 8 -3.6 s6 1.1 8 3.6 c-2 2.5 -5 3.6 -8 3.6 s-6 -1.1 -8 -3.6z" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    </svg>
  ),
} as const;

const paletteItems: PaletteItem[] = [
  { type: "image", label: "Image", accent: "bg-[#ff6fa8]", hoverTint: "hover:bg-[#ffe7f0]", Icon: Icons.image },
  { type: "prompt", label: "Prompt", accent: "bg-[#ffd400]", hoverTint: "hover:bg-[#fff7bf]", Icon: Icons.prompt },
  { type: "vision", label: "Vision", accent: "bg-[#ff8a3d]", hoverTint: "hover:bg-[#ffe8d5]", Icon: Icons.vision },
  { type: "mesh", label: "Mesh", accent: "bg-[#3e8cff]", hoverTint: "hover:bg-[#dce9ff]", Icon: Icons.mesh },
];

export function SidebarPalette() {
  return (
    <aside className="flex w-28 shrink-0 flex-col items-stretch gap-3 border-r-[3px] border-black bg-[#efe8cd] px-3 py-4">
      <div className="pb-0.5 text-center text-[9px] font-black uppercase tracking-[0.22em] text-black/55">
        Drag onto canvas
      </div>

      <div className="flex flex-col gap-2">
        {paletteItems.map((item) => (
          <PaletteTile key={item.type} item={item} />
        ))}
      </div>
    </aside>
  );
}

function PaletteTile({ item }: { item: PaletteItem }) {
  const { type, label, accent, hoverTint, Icon } = item;
  return (
    <button
      data-testid={`palette-${type}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(
          "application/carvingen-node",
          JSON.stringify({ nodeType: type }),
        );
        event.dataTransfer.effectAllowed = "move";
      }}
      type="button"
      title={`Drag onto canvas to add a ${label} node`}
      className={`group relative flex h-[84px] flex-col items-stretch overflow-hidden border-[3px] border-black bg-white shadow-[4px_4px_0_0_#0a0a0a] transition will-change-transform hover:-translate-y-[1px] hover:shadow-[5px_5px_0_0_#0a0a0a] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_#0a0a0a] ${hoverTint}`}
    >
      <span
        className={`absolute left-0 top-0 h-full w-[6px] border-r-[3px] border-black ${accent}`}
        aria-hidden
      />
      <span className="flex flex-1 items-center justify-center pl-[9px]">
        <span className="block h-7 w-7 text-black">
          <Icon />
        </span>
      </span>
      <span className="border-t-[3px] border-black bg-[#f9f5e8] py-1 pl-[9px] text-center text-[10px] font-black uppercase leading-none tracking-[0.16em]">
        {label}
      </span>
    </button>
  );
}

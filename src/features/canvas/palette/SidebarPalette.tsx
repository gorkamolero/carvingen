"use client";

const paletteItems = [
  { type: "image", label: "Image", accent: "bg-[#ff6fa8]" },
  { type: "prompt", label: "Prompt", accent: "bg-[#ffd400]" },
  { type: "vision", label: "Vision", accent: "bg-[#ff8a3d]" },
  { type: "mesh", label: "Mesh", accent: "bg-[#3e8cff]" },
  { type: "viewer", label: "Viewer", accent: "bg-[#8cff3e]" },
] as const;

export function SidebarPalette() {
  return (
    <aside className="flex w-24 shrink-0 flex-col items-stretch gap-3 border-r-[3px] border-black bg-[#efe8cd] px-3 py-4">
      <div className="pb-1 text-center text-[9px] font-black uppercase tracking-[0.22em] text-black/60">
        Drop onto canvas
      </div>
      {paletteItems.map((item, index) => (
        <button
          key={item.type}
          data-testid={`palette-${item.type}`}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(
              "application/carvingen-node",
              JSON.stringify({ nodeType: item.type }),
            );
            event.dataTransfer.effectAllowed = "move";
          }}
          className={`group flex h-14 flex-col items-stretch overflow-hidden border-[3px] border-black bg-white shadow-[4px_4px_0_0_#0a0a0a] transition will-change-transform hover:-translate-y-[1px] hover:shadow-[5px_5px_0_0_#0a0a0a] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_#0a0a0a] ${
            index === 1 ? "mb-2" : ""
          }`}
          type="button"
          title={`Drag to add ${item.label} node`}
        >
          <span className={`h-2 w-full border-b-[3px] border-black ${item.accent}`} />
          <span className="flex flex-1 items-center justify-center text-[11px] font-black uppercase tracking-[0.16em]">
            {item.label}
          </span>
        </button>
      ))}
    </aside>
  );
}

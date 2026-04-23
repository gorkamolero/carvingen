"use client";

const paletteItems = [
  { type: "image", label: "Im" },
  { type: "prompt", label: "Pr" },
  { type: "vision", label: "Vs" },
  { type: "mesh", label: "Me" },
  { type: "viewer", label: "Vw" },
] as const;

export function SidebarPalette() {
  return (
    <aside className="flex w-20 shrink-0 flex-col items-center gap-2 border-r-[3px] border-black bg-[#fff6d8] p-3">
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
          className={`h-16 w-14 border-[3px] border-black bg-white text-sm font-black uppercase shadow-[4px_4px_0_#000] ${index === 1 ? "mb-4" : ""}`}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </aside>
  );
}

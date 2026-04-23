import clsx from "clsx";

export function NodeChrome({
  title,
  accentClassName,
  children,
  className,
  testId,
  nodeId,
  collapsed,
  onToggleCollapsed,
}: {
  title: string;
  accentClassName: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
  nodeId?: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const isCollapsed = Boolean(collapsed);

  return (
    <div
      data-testid={testId}
      data-node-id={nodeId}
      data-collapsed={isCollapsed || undefined}
      className={clsx(
        "border-[3px] border-black bg-white shadow-[6px_6px_0_0_#0a0a0a] transition-[width] duration-150",
        isCollapsed ? "w-[192px]" : "w-[320px]",
        className,
      )}
    >
      <div
        className={clsx(
          "flex items-center justify-between border-b-[3px] border-black py-1.5 pl-3.5 pr-1 leading-none",
          accentClassName,
        )}
      >
        <span className="text-[11px] font-black uppercase tracking-[0.18em]">{title}</span>
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={isCollapsed ? "Expand node" : "Minimize node"}
            title={isCollapsed ? "Expand node" : "Minimize node"}
            data-testid="node-collapse-toggle"
            className="nodrag ml-2 flex h-6 w-6 shrink-0 items-center justify-center border-[2px] border-black bg-white text-[13px] font-black leading-none hover:bg-white/80 active:translate-x-[1px] active:translate-y-[1px]"
          >
            {isCollapsed ? "+" : "−"}
          </button>
        ) : null}
      </div>
      <div className={isCollapsed ? "p-2" : "space-y-3 p-3.5"}>{children}</div>
    </div>
  );
}

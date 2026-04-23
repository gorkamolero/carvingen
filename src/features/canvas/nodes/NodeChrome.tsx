import clsx from "clsx";

export function NodeChrome({
  title,
  accentClassName,
  children,
  className,
  testId,
  nodeId,
}: {
  title: string;
  accentClassName: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
  nodeId?: string;
}) {
  return (
    <div
      data-testid={testId}
      data-node-id={nodeId}
      className={clsx(
        "w-[320px] border-[3px] border-black bg-white shadow-[6px_6px_0_0_#0a0a0a]",
        className,
      )}
    >
      <div
        className={clsx(
          "border-b-[3px] border-black px-3.5 py-2 text-[11px] font-black uppercase leading-none tracking-[0.18em]",
          accentClassName,
        )}
      >
        {title}
      </div>
      <div className="space-y-3 p-3.5">{children}</div>
    </div>
  );
}

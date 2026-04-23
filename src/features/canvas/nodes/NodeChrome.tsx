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
        "w-[320px] border-[3px] border-black bg-[#fffdf5] shadow-[4px_4px_0_#000]",
        className,
      )}
    >
      <div className={clsx("border-b-[3px] border-black px-3 py-2 text-sm font-black uppercase", accentClassName)}>
        {title}
      </div>
      <div className="space-y-3 p-3">{children}</div>
    </div>
  );
}

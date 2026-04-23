"use client";

type ProjectListItem = {
  id: string;
  name: string;
  updatedAt: string;
};

export function ProjectSwitcher({
  projects,
  activeProjectId,
  onSelect,
  onCreate,
  onRename,
  onOpenHelp,
}: {
  projects: ProjectListItem[];
  activeProjectId: string | null;
  onSelect: (projectId: string) => void;
  onCreate: () => void;
  onRename: () => void;
  onOpenHelp: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b-[3px] border-black bg-[#efe8cd] px-5 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[20px] font-black uppercase tracking-[-0.01em] leading-none">
          Carvingen
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-black/55">
          v0
        </span>
      </div>

      <span className="mx-2 h-6 w-[3px] bg-black/25" aria-hidden />

      <label className="flex items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-black/55">
          Project
        </span>
        <select
          data-testid="project-switcher"
          value={activeProjectId ?? ""}
          onChange={(event) => onSelect(event.target.value)}
          className="h-9 min-w-[220px] border-[3px] border-black bg-white px-3 text-[13px] font-bold leading-none shadow-[3px_3px_0_0_#0a0a0a]"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-2">
        <button
          data-testid="rename-project-button"
          type="button"
          onClick={onRename}
          className="h-9 border-[3px] border-black bg-white px-3 text-[11px] font-black uppercase tracking-[0.14em] shadow-[3px_3px_0_0_#0a0a0a] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_#0a0a0a]"
        >
          Rename
        </button>
        <button
          data-testid="new-project-button"
          type="button"
          onClick={onCreate}
          className="h-9 border-[3px] border-black bg-[#ffd400] px-3 text-[11px] font-black uppercase tracking-[0.14em] shadow-[3px_3px_0_0_#0a0a0a] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_#0a0a0a]"
        >
          + New
        </button>
        <button
          data-testid="help-button"
          type="button"
          onClick={onOpenHelp}
          aria-label="Open keyboard and gesture reference"
          className="h-9 border-[3px] border-black bg-white px-3 text-[11px] font-black uppercase tracking-[0.14em] shadow-[3px_3px_0_0_#0a0a0a] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_#0a0a0a]"
        >
          ? Help
        </button>
      </div>
    </div>
  );
}

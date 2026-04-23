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
}: {
  projects: ProjectListItem[];
  activeProjectId: string | null;
  onSelect: (projectId: string) => void;
  onCreate: () => void;
  onRename: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b-[3px] border-black bg-[#fff6d8] px-4 py-3">
      <select
        data-testid="project-switcher"
        value={activeProjectId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
        className="border-[3px] border-black bg-white px-3 py-2 font-black"
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <button
        data-testid="new-project-button"
        type="button"
        onClick={onCreate}
        className="border-[3px] border-black bg-white px-3 py-2 text-sm font-black uppercase shadow-[4px_4px_0_#000]"
      >
        New project
      </button>
      <button
        data-testid="rename-project-button"
        type="button"
        onClick={onRename}
        className="border-[3px] border-black bg-white px-3 py-2 text-sm font-black uppercase shadow-[4px_4px_0_#000]"
      >
        Rename
      </button>
    </div>
  );
}

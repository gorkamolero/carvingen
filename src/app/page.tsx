"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { resolveHomeProject } from "@/lib/projects/routing";

export default function Home() {
  const router = useRouter();
  const project = useQuery({ queryKey: ["home-project"], queryFn: resolveHomeProject,
    retry: false, staleTime: 0, gcTime: 0 });
  useEffect(() => {
    if (project.data && !project.isFetching) router.replace(project.data);
  }, [project.data, project.isFetching, router]);
  return <main className="p-8">{project.isError ? <>
    <p>Unable to open a project: {project.error.message}</p>
    <button onClick={() => void project.refetch()}>Try again</button>
  </> : <p>Opening project…</p>}</main>;
}

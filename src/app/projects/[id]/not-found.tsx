import Link from "next/link";

export default function ProjectNotFound() {
  return <main className="p-8"><h1>Project not found</h1>
    <p>This project does not exist.</p><Link href="/">Back to projects</Link></main>;
}

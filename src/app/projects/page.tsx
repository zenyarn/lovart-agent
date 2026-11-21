import { CreditBalance } from "@/components/credit-balance";
import Link from "next/link";
import { pageOwner } from "@/lib/auth";
import { listProjects } from "@/lib/projects";
import { ProjectGrid, Logout } from "@/components/project-grid";
export default async function Projects() {
  const user = await pageOwner("/projects");
  const data = await listProjects(user.id, 0, 20);
  return (
    <main className="projects-page">
      <header className="projects-header">
        <h1>项目</h1>
        <nav>
          <Link href="/protected">返回首页</Link>
          <CreditBalance />
        <Logout />
        </nav>
      </header>
      <ProjectGrid initial={data.projects} hasMore={data.hasMore} />
    </main>
  );
}

import { pageOwner } from "@/lib/auth";
import { listProjects } from "@/lib/projects";
import { ProjectGrid, Logout } from "@/components/project-grid";
import { HomeComposer } from "@/components/home-composer";
export default async function Protected() {
  const user = await pageOwner("/protected");
  const data = await listProjects(user.id, 0, 4);
  return (
    <main className="home-page">
      <header className="home-header">
        <span className="user-avatar">
          {user.email?.slice(0, 1).toUpperCase()}
        </span>
        <Logout />
      </header>
      <section className="home-hero">
        <h1>
          <span className="brand-mark">L°</span>Lovart 让设计更简单
        </h1>
        <p>懂你的设计代理，帮你搞定一切</p>
        <HomeComposer ownerId={user.id} />
      </section>
      <ProjectGrid initial={data.projects} home />
    </main>
  );
}

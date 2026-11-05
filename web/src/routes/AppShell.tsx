import { Link, Outlet } from "react-router";

export function AppShell() {
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">covis</Link>
        <span className="faint">the repository is the source of truth; the canvas mirrors one commit</span>
      </header>
      <div className="frame">
        <Outlet />
      </div>
    </>
  );
}

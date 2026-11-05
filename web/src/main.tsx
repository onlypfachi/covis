import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Provider } from "urql";
import { client } from "./lib/client";
import { AppShell } from "./routes/AppShell";
import { ChangeSetPage } from "./routes/ChangeSetPage";
import { RepoList } from "./routes/RepoList";
import { Workspace } from "./routes/Workspace";
import "@xyflow/react/dist/style.css";
import "react-diff-view/style/index.css";
import "./styles.css";

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <RepoList /> },
      { path: "/repos/:repoId", element: <Workspace /> },
      { path: "/repos/:repoId/changesets/:csId", element: <ChangeSetPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider value={client}>
      <RouterProvider router={router} />
    </Provider>
  </StrictMode>,
);

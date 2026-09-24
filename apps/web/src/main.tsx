import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { Button } from "@heroui/react";
import {
  Activity,
  Boxes,
  Cable,
  Check,
  GitBranch as Github,
  LogOut,
  Moon,
  Radio,
  Send,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";
import { api, ApiError, useConfig } from "./data";
import { ErrorNotice, External, Loading, Logo } from "./ui";
import { ProjectsPage } from "./projects";
import { ProjectPage } from "./project-detail";
import { ConnectionsPage } from "./connections";
import { DestinationsPage } from "./destinations";
import { ActivityPage, SettingsPage, VerifyPage } from "./other-pages";
import "./styles.css";
import "./responsive.css";
import "./project.css";
const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) =>
        !(error instanceof ApiError && error.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});
function ThemeToggle() {
  const [dark, setDark] = useState(
    () =>
      localStorage.getItem("theme") === "dark" ||
      (!localStorage.getItem("theme") &&
        matchMedia("(prefers-color-scheme: dark)").matches),
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  return (
    <Button
      size="sm"
      variant="ghost"
      isIconOnly
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      onPress={() => setDark(!dark)}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </Button>
  );
}
function Login() {
  const config = useConfig();
  const [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  async function login() {
    setPending(true);
    try {
      const result = await api<{ url: string }>("/session/login", "POST", {});
      location.assign(result.url);
    } catch (error) {
      setError(error);
      setPending(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="mb-16">
          <Logo />
        </div>
        <p className="eyebrow !text-[#bdcbb5]">
          A LITTLE SIGNAL. A LOT OF CLARITY.
        </p>
        <h1>
          Your products.
          <br />
          In the loop.
        </h1>
        <p className="mt-6 text-[#c5d4bc] text-base leading-7 max-w-md">
          Know when someone joins. See how your apps are growing. Get the
          updates that matter, wherever you are.
        </p>
        <div className="login-example">
          <p className="eyebrow !text-[#c1d1b8]">BUILT FOR YOUR EVERYDAY</p>
          <div className="flex gap-3 items-start">
            <Radio size={21} className="mt-1 text-[#d0edb4]" />
            <div>
              <p className="font-medium">One place for all your products.</p>
              <p className="text-xs leading-6 text-[#c4d2bc] mt-1">
                Supabase account alerts. App Store download reports.
                <br />
                Delivered to Telegram or your inbox.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-12 flex items-center gap-2 text-xs text-[#bdcbb5]">
          <Check size={14} />
          Open source. Yours to host.
        </div>
      </section>
      <section className="login-form">
        <div className="login-inner">
          <div className="mb-12">
            <Logo />
          </div>
          <h1 className="!text-[30px]">A clearer picture.</h1>
          <p className="muted mt-3 mb-8">
            Connect your first product in a few steps.
            <br />
            We’ll take care of keeping you in the loop.
          </p>
          <Button
            fullWidth
            size="lg"
            onPress={() => void login()}
            isPending={pending}
            isDisabled={config.data ? !config.data.loginEnabled : true}
          >
            <Github size={18} />
            Continue with GitHub
          </Button>
          {config.data && !config.data.loginEnabled && (
            <p className="muted text-xs mt-4">
              This installation is being set up. GitHub sign-in will be
              available once configured.
            </p>
          )}
          <div className="mt-4">
            <ErrorNotice error={error ?? config.error} />
          </div>
          <div className="mt-8 flex items-center justify-between">
            <External
              href={
                config.data?.sourceUrl ??
                "https://github.com/arminayat/signs-of-life"
              }
            >
              View source
            </External>
            <ThemeToggle />
          </div>
        </div>
      </section>
    </div>
  );
}
const nav = [
  { path: "/", label: "Projects", icon: Boxes },
  { path: "/connections", label: "Connections", icon: Cable },
  { path: "/destinations", label: "Destinations", icon: Send },
  { path: "/activity", label: "Activity", icon: Activity },
  { path: "/settings", label: "Settings", icon: SettingsIcon },
];
function App() {
  const pathname = useLocation().pathname;
  const inProject = pathname.startsWith("/projects/");
  const config = useConfig();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api<{ name: string }>("/session"),
    retry: false,
    enabled: pathname !== "/verify",
  });
  if (pathname === "/verify") return <VerifyPage />;
  if (session.isPending) return <Loading />;
  if (session.error instanceof ApiError && session.error.status === 401)
    return <Login />;
  if (session.error || !session.data)
    return (
      <div className="p-10">
        <ErrorNotice error={session.error} />
        <Button onPress={() => void session.refetch()} className="mt-4">
          Try again
        </Button>
      </div>
    );
  const name = session.data.name;
  async function logout() {
    await api("/session/logout", "POST", {});
    client.clear();
    location.assign("/");
  }
  return (
    <div className={`shell ${inProject ? "project-shell" : ""}`}>
      <a href="#content" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link to="/" aria-label="Signs of Life home">
          <Logo compact={inProject} />
        </Link>
        <p className="workspace-label">YOUR WORKSPACE</p>
        <nav aria-label="Main navigation">
          {nav.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              aria-label={label}
              title={inProject ? label : undefined}
              className={({ isActive }) =>
                `nav-link ${isActive || (inProject && path === "/") ? "active" : ""}`
              }
            >
              <Icon size={17} />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <External href={config.data?.sourceUrl ?? "#"}>
            <Github size={15} />
            <span className="nav-label">Open-source project</span>
          </External>
          <div className="user-row">
            <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
            <div className="user-details flex-1 min-w-0">
              <p className="truncate font-medium">{name}</p>
              <p className="muted text-[10px]">Personal workspace</p>
            </div>
            <Button
              variant="ghost"
              isIconOnly
              size="sm"
              aria-label="Sign out"
              onPress={() => void logout()}
            >
              <LogOut size={14} />
            </Button>
          </div>
        </div>
      </aside>
      <main id="content" className="main-content">
        <div className="topbar">
          <span>
            Workspace <span className="mx-2 opacity-40">/</span>{" "}
            {nav.find(
              (item) => item.path !== "/" && pathname.startsWith(item.path),
            )?.label ?? "Projects"}
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#81a267]" />
              Your product pulse
            </span>
            <ThemeToggle />
          </div>
        </div>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:id/*" element={<ProjectPage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/destinations" element={<DestinationsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/settings" element={<SettingsPage logout={logout} />} />
          <Route
            path="*"
            element={
              <div>
                <h1>Page not found</h1>
                <Link className="text-link mt-4" to="/">
                  Back to projects
                </Link>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

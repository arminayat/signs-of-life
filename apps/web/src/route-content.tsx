import { Component, Suspense, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Loading } from "./ui";

type Props = { children: ReactNode; pathname: string };
class RouteErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.pathname !== this.props.pathname)
      this.setState({ failed: false });
  }
  render() {
    if (this.state.failed)
      return (
        <div role="alert">
          <p>This page could not load. Reload to try again.</p>
          <button
            type="button"
            className="text-link"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    return this.props.children;
  }
}

export function RouteContent({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundary pathname={pathname}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

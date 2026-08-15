import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; name?: string };
type State = { error: string | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: Error): State {
    return { error: err?.message || String(err) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(this.props.name || "UI", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full p-6 bg-mc-bg text-white overflow-auto">
          <h2 className="text-xl font-bold text-red-400 mb-2">Ошибка вкладки{this.props.name ? `: ${this.props.name}` : ""}</h2>
          <pre className="text-sm text-mc-muted whitespace-pre-wrap mb-4">{this.state.error}</pre>
          <button
            className="h-9 px-4 bg-mc-green rounded-sm"
            onClick={() => this.setState({ error: null })}
          >
            Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

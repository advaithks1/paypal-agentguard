import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './States';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo): void { console.error('UI error:', error, info.componentStack); }
  render(): ReactNode {
    if (this.state.error) {
      return <ErrorState title="This screen crashed" message={this.state.error.message} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

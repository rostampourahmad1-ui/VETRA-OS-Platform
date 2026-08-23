import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
}

interface ErrorBoundaryState {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary] Caught an error:", error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ error: null, errorInfo: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;

    if (typeof fallback === "function") {
      return fallback(error, this.handleReset);
    }

    if (fallback !== undefined) {
      return fallback;
    }

    return (
      <div
        className="min-h-[40vh] w-full flex items-center justify-center bg-background p-4"
        dir="rtl"
        lang="fa"
      >
        <Card className="w-full max-w-md bg-card shadow-lg border-border">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-xl font-bold text-foreground">
              خطا در بارگذاری
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-2">
            <p className="text-muted-foreground text-sm">
              مشکلی در نمایش این بخش پیش آمده است. لطفاً دوباره تلاش کنید.
            </p>
            {process.env.NODE_ENV !== "production" && (
              <details className="text-xs text-left mt-4 bg-muted/50 rounded-lg p-3">
                <summary className="cursor-pointer text-muted-foreground font-mono">
                  Error details
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-destructive font-mono text-[11px] leading-relaxed">
                  {error.message}
                  {"\n"}
                  {error.stack}
                </pre>
              </details>
            )}
          </CardContent>
          <CardFooter className="flex justify-center gap-3 pt-2">
            <Button variant="default" onClick={this.handleReset}>
              <RefreshCw className="ml-2 h-4 w-4" />
              تلاش مجدد
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
}

export function withErrorBoundary<P extends object>(
  Component_: React.ComponentType<P>,
  fallback?: ErrorBoundaryProps["fallback"],
): React.FC<P> {
  const displayName = Component_.displayName || Component_.name || "Component";
  const Wrapped: React.FC<P> = (props) => (
    <ErrorBoundary fallback={fallback}>
      <Component_ {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = "withErrorBoundary(" + displayName + ")";
  return Wrapped;
}

export default ErrorBoundary;
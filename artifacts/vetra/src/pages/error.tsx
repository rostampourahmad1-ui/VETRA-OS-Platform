import { t } from '@/lib/i18n';
import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

interface ErrorPageProps {
  error?: Error;
  onRetry?: () => void;
  title?: string;
  description?: string;
}

/**
 * ErrorPage — Full-page error fallback for critical application errors.
 *
 * Renders a centered error card with a retry button and a link back to the
 * dashboard.  Intended to be used as the top-level error boundary fallback
 * or as a standalone route.
 */
export function ErrorPage({
  error,
  onRetry,
  title = t("error.boundaryTitle"),
  description = t('error.boundaryDesc'),
}: ErrorPageProps) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4" dir="rtl" lang="fa">
      <Card className="w-full max-w-lg bg-card shadow-lg border-border">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">{description}</p>
          {error && process.env.NODE_ENV !== "production" && (
            <details className="text-xs text-left bg-muted/50 rounded-lg p-3">
              <summary className="cursor-pointer text-muted-foreground font-mono">
                {t('error.details')}
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
          {onRetry && (
            <Button variant="default" onClick={onRetry}>
              <RefreshCw className="ml-2 h-4 w-4" />
              {t('error.retry')}
            </Button>
          )}
          <Link href="/">
            <Button variant="outline">
              <Home className="ml-2 h-4 w-4" />
              {t('dashboard.title')}
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export default ErrorPage;

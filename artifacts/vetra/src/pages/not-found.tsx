import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md bg-card shadow-lg border-border">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">404</h1>
          <p className="text-muted-foreground text-sm font-mono uppercase tracking-wider">
            Page Not Found
          </p>
          <div className="pt-4 border-t border-border mt-6">
            <Link href="/" className="text-sm font-medium text-primary hover:underline underline-offset-4">
              Return to Dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
import React from 'react';
import { Building2 } from 'lucide-react';

export default function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed border-border bg-card">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-medium">Module in Development</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              The {title} module is currently being provisioned for your workspace.
              Contact your administrator for timeline details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
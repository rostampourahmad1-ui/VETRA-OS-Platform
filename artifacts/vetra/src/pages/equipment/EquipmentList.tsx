import React from 'react';
import { useListEquipment } from '@workspace/api-client-react';
import { Plus, Search, Wrench, Settings, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'wouter';

export default function EquipmentList() {
  const { data: equipment, isLoading } = useListEquipment();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'in-use': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'maintenance': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'retired': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipment</h1>
          <p className="text-muted-foreground">Track machinery, tools, and fleet allocation.</p>
        </div>
        <Button className="shrink-0 gap-2">
          <Plus className="h-4 w-4" /> Register Equipment
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search equipment by name or serial..." className="pl-9 font-sans" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading ? (
          <div className="col-span-full py-20 text-center font-mono text-muted-foreground">LOADING EQUIPMENT...</div>
        ) : (
          equipment?.map((item) => (
            <Card key={item.id} className="group hover:border-primary/50 transition-colors">
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2.5 bg-muted rounded-lg">
                    <Wrench className="h-5 w-5 text-foreground" />
                  </div>
                  <Badge variant="outline" className={`uppercase font-mono text-[10px] ${getStatusColor(item.status)}`}>
                    {item.status}
                  </Badge>
                </div>
                
                <div className="mb-4">
                  <h3 className="font-semibold text-lg leading-tight">{item.name}</h3>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <span className="bg-muted px-1.5 py-0.5 rounded font-mono">{item.type}</span>
                    {item.model && <span>{item.model}</span>}
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-border text-sm">
                  {item.projectName ? (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">Allocated to</span>
                      <Link href={`/projects/${item.projectId}`} className="text-xs font-medium text-primary hover:underline">
                        {item.projectName}
                      </Link>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{item.location || 'Warehouse'}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Settings className="h-3.5 w-3.5" />
                      <span>Next Maint.</span>
                    </div>
                    <span className="font-mono">
                      {item.nextMaintenance ? new Date(item.nextMaintenance).toLocaleDateString() : '-'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
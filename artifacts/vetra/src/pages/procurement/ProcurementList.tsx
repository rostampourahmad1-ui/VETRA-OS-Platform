import React, { useState } from 'react';
import { useListProcurementOrders } from '@workspace/api-client-react';
import { Plus, Search, Truck, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'wouter';
import { formatCurrency } from '@/lib/jalali';

export default function ProcurementList() {
  const [search, setSearch] = useState('');
  const { data: orders, isLoading } = useListProcurementOrders();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-muted text-muted-foreground border-border';
      case 'pending': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'approved': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'ordered': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'delivered': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'cancelled': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Procurement</h1>
          <p className="text-muted-foreground">Manage purchase orders and supplier deliveries.</p>
        </div>
        <Button className="shrink-0 gap-2">
          <Plus className="h-4 w-4" /> Create PO
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search orders..." 
            className="pl-9 font-sans"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full py-20 text-center font-mono text-muted-foreground">LOADING ORDERS...</div>
        ) : (
          orders?.map((order) => (
            <Card key={order.id} className="group hover:border-primary/50 transition-colors">
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                      <Truck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-mono text-muted-foreground mb-1">PO-{order.id.toString().padStart(4, '0')}</div>
                      <h3 className="font-semibold leading-tight">{order.title}</h3>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Supplier</span>
                    <span className="font-medium">{order.supplier}</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Project</span>
                    <Link href={`/projects/${order.projectId}`} className="text-primary hover:underline font-medium text-xs">
                      {order.projectName}
                    </Link>
                  </div>

                  <div className="flex justify-between items-center text-sm pt-2 border-t">
                    <span className="text-muted-foreground">Total Value</span>
                    <span className="font-mono font-bold">{formatCurrency(order.totalAmount)}</span>
                  </div>

                  <div className="pt-2 flex justify-between items-center">
                    <Badge variant="outline" className={`uppercase font-mono text-[10px] ${getStatusColor(order.status)}`}>
                      {order.status}
                    </Badge>
                    
                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                      View <ArrowRight className="h-3 w-3" />
                    </Button>
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

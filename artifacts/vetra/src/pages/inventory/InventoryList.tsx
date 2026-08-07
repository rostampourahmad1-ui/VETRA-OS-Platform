import React, { useState } from 'react';
import { useListInventory } from '@workspace/api-client-react';
import { Plus, Search, Package, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';

export default function InventoryList() {
  const [search, setSearch] = useState('');
  const { data: inventory, isLoading } = useListInventory();

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground">Material stock levels and warehouse management.</p>
        </div>
        <Button className="shrink-0 gap-2">
          <Plus className="h-4 w-4" /> Add Item
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search materials..." 
            className="pl-9 font-sans"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 text-center font-mono text-muted-foreground">LOADING INVENTORY...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                  <th className="py-3 px-4 font-medium w-10"></th>
                  <th className="py-3 px-4 font-medium">Item Name</th>
                  <th className="py-3 px-4 font-medium">Category</th>
                  <th className="py-3 px-4 font-medium text-right">Stock Level</th>
                  <th className="py-3 px-4 font-medium text-right">Unit Cost</th>
                  <th className="py-3 px-4 font-medium">Project Allocation</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inventory?.map((item) => {
                  const isLow = typeof item.minStock === 'number' && item.quantity <= item.minStock;
                  return (
                    <tr key={item.id} className={`group hover:bg-muted/50 transition-colors ${isLow ? 'bg-amber-500/5' : ''}`}>
                      <td className="py-3 px-4">
                        {isLow ? <AlertCircle className="h-4 w-4 text-amber-500" /> : <Package className="h-4 w-4 text-muted-foreground" />}
                      </td>
                      <td className="py-3 px-4 font-medium text-foreground">
                        {item.name}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="font-mono text-[10px] bg-background">
                          {item.category}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`font-mono font-bold ${isLow ? 'text-amber-600' : ''}`}>
                            {item.quantity} <span className="font-sans font-normal text-xs text-muted-foreground">{item.unit}</span>
                          </span>
                          {isLow && <span className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Low Stock</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                        {item.unitCost ? formatCurrency(item.unitCost) : '-'}
                      </td>
                      <td className="py-3 px-4">
                        {item.projectId ? (
                          <Link href={`/projects/${item.projectId}`} className="text-primary hover:underline text-xs">
                            {item.projectName}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unallocated</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
import React, { useState } from 'react';
import { useListContracts } from '@workspace/api-client-react';
import { Plus, Search, Filter, Briefcase, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatJalali } from '@/lib/jalali';

export default function ContractList() {
  const [search, setSearch] = useState('');
  const { data: contracts, isLoading } = useListContracts();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-muted text-muted-foreground border-border';
      case 'active': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'completed': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'terminated': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contracts</h1>
          <p className="text-muted-foreground">Vendor agreements, client contracts, and legal documents.</p>
        </div>
        <Button className="shrink-0 gap-2">
          <Plus className="h-4 w-4" /> New Contract
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search contracts..." 
            className="pl-9 font-sans"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" /> Filter Status
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full py-20 text-center font-mono text-muted-foreground">LOADING CONTRACTS...</div>
        ) : (
          contracts?.map((contract) => (
            <Card key={contract.id} className="group hover:border-primary/50 transition-colors">
              <CardContent className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                      <FileSignature className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{contract.name}</h3>
                      <p className="text-xs text-muted-foreground">{contract.contractor}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`uppercase font-mono text-[10px] ${getStatusColor(contract.status)}`}>
                    {contract.status}
                  </Badge>
                </div>

                <div className="pt-4 border-t border-border flex justify-between items-end">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Project</span>
                    <Link href={`/projects/${contract.projectId}`} className="text-sm font-medium hover:underline hover:text-primary transition-colors">
                      {contract.projectName}
                    </Link>
                  </div>
                  <div className="flex flex-col gap-1 text-right">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Value</span>
                    <span className="font-mono font-bold text-base">{formatCurrency(contract.value)}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                  <div className="flex items-center gap-1.5 font-mono">
                    {formatJalali(contract.startDate)}
                  </div>
                  <span>→</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    {formatJalali(contract.endDate)}
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

import { useEffect, useState } from 'react';
import { Search, UserRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { get } from '@/lib/phase2-api';

export default function CRM() {
  const [search, setSearch] = useState(''); const [clients, setClients] = useState<any[]>([]);
  useEffect(() => { get<any[]>('/crm/clients', { search }).then(setClients).catch(() => setClients([])); }, [search]);
  return <div className="space-y-6"><div><p className="text-xs font-mono tracking-widest text-primary">RELATIONSHIP MANAGEMENT</p><h1 className="text-3xl font-bold mt-2">CRM</h1><p className="text-muted-foreground mt-2">Keep client, consultant and partner relationships in one place.</p></div><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts and companies..." className="pl-9" /></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{clients.map((client) => <Card key={client.id}><CardHeader><div className="flex justify-between"><div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"><UserRound className="h-5 w-5 text-primary" /></div><Badge variant="outline">{client.status}</Badge></div><CardTitle className="mt-3">{client.name}</CardTitle></CardHeader><CardContent><p className="text-sm font-medium">{client.company ?? 'Independent contact'}</p><p className="text-sm text-muted-foreground mt-1">{client.email ?? 'No email'} · {client.phone ?? 'No phone'}</p></CardContent></Card>)}</div></div>;
}

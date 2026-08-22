import React from 'react';
import { useListMeetings } from '@workspace/api-client-react';
import { Plus, Calendar, Clock, MapPin, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'wouter';
import { formatJalali } from '@/lib/jalali';

export default function MeetingList() {
  const { data: meetings, isLoading } = useListMeetings();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'in-progress': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'completed': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'cancelled': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meetings</h1>
          <p className="text-muted-foreground">Schedule and review project meetings.</p>
        </div>
        <Button className="shrink-0 gap-2">
          <Plus className="h-4 w-4" /> Schedule Meeting
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full py-20 text-center font-mono text-muted-foreground">LOADING MEETINGS...</div>
        ) : (
          meetings?.map((meeting) => (
            <Card key={meeting.id} className="group hover:border-primary/50 transition-colors">
              <CardContent className="p-5 space-y-4">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className={`uppercase font-mono text-[10px] ${getStatusColor(meeting.status)}`}>
                    {meeting.status}
                  </Badge>
                  <div className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(meeting.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold text-lg">{meeting.title}</h3>
                  <Link href={`/projects/${meeting.projectId}`} className="text-sm text-primary hover:underline block mt-1">
                    {meeting.projectName}
                  </Link>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground pt-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="font-mono text-xs">{formatJalali(meeting.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{meeting.location}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>{meeting.organizer} + {meeting.attendees?.split(',').length || 0} attendees</span>
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
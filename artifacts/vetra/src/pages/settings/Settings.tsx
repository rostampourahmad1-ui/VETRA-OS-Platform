import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { get, patch } from '@/lib/phase2-api';

interface NotificationPref {
  type: string;
  optIn: boolean;
}

export default function Settings() {
  const [profile, setProfile] = useState<any>({});
  const [organization, setOrganization] = useState<any>({});
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPref[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      get('/settings/profile'),
      get('/settings/organization'),
      get('/notifications/preferences'),
    ])
      .then(([p, o, prefs]) => {
        setProfile(p);
        setOrganization(o);
        setNotificationPrefs((prefs as NotificationPref[]) ?? []);
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    await patch('/settings/profile', profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const saveNotificationPrefs = async () => {
    await fetch('/api/notifications/preferences', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: notificationPrefs }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const toggleNotificationPref = (type: string) => {
    setNotificationPrefs((prev) => {
      const existing = prev.find((p) => p.type === type);
      if (existing) {
        return prev.map((p) => (p.type === type ? { ...p, optIn: !p.optIn } : p));
      }
      return [...prev, { type, optIn: false }];
    });
  };

  const notificationTypes = [
    { key: 'task_assigned', label: 'وظایف محول شده' },
    { key: 'workflow_approved', label: 'تأیید گردش کار' },
    { key: 'workflow_rejected', label: 'رد گردش کار' },
    { key: 'document_uploaded', label: 'آپلود اسناد' },
    { key: 'low_stock', label: 'موجودی کم' },
    { key: 'workflow_escalated', label: 'تصعید گردش کار' },
    { key: 'invoice_due', label: 'سررسید فاکتور' },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <p className="text-xs font-mono tracking-widest text-primary">WORKSPACE CONFIGURATION</p>
        <h1 className="text-3xl font-bold mt-2">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your personal profile, organization and display preferences.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={profile.name ?? ''} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={profile.email ?? ''} disabled />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={profile.phone ?? ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Department</Label>
            <Input
              value={profile.department ?? ''}
              onChange={(e) => setProfile({ ...profile, department: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Button onClick={save}>{saved ? 'Saved' : 'Save profile'}</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Organization name</Label>
            <Input value={organization.name ?? ''} disabled />
          </div>
          <div className="space-y-2">
            <Label>Organization code</Label>
            <Input value={organization.code ?? ''} disabled />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {notificationTypes.map((nt) => {
            const pref = notificationPrefs.find((p) => p.type === nt.key);
            const isOptedIn = pref?.optIn ?? true;
            return (
              <div key={nt.key} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{nt.label}</p>
                  <p className="text-sm text-muted-foreground">دریافت اعلان برای این نوع رویداد</p>
                </div>
                <Switch checked={isOptedIn} onCheckedChange={() => toggleNotificationPref(nt.key)} />
              </div>
            );
          })}
          <div className="pt-4">
            <Button onClick={saveNotificationPrefs}>{saved ? 'Saved' : 'Save preferences'}</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Jalali calendar</p>
              <p className="text-sm text-muted-foreground">Display operational dates in the Persian calendar.</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Weekly digest</p>
              <p className="text-sm text-muted-foreground">Receive a summary of project activity.</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

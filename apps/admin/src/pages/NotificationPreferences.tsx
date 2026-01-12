import { useState, useEffect } from 'react';
import { Settings, Bell, Mail, Clock, Save, Loader2 } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { Button, Switch, Label } from '@wordrhyme/ui';

interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
}

interface Preferences {
  enabledChannels: string[];
  quietHours: QuietHours | null;
  emailFrequency: 'instant' | 'hourly' | 'daily';
}

const CHANNELS = [
  { id: 'in-app', name: 'In-App Notifications', description: 'Show notifications in the app', icon: Bell },
  { id: 'email', name: 'Email Notifications', description: 'Receive notifications via email', icon: Mail },
];

const EMAIL_FREQUENCIES = [
  { value: 'instant', label: 'Instant', description: 'Receive emails immediately' },
  { value: 'hourly', label: 'Hourly Digest', description: 'Receive a summary every hour' },
  { value: 'daily', label: 'Daily Digest', description: 'Receive a summary once a day' },
];

export function NotificationPreferencesPage() {
  const { data: preferences, isLoading, refetch } = trpc.notificationPreferences.get.useQuery();

  const updateMutation = trpc.notificationPreferences.update.useMutation({
    onSuccess: () => refetch(),
  });

  const [localPrefs, setLocalPrefs] = useState<Preferences>({
    enabledChannels: ['in-app'],
    quietHours: null,
    emailFrequency: 'instant',
  });

  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (preferences) {
      setLocalPrefs({
        enabledChannels: preferences.enabledChannels as string[],
        quietHours: preferences.quietHours as QuietHours | null,
        emailFrequency: preferences.emailFrequency as 'instant' | 'hourly' | 'daily',
      });
    }
  }, [preferences]);

  const handleChannelToggle = (channelId: string) => {
    // in-app is always enabled
    if (channelId === 'in-app') return;

    setLocalPrefs((prev) => {
      const channels = prev.enabledChannels.includes(channelId)
        ? prev.enabledChannels.filter((c) => c !== channelId)
        : [...prev.enabledChannels, channelId];
      return { ...prev, enabledChannels: channels };
    });
    setHasChanges(true);
  };

  const handleQuietHoursToggle = () => {
    setLocalPrefs((prev) => ({
      ...prev,
      quietHours: prev.quietHours?.enabled
        ? { ...prev.quietHours, enabled: false }
        : {
            enabled: true,
            start: prev.quietHours?.start || '22:00',
            end: prev.quietHours?.end || '08:00',
            timezone: prev.quietHours?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
    }));
    setHasChanges(true);
  };

  const handleQuietHoursChange = (field: 'start' | 'end', value: string) => {
    setLocalPrefs((prev) => ({
      ...prev,
      quietHours: prev.quietHours
        ? { ...prev.quietHours, [field]: value }
        : null,
    }));
    setHasChanges(true);
  };

  const handleEmailFrequencyChange = (value: 'instant' | 'hourly' | 'daily') => {
    setLocalPrefs((prev) => ({ ...prev, emailFrequency: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      enabledChannels: localPrefs.enabledChannels,
      quietHours: localPrefs.quietHours,
      emailFrequency: localPrefs.emailFrequency,
    });
    setHasChanges(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Notification Preferences</h1>
        </div>
        {hasChanges && (
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        )}
      </div>

      <div className="space-y-8">
        {/* Notification Channels */}
        <section className="p-6 rounded-xl bg-card border border-border">
          <h2 className="text-xl font-semibold mb-4">Notification Channels</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Choose how you want to receive notifications
          </p>
          <div className="space-y-4">
            {CHANNELS.map((channel) => {
              const Icon = channel.icon;
              const isEnabled = localPrefs.enabledChannels.includes(channel.id);
              const isInApp = channel.id === 'in-app';

              return (
                <div
                  key={channel.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-muted">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <Label className="font-medium">{channel.name}</Label>
                      <p className="text-sm text-muted-foreground">
                        {channel.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => handleChannelToggle(channel.id)}
                    disabled={isInApp}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Email Frequency */}
        {localPrefs.enabledChannels.includes('email') && (
          <section className="p-6 rounded-xl bg-card border border-border">
            <h2 className="text-xl font-semibold mb-4">Email Frequency</h2>
            <p className="text-sm text-muted-foreground mb-6">
              How often do you want to receive email notifications?
            </p>
            <div className="space-y-3">
              {EMAIL_FREQUENCIES.map((freq) => (
                <label
                  key={freq.value}
                  className={`flex items-center p-4 rounded-lg border cursor-pointer transition-colors ${
                    localPrefs.emailFrequency === freq.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="emailFrequency"
                    value={freq.value}
                    checked={localPrefs.emailFrequency === freq.value}
                    onChange={() => handleEmailFrequencyChange(freq.value as 'instant' | 'hourly' | 'daily')}
                    className="sr-only"
                  />
                  <div className="flex-1">
                    <span className="font-medium">{freq.label}</span>
                    <p className="text-sm text-muted-foreground">{freq.description}</p>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border-2 ${
                      localPrefs.emailFrequency === freq.value
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground'
                    }`}
                  />
                </label>
              ))}
            </div>
          </section>
        )}

        {/* Quiet Hours */}
        <section className="p-6 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">Quiet Hours</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Pause non-urgent notifications during specific hours
              </p>
            </div>
            <Switch
              checked={localPrefs.quietHours?.enabled || false}
              onCheckedChange={handleQuietHoursToggle}
            />
          </div>

          {localPrefs.quietHours?.enabled && (
            <div className="mt-6 p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-4">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <Label>From</Label>
                  <input
                    type="time"
                    value={localPrefs.quietHours.start}
                    onChange={(e) => handleQuietHoursChange('start', e.target.value)}
                    className="px-3 py-2 rounded-md border border-border bg-background"
                  />
                  <Label>to</Label>
                  <input
                    type="time"
                    value={localPrefs.quietHours.end}
                    onChange={(e) => handleQuietHoursChange('end', e.target.value)}
                    className="px-3 py-2 rounded-md border border-border bg-background"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Timezone: {localPrefs.quietHours.timezone}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Urgent notifications will still be delivered during quiet hours.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

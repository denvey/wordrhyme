import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Switch,
} from "@wordrhyme/ui";
import { AlertCircle, Check, ExternalLink, Eye, EyeOff, Shield } from "lucide-react";
/**
 * OAuth Settings Page
 *
 * Configure OAuth social login providers (Google, GitHub, Apple).
 * Only accessible by users with PlatformOAuth permission.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppleIcon, GitHubIcon, GoogleIcon } from "../components/icons/SocialIcons";
import { useCan } from "../lib/ability";
import { trpc } from "../lib/trpc";

type OAuthProvider = "google" | "github" | "apple";

interface ProviderCardProps {
    provider: OAuthProvider;
    title: string;
    icon: React.ReactNode;
    description: string;
    docsUrl: string;
}

const PROVIDERS: ProviderCardProps[] = [
    {
        provider: "google",
        title: "Google",
        icon: <GoogleIcon className="size-6" />,
        description: "Allow users to sign in with their Google account",
        docsUrl: "https://console.cloud.google.com/apis/credentials",
    },
    {
        provider: "github",
        title: "GitHub",
        icon: <GitHubIcon className="size-6" />,
        description: "Allow users to sign in with their GitHub account",
        docsUrl: "https://github.com/settings/developers",
    },
    {
        provider: "apple",
        title: "Apple",
        icon: <AppleIcon className="size-6" />,
        description: "Allow users to sign in with their Apple ID",
        docsUrl: "https://developer.apple.com/account/resources/identifiers",
    },
];

interface OAuthSettingsPanelProps {
    embedded?: boolean;
}

export function OAuthSettingsPanel({ embedded = false }: OAuthSettingsPanelProps) {
    const canReadOAuth = useCan("read", "PlatformOAuth");

    if (!canReadOAuth) {
        return (
            <div className={embedded ? "" : "p-8"}>
                <div className="flex items-center gap-2 p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>You don't have permission to manage OAuth settings.</span>
                </div>
            </div>
        );
    }

    return (
        <div>
            {!embedded && (
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <Shield className="h-8 w-8 text-primary" />
                        <div>
                            <h1 className="text-3xl font-bold">OAuth Settings</h1>
                            <p className="text-muted-foreground">
                                Configure social login providers for your application
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-6">
                {PROVIDERS.map((providerConfig) => (
                    <ProviderCard key={providerConfig.provider} {...providerConfig} />
                ))}
            </div>

            <div className="mt-8 text-sm text-muted-foreground">
                <p>Changes take effect immediately. No server restart required.</p>
                <p className="mt-1">
                    For detailed setup instructions, see the{" "}
                    <a href="/docs/guides/oauth-setup" className="text-primary hover:underline">
                        OAuth Setup Guide
                    </a>
                    .
                </p>
            </div>
        </div>
    );
}

export function OAuthSettingsPage() {
    return <OAuthSettingsPanel />;
}

function ProviderCard({ provider, title, icon, description, docsUrl }: ProviderCardProps) {
    const [showSecret, setShowSecret] = useState(false);
    const [localEnabled, setLocalEnabled] = useState<boolean | null>(null);
    const [localClientId, setLocalClientId] = useState<string>("");
    const [localClientSecret, setLocalClientSecret] = useState<string>("");
    const [localTeamId, setLocalTeamId] = useState<string>("");
    const [localKeyId, setLocalKeyId] = useState<string>("");
    const [isDirty, setIsDirty] = useState(false);

    const utils = trpc.useUtils();

    const { data, isLoading } = trpc.oauthSettings.get.useQuery({ provider });

    // Sync server data to local state on initial load
    const [initialized, setInitialized] = useState(false);
    useEffect(() => {
        if (data && !initialized) {
            setLocalEnabled(data.enabled);
            setLocalClientId(data.clientId || "");
            setLocalClientSecret(data.clientSecret || "");
            if (provider === "apple") {
                setLocalTeamId(data.teamId || "");
                setLocalKeyId(data.keyId || "");
            }
            setInitialized(true);
        }
    }, [data, initialized, provider]);

    const saveMutation = trpc.oauthSettings.set.useMutation({
        onSuccess: () => {
            toast.success(`${title} settings saved`);
            setIsDirty(false);
            utils.oauthSettings.get.invalidate({ provider });
            utils.oauthSettings.list.invalidate();
            utils.oauthSettings.getEnabledProviders.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to save settings");
        },
    });

    const handleSave = () => {
        saveMutation.mutate({
            provider,
            enabled: localEnabled ?? false,
            clientId: localClientId || undefined,
            clientSecret: localClientSecret || undefined,
            ...(provider === "apple" && {
                teamId: localTeamId || undefined,
                keyId: localKeyId || undefined,
            }),
        });
    };

    const handleChange = () => {
        setIsDirty(true);
    };

    const isApple = provider === "apple";

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted animate-pulse" />
                        <div className="space-y-2">
                            <div className="h-5 w-24 bg-muted animate-pulse rounded" />
                            <div className="h-4 w-48 bg-muted animate-pulse rounded" />
                        </div>
                    </div>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">{icon}</div>
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                {title}
                                {data?.configuredFromEnv && <Badge variant="secondary">From Environment</Badge>}
                                {(localEnabled ?? data?.enabled) && (
                                    <Badge variant="default" className="bg-green-500">
                                        <Check className="size-3 mr-1" />
                                        Enabled
                                    </Badge>
                                )}
                            </CardTitle>
                            <CardDescription>{description}</CardDescription>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={localEnabled ?? data?.enabled ?? false}
                            onCheckedChange={(checked) => {
                                setLocalEnabled(checked);
                                handleChange();
                            }}
                            disabled={data?.configuredFromEnv}
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {data?.configuredFromEnv ? (
                    <div className="flex items-center gap-2 p-4 rounded-lg border border-border bg-muted/50 text-muted-foreground">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        <span className="text-sm">
                            This provider is configured via environment variables. To configure via the admin panel,
                            remove the environment variables and restart the server.
                        </span>
                    </div>
                ) : (
                    <>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor={`${provider}-client-id`}>Client ID</Label>
                                <Input
                                    id={`${provider}-client-id`}
                                    value={localClientId}
                                    onChange={(e) => {
                                        setLocalClientId(e.target.value);
                                        handleChange();
                                    }}
                                    placeholder="Enter Client ID"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor={`${provider}-client-secret`}>Client Secret</Label>
                                <div className="relative">
                                    <Input
                                        id={`${provider}-client-secret`}
                                        type={showSecret ? "text" : "password"}
                                        value={localClientSecret}
                                        onChange={(e) => {
                                            setLocalClientSecret(e.target.value);
                                            handleChange();
                                        }}
                                        placeholder="Enter Client Secret"
                                        className="pr-10"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-0 top-0 h-full px-3"
                                        onClick={() => setShowSecret(!showSecret)}
                                    >
                                        {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {isApple && (
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="apple-team-id">Team ID</Label>
                                    <Input
                                        id="apple-team-id"
                                        value={localTeamId}
                                        onChange={(e) => {
                                            setLocalTeamId(e.target.value);
                                            handleChange();
                                        }}
                                        placeholder="Enter Team ID"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="apple-key-id">Key ID</Label>
                                    <Input
                                        id="apple-key-id"
                                        value={localKeyId}
                                        onChange={(e) => {
                                            setLocalKeyId(e.target.value);
                                            handleChange();
                                        }}
                                        placeholder="Enter Key ID"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Callback URL</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    value={data?.callbackUrl || ""}
                                    readOnly
                                    className="font-mono text-sm bg-muted"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => {
                                        navigator.clipboard.writeText(data?.callbackUrl || "");
                                        toast.success("Callback URL copied");
                                    }}
                                >
                                    <ExternalLink className="size-4" />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Add this URL to your {title} OAuth app settings
                            </p>
                        </div>
                    </>
                )}

                <div className="flex items-center justify-between pt-4 border-t">
                    <a
                        href={docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                        <ExternalLink className="size-3" />
                        {title} Developer Console
                    </a>
                    {!data?.configuredFromEnv && (
                        <Button onClick={handleSave} disabled={saveMutation.isPending || !isDirty}>
                            {saveMutation.isPending ? "Saving..." : "Save Changes"}
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

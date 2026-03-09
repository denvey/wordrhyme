import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './lib/auth';
import { PermissionRoute } from './components/PermissionRoute';
import { DashboardPage } from './pages/Dashboard';
import { PluginsPage } from './pages/Plugins';
import { SettingsPage } from './pages/Settings';
import { FeatureFlagsPage } from './pages/FeatureFlags';
import { PluginPage } from './pages/PluginPage';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { MembersPage } from './pages/Members';
import { MemberDetailPage } from './pages/MemberDetail';
import { InvitationsPage } from './pages/Invitations';
import { PlatformUsersPage } from './pages/PlatformUsers';
import { RolesPage } from './pages/Roles';
import { RoleDetailPage } from './pages/RoleDetail';
import { MenusPage } from './pages/Menus';
import { NotificationsPage } from './pages/Notifications';
import { NotificationPreferencesPage } from './pages/NotificationPreferences';
import { NotificationTemplatesPage } from './pages/NotificationTemplates';
import { NotificationTestPage } from './pages/NotificationTest';
import { MediaLibraryPage } from './pages/MediaLibrary';
import { AuditLogsPage } from './pages/AuditLogs';
import CacheManagement from './pages/CacheManagement';
import PluginHealth from './pages/PluginHealth';
import { WebhooksPage } from './pages/Webhooks';
import { WebhookDetailPage } from './pages/WebhookDetail';
import { HooksPage } from './pages/Hooks';
import { ApiTokensPage } from './pages/ApiTokens';
import { IframePage } from './pages/Iframe';
import { PermissionTestPage } from './pages/PermissionTest';
import { LanguagesPage, TranslationsPage } from './pages/i18n';
import { CurrenciesPage } from './pages/currency';
import { OAuthSettingsPage } from './pages/OAuthSettings';
import { StorageSettingsPage } from './pages/platform/StorageSettings';
import {
    PlansPage,
    PlanDetailPage,
    SubscriptionsPage,
} from './pages/billing';

export function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <Layout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<DashboardPage />} />
                <Route path="plugins" element={<PluginsPage />} />
                <Route
                    path="members"
                    element={
                        <PermissionRoute action="read" subject="Member">
                            <MembersPage />
                        </PermissionRoute>
                    }
                />
                <Route
                    path="members/:memberId"
                    element={
                        <PermissionRoute action="read" subject="Member">
                            <MemberDetailPage />
                        </PermissionRoute>
                    }
                />
                <Route path="invitations" element={<InvitationsPage />} />
                <Route
                    path="roles"
                    element={
                        <PermissionRoute action="read" subject="Role">
                            <RolesPage />
                        </PermissionRoute>
                    }
                />
                <Route
                    path="roles/:roleId"
                    element={
                        <PermissionRoute action="read" subject="Role">
                            <RoleDetailPage />
                        </PermissionRoute>
                    }
                />
                <Route path="menus" element={<MenusPage />} />
                {/* Settings group: /settings/* */}
                <Route path="settings">
                    <Route path="general" element={<SettingsPage />} />
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route path="notifications/preferences" element={<NotificationPreferencesPage />} />
                    <Route path="notifications/templates" element={<NotificationTemplatesPage />} />
                    <Route path="notifications/test" element={<NotificationTestPage />} />
                    <Route path="webhooks" element={<WebhooksPage />} />
                    <Route path="webhooks/:id" element={<WebhookDetailPage />} />
                    <Route path="api-tokens" element={<ApiTokensPage />} />
                    <Route path="hooks" element={<HooksPage />} />
                    <Route path="audit" element={<AuditLogsPage />} />
                    <Route path="i18n/languages" element={<LanguagesPage />} />
                    <Route path="i18n/messages" element={<TranslationsPage />} />
                    <Route path="currencies" element={<CurrenciesPage />} />
                    {/* Billing group: /settings/billing/* */}
                    <Route path="billing/plans" element={<PlansPage />} />
                    <Route path="billing/plans/:planId" element={<PlanDetailPage />} />
                    <Route path="billing/subscriptions" element={<SubscriptionsPage />} />
                </Route>
                {/* Platform group */}
                <Route path="platform/users" element={<PlatformUsersPage />} />
                <Route path="platform/settings/oauth" element={<OAuthSettingsPage />} />
                <Route path="platform/feature-flags" element={<FeatureFlagsPage />} />
                <Route path="platform/storage" element={<StorageSettingsPage />} />
                <Route path="platform/cache" element={<CacheManagement />} />
                <Route path="platform/plugin-health" element={<PluginHealth />} />
                {/* Other */}
                <Route path="media" element={<MediaLibraryPage />} />
                <Route path="iframe" element={<IframePage />} />
                <Route path="test/permissions" element={<PermissionTestPage />} />
                {/* Dynamic plugin routes - /p/:pluginId/* */}
                <Route path="p/:pluginId/*" element={<PluginPage />} />
            </Route>
        </Routes>
    );
}

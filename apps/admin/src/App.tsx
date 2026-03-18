import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PermissionRoute } from "./components/PermissionRoute";
import { ProtectedRoute } from "./lib/auth";
import { ApiTokensPage } from "./pages/ApiTokens";
import { AuditLogsPage } from "./pages/AuditLogs";
import CacheManagement from "./pages/CacheManagement";
import { DashboardPage } from "./pages/Dashboard";
import { FeatureFlagsPage } from "./pages/FeatureFlags";
import { HooksPage } from "./pages/Hooks";
import { IframePage } from "./pages/Iframe";
import { InvitationsPage } from "./pages/Invitations";
import { LoginPage } from "./pages/Login";
import { MediaLibraryPage } from "./pages/MediaLibrary";
import { MemberDetailPage } from "./pages/MemberDetail";
import { MembersPage } from "./pages/Members";
import { MenusPage } from "./pages/Menus";
import { NotificationPreferencesPage } from "./pages/NotificationPreferences";
import { NotificationTemplatesPage } from "./pages/NotificationTemplates";
import { NotificationTestPage } from "./pages/NotificationTest";
import { NotificationsPage } from "./pages/Notifications";
import { PermissionTestPage } from "./pages/PermissionTest";
import { PlatformUsersPage } from "./pages/PlatformUsers";
import PluginHealth from "./pages/PluginHealth";
import { PluginPage } from "./pages/PluginPage";
import { PluginsPage } from "./pages/Plugins";
import { RegisterPage } from "./pages/Register";
import { RoleDetailPage } from "./pages/RoleDetail";
import { RolesPage } from "./pages/Roles";
import { SettingsPage } from "./pages/Settings";
import { WebhookDetailPage } from "./pages/WebhookDetail";
import { WebhooksPage } from "./pages/Webhooks";
import { PlanDetailPage, PlansPage, SubscriptionsPage } from "./pages/billing";
import { CurrenciesPage } from "./pages/currency";
import { LanguagesPage, TranslationsPage } from "./pages/i18n";

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
                <Route path="platform/feature-flags" element={<FeatureFlagsPage />} />
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

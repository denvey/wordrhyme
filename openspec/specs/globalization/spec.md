# globalization Specification

## Purpose
Define the globalization primitives for locale, currency, timezone, and text presentation across the platform.
## Requirements
### Requirement: Globalization Context

Core SHALL provide a `GlobalizationContext` that contains the current user's locale, currency, timezone, and text direction.

The context SHALL be resolved from the following sources in priority order:
1. URL query parameter (`?lang=`)
2. Cookie
3. User preference
4. Organization default
5. System default (`zh-CN`)

#### Scenario: Context resolution from URL
- **WHEN** request contains `?lang=en-US`
- **THEN** `GlobalizationContext.locale` is `en-US`
- **AND** `GlobalizationContext.direction` is `ltr`

#### Scenario: Context resolution fallback to organization default
- **WHEN** no locale specified in URL, cookie, or user preference
- **AND** organization default is `ja-JP`
- **THEN** `GlobalizationContext.locale` is `ja-JP`

#### Scenario: RTL language detection
- **WHEN** locale is `ar-SA`
- **THEN** `GlobalizationContext.direction` is `rtl`

---

### Requirement: Language Management

Core SHALL provide language management capabilities allowing administrators to add, update, enable/disable, and set default languages.

Each organization SHALL have exactly one default language.

#### Scenario: Add new language
- **GIVEN** user has `i18n.language:manage` permission
- **WHEN** user adds language `fr-FR` with name `Français`
- **THEN** language is created with `is_enabled=true`
- **AND** language is available for translation

#### Scenario: Set default language
- **GIVEN** languages `zh-CN` and `en-US` exist
- **WHEN** user sets `en-US` as default
- **THEN** `en-US.is_default` is `true`
- **AND** `zh-CN.is_default` is `false`

#### Scenario: Disable language
- **GIVEN** language `fr-FR` exists and is not default
- **WHEN** user disables `fr-FR`
- **THEN** `fr-FR.is_enabled` is `false`
- **AND** translations for `fr-FR` are excluded from public API

---

### Requirement: Translation Management

Core SHALL provide translation management capabilities allowing administrators to create, read, update, and delete translation entries.

Translations SHALL be stored with a key, namespace, type (page/api), and JSONB translations object.

#### Scenario: Create translation
- **GIVEN** user has `i18n.message:manage` permission
- **WHEN** user creates translation with key `order.submit`, namespace `core`
- **AND** translations `{"zh-CN": "提交订单", "en-US": "Submit Order"}`
- **THEN** translation is created
- **AND** cache is invalidated for namespace `core`

#### Scenario: Update translation
- **GIVEN** translation `order.submit` exists
- **WHEN** user updates `en-US` value to `Submit`
- **THEN** translation is updated
- **AND** `user_modified` is set to `true`
- **AND** cache is invalidated

#### Scenario: Filter translations by namespace
- **WHEN** user queries translations with `namespace=plugin:dsneo`
- **THEN** only translations with namespace `plugin:dsneo` are returned

---

### Requirement: Public Translation API

Core SHALL provide a public tRPC procedure `i18n.getMessages` that returns translations for specified locale and namespaces.

The API SHALL support version-based caching to minimize data transfer.

#### Scenario: Fetch translations
- **WHEN** client requests translations for `locale=zh-CN`, `namespaces=[core, admin]`
- **THEN** response contains merged messages from both namespaces
- **AND** response includes `version` for cache validation

#### Scenario: Version match returns not modified
- **GIVEN** client has cached version `1706961234567`
- **WHEN** client requests with `version=1706961234567`
- **AND** server version matches
- **THEN** response contains `notModified: true`
- **AND** client uses local cache

---

### Requirement: Translation Caching

Core SHALL implement multi-layer caching for translations: Redis (application cache) and LocalStorage (client cache).

Cache SHALL be invalidated when translations are updated.

#### Scenario: Redis cache hit
- **GIVEN** translations for `zh-CN:core` are cached in Redis
- **WHEN** client requests translations
- **THEN** response is served from Redis
- **AND** database is not queried

#### Scenario: Cache invalidation on update
- **WHEN** translation in namespace `core` is updated
- **THEN** Redis cache for all locales in `core` namespace is invalidated
- **AND** new version number is generated

---

### Requirement: Plugin Translation Lifecycle

Core SHALL load plugin translations when a plugin is installed, and remove them when uninstalled.

Plugin translations SHALL be isolated to their own namespace.

User-modified translations SHALL be preserved during plugin upgrades.

#### Scenario: Plugin installation loads translations
- **WHEN** plugin `dsneo-orders` is installed
- **AND** plugin has i18n directory with `zh-CN.json`
- **THEN** translations are inserted with `namespace=plugin:dsneo.orders`, `source=plugin`
- **AND** key conflicts are skipped and logged

#### Scenario: Plugin upgrade preserves user modifications
- **GIVEN** translation `plugin:dsneo.dashboard.title` exists with `user_modified=true`
- **WHEN** plugin `dsneo-orders` is upgraded with new value
- **THEN** translation is NOT overwritten
- **AND** original user value is preserved

#### Scenario: Plugin uninstall removes translations
- **WHEN** plugin `dsneo-orders` is uninstalled
- **THEN** translations with `source=plugin`, `source_id=dsneo-orders`, `user_modified=false` are deleted
- **AND** translations with `user_modified=true` are preserved

---

### Requirement: RTL Layout Support

Core SHALL support right-to-left (RTL) languages by setting `dir="rtl"` on the HTML element and using CSS logical properties.

Physical CSS properties SHALL be prohibited via Stylelint rules.

#### Scenario: RTL language sets direction
- **WHEN** user switches to Arabic (`ar-SA`)
- **THEN** `<html dir="rtl" lang="ar-SA">` is set
- **AND** layout automatically mirrors

#### Scenario: Stylelint blocks physical properties
- **WHEN** CSS contains `margin-left: 16px`
- **THEN** Stylelint reports error
- **AND** suggests `margin-inline-start: 16px`

---

### Requirement: Smart Formatting Components

Core SHALL provide React components for localized formatting: text, currency, date/time, and numbers.

Components SHALL use the current `GlobalizationContext` for formatting.

#### Scenario: CurrencyDisplay formats amount
- **GIVEN** `GlobalizationContext.locale` is `en-US`
- **WHEN** `<CurrencyDisplay amount={1234.56} currency="USD" />` is rendered
- **THEN** output is `$1,234.56`

#### Scenario: DateTimeDisplay formats date
- **GIVEN** `GlobalizationContext.locale` is `zh-CN`
- **WHEN** `<DateTimeDisplay date={new Date('2024-01-15')} />` is rendered
- **THEN** output is `2024年1月15日`

---

### Requirement: Frontend I18n Integration

Core SHALL provide an `I18nProvider` component that integrates with react-i18next and supports SSR.

Translations SHALL be pre-fetched on the server and hydrated on the client.

#### Scenario: SSR translation loading
- **WHEN** page is server-rendered
- **THEN** translations are fetched on server
- **AND** passed to client via `I18nProvider`
- **AND** no hydration mismatch occurs

#### Scenario: Client-side language switch
- **WHEN** user switches language from `zh-CN` to `en-US`
- **THEN** new translations are fetched (or loaded from cache)
- **AND** `<html lang="en-US">` is updated
- **AND** UI re-renders with new language

---

### Requirement: Content Data i18n Helper

Core SHALL provide a `getI18nValue` helper function for extracting localized content from entity JSONB fields.

This helper is distinct from UI translation (`t()`) - it is used for content data (product names, article titles, etc.) that is stored directly in entity fields.

#### Scenario: Extract value for current locale
- **GIVEN** `product.title` is `{ "en-US": "Winter Jacket", "zh-CN": "冬季夹克" }`
- **WHEN** `getI18nValue(product.title, 'zh-CN')` is called
- **THEN** result is `"冬季夹克"`

#### Scenario: Fallback to default locale
- **GIVEN** `product.title` is `{ "en-US": "Winter Jacket", "zh-CN": "冬季夹克" }`
- **AND** requested locale `ja-JP` does not exist
- **WHEN** `getI18nValue(product.title, 'ja-JP', 'en-US')` is called
- **THEN** result is `"Winter Jacket"` (fallback to `en-US`)

#### Scenario: Fallback to first available
- **GIVEN** `product.title` is `{ "en-US": "Winter Jacket" }`
- **AND** no fallback locale specified
- **WHEN** `getI18nValue(product.title, 'ja-JP')` is called
- **THEN** result is `"Winter Jacket"` (first available value)

#### Scenario: Empty field returns undefined
- **GIVEN** `product.title` is `{}` or `null`
- **WHEN** `getI18nValue(product.title, 'en-US')` is called
- **THEN** result is `undefined`

#### Scenario: Get all translations
- **GIVEN** `product.title` is `{ "en-US": "Winter Jacket", "zh-CN": "冬季夹克" }`
- **WHEN** `getI18nValue(product.title)` is called (no locale specified)
- **THEN** result is the entire object `{ "en-US": "Winter Jacket", "zh-CN": "冬季夹克" }`

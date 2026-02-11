# @wordrhyme/db

Shared database types and Zod schemas for WordRhyme.

## Installation

```bash
pnpm add @wordrhyme/db
```

## Usage

### Zod Schemas (for AutoCrudTable)

```typescript
import { selectI18nLanguageSchema } from '@wordrhyme/db/zod';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { trpc } from '@/lib/trpc';

function LanguagesPage() {
  const resource = useAutoCrudResource({
    router: trpc.i18n.languages,
    schema: selectI18nLanguageSchema,
  });

  return (
    <AutoCrudTable
      schema={selectI18nLanguageSchema}
      resource={resource}
      fields={{
        id: { hidden: true },
        organizationId: { hidden: true },
      }}
    />
  );
}
```

### Types

```typescript
import type { I18nLanguage, I18nMessage } from '@wordrhyme/db';

function processLanguage(lang: I18nLanguage) {
  console.log(lang.locale, lang.name);
}
```

## Exports

| Path | Description |
|------|-------------|
| `@wordrhyme/db` | Types and all Zod schemas |
| `@wordrhyme/db/zod` | Zod schemas only |
| `@wordrhyme/db/schema` | Drizzle schemas (reserved) |

## Available Schemas

### i18n

- `selectI18nLanguageSchema` - For displaying languages
- `insertI18nLanguageSchema` - For creating languages (with validation)
- `updateI18nLanguageSchema` - For updating languages
- `selectI18nMessageSchema` - For displaying messages
- `insertI18nMessageSchema` - For creating messages
- `updateI18nMessageSchema` - For updating messages

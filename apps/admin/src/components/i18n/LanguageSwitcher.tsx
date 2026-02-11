/**
 * Language Switcher Component
 *
 * Dropdown for switching the application language.
 * Uses I18nProvider context for language management.
 *
 * @see design.md D4: 前端 SSR 集成
 */
import React from 'react';
import { Globe, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Button,
} from '@wordrhyme/ui';
import { useLanguageSwitcher } from '../../lib/i18n';
import { cn } from '../../lib/utils';

/**
 * Language display names
 */
const LANGUAGE_NAMES: Record<string, { name: string; nativeName: string }> = {
  'en-US': { name: 'English (US)', nativeName: 'English' },
  'en-GB': { name: 'English (UK)', nativeName: 'English' },
  'zh-CN': { name: 'Chinese (Simplified)', nativeName: '简体中文' },
  'zh-TW': { name: 'Chinese (Traditional)', nativeName: '繁體中文' },
  'ja-JP': { name: 'Japanese', nativeName: '日本語' },
  'ko-KR': { name: 'Korean', nativeName: '한국어' },
  'ar-SA': { name: 'Arabic', nativeName: 'العربية' },
  'he-IL': { name: 'Hebrew', nativeName: 'עברית' },
  'fa-IR': { name: 'Persian', nativeName: 'فارسی' },
  'de-DE': { name: 'German', nativeName: 'Deutsch' },
  'fr-FR': { name: 'French', nativeName: 'Français' },
  'es-ES': { name: 'Spanish', nativeName: 'Español' },
  'pt-BR': { name: 'Portuguese (Brazil)', nativeName: 'Português' },
  'ru-RU': { name: 'Russian', nativeName: 'Русский' },
  'it-IT': { name: 'Italian', nativeName: 'Italiano' },
  'nl-NL': { name: 'Dutch', nativeName: 'Nederlands' },
  'pl-PL': { name: 'Polish', nativeName: 'Polski' },
  'tr-TR': { name: 'Turkish', nativeName: 'Türkçe' },
  'th-TH': { name: 'Thai', nativeName: 'ไทย' },
  'vi-VN': { name: 'Vietnamese', nativeName: 'Tiếng Việt' },
};

/**
 * Get language info for a locale
 */
function getLanguageInfo(locale: string): { name: string; nativeName: string } {
  return (
    LANGUAGE_NAMES[locale] || {
      name: locale,
      nativeName: locale,
    }
  );
}

/**
 * Language Switcher Props
 */
interface LanguageSwitcherProps {
  /** Show native name instead of English name */
  showNativeName?: boolean;
  /** Compact mode (icon only) */
  compact?: boolean;
  /** Additional className */
  className?: string;
  /** Button variant */
  variant?: 'default' | 'ghost' | 'outline';
  /** Button size */
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * Language Switcher Component
 */
export function LanguageSwitcher({
  showNativeName = false,
  compact = false,
  className,
  variant = 'ghost',
  size = 'default',
}: LanguageSwitcherProps) {
  const { currentLocale, availableLocales, isChanging, switchTo } = useLanguageSwitcher();

  const currentLang = getLanguageInfo(currentLocale);

  const handleSwitch = (locale: string) => {
    if (locale !== currentLocale) {
      switchTo(locale);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={compact ? 'icon' : size}
          className={cn('gap-2', className)}
          disabled={isChanging}
        >
          <Globe className="h-4 w-4" />
          {!compact && (
            <span className="hidden sm:inline">
              {showNativeName ? currentLang.nativeName : currentLang.name}
            </span>
          )}
          {isChanging && (
            <span className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        {availableLocales.map((locale) => {
          const lang = getLanguageInfo(locale);
          const isActive = locale === currentLocale;

          return (
            <DropdownMenuItem
              key={locale}
              onClick={() => handleSwitch(locale)}
              className={cn('flex items-center justify-between', isActive && 'bg-accent')}
            >
              <div className="flex flex-col">
                <span className="font-medium">{lang.nativeName}</span>
                <span className="text-xs text-muted-foreground">{lang.name}</span>
              </div>
              {isActive && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Compact Language Switcher (icon only)
 */
export function LanguageSwitcherCompact(props: Omit<LanguageSwitcherProps, 'compact'>) {
  return <LanguageSwitcher {...props} compact />;
}

export default LanguageSwitcher;

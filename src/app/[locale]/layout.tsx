import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import ThemeToggle from '@/components/ui/ThemeToggle';
import SoundToggle from '@/components/ui/SoundToggle';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import '../globals.css';

// Inline script that runs before React hydration to prevent flash of wrong theme.
const themeInitScript = `
(function(){
  try {
    var stored = localStorage.getItem('theme');
    var cls = 'dark';
    if (stored === 'dark' || stored === 'light') {
      cls = stored;
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      cls = 'light';
    }
    document.documentElement.classList.remove('dark','light');
    document.documentElement.classList.add(cls);
  } catch(e){}
})();
`;

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased bg-bg text-text min-h-screen">
        <NextIntlClientProvider messages={messages}>
          <div className="fixed top-4 right-16 z-50 flex items-center gap-2 md:right-4">
            <SoundToggle />
            <ThemeToggle />
          </div>
          {children}
          <LanguageSwitcher />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

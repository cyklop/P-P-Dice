import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/components/ui/ThemeToggle";
import SoundToggle from "@/components/ui/SoundToggle";

export const metadata: Metadata = {
  title: "PP Dice - Multiplayer 3D Dice Roller",
  description:
    "Würfle gemeinsam mit Freunden in Echtzeit und 3D. RPG-Würfel von D4 bis D20 mit Physik-Simulation.",
};

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased bg-bg text-text min-h-screen">
        <div className="fixed top-4 right-16 z-50 flex items-center gap-2 md:right-4">
          <SoundToggle />
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}

import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CFB Live Scores",
  description: "Live college football scores + latest scoring plays"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/70 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <h1 className="text-lg font-semibold">CFB Live</h1>
            <a className="text-sm opacity-70 hover:opacity-100" href="#">by Matthew</a>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { LocaleRoot } from "@/components/locale-root";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trip Planner",
  description: "Generate complete travel itineraries with AI, then edit and check them off as you go.",
};

// Sets <html lang> from the saved language before paint, so the layout itself stays static.
const setLang = `(function(){try{var m=document.cookie.match(/(?:^|; )locale=([a-z]{2})/);var l=m?m[1]:(navigator.language||"en").slice(0,2);if(["en","es","fr","pt","de","ja"].indexOf(l)>-1)document.documentElement.lang=l}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: setLang }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <Suspense>
          <LocaleRoot>
            <Providers>
              <Header />
              <div className="flex flex-1 flex-col">{children}</div>
            </Providers>
          </LocaleRoot>
        </Suspense>
      </body>
    </html>
  );
}

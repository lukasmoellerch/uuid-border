import type { Metadata } from "next";
import { Crimson_Pro, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const crimsonPro = Crimson_Pro({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "UUID Border — Hidden Data in Plain Sight",
  description: "Encode UUID4 values into subtle color variations in input borders. A steganography experiment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var mode = localStorage.getItem('theme');
                  if (mode === 'dark' || (!mode && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${crimsonPro.variable} ${jetbrainsMono.variable} antialiased min-h-screen`}
      >
        {/* Subtle background pattern */}
        <div className="fixed inset-0 -z-10 grain" />
        
        {/* Gradient orbs for visual interest */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div 
            className="absolute -top-[40%] -right-[20%] w-[80%] h-[80%] rounded-full opacity-[0.03]"
            style={{
              background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
            }}
          />
          <div 
            className="absolute -bottom-[30%] -left-[20%] w-[60%] h-[60%] rounded-full opacity-[0.03]"
            style={{
              background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
            }}
          />
        </div>
        
        {children}
      </body>
    </html>
  );
}

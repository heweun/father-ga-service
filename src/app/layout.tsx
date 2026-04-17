import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "총무나라 - 아버지를 위한 간편한 총무나라",
  description: "수입과 지출을 쉽게 관리하는 총무나라 앱",
  manifest: "/manifest.json",
  themeColor: "#1B3F8B",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "총무나라",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${notoSansKR.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Lovart Agent · 画布创作",
  description: "个人画布生图工作台",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

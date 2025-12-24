import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "Agent Portal",
  description: "代理商平台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

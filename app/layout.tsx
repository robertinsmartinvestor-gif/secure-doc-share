export const metadata = {
  title: "Accesso documenti",
  description: "Accesso sicuro ai documenti",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReCompose — Perception, Measured',
  description:
    'Avatar-based body image assessment on your own 3D body scan. Segmental morphing anchored to body composition, with the complete adjustment trajectory captured as measurement data. All processing happens on your device.',
  applicationName: 'ReCompose',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased" style={{ fontFamily: 'var(--rc-font-body)' }}>
        {children}
      </body>
    </html>
  );
}

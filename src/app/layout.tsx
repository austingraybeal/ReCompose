import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReCompose — See your future form',
  description: 'Interactive 3D body composition visualization. Upload a body scan and explore morphing at different body fat percentages.',
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

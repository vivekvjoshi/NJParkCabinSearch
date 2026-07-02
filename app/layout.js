import './globals.css';

export const metadata = {
  title: 'NJ Park Site Finder — search every NJ state park at once',
  description:
    'Compare campsites, cabins & lean-tos across all 18 NJ state parks in one search.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

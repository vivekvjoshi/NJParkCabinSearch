import './globals.css';

export const metadata = {
  title: 'NJ Park Site Finder — search every NJ state park at once',
  description:
    'Compare campsites, cabins & lean-tos across all 18 NJ state parks in one search.',
  openGraph: {
    title: 'NJ Park Site Finder',
    description:
      'Compare campsites, cabins & lean-tos across all 18 NJ state parks in one search.',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* set data-theme before first paint to avoid a light/dark flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('njpf.theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

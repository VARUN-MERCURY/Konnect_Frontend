import './globals.css';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#06040f',
};

export const metadata = {
  title: 'Konnect',
  description: 'Konnect authentication',
  icons: {
    icon: [
      { url: '/konnect-logo.png', type: 'image/png', sizes: '512x512' },
      { url: '/konnect-logo.png', type: 'image/png', sizes: '192x192' },
      { url: '/konnect-logo.png', type: 'image/png', sizes: '96x96' },
      { url: '/konnect-logo.png', type: 'image/png', sizes: '64x64' },
    ],
    shortcut: '/konnect-logo.png',
    apple: [{ url: '/konnect-logo.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

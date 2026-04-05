import './globals.css';

export const metadata = {
  title: 'Konnect',
  description: 'Konnect authentication',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

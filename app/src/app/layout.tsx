import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'BukkaGo — good food, ready when you are', description: 'Order ahead from your neighbourhood bukka and skip the queue.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

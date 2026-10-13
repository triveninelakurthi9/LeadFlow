import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'LeadFlow — Lead management', description: 'A thoughtful workspace for managing leads and follow-ups.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

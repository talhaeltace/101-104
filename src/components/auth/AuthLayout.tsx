import React from 'react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm">
        {children}
      </div>

      <footer className="mt-8 text-center text-xs text-gray-400">
        &copy; {new Date().getFullYear()} nelit.com.tr
      </footer>
    </div>
  );
}

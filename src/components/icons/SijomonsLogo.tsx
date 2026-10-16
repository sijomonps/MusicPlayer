import React from "react";

interface SijomonsLogoProps {
  className?: string;
  size?: number;
}

export function SijomonsLogo({ className = "w-6 h-6", size }: SijomonsLogoProps) {
  const style = size ? { width: size, height: size } : undefined;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <defs>
        <linearGradient id="sijomonsGradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {/* S Monogram merged with Soundwave & Vinyl Curve */}
      <path
        d="M18 6.5C18 4.01472 15.7614 2 13 2H9C6.23858 2 4 4.23858 4 7C4 9.76142 6.23858 12 9 12H15C17.7614 12 20 14.2386 20 17C20 19.7614 17.7614 22 15 22H10C7.23858 22 5 19.9853 5 17.5"
        stroke="url(#sijomonsGradient)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Central Acoustic Core */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      {/* Subtle Acoustic Wave Accents */}
      <path
        d="M17.5 2.5C19.8 3.6 21.2 5.1 21.8 6.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M6.5 21.5C4.2 20.4 2.8 18.9 2.2 17.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

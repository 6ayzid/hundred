import React from 'react';

export interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * Custom "100" layered tabletop card emblem matching হানডেট HUNDRED's pastel
 * berry-rose, purple card-back, and gold star palette. Uses exact vector paths
 * so "100" stays crisp across every font environment and screen density.
 */
export function BrandMark({ size = 44, className = '' }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-testid="brand-logo-mark"
      className={className}
    >
      <defs>
        <linearGradient id="hundred-logo-back" x1="8" y1="6" x2="44" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7a64ba" />
          <stop offset="100%" stopColor="#4c3984" />
        </linearGradient>
        <linearGradient id="hundred-logo-front" x1="12" y1="8" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ff96b4" />
          <stop offset="52%" stopColor="#f05482" />
          <stop offset="100%" stopColor="#d83563" />
        </linearGradient>
        <linearGradient id="hundred-logo-star" x1="46" y1="4" x2="60" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffef99" />
          <stop offset="100%" stopColor="#ffb703" />
        </linearGradient>
      </defs>

      {/* Tilted purple card back peeking behind */}
      <g transform="rotate(-12 26 32)">
        <rect
          x="6"
          y="9"
          width="38"
          height="46"
          rx="10"
          fill="url(#hundred-logo-back)"
          stroke="#3b2b68"
          strokeWidth="2"
        />
        <rect
          x="10.5"
          y="13.5"
          width="29"
          height="37"
          rx="6.5"
          stroke="#e5dcff"
          strokeOpacity="0.48"
          strokeWidth="1.4"
          strokeDasharray="3 2.5"
        />
      </g>

      {/* Front Hero Card: Coral-Rose 100 Tabletop Badge */}
      <g transform="rotate(2.5 34 34)">
        {/* Tactile 3D lower card edge */}
        <rect
          x="11"
          y="13.5"
          width="46"
          height="45"
          rx="13.5"
          fill="#b52550"
          fillOpacity="0.38"
        />
        {/* Card body */}
        <rect
          x="11"
          y="10"
          width="46"
          height="45"
          rx="13.5"
          fill="url(#hundred-logo-front)"
          stroke="#fffaf5"
          strokeWidth="2.5"
        />
        {/* Cozy subtle gloss & dashed honey-gold inner border */}
        <path
          d="M14 23 C14 15.5 18 12.5 25 12.5 H43 C50 12.5 54 15.5 54 23 C42 26.5 26 26.5 14 23 Z"
          fill="#ffffff"
          fillOpacity="0.16"
        />
        <rect
          x="15.2"
          y="14.2"
          width="37.6"
          height="36.6"
          rx="9.5"
          stroke="#fff2b8"
          strokeOpacity="0.65"
          strokeWidth="1.4"
          strokeDasharray="3.2 2.4"
        />

        {/* Drop shadow behind centered 100 */}
        <g transform="translate(0, 1.7)" opacity="0.34">
          <path
            d="M18.2 28.4 L20.6 25.3 V40.4 M18.4 40.4 H22.8"
            stroke="#6e112c"
            strokeWidth="4.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="27.0"
            y="25.3"
            width="9.0"
            height="15.1"
            rx="4.5"
            stroke="#6e112c"
            strokeWidth="4.2"
          />
          <rect
            x="40.4"
            y="25.3"
            width="9.0"
            height="15.1"
            rx="4.5"
            stroke="#6e112c"
            strokeWidth="4.2"
          />
        </g>

        {/* Bold rounded centered "100" */}
        <g>
          <path
            d="M18.2 28.4 L20.6 25.3 V40.4 M18.4 40.4 H22.8"
            stroke="#fffef9"
            strokeWidth="4.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="27.0"
            y="25.3"
            width="9.0"
            height="15.1"
            rx="4.5"
            stroke="#fffef9"
            strokeWidth="4.2"
          />
          <rect
            x="40.4"
            y="25.3"
            width="9.0"
            height="15.1"
            rx="4.5"
            stroke="#fffef9"
            strokeWidth="4.2"
          />
        </g>

        {/* Tiny bottom-left suit dot */}
        <circle cx="20.5" cy="46.2" r="1.4" fill="#ffe8a3" fillOpacity="0.88" />
      </g>

      {/* Gold Star Trump Charm on top-right corner (honoring the 100 card suit) */}
      <path
        d="M52.5 5.2 L54.7 9.9 L59.8 10.6 L56.1 14.1 L57 19.2 L52.5 16.7 L48 19.2 L48.9 14.1 L45.2 10.6 L50.3 9.9 Z"
        fill="url(#hundred-logo-star)"
        stroke="#c96f0a"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default BrandMark;

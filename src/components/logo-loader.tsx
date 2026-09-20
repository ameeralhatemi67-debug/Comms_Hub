'use client';

import React from 'react';

export interface LogoLoaderProps {
  /**
   * Visual dimension of the loader.
   * Named tokens: 'xs' (16px), 'sm' (24px), 'md' (32px), 'lg' (48px), 'xl' (64px), '2xl' (80px),
   * or a custom number in pixels.
   * Default: 'md' (32px).
   */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;
  /**
   * 'active' runs the approved continuous-360 forward animation with 1.5s assembly rotation.
   * 'static' renders the expanded 8-petal brand rosette without motion.
   * Default: 'active'.
   */
  mode?: 'active' | 'static';
  /**
   * Stroke outline color. Default: '#B99445' (brand gold).
   */
  color?: string;
  /**
   * Additional CSS classes on the outer container.
   */
  className?: string;
  /**
   * Accessible description for assistive technologies.
   */
  ariaLabel?: string;
}

const SIZE_MAP = {
  xs: 16,
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
  '2xl': 80,
} as const;

export function LogoLoader({
  size = 'md',
  mode = 'active',
  color = '#B99445',
  className = '',
  ariaLabel = 'جارٍ التحميل…',
}: LogoLoaderProps) {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size] || 32;
  const isStatic = mode === 'static';

  return (
    <span
      className={`logo-loader-container ${isStatic ? 'is-static' : 'is-active'} ${className}`.trim()}
      role="status"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: pixelSize,
        height: pixelSize,
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="-80 -80 160 160"
        width={pixelSize}
        height={pixelSize}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: '100%',
          height: '100%',
          overflow: 'visible',
          display: 'block',
        }}
        aria-hidden="true"
      >
        <defs>
          <style>{`
            .logo-loader-assembly {
              transform-origin: 0px 0px;
            }
            .logo-loader-assembly.animate-assembly {
              animation: logoAssemblySpin 1.5s linear infinite;
            }
            .logo-capsule {
              transform-origin: 0px 0px;
            }
            .logo-cap-1.animate-cap {
              animation: logoBloomCap1 4s infinite;
            }
            .logo-cap-2.animate-cap {
              animation: logoBloomCap2 4s infinite;
            }
            .logo-cap-3.animate-cap {
              animation: logoBloomCap3 4s infinite;
            }

            @keyframes logoAssemblySpin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }

            /* Capsule 1: 45 -> 0 -> -135(225) -> 180 -> 45(405) */
            @keyframes logoBloomCap1 {
              0%, 13.75% {
                transform: rotate(0deg);
                animation-timing-function: cubic-bezier(0.44, -0.03, 0.4, 1);
              }
              27.5%, 36.25% {
                transform: rotate(45deg);
                animation-timing-function: cubic-bezier(0.44, -0.03, 0.4, 1);
              }
              50%, 63.75% {
                transform: rotate(180deg);
                animation-timing-function: cubic-bezier(0.44, -0.03, 0.4, 1);
              }
              77.5%, 86.25% {
                transform: rotate(225deg);
                animation-timing-function: cubic-bezier(0.44, -0.03, 0.4, 1);
              }
              100% {
                transform: rotate(360deg);
              }
            }

            /* Capsule 2: 90 -> 0 -> -90(270) -> 180 -> 90(450) */
            @keyframes logoBloomCap2 {
              0%, 13.75% {
                transform: rotate(0deg);
                animation-timing-function: cubic-bezier(0.44, -0.03, 0.4, 1);
              }
              27.5%, 36.25% {
                transform: rotate(90deg);
                animation-timing-function: cubic-bezier(0.44, -0.03, 0.4, 1);
              }
              50%, 63.75% {
                transform: rotate(180deg);
                animation-timing-function: cubic-bezier(0.44, -0.03, 0.4, 1);
              }
              77.5%, 86.25% {
                transform: rotate(270deg);
                animation-timing-function: cubic-bezier(0.44, -0.03, 0.4, 1);
              }
              100% {
                transform: rotate(360deg);
              }
            }

            /* Capsule 3: 135 -> 0 -> -45(315) -> 180 -> 135(495) */
            @keyframes logoBloomCap3 {
              0%, 13.75% {
                transform: rotate(0deg);
                animation-timing-function: cubic-bezier(0.44, -0.03, 0.4, 1);
              }
              27.5%, 36.25% {
                transform: rotate(135deg);
                animation-timing-function: cubic-bezier(0.44, -0.03, 0.4, 1);
              }
              50%, 63.75% {
                transform: rotate(180deg);
                animation-timing-function: cubic-bezier(0.44, -0.03, 0.4, 1);
              }
              77.5%, 86.25% {
                transform: rotate(315deg);
                animation-timing-function: cubic-bezier(0.44, -0.03, 0.4, 1);
              }
              100% {
                transform: rotate(360deg);
              }
            }

            @media (prefers-reduced-motion: reduce) {
              .logo-loader-assembly.animate-assembly {
                animation: none !important;
              }
              .logo-cap-1.animate-cap,
              .logo-cap-2.animate-cap,
              .logo-cap-3.animate-cap {
                animation: none !important;
              }
              .logo-cap-0 { transform: rotate(0deg); }
              .logo-cap-1 { transform: rotate(45deg); }
              .logo-cap-2 { transform: rotate(90deg); }
              .logo-cap-3 { transform: rotate(135deg); }
              .logo-loader-assembly {
                animation: logoReducedBreath 3s ease-in-out infinite alternate !important;
              }
            }

            @keyframes logoReducedBreath {
              from { opacity: 0.75; }
              to { opacity: 1; }
            }
          `}</style>
        </defs>

        <g className={`logo-loader-assembly ${isStatic ? '' : 'animate-assembly'}`}>
          {/* Capsule 0: Horizontal Anchor (0 deg) */}
          <g className="logo-capsule logo-cap-0">
            <rect
              x="-60"
              y="-18"
              width="120"
              height="36"
              rx="18"
              ry="18"
              stroke={color}
              strokeWidth="3"
            />
          </g>

          {/* Capsule 1: Nominal 45 deg */}
          <g
            className={`logo-capsule logo-cap-1 ${isStatic ? '' : 'animate-cap'}`}
            style={isStatic ? { transform: 'rotate(45deg)' } : undefined}
          >
            <rect
              x="-60"
              y="-18"
              width="120"
              height="36"
              rx="18"
              ry="18"
              stroke={color}
              strokeWidth="3"
            />
          </g>

          {/* Capsule 2: Nominal 90 deg */}
          <g
            className={`logo-capsule logo-cap-2 ${isStatic ? '' : 'animate-cap'}`}
            style={isStatic ? { transform: 'rotate(90deg)' } : undefined}
          >
            <rect
              x="-60"
              y="-18"
              width="120"
              height="36"
              rx="18"
              ry="18"
              stroke={color}
              strokeWidth="3"
            />
          </g>

          {/* Capsule 3: Nominal 135 deg */}
          <g
            className={`logo-capsule logo-cap-3 ${isStatic ? '' : 'animate-cap'}`}
            style={isStatic ? { transform: 'rotate(135deg)' } : undefined}
          >
            <rect
              x="-60"
              y="-18"
              width="120"
              height="36"
              rx="18"
              ry="18"
              stroke={color}
              strokeWidth="3"
            />
          </g>
        </g>
      </svg>
    </span>
  );
}

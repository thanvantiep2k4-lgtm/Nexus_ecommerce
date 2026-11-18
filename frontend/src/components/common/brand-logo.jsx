import React from 'react';

/**
 * Logo NexusMart: chữ N gấp ruy-băng 4 màu + chữ "nexusmart".
 * Vẽ inline SVG để luôn sắc nét và dùng đúng font của trang.
 */
export const BrandMark = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path d="M7 8h9v32H7z" fill="#EF4444" />
    <path d="M7 8h9l25 32h-9z" fill="#2563EB" />
    <path d="M32 8h9v32h-9z" fill="#16A34A" />
    <path d="M32 40h9l-9-11.5z" fill="#F59E0B" />
    <path d="M7 8h9l-9 11.5z" fill="#F59E0B" opacity="0.9" />
  </svg>
);

const BrandLogo = ({ size = 36, className = '' }) => (
  <span className={`nx-logo ${className}`}>
    <BrandMark size={size} />
    <span className="nx-logo__word">
      nexus<span className="nx-logo__accent">mart</span>
    </span>
    <span className="visually-hidden">NexusMart</span>
  </span>
);

export default BrandLogo;

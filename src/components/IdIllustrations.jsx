// Simple example drawings for the apply form. Colors follow the app palette.

export function IdCardArt({ className = '' }) {
  return (
    <svg viewBox="0 0 240 150" className={className} role="img" aria-label="Example of a valid ID photo">
      <rect x="6" y="6" width="228" height="138" rx="12" fill="#FFFDF8" stroke="#1F5C46" strokeWidth="3" />
      <rect x="6" y="6" width="228" height="30" rx="12" fill="#1F5C46" />
      <rect x="6" y="24" width="228" height="12" fill="#1F5C46" />
      <rect x="20" y="15" width="70" height="7" rx="3.5" fill="#E3EFE8" />
      <rect x="168" y="15" width="52" height="7" rx="3.5" fill="#E3EFE8" opacity=".6" />
      {/* photo */}
      <rect x="20" y="48" width="58" height="72" rx="6" fill="#E3EFE8" />
      <circle cx="49" cy="74" r="13" fill="#1F5C46" opacity=".75" />
      <path d="M27 120c2-17 12-25 22-25s20 8 22 25z" fill="#1F5C46" opacity=".75" />
      {/* lines */}
      <rect x="92" y="52" width="104" height="9" rx="4.5" fill="#1D1B16" opacity=".8" />
      <rect x="92" y="70" width="128" height="6" rx="3" fill="#8F887C" opacity=".55" />
      <rect x="92" y="84" width="96" height="6" rx="3" fill="#8F887C" opacity=".55" />
      <rect x="92" y="98" width="112" height="6" rx="3" fill="#8F887C" opacity=".55" />
      <rect x="92" y="114" width="60" height="6" rx="3" fill="#8F887C" opacity=".35" />
      {/* corner guides */}
      <g stroke="#B7791F" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M2 18V2h16" /><path d="M222 2h16v16" /><path d="M238 132v16h-16" /><path d="M18 148H2v-16" />
      </g>
    </svg>
  )
}

export function SelfieArt({ className = '' }) {
  return (
    <svg viewBox="0 0 240 150" className={className} role="img" aria-label="Example of a selfie holding your ID">
      <rect x="6" y="6" width="228" height="138" rx="12" fill="#E3EFE8" />
      {/* person */}
      <path d="M58 150c4-30 22-44 46-44s42 14 46 44z" fill="#1F5C46" />
      <circle cx="104" cy="66" r="27" fill="#C9A27E" />
      <path d="M77 62c0-20 12-31 27-31s27 11 27 31c-6-9-15-13-27-13s-21 4-27 13z" fill="#1D1B16" />
      <circle cx="95" cy="68" r="2.6" fill="#1D1B16" />
      <circle cx="113" cy="68" r="2.6" fill="#1D1B16" />
      <path d="M97 80c4 4 10 4 14 0" stroke="#1D1B16" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {/* arm + hand */}
      <path d="M140 150c2-20 8-36 20-48" stroke="#1F5C46" strokeWidth="18" strokeLinecap="round" fill="none" />
      <circle cx="163" cy="98" r="9" fill="#C9A27E" />
      {/* ID card held up */}
      <g transform="rotate(-8 186 86)">
        <rect x="150" y="60" width="74" height="48" rx="6" fill="#FFFDF8" stroke="#1F5C46" strokeWidth="2.5" />
        <rect x="150" y="60" width="74" height="11" rx="5" fill="#1F5C46" />
        <rect x="157" y="76" width="18" height="24" rx="3" fill="#E3EFE8" />
        <circle cx="166" cy="85" r="4.5" fill="#1F5C46" opacity=".75" />
        <rect x="180" y="78" width="36" height="4" rx="2" fill="#1D1B16" opacity=".8" />
        <rect x="180" y="87" width="38" height="3" rx="1.5" fill="#8F887C" opacity=".6" />
        <rect x="180" y="94" width="28" height="3" rx="1.5" fill="#8F887C" opacity=".6" />
      </g>
      {/* check */}
      <circle cx="28" cy="28" r="12" fill="#1F5C46" />
      <path d="M22 28l4 4 8-8" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

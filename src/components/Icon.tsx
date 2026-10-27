import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

// Line icons used across the app (replaces emoji). 24×24 grid, stroke only.
export type IconName =
  | 'bell'
  | 'lock'
  | 'unlock'
  | 'navigate'
  | 'pin'
  | 'shield'
  | 'settings'
  | 'plus'
  | 'check'
  | 'chevron-right'
  | 'chevron-left'
  | 'fingerprint'
  | 'mic'
  | 'phone'
  | 'users'
  | 'list'
  | 'card'
  | 'logout'
  | 'refresh'
  | 'trash'
  | 'edit'
  | 'x';

export function Icon({
  name,
  size = 24,
  color = '#F5F5F2',
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'bell' && (<><Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" {...p} /><Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" {...p} /></>)}
      {name === 'lock' && (<><Rect x="4" y="11" width="16" height="10" rx="2" {...p} /><Path d="M8 11V7a4 4 0 0 1 8 0v4" {...p} /></>)}
      {name === 'unlock' && (<><Rect x="4" y="11" width="16" height="10" rx="2" {...p} /><Path d="M8 11V7a4 4 0 0 1 7.5-2" {...p} /></>)}
      {name === 'navigate' && <Path d="M3 11l18-8-8 18-2-8-8-2z" {...p} />}
      {name === 'pin' && (<><Path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" {...p} /><Circle cx="12" cy="9" r="2.5" {...p} /></>)}
      {name === 'shield' && <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" {...p} />}
      {name === 'settings' && (<><Circle cx="12" cy="12" r="3" {...p} /><Path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" {...p} /></>)}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...p} />}
      {name === 'check' && <Path d="M5 12l5 5 9-10" {...p} />}
      {name === 'chevron-right' && <Path d="M9 18l6-6-6-6" {...p} />}
      {name === 'chevron-left' && <Path d="M15 18l-6-6 6-6" {...p} />}
      {name === 'fingerprint' && (<><Path d="M12 11c0 3.5-1 6.5-2.5 9" {...p} /><Path d="M8.5 6.5A5 5 0 0 1 17 10c0 2.5-.3 4.8-1 7" {...p} /><Path d="M6 9.5c0-.6.1-1.2.3-1.8" {...p} /><Path d="M5.5 14c.3-1.2.5-2.5.5-4" {...p} /><Path d="M14 13c0 3-.6 5.5-1.5 7.5" {...p} /><Path d="M9 10a3 3 0 0 1 6 0" {...p} /></>)}
      {name === 'mic' && (<><Rect x="9" y="3" width="6" height="11" rx="3" {...p} /><Path d="M5 11a7 7 0 0 0 14 0M12 18v3" {...p} /></>)}
      {name === 'phone' && (<><Rect x="6" y="2" width="12" height="20" rx="3" {...p} /><Path d="M11 18h2" {...p} /></>)}
      {name === 'users' && (<><Circle cx="9" cy="8" r="3.5" {...p} /><Path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" {...p} /></>)}
      {name === 'list' && <Path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" {...p} />}
      {name === 'card' && (<><Rect x="2" y="5" width="20" height="14" rx="2" {...p} /><Path d="M2 10h20" {...p} /></>)}
      {name === 'logout' && <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" {...p} />}
      {name === 'refresh' && <Path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" {...p} />}
      {name === 'trash' && <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" {...p} />}
      {name === 'edit' && <Path d="M4 20h4L19 9l-4-4L4 16v4z" {...p} />}
      {name === 'x' && <Path d="M18 6L6 18M6 6l12 12" {...p} />}
    </Svg>
  );
}

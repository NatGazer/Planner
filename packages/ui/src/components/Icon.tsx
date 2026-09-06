import type { SVGProps } from 'react';

/**
 * One stroked icon set, drawn on a 24-unit grid with a 1.6 stroke so glyphs
 * sit optically level with text at every size. No icon font, no sprite sheet,
 * no network request.
 */
export type IconName =
  | 'cube' | 'fan' | 'bolt' | 'drop' | 'gear' | 'flame' | 'wave' | 'shield' | 'truck' | 'leaf' | 'chip' | 'lift'
  | 'dashboard' | 'tasks' | 'equipment' | 'rules' | 'history' | 'activity' | 'types'
  | 'clock' | 'calendar' | 'alert' | 'check' | 'checkCircle' | 'chevronRight' | 'chevronLeft' | 'chevronDown'
  | 'plus' | 'search' | 'filter' | 'close' | 'camera' | 'image' | 'comment' | 'user' | 'signOut'
  | 'pin' | 'copy' | 'edit' | 'archive' | 'power' | 'refresh' | 'arrowRight' | 'arrowUpRight' | 'sparkle'
  | 'sun' | 'moon' | 'info' | 'trend' | 'grid' | 'list' | 'shuffle' | 'lock';

const PATHS: Record<IconName, string> = {
  cube: 'M12 2.8 20.2 7v10L12 21.2 3.8 17V7Zm0 0v18.4M20.2 7 12 11.6 3.8 7',
  fan: 'M12 12a4.2 4.2 0 0 0 4.2-4.2c0-2-1.9-3.6-4.2-3.6S7.8 5.8 7.8 7.8M12 12a4.2 4.2 0 0 1 1.6 5.7c-1 1.7-3.4 2.2-5.3 1s-2.6-3.5-1.6-5.2M12 12a4.2 4.2 0 0 1-5.8 1.5M12 12a4.2 4.2 0 0 0 4.2 3.9M12 12l5.7-2.4c1.8-.8 3.9.3 4.4 2.3M12 12c1.4 1 1.8 3 .9 4.6',
  bolt: 'M13.2 2.5 4.8 13.4h6L10.4 21.5l8.8-11.2h-6.2Z',
  drop: 'M12 2.8c3.4 4 6.2 7.2 6.2 10.6a6.2 6.2 0 1 1-12.4 0c0-3.4 2.8-6.6 6.2-10.6Z',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm8-3.2c0 .6-.06 1.1-.16 1.7l2 1.5-2 3.5-2.4-1a8 8 0 0 1-2.9 1.7l-.35 2.6h-4l-.35-2.6a8 8 0 0 1-2.9-1.7l-2.4 1-2-3.5 2-1.5a8.4 8.4 0 0 1 0-3.4l-2-1.5 2-3.5 2.4 1a8 8 0 0 1 2.9-1.7L10 2h4l.35 2.6a8 8 0 0 1 2.9 1.7l2.4-1 2 3.5-2 1.5c.1.6.16 1.1.16 1.7Z',
  flame: 'M12 22c3.6 0 6.4-2.6 6.4-6 0-4.3-4-6.6-4.9-11-2 1.6-3.4 3.7-3.4 5.7 0 1.4.5 2.2.5 3 0 .9-.7 1.6-1.6 1.6-1 0-1.7-.8-1.7-2.1-1 1.2-1.7 2.6-1.7 4.2 0 3.2 2.9 4.6 6.4 4.6Z',
  wave: 'M2.5 9.5c2-2.4 4-2.4 6 0s4 2.4 6 0 4-2.4 6 0M2.5 15.5c2-2.4 4-2.4 6 0s4 2.4 6 0 4-2.4 6 0',
  shield: 'M12 2.6 20 5.6v6.1c0 4.6-3.2 8.3-8 9.7-4.8-1.4-8-5.1-8-9.7V5.6Zm-3.2 9.4 2.4 2.4 4.4-4.6',
  truck: 'M2.8 6.4h10.4v9.8H2.8Zm10.4 3.2h3.6l3.4 3.2v3.4h-7Zm-6.6 9.2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10.4 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  leaf: 'M20 4c0 9.4-4.4 14.6-11 14.6-2.4 0-4.2-1-4.2-1S4.2 4 20 4ZM8.5 19.5C10 14.4 13 10.6 17.4 8.2',
  chip: 'M7.2 7.2h9.6v9.6H7.2ZM9.6 3.6v3.6m4.8-3.6v3.6M9.6 16.8v3.6m4.8-3.6v3.6M3.6 9.6h3.6m-3.6 4.8h3.6m9.6-4.8h3.6m-3.6 4.8h3.6',
  lift: 'M4 4v16h3M9 20h11M7 20V8.5h5.5L16 13v7M9.5 11h3.4M13 4.5h6M16 4.5v4',
  dashboard: 'M3.5 3.5h7.2v6.4H3.5Zm9.8 0h7.2v4H13.3ZM3.5 12.5h7.2v8H3.5Zm9.8-1h7.2v9h-7.2Z',
  tasks: 'M4 6.5 5.8 8.3 9.4 4.7M4 17.5l1.8 1.8 3.6-3.6M12.5 6.5h7.8M12.5 17.5h7.8M12.5 12h7.8M4 12h5',
  equipment: 'M4 20V9.5l8-5.5 8 5.5V20Zm5-6.5h6V20H9Z',
  rules: 'M6 3.5h9l3.5 3.5v13.5H6Zm9 0V7h3.5M9.2 12h6m-6 3.6h6M9.2 8.4h2.6',
  history: 'M3.8 12a8.2 8.2 0 1 0 2.6-6M3.5 4.5V10h5.5M12 7.6V12l3 1.8',
  activity: 'M3 12h3.6l2.4-6.4 4 13L15.6 12H21',
  types: 'M12 2.8 21 7.4 12 12 3 7.4Zm9 9.2-9 4.6-9-4.6m18 4.8-9 4.6-9-4.6',
  clock: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7v5.2l3.4 2',
  calendar: 'M4 6.5h16v14H4Zm0 4.5h16M8.5 3.5v4m7-4v4',
  alert: 'M12 3.4 21.2 20H2.8ZM12 9.6v4.6m0 2.8v.1',
  check: 'm4.5 12.5 5 5 10-11',
  checkCircle: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Zm-4-8.8 3 3 5-5.4',
  chevronRight: 'm9.5 5 7 7-7 7',
  chevronLeft: 'm14.5 5-7 7 7 7',
  chevronDown: 'm5 9.5 7 7 7-7',
  plus: 'M12 4.5v15m-7.5-7.5h15',
  search: 'M10.8 17.6a6.8 6.8 0 1 0 0-13.6 6.8 6.8 0 0 0 0 13.6Zm5-1.8 4.2 4.2',
  filter: 'M3.5 5.5h17l-6.6 7.8v6.2l-3.8-2v-4.2Z',
  close: 'm5.5 5.5 13 13m0-13-13 13',
  camera: 'M3.5 7.8h3.8L9 5.2h6l1.7 2.6h3.8v11.4H3.5Zm8.5 9.4a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4Z',
  image: 'M3.5 4.8h17v14.4h-17Zm0 10.4 4.6-4.4 4 3.6 3.4-3 4.5 4.2M8.6 9.8a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z',
  comment: 'M20.5 12.4c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.42L4 20.8l1.5-3.6a6.9 6.9 0 0 1-2-4.8c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2Z',
  user: 'M12 11.6a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8ZM4.6 20.4c.8-3.5 3.8-5.6 7.4-5.6s6.6 2.1 7.4 5.6',
  signOut: 'M14.5 8V4.5H4v15h10.5V16M10 12h10.5m0 0-3.4-3.4M20.5 12l-3.4 3.4',
  pin: 'M12 21c4-4.8 6-8.1 6-10.9A6 6 0 0 0 6 10.1C6 12.9 8 16.2 12 21Zm0-8.4a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  copy: 'M8.5 8.5h11v11h-11Zm-4 7v-11h11',
  edit: 'M4.5 19.5h3.4L19 8.4a2.4 2.4 0 0 0-3.4-3.4L4.5 16.1Zm10-13.4 3.4 3.4',
  archive: 'M3.5 4.5h17V9h-17Zm1.4 4.5h14.2v10.5H4.9ZM9.6 13h4.8',
  power: 'M12 3.6v8.2M7.2 6.6a7.4 7.4 0 1 0 9.6 0',
  refresh: 'M20 12a8 8 0 1 1-2.4-5.7M20.5 3.8v4.4h-4.4',
  arrowRight: 'M4.5 12h15m0 0-5.5-5.5M19.5 12 14 17.5',
  arrowUpRight: 'M7 17 17 7m0 0H8.4M17 7v8.6',
  sparkle: 'M12 3.2 13.9 9l5.8 1.9-5.8 1.9L12 18.6l-1.9-5.8L4.3 11 10.1 9ZM18.6 3v3.2m1.6-1.6H17M5.4 17v2.6m1.3-1.3H4.1',
  sun: 'M12 16.4a4.4 4.4 0 1 0 0-8.8 4.4 4.4 0 0 0 0 8.8ZM12 2.6v2.2m0 14.4v2.2M2.6 12h2.2m14.4 0h2.2M5.3 5.3l1.6 1.6m10.2 10.2 1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6',
  moon: 'M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6a8.6 8.6 0 1 0 10.6 10.6Z',
  info: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Zm0-9.3v5.1m0-8v.1',
  trend: 'M3.5 16.5 9 11l3.5 3.5L20.5 6.5m0 0h-5m5 0v5',
  grid: 'M4 4h6.4v6.4H4Zm9.6 0H20v6.4h-6.4ZM4 13.6h6.4V20H4Zm9.6 0H20V20h-6.4Z',
  list: 'M4 6.5h16M4 12h16M4 17.5h16',
  shuffle: 'M4 6.5h3.4l9.2 11H21M4 17.5h3.4l3-3.6M14 8.5l2.6-2H21m0 0-3-3m3 3-3 3m0 11 3-3-3-3',
  lock: 'M6.5 10.5h11v9.5h-11Zm2.2 0V7.8a3.3 3.3 0 0 1 6.6 0v2.7',
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, strokeWidth = 1.6, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name] ?? PATHS.cube} />
    </svg>
  );
}

export const TYPE_ICONS: IconName[] = ['cube', 'fan', 'bolt', 'drop', 'gear', 'flame', 'wave', 'shield', 'truck', 'leaf', 'chip', 'lift'];

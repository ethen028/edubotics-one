import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { PATHS, type IconName } from './icon-paths';

export function Icon({ name, size = 20, color }: { name: string; size?: number; color: string }) {
  const d = PATHS[(name in PATHS ? name : 'grid') as IconName];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d={d} />
    </Svg>
  );
}

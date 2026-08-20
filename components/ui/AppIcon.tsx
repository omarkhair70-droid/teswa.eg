import type { ComponentProps } from 'react';
import { Bell, Check, ChevronLeft, ChevronRight, Globe2, Info, Lock, Moon, Palette, Shield, Sun, User, X } from 'lucide-react-native';

import { useTeswaColors } from '@/lib/theme/use-teswa-theme';

const icons = {
  bell: Bell,
  check: Check,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  globe: Globe2,
  info: Info,
  lock: Lock,
  moon: Moon,
  palette: Palette,
  shield: Shield,
  sun: Sun,
  user: User,
  x: X,
} as const;

export type AppIconName = keyof typeof icons;

type AppIconProps = Omit<ComponentProps<typeof Bell>, 'color'> & {
  name: AppIconName;
  color?: string;
};

export function AppIcon({ name, color, size = 20, strokeWidth = 2, ...props }: AppIconProps) {
  const colors = useTeswaColors();
  const Icon = icons[name];
  return <Icon color={color ?? colors.text} size={size} strokeWidth={strokeWidth} {...props} />;
}

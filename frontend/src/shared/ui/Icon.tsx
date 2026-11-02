import {
  ArrowRight,
  ArrowLeft,
  Bell,
  Buildings,
  CalendarBlank,
  CaretDown,
  Check,
  Clock,
  Compass,
  Database,
  Heart,
  Leaf,
  List,
  Lock,
  MapTrifold,
  MapPin,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  ShieldCheck,
  Stack,
  Star,
  Sun,
  Moon,
  Trash,
  User,
  WarningCircle,
  X,
  ArrowsClockwise,
  LockOpen,
  Eye,
  SlidersHorizontal,
  NavigationArrow,
  ShareNetwork,
  Tag,
  CurrencyCircleDollar,
  ForkKnife,
  ChatCircle,
  type Icon as PhosphorIcon
} from '@phosphor-icons/react';

const icons: Record<string, PhosphorIcon> = {
  compass: Compass,
  pin: MapPin,
  map: MapTrifold,
  arrow: ArrowRight,
  arrowLeft: ArrowLeft,
  heart: Heart,
  sun: Sun,
  moon: Moon,
  calendar: CalendarBlank,
  clock: Clock,
  star: Star,
  search: MagnifyingGlass,
  check: Check,
  lock: Lock,
  unlock: LockOpen,
  user: User,
  building: Buildings,
  shield: ShieldCheck,
  bell: Bell,
  layers: Stack,
  leaf: Leaf,
  plus: Plus,
  x: X,
  refresh: ArrowsClockwise,
  chevronDown: CaretDown,
  database: Database,
  alert: WarningCircle,
  trash: Trash,
  menu: List,
  edit: PencilSimple,
  eye: Eye,
  filter: SlidersHorizontal,
  route: NavigationArrow,
  share: ShareNetwork,
  tag: Tag,
  price: CurrencyCircleDollar,
  food: ForkKnife,
  chat: ChatCircle,
};

export interface IconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, size = 20, className = '', style }: IconProps) {
  const Glyph = icons[name] ?? Compass;
  return <Glyph size={size} weight="regular" className={className} style={style} aria-hidden="true" />;
}


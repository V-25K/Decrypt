import { cn } from '../utils';

export const tabButtonClass = (isActive: boolean) =>
  cn(
    'btn-3d rounded-lg px-2 py-1 text-xs font-black uppercase',
    isActive ? 'btn-secondary btn-pressed' : 'btn-neutral'
  );

export const navItemClass = (isActive: boolean) =>
  cn(
    'nav-item-btn btn-3d flex h-12 min-w-[46px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1',
    isActive ? 'btn-secondary nav-item-selected btn-pressed' : 'btn-neutral'
  );

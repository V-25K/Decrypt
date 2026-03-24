import { cn } from '../utils';

export const tabButtonClass = (isActive: boolean) =>
  cn(
    'btn-3d rounded-lg border px-2 py-1 text-xs font-black uppercase',
    isActive ? 'btn-secondary btn-pressed' : 'btn-neutral'
  );

export const navItemClass = (isActive: boolean) =>
  cn(
    'nav-item-btn btn-3d flex h-11 w-11 shrink-0 items-center justify-center rounded-xl p-0',
    isActive ? 'btn-secondary nav-item-selected btn-pressed' : 'btn-neutral'
  );

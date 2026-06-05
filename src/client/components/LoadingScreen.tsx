import { cn } from '../utils';

type LoadingScreenProps = {
  className?: string;
};

export const LoadingScreen = ({ className }: LoadingScreenProps) => {
  return (
    <section
      aria-live="polite"
      data-testid="loading-screen"
      className={cn(
        'loading-shell flex min-h-full flex-1 items-center justify-center px-5 py-6',
        className
      )}
    >
      <img
        data-testid="loading-glass"
        src="/loading_glass.png"
        alt=""
        loading="eager"
        decoding="async"
        fetchPriority="high"
        className="loading-glass-mark"
      />
    </section>
  );
};

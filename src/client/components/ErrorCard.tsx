type ErrorCardProps = {
  error: string;
  onRetry: () => void;
  retryLabel?: string;
};

export const ErrorCard = ({
  error,
  onRetry,
  retryLabel = 'Retry',
}: ErrorCardProps) => (
  <div className="hub-card app-surface rounded-lg border app-border p-3 text-center">
    <p className="text-xs font-semibold text-red-500">{error}</p>
    <button
      type="button"
      className="btn-3d btn-neutral mt-2 px-3 py-1 text-[11px] font-bold uppercase"
      onClick={onRetry}
    >
      {retryLabel}
    </button>
  </div>
);

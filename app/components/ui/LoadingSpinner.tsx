type LoadingSpinnerProps = {
  label?: string;
};

export function LoadingSpinner({ label = 'Loading…' }: LoadingSpinnerProps) {
  return (
    <div className="loading-spinner-container" role="status" aria-live="polite">
      <div className="loading-spinner-circle" aria-hidden="true" />
      <div className="loading-spinner-text">{label}</div>
    </div>
  );
}






type AlertProps = {
  type: 'success' | 'error';
  message: string;
};

export function Alert({ type, message }: AlertProps) {
  return (
    <div className={`app-alert app-alert-${type}`}>
      <span className="app-alert-icon" aria-hidden="true">
        {type === 'success' ? '✓' : '!'}
      </span>
      <span className="app-alert-text">{message}</span>
    </div>
  );
}






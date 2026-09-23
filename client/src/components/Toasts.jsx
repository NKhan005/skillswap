import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

const STYLES = {
  success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
  warning: { cls: 'border-amber-200 bg-amber-50 text-amber-800', Icon: AlertTriangle },
  error: { cls: 'border-rose-200 bg-rose-50 text-rose-800', Icon: AlertTriangle },
  info: { cls: 'border-slate-200 bg-white text-slate-700', Icon: Info },
};

/** Live region so realtime events are announced, not just shown. */
export default function Toasts() {
  const { toasts, dismiss } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map(({ id, message, type }) => {
        const { cls, Icon } = STYLES[type] || STYLES.info;
        return (
          <div
            key={id}
            className={`animate-fade-up pointer-events-auto flex items-start gap-2.5 rounded-2xl border px-4 py-3 shadow-lg ${cls}`}
          >
            <Icon size={18} className="mt-0.5 shrink-0" />
            <p className="flex-1 text-sm">{message}</p>
            <button
              type="button"
              onClick={() => dismiss(id)}
              className="shrink-0 rounded-lg p-0.5 opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

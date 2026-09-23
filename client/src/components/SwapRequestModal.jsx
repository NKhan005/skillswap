import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Coins, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ErrorNote } from './ui';

/**
 * Resolve a skill name to the exact casing used in a skill list.
 * The matching engine reports overlaps in normalised lowercase ("guitar"),
 * while the <option> values carry the member's own casing ("Guitar"), so a
 * prefilled name has to be mapped back or the select silently shows nothing.
 */
function canonicalName(skills, name) {
  if (!name) return '';
  const wanted = String(name).trim().toLowerCase();
  return skills?.find((s) => s.name.trim().toLowerCase() === wanted)?.name || '';
}

/**
 * Compose a swap request. Direct swaps need a skill offered back; credit swaps
 * debit the wallet, so the balance is checked before the button is enabled.
 */
export default function SwapRequestModal({ open, onClose, target, prefill = {}, onSubmit }) {
  const { user } = useAuth();

  const [type, setType] = useState(prefill.type || 'direct');
  const [skillRequested, setSkillRequested] = useState('');
  const [skillOffered, setSkillOffered] = useState('');
  const [hours, setHours] = useState(1);
  const [message, setMessage] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  // Synchronous double-submit guard. The `busy` state cannot do this job:
  // two submit events in the same tick both read the pre-render value and
  // both get through, creating the request twice.
  const submittingRef = useRef(false);
  // Whatever had focus when the dialog opened, so it can be handed back.
  const restoreFocusRef = useRef(null);

  // Re-seed the form each time the modal opens for a different person.
  useEffect(() => {
    if (!open) return;
    setType(prefill.type || 'direct');
    setSkillRequested(canonicalName(target?.skillsOffered, prefill.skillRequested) || target?.skillsOffered?.[0]?.name || '');
    setSkillOffered(canonicalName(user?.skillsOffered, prefill.skillOffered) || user?.skillsOffered?.[0]?.name || '');
    setHours(prefill.hours || 1);
    setMessage('');
    setMeetingLocation('');
    setError('');
    submittingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?._id]);

  /**
   * Dialog behaviour: Escape closes, the page behind does not scroll, and
   * focus moves into the dialog and stays there.
   *
   * Moving focus matters for more than screen readers: left on the button
   * behind the overlay, a stray keystroke (a space activates a focused
   * button) re-fires it straight through the open dialog.
   */
  useEffect(() => {
    if (!open) return undefined;

    restoreFocusRef.current = document.activeElement;
    // Let the dialog paint before reaching for the field inside it.
    const focusTimer = setTimeout(() => firstFieldRef.current?.focus(), 0);

    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) || []
      ).filter((el) => !el.disabled && el.offsetParent !== null);

    const onKey = (e) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab') return undefined;

      // Wrap Tab at both ends so focus cannot walk out of the dialog.
      const items = focusable();
      if (items.length === 0) return undefined;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return undefined;
    };

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || !target) return null;

  const cost = Number(hours) || 0;
  const balance = user?.wallet?.balance ?? 0;
  const shortOnCredits = type === 'credit' && cost > balance;

  const submit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return undefined;
    setError('');

    if (!skillRequested) return setError('Choose the skill you want to learn');
    if (type === 'direct' && !skillOffered) return setError('Choose the skill you will teach in return');
    if (shortOnCredits) return setError(`You need ${cost} credits but have ${balance}`);

    submittingRef.current = true;
    setBusy(true);
    try {
      await onSubmit({
        providerId: target._id,
        type,
        skillRequested,
        skillOffered: type === 'direct' ? skillOffered : undefined,
        hours: Number(hours),
        message,
        meetingLocation,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
    return undefined;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="swap-modal-title"
        className="animate-fade-up max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="swap-modal-title" className="font-semibold text-slate-900">
            Request a swap with {target.name}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="grid gap-4 px-5 py-5">
          {/* Swap type */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'direct', label: 'Direct swap', hint: 'Teach each other', Icon: ArrowRightLeft },
              { id: 'credit', label: 'Time credits', hint: `${cost} credit${cost === 1 ? '' : 's'}`, Icon: Coins },
            ].map(({ id, label, hint, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setType(id)}
                className={`rounded-xl border p-3 text-left transition ${
                  type === id
                    ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Icon size={18} className={type === id ? 'text-brand-600' : 'text-slate-400'} />
                <p className="mt-1.5 text-sm font-semibold text-slate-800">{label}</p>
                <p className="text-xs text-slate-500">{hint}</p>
              </button>
            ))}
          </div>

          <div>
            <label className="label" htmlFor="skill-requested">
              You want to learn
            </label>
            <select
              id="skill-requested"
              ref={firstFieldRef}
              className="input"
              value={skillRequested}
              onChange={(e) => setSkillRequested(e.target.value)}
            >
              <option value="">Select a skill</option>
              {(target.skillsOffered || []).map((s) => (
                <option key={s._id || s.name} value={s.name}>
                  {s.name} ({s.experienceLevel})
                </option>
              ))}
            </select>
          </div>

          {type === 'direct' && (
            <div>
              <label className="label" htmlFor="skill-offered">
                You will teach in return
              </label>
              <select
                id="skill-offered"
                className="input"
                value={skillOffered}
                onChange={(e) => setSkillOffered(e.target.value)}
              >
                <option value="">Select a skill</option>
                {(user?.skillsOffered || []).map((s) => (
                  <option key={s._id || s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              {(user?.skillsOffered || []).length === 0 && (
                <p className="mt-1.5 text-xs text-amber-600">
                  Add a skill you can teach on your profile first.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="hours">
                Hours
              </label>
              <input
                id="hours"
                type="number"
                min="0.5"
                max="12"
                step="0.5"
                className="input"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="meeting">
                Where
              </label>
              <input
                id="meeting"
                className="input"
                placeholder="Cafe, campus, online"
                value={meetingLocation}
                onChange={(e) => setMeetingLocation(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="swap-message">
              Message
            </label>
            <textarea
              id="swap-message"
              rows={3}
              className="input resize-none"
              placeholder={`Hi ${target.name}, I would love to learn ${skillRequested || 'this skill'}...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          {type === 'credit' && (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm">
              <span className="text-emerald-800">
                Cost: <strong>{cost}</strong> credit{cost === 1 ? '' : 's'}
              </span>
              <span className={shortOnCredits ? 'font-semibold text-rose-600' : 'text-emerald-700'}>
                Balance: {balance}
              </span>
            </div>
          )}

          <ErrorNote>{error}</ErrorNote>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={busy || shortOnCredits} className="btn-primary flex-1">
              {busy ? 'Sending...' : 'Send request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

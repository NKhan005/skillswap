import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Send, ArrowLeft, MessageSquare, Circle, Info } from 'lucide-react';
import { endpoints } from '../api/client';
import { connectSocket, emit, on } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import { Avatar, Chip, EmptyState, Spinner } from '../components/ui';

/** Conversation list on the left, live thread on the right (feature 8). */
export default function Messages() {
  const { swapId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [typingName, setTypingName] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);

  const bottomRef = useRef(null);
  const typingTimer = useRef(null);

  const active = conversations.find((c) => String(c.swapId) === String(swapId));

  // Conversation list.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await endpoints.messages.conversations();
        setConversations(data.conversations);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Socket lifecycle: one connection, re-joined per thread.
  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return undefined;

    setConnected(socket.connected);

    const offs = [
      on('connect', () => setConnected(true)),
      on('disconnect', () => setConnected(false)),
      on('receive_message', (msg) => {
        // Only append messages for the thread currently open.
        if (String(msg.swap) !== String(swapId)) return;
        setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]));
      }),
      on('typing', ({ name }) => {
        setTypingName(name);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTypingName(''), 2500);
      }),
      on('stop_typing', () => setTypingName('')),
    ];

    return () => {
      offs.forEach((off) => off());
      clearTimeout(typingTimer.current);
    };
  }, [swapId]);

  // Join the room and load history whenever the thread changes.
  useEffect(() => {
    if (!swapId) {
      setMessages([]);
      return undefined;
    }

    setThreadLoading(true);
    emit('join_room', { swapId });
    emit('mark_read', { swapId });

    (async () => {
      try {
        const { data } = await endpoints.messages.thread(swapId);
        setMessages(data.messages);
        setConversations((prev) =>
          prev.map((c) => (String(c.swapId) === String(swapId) ? { ...c, unread: 0 } : c))
        );
      } finally {
        setThreadLoading(false);
      }
    })();

    return () => emit('leave_room', { swapId });
  }, [swapId]);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || !swapId) return;

    setDraft('');
    emit('stop_typing', { swapId });

    emit('send_message', { swapId, body }, (res) => {
      // Fall back to REST if the socket could not deliver it.
      if (!res?.ok) endpoints.messages.send(swapId, body).catch(() => {});
    });
  };

  const onDraftChange = (e) => {
    setDraft(e.target.value);
    if (swapId) emit('typing', { swapId });
  };

  // Enter sends. Handled explicitly rather than relying on the form's implicit
  // submission, and preventDefault stops the two paths firing together.
  const onDraftKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (loading) return <Spinner label="Loading conversations" />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Messages</h1>
      <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
        Arrange the details before you swap.
        <span className="inline-flex items-center gap-1 text-xs">
          <Circle size={7} className={connected ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300'} />
          {connected ? 'live' : 'offline'}
        </span>
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Conversation list */}
        <aside className={`card overflow-hidden ${swapId ? 'hidden lg:block' : ''}`}>
          {conversations.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">No conversations yet.</p>
          ) : (
            <ul className="scroll-slim max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.swapId}>
                  <Link
                    to={`/messages/${c.swapId}`}
                    className={`flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 ${
                      String(c.swapId) === String(swapId) ? 'bg-brand-50' : ''
                    }`}
                  >
                    <Avatar name={c.counterpart.name} src={c.counterpart.avatarUrl} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-800">{c.counterpart.name}</p>
                        {c.unread > 0 && (
                          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                            {c.unread}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        {c.lastMessage?.body || `Swap: ${c.skillRequested}`}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Thread */}
        <section className={`card flex h-[70vh] flex-col ${!swapId ? 'hidden lg:flex' : ''}`}>
          {!swapId ? (
            <div className="grid flex-1 place-items-center">
              <EmptyState
                icon={MessageSquare}
                title="Pick a conversation"
                description="Select someone on the left to open the thread."
              />
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <button
                  type="button"
                  onClick={() => navigate('/messages')}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={18} />
                </button>

                {active && (
                  <>
                    <Avatar name={active.counterpart.name} src={active.counterpart.avatarUrl} size={38} />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/profile/${active.counterpart._id}`}
                        className="truncate font-semibold text-slate-900 hover:text-brand-600"
                      >
                        {active.counterpart.name}
                      </Link>
                      <p className="truncate text-xs text-slate-500">
                        {active.skillRequested}
                        {active.skillOffered && ` for ${active.skillOffered}`}
                      </p>
                    </div>
                    <Chip tone="slate">{active.status}</Chip>
                  </>
                )}
              </header>

              <div className="scroll-slim flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {threadLoading ? (
                  <Spinner label="Loading messages" />
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">
                    No messages yet. Say hello and agree a time.
                  </p>
                ) : (
                  messages.map((m) => {
                    const senderId = m.sender?._id || m.sender;
                    const mine = String(senderId) === String(user.id);

                    if (m.kind === 'system') {
                      return (
                        <div key={m._id} className="flex justify-center">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                            <Info size={11} />
                            {m.body}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`animate-fade-up max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                            mine
                              ? 'rounded-br-md bg-brand-600 text-white'
                              : 'rounded-bl-md bg-slate-100 text-slate-800'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                          <p className={`mt-1 text-[10px] ${mine ? 'text-brand-200' : 'text-slate-400'}`}>
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}

                {typingName && (
                  <p className="text-xs text-slate-400 italic">{typingName} is typing...</p>
                )}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3">
                <input
                  className="input"
                  placeholder="Write a message"
                  value={draft}
                  onChange={onDraftChange}
                  onKeyDown={onDraftKeyDown}
                  aria-label="Message"
                />
                <button type="submit" disabled={!draft.trim()} className="btn-primary px-4">
                  <Send size={16} />
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

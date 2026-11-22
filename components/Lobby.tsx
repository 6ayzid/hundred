'use client';

import React, { useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Crown,
  LogIn,
  LogOut,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { PlayingCard } from '@/components/PlayingCard';
import { SeatAvatarGraphic } from '@/components/SeatHub';
import { VoiceBar } from '@/components/VoiceBar';
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from '@/lib/gameEngine';
import { unlockAudio } from '@/lib/soundEngine';
import {
  type CardValue,
  type ChatMessage,
  type GameAction,
  type GameState,
  type SeatIndex,
  type SpeakingMap,
  type SyncMode,
} from '@/lib/types';

const PREVIEW_CARDS: CardValue[] = [1, 40, 70, 90, 100];

export interface LobbyProps {
  nickname: string;
  onNicknameChange: (name: string) => void;
  joinCodeInput: string;
  onJoinCodeInputChange: (val: string) => void;
  activeRoomCode: string | null;
  roomNotice?: string | null;
  onDismissNotice?: () => void;
  state: GameState | null;
  clientId: string;
  mySeatIndex: SeatIndex | null;
  hostSeatIndex: SeatIndex | null;
  syncMode: SyncMode;
  supabaseConfigured: boolean;
  livekitConfigured: boolean;
  lowDataMode: boolean;
  onToggleLowDataMode: () => void;
  rainEnabled: boolean;
  onToggleRain: () => void;
  chatMessages: ChatMessage[];
  onSendChat: (text: string, isBanter?: boolean) => void;
  onSpeakingMapChange: (speaking: SpeakingMap) => void;
  onEnterRoom: (roomCode: string, mode?: 'create' | 'join') => void;
  onLeaveRoom: () => void;
  onDispatchAction: (action: GameAction) => void;
  availableCardScans?: number[];
}

export function Lobby({
  nickname,
  onNicknameChange,
  joinCodeInput,
  onJoinCodeInputChange,
  activeRoomCode,
  roomNotice = null,
  onDismissNotice,
  state,
  clientId,
  mySeatIndex,
  hostSeatIndex,
  syncMode,
  supabaseConfigured,
  livekitConfigured,
  lowDataMode,
  onToggleLowDataMode,
  rainEnabled,
  onToggleRain,
  chatMessages,
  onSendChat,
  onSpeakingMapChange,
  onEnterRoom,
  onLeaveRoom,
  onDispatchAction,
  availableCardScans = [],
}: LobbyProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedInviteUrl, setCopiedInviteUrl] = useState<string | null>(null);
  const [clipboardFallbackUrl, setClipboardFallbackUrl] = useState<
    string | null
  >(null);

  const scanSet = new Set(availableCardScans);
  const cloudReady = supabaseConfigured && livekitConfigured;

  const buildInviteUrl = (roomCode: string): string => {
    if (typeof window === 'undefined') return `?room=${roomCode}`;
    return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomCode)}`;
  };

  const copyInviteLink = async (roomCode: string) => {
    const inviteUrl = buildInviteUrl(roomCode);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
        setCopiedInviteUrl(inviteUrl);
        setClipboardFallbackUrl(null);
        window.setTimeout(() => setCopiedInviteUrl(null), 3000);
        return;
      }
    } catch {
      // Fall through to visible fallback input
    }
    setClipboardFallbackUrl(inviteUrl);
  };

  const ensureValidNickname = (): string | null => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setFormError('Please enter a nickname before creating or joining a room.');
      return null;
    }
    setFormError(null);
    return trimmed;
  };

  const handleCreateRoom = () => {
    unlockAudio();
    if (!ensureValidNickname()) return;
    onDismissNotice?.();
    const code = generateRoomCode();
    onJoinCodeInputChange(code);
    onEnterRoom(code, 'create');
    void copyInviteLink(code);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    unlockAudio();
    if (!ensureValidNickname()) return;
    onDismissNotice?.();
    const normalized = normalizeRoomCode(joinCodeInput);
    if (!isValidRoomCode(normalized)) {
      setFormError(
        'Enter a valid room code (for example, TNG-AB12 or a ?room=TNG-... invite link).',
      );
      return;
    }
    setFormError(null);
    onJoinCodeInputChange(normalized);
    onEnterRoom(normalized, 'join');
  };

  const isMeHost = mySeatIndex !== null && hostSeatIndex === mySeatIndex;
  const hostSeatObj =
    state && hostSeatIndex !== null ? state.seats[hostSeatIndex] : null;
  const hostDisplayName = hostSeatObj?.username || 'Host';

  const allSeatsFilled = state
    ? state.seats.every((seat) => seat.type !== 'EMPTY')
    : false;
  const emptySeatCount = state
    ? state.seats.filter((seat) => seat.type === 'EMPTY').length
    : 0;

  return (
    <div
      data-testid="lobby-root"
      data-rain-paused={lowDataMode ? 'true' : 'false'}
      className="pati-table-surface relative flex min-h-dvh w-full items-center justify-center overflow-x-hidden p-4 sm:p-8"
    >
      <div
        aria-hidden="true"
        data-testid="rain-overlay"
        data-rain-paused={lowDataMode ? 'true' : 'false'}
        className={`rain-overlay absolute inset-0 ${
          !rainEnabled ? 'rain-hidden' : ''
        } ${lowDataMode ? 'rain-paused' : ''}`}
      />

      <main className="glass-pill relative z-10 flex w-full max-w-xl flex-col items-center gap-5 rounded-3xl p-5 text-center sm:p-8">
        <header className="flex flex-col items-center">
          <h1 className="font-bangla text-4xl font-extrabold tracking-tight text-[#faf3e6] sm:text-5xl">
            হানডেট <span className="text-[#e0a943]">HUNDRED</span>
          </h1>
          <p className="mt-1.5 text-xs font-medium text-[#d8c7ae] sm:text-sm">
            4 Players • 10 Rounds • Holder of 1 starts • Min Call 50
          </p>
        </header>

        {/* Fanned Visiting Cards Showcase */}
        <div
          aria-label="Handwritten visiting cards preview"
          className="flex items-end justify-center py-1"
        >
          {PREVIEW_CARDS.map((cardValue, idx) => {
            const offset = idx - 2;
            return (
              <div
                key={cardValue}
                style={{
                  transform: `rotate(${offset * 5}deg) translateY(${Math.abs(offset) * 2.5}px)`,
                  marginLeft: idx === 0 ? 0 : -12,
                }}
              >
                <PlayingCard
                  value={cardValue}
                  size="sm"
                  useCustomScan={scanSet.has(cardValue)}
                />
              </div>
            );
          })}
        </div>

        {/* JOINING EXISTING ROOM VIA INVITE / JOIN */}
        {activeRoomCode && !state ? (
          <div
            data-testid="joining-room-card"
            className="animate-panel-enter flex w-full flex-col items-center gap-3 rounded-2xl border border-amber-300/25 bg-black/45 px-5 py-6 text-center"
          >
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-300/30 border-t-amber-300" />
            <div>
              <p className="text-sm font-bold text-[#faf3e6]">
                Joining room <span className="text-amber-300">{activeRoomCode}</span>…
              </p>
              <p className="mt-0.5 text-xs text-[#cbb89d]">
                Checking availability with the room host
              </p>
            </div>
            <button
              type="button"
              onClick={onLeaveRoom}
              className="mt-1 rounded-xl border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold text-[#f0dfc2] transition hover:bg-white/20"
            >
              Cancel
            </button>
          </div>
        ) : !activeRoomCode || !state ? (
          <div className="w-full space-y-4 text-left">
            {roomNotice && (
              <div
                role="status"
                data-testid="lobby-notice"
                className="animate-panel-enter flex items-center justify-between gap-2 rounded-xl border border-amber-400/45 bg-amber-950/65 px-3.5 py-2.5 text-xs font-medium text-amber-100"
              >
                <span>{roomNotice}</span>
                {onDismissNotice && (
                  <button
                    type="button"
                    onClick={onDismissNotice}
                    aria-label="Dismiss notice"
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-amber-300 hover:bg-white/10"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            <div>
              <label
                htmlFor="nickname-input"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#d8c7ae]"
              >
                Your Nickname
              </label>
              <input
                id="nickname-input"
                data-testid="nickname-input"
                type="text"
                maxLength={24}
                value={nickname}
                onChange={(e) => {
                  onNicknameChange(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="Enter your name (e.g. Rafiq)"
                className="w-full rounded-xl border border-white/15 bg-black/45 px-4 py-3 text-sm font-semibold text-white placeholder:text-stone-400 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleCreateRoom}
                data-testid="create-room-btn"
                className="flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-extrabold text-[#1b1108] transition hover:bg-amber-300 active:scale-[0.98]"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>Create Room</span>
              </button>

              <form onSubmit={handleJoinRoom} className="flex gap-2">
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => {
                    onJoinCodeInputChange(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="TNG-AB12"
                  aria-label="Room Code"
                  data-testid="join-room-input"
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/45 px-3.5 py-3 text-sm font-bold uppercase tracking-wider text-white placeholder:text-stone-500 focus:border-amber-400 focus:outline-none"
                />
                <button
                  type="submit"
                  data-testid="join-room-btn"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/20 active:scale-[0.98]"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  <span>Join</span>
                </button>
              </form>
            </div>

            {formError && (
              <p
                role="alert"
                data-testid="lobby-error"
                className="rounded-xl border border-red-400/40 bg-red-950/60 px-3.5 py-2.5 text-xs font-medium text-red-200"
              >
                {formError}
              </p>
            )}
          </div>
        ) : (
          /* ROOM LOBBY */
          <div
            data-testid="room-lobby"
            className="animate-panel-enter w-full space-y-4 text-left"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/15 bg-black/40 px-4 py-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#cbb89d]">
                  Room Code
                </span>
                <div className="flex items-center gap-2">
                  <span
                    data-testid="lobby-room-code"
                    className="text-xl font-black tracking-wider text-amber-300"
                  >
                    {state.roomCode}
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#e6d5b8]">
                    {syncMode === 'supabase' ? 'Supabase Live' : 'Room Relay'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyInviteLink(state.roomCode)}
                  data-testid="copy-invite-btn"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/45 bg-amber-400/15 px-3 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-400 hover:text-[#1b1108]"
                >
                  {copiedInviteUrl ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Invite</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onLeaveRoom}
                  data-testid="lobby-leave-btn"
                  className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-[#f0dfc2] hover:bg-white/20"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Leave</span>
                </button>
              </div>
            </div>

            {clipboardFallbackUrl && (
              <div className="rounded-xl border border-amber-400/35 bg-black/50 p-2.5 text-xs text-amber-200">
                <span className="block font-semibold">
                  Share this invite URL:
                </span>
                <input
                  type="text"
                  readOnly
                  value={clipboardFallbackUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-1 w-full rounded border border-white/15 bg-black/60 px-2 py-1 font-mono text-[11px] text-white"
                />
              </div>
            )}

            {/* 4 Seats Grid */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {state.seats.map((seat) => {
                const isMe = mySeatIndex === seat.seatIndex;
                const isHostSeat = hostSeatIndex === seat.seatIndex;
                return (
                  <div
                    key={seat.seatIndex}
                    data-testid={`lobby-seat-${seat.seatIndex}`}
                    className={`flex items-center justify-between rounded-2xl border px-3.5 py-2.5 transition ${
                      seat.type === 'EMPTY'
                        ? 'border-dashed border-white/20 bg-black/25'
                        : 'border-white/15 bg-black/45'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {seat.type === 'EMPTY' ? (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-white/25 bg-white/5 text-xs font-bold text-stone-400">
                          S{seat.seatIndex + 1}
                        </div>
                      ) : (
                        <div className="h-10 w-10 overflow-hidden rounded-full ring-1 ring-white/25">
                          <SeatAvatarGraphic seat={seat} size={40} />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                          <span>
                            {seat.type === 'EMPTY'
                              ? `Empty Seat ${seat.seatIndex + 1}`
                              : seat.username}
                          </span>
                          {isHostSeat && (
                            <Crown
                              className="h-3.5 w-3.5 text-amber-400"
                              aria-label="Host"
                            />
                          )}
                        </div>
                        <span className="text-[11px] text-[#cbb89d]">
                          {seat.type === 'AI'
                            ? 'AI Bot'
                            : seat.type === 'HUMAN'
                              ? isMe
                                ? isHostSeat
                                  ? 'You (Host)'
                                  : 'You'
                                : isHostSeat
                                  ? 'Host'
                                  : 'Player'
                              : 'Open seat'}
                        </span>
                      </div>
                    </div>

                    {isMeHost && seat.type === 'EMPTY' && (
                      <button
                        type="button"
                        onClick={() =>
                          onDispatchAction({
                            type: 'ADD_BOT',
                            seatIndex: seat.seatIndex,
                          })
                        }
                        data-testid={`add-bot-seat-${seat.seatIndex}`}
                        className="inline-flex items-center gap-1 rounded-xl border border-amber-300/45 bg-amber-400/15 px-2.5 py-1.5 text-xs font-bold text-amber-200 transition hover:bg-amber-400 hover:text-[#1b1108]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Bot</span>
                      </button>
                    )}

                    {isMeHost && seat.type === 'AI' && (
                      <button
                        type="button"
                        onClick={() =>
                          onDispatchAction({
                            type: 'REMOVE_BOT',
                            seatIndex: seat.seatIndex,
                          })
                        }
                        data-testid={`remove-bot-seat-${seat.seatIndex}`}
                        aria-label={`Remove bot ${seat.username}`}
                        className="inline-flex items-center gap-1 rounded-xl border border-red-400/35 bg-red-500/15 px-2.5 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {isMeHost ? (
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                {emptySeatCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      unlockAudio();
                      onDispatchAction({ type: 'FILL_BOTS_AND_START' });
                    }}
                    data-testid="fill-bots-start-btn"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-[#1b1108] transition hover:bg-amber-300 active:scale-[0.98]"
                  >
                    <Bot className="h-4 w-4" />
                    <span>Fill Bots &amp; Start</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={!allSeatsFilled}
                  onClick={() => {
                    unlockAudio();
                    onDispatchAction({ type: 'START_MATCH' });
                  }}
                  data-testid="start-match-btn"
                  className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-extrabold transition ${
                    allSeatsFilled
                      ? 'bg-emerald-500 text-[#052e16] hover:bg-emerald-400 active:scale-[0.98]'
                      : 'cursor-not-allowed border border-white/15 bg-white/5 text-stone-500'
                  }`}
                >
                  <Play className="h-4 w-4" />
                  <span>Start Match</span>
                </button>
              </div>
            ) : (
              <div
                data-testid="waiting-for-host-banner"
                className="flex items-center justify-center gap-2 rounded-xl border border-amber-300/20 bg-black/35 px-4 py-2.5 text-xs font-semibold text-[#e6d5b8]"
              >
                <Crown className="h-3.5 w-3.5 text-amber-400" />
                <span>Waiting for {hostDisplayName} to start the match…</span>
              </div>
            )}

            <div className="pt-1">
              <VoiceBar
                roomCode={state.roomCode}
                username={nickname}
                clientId={clientId}
                isLiveKitConfigured={livekitConfigured}
                lowDataMode={lowDataMode}
                onToggleLowDataMode={onToggleLowDataMode}
                rainEnabled={rainEnabled}
                onToggleRain={onToggleRain}
                chatMessages={chatMessages}
                onSendChat={onSendChat}
                onSpeakingMapChange={onSpeakingMapChange}
              />
            </div>
          </div>
        )}

        {!cloudReady && (
          <div
            aria-label="Environment readiness"
            className="w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-2.5 text-left text-[11px] text-[#cbb89d]"
          >
            <strong className="text-amber-300">Setup Tip:</strong> Add Supabase
            &amp; LiveKit keys in Vercel Environment Variables (see{' '}
            <code>.env.example</code>) for persistent cross-region Realtime sync
            &amp; live voice mic. Room Relay &amp; SFX work out of the box.
          </div>
        )}
      </main>
    </div>
  );
}

export default Lobby;

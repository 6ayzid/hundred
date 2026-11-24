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

      <main className="glass-pill relative z-10 flex w-full max-w-xl flex-col items-center gap-5 rounded-[32px] p-5 text-center sm:p-8">
        {/* Cute twinkling corner stars */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="#ffc857"
          className="animate-sparkle-twinkle pointer-events-none absolute left-5 top-5 h-5 w-5 opacity-80"
        >
          <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
        </svg>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="#ff8fab"
          className="animate-sparkle-twinkle pointer-events-none absolute right-6 top-6 h-4 w-4 opacity-75"
          style={{ animationDelay: '0.9s' }}
        >
          <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
        </svg>

        <header className="flex flex-col items-center">
          <h1 className="font-bangla text-4xl font-extrabold tracking-tight text-[#4a2e2b] sm:text-5xl">
            হানডেট <span className="text-[#f25c84]">HUNDRED</span>
          </h1>
          <p className="mt-1.5 rounded-full bg-[#fff0ec] px-3.5 py-1 text-xs font-semibold text-[#875f5c] sm:text-sm">
            4 Players • 10 Rounds • Holder of 1 starts • Min Call 50
          </p>
        </header>

        {/* Fanned Visiting Cards Showcase */}
        <div
          aria-label="Handwritten visiting cards preview"
          className="animate-cute-float flex items-end justify-center py-1"
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
            className="animate-panel-enter flex w-full flex-col items-center gap-3 rounded-3xl border-2 border-[#f7c6d0] bg-[#fff7f3] px-5 py-6 text-center"
          >
            <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#ffd6e0] border-t-[#f25c84]" />
            <div>
              <p className="text-sm font-bold text-[#4a2e2b]">
                Joining room <span className="text-[#f25c84]">{activeRoomCode}</span>…
              </p>
              <p className="mt-0.5 text-xs text-[#875f5c]">
                Checking availability with the room host
              </p>
            </div>
            <button
              type="button"
              onClick={onLeaveRoom}
              className="mt-1 rounded-full border border-[#f2c4cf] bg-white px-4 py-1.5 text-xs font-bold text-[#6e4946] transition hover:bg-[#fff0ec]"
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
                className="animate-panel-enter flex items-center justify-between gap-2 rounded-2xl border border-[#ffc857] bg-[#fff6db] px-3.5 py-2.5 text-xs font-semibold text-[#6b4810]"
              >
                <span>{roomNotice}</span>
                {onDismissNotice && (
                  <button
                    type="button"
                    onClick={onDismissNotice}
                    aria-label="Dismiss notice"
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold text-[#9c6712] hover:bg-[#ffe8a3]/50"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            <div>
              <label
                htmlFor="nickname-input"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#875f5c]"
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
                className="w-full rounded-2xl border-2 border-[#f4cbd5] bg-white px-4 py-3 text-sm font-semibold text-[#4a2e2b] placeholder:text-[#b89694] focus:border-[#ff7597] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleCreateRoom}
                data-testid="create-room-btn"
                className="flex items-center justify-center gap-2 rounded-2xl bg-[#ff7597] px-4 py-3 text-sm font-extrabold text-white shadow-[0_4px_0_#d94f72] transition hover:bg-[#ff6188] active:translate-y-[2px] active:shadow-[0_2px_0_#d94f72]"
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
                  className="min-w-0 flex-1 rounded-2xl border-2 border-[#f4cbd5] bg-white px-3.5 py-3 text-sm font-bold uppercase tracking-wider text-[#4a2e2b] placeholder:text-[#b89694] focus:border-[#ff7597] focus:outline-none"
                />
                <button
                  type="submit"
                  data-testid="join-room-btn"
                  className="inline-flex items-center gap-1.5 rounded-2xl border-2 border-[#f2c4cf] bg-[#fff0ec] px-4 py-3 text-sm font-bold text-[#6e3f45] shadow-[0_3px_0_#ecc0cb] transition hover:bg-[#ffe3e9] active:translate-y-[2px] active:shadow-[0_1px_0_#ecc0cb]"
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
                className="rounded-2xl border border-[#f598b0] bg-[#fff0f4] px-3.5 py-2.5 text-xs font-semibold text-[#b83256]"
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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-3xl border-2 border-[#f5cbd4] bg-[#fff7f3] px-4 py-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8c6460]">
                  Room Code
                </span>
                <div className="flex items-center gap-2">
                  <span
                    data-testid="lobby-room-code"
                    className="text-xl font-black tracking-wider text-[#f25c84]"
                  >
                    {state.roomCode}
                  </span>
                  <span className="rounded-full border border-[#e8d5ff] bg-[#f4edff] px-2.5 py-0.5 text-[10px] font-bold text-[#6a52a3]">
                    {syncMode === 'supabase' ? 'Supabase Live' : 'Room Relay'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyInviteLink(state.roomCode)}
                  data-testid="copy-invite-btn"
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#ffccd8] bg-[#fff0f4] px-3 py-1.5 text-xs font-bold text-[#c73e65] transition hover:bg-[#ff7597] hover:text-white"
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
                  className="inline-flex items-center gap-1 rounded-full border border-[#edd0d6] bg-white px-3 py-1.5 text-xs font-bold text-[#7d5a58] hover:bg-[#fff0ec]"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Leave</span>
                </button>
              </div>
            </div>

            {clipboardFallbackUrl && (
              <div className="rounded-2xl border border-[#ffd88a] bg-[#fff8e4] p-2.5 text-xs text-[#6b4810]">
                <span className="block font-bold">
                  Share this invite URL:
                </span>
                <input
                  type="text"
                  readOnly
                  value={clipboardFallbackUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-1 w-full rounded-xl border border-[#f2d699] bg-white px-2.5 py-1 font-mono text-[11px] text-[#4a2e2b]"
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
                    className={`flex items-center justify-between rounded-3xl border-2 px-3.5 py-2.5 transition ${
                      seat.type === 'EMPTY'
                        ? 'border-dashed border-[#eac4cd] bg-[#fff8f5]'
                        : 'border-[#f4cbd5] bg-white shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {seat.type === 'EMPTY' ? (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-[#e8bcc7] bg-[#fff0ec] text-xs font-bold text-[#a87e84]">
                          S{seat.seatIndex + 1}
                        </div>
                      ) : (
                        <div className="h-10 w-10 overflow-hidden rounded-full ring-2 ring-[#ffe3ea]">
                          <SeatAvatarGraphic seat={seat} size={40} />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-bold text-[#4a2e2b]">
                          <span>
                            {seat.type === 'EMPTY'
                              ? `Empty Seat ${seat.seatIndex + 1}`
                              : seat.username}
                          </span>
                          {isHostSeat && (
                            <Crown
                              className="h-3.5 w-3.5 text-[#f59e0b]"
                              aria-label="Host"
                            />
                          )}
                        </div>
                        <span className="text-[11px] font-medium text-[#8c6460]">
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
                        className="inline-flex items-center gap-1 rounded-full border-2 border-[#ffd57e] bg-[#fff5d6] px-2.5 py-1 text-xs font-bold text-[#8a5808] transition hover:bg-[#ffc857] hover:text-[#4a2e2b]"
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
                        className="inline-flex items-center gap-1 rounded-full border border-[#f8b4c4] bg-[#fff0f4] px-2.5 py-1 text-xs font-bold text-[#c73e65] transition hover:bg-[#ffdce5]"
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
                    className="inline-flex items-center gap-1.5 rounded-2xl bg-[#ffc857] px-5 py-2.5 text-sm font-extrabold text-[#4a2e2b] shadow-[0_4px_0_#d99c26] transition hover:bg-[#ffbe3b] active:translate-y-[2px] active:shadow-[0_2px_0_#d99c26]"
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
                  className={`inline-flex items-center gap-1.5 rounded-2xl px-5 py-2.5 text-sm font-extrabold transition ${
                    allSeatsFilled
                      ? 'bg-[#52b788] text-white shadow-[0_4px_0_#368c64] hover:bg-[#40a878] active:translate-y-[2px] active:shadow-[0_2px_0_#368c64]'
                      : 'cursor-not-allowed border-2 border-[#ebd5da] bg-[#faf2f4] text-[#b89a9e]'
                  }`}
                >
                  <Play className="h-4 w-4" />
                  <span>Start Match</span>
                </button>
              </div>
            ) : (
              <div
                data-testid="waiting-for-host-banner"
                className="flex items-center justify-center gap-2 rounded-2xl border border-[#ffd88a] bg-[#fff8e4] px-4 py-2.5 text-xs font-bold text-[#7a5010]"
              >
                <Crown className="h-3.5 w-3.5 text-[#f59e0b]" />
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
            className="w-full rounded-2xl border border-[#f2d2d9] bg-[#fff8f5] px-4 py-2.5 text-left text-[11px] text-[#7d5a58]"
          >
            <strong className="text-[#d94f72]">Setup Tip:</strong> Add Supabase
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

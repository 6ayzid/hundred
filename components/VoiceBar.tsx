'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
} from '@livekit/components-react';
import { Track, type RoomOptions } from 'livekit-client';
import {
  Check,
  CloudRain,
  Copy,
  MessageSquare,
  Mic,
  MicOff,
  Radio,
  Send,
  SignalLow,
  SlidersHorizontal,
} from 'lucide-react';
import { getPublicEnv } from '@/lib/env';
import {
  BANTER_CHIPS,
  type ChatMessage,
  type LiveKitTokenResponse,
  type SpeakingMap,
} from '@/lib/types';

export const VILLAGE_3G_AUDIO_BITRATE = 16_000;
export const STANDARD_AUDIO_BITRATE = 24_000;
export const MAX_CHAT_MESSAGE_LENGTH = 350;

export const AUDIO_CAPTURE_DEFAULTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
} as const;

export interface VoiceBarProps {
  roomCode: string;
  username: string;
  clientId: string;
  isLiveKitConfigured: boolean;
  lowDataMode: boolean;
  onToggleLowDataMode: () => void;
  rainEnabled: boolean;
  onToggleRain: () => void;
  chatMessages: ChatMessage[];
  onSendChat: (text: string, isBanter?: boolean) => void;
  onSpeakingMapChange: (speakingByClientId: Record<string, boolean>) => void;
  compact?: boolean;
  onCopyRoomCode?: () => void;
  copiedRoom?: boolean;
}

interface RtpEncodingParametersLike {
  maxBitrate?: number;
  [key: string]: unknown;
}

interface RtpSendParametersLike {
  encodings?: RtpEncodingParametersLike[];
  [key: string]: unknown;
}

interface RtpSenderLike {
  getParameters: () => RtpSendParametersLike;
  setParameters: (params: RtpSendParametersLike) => Promise<void> | void;
}

function isRtpSenderLike(candidate: unknown): candidate is RtpSenderLike {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const record = candidate as Record<string, unknown>;
  return (
    typeof record.getParameters === 'function' &&
    typeof record.setParameters === 'function'
  );
}

function extractSendersFromParticipant(participant: unknown): RtpSenderLike[] {
  if (typeof participant !== 'object' || participant === null) {
    return [];
  }

  const senders = new Set<RtpSenderLike>();
  const p = participant as Record<string, unknown>;

  const inspectPublication = (pub: unknown) => {
    if (typeof pub !== 'object' || pub === null) {
      return;
    }
    const pubRecord = pub as Record<string, unknown>;
    if (isRtpSenderLike(pubRecord.sender)) {
      senders.add(pubRecord.sender);
    }
    const track = pubRecord.track ?? pubRecord.audioTrack;
    if (typeof track === 'object' && track !== null) {
      const trackRecord = track as Record<string, unknown>;
      if (isRtpSenderLike(trackRecord.sender)) {
        senders.add(trackRecord.sender);
      }
    }
  };

  if (isRtpSenderLike(p.sender)) {
    senders.add(p.sender);
  }

  if (typeof p.getTrackPublication === 'function') {
    try {
      const micPub = (
        p.getTrackPublication as (source: unknown) => unknown
      )(Track.Source.Microphone);
      inspectPublication(micPub);
    } catch {
      // Ignore lookup errors on mock objects
    }
  }

  const collectFromIterable = (collection: unknown) => {
    if (!collection) return;
    if (collection instanceof Map) {
      for (const pub of collection.values()) {
        inspectPublication(pub);
      }
    } else if (Array.isArray(collection)) {
      for (const pub of collection) {
        inspectPublication(pub);
      }
    } else if (
      typeof collection === 'object' &&
      collection !== null &&
      typeof (collection as { values?: unknown }).values === 'function'
    ) {
      for (const pub of (
        collection as { values: () => Iterable<unknown> }
      ).values()) {
        inspectPublication(pub);
      }
    }
  };

  collectFromIterable(p.audioTrackPublications);
  collectFromIterable(p.trackPublications);

  return Array.from(senders);
}

/**
 * Dynamically caps active WebRTC audio RTCRtpSender encoding maxBitrate
 * (16,000 bps in Village 3G mode vs 24,000 bps in normal mode) without
 * tearing down or re-initializing the LiveKitRoom connection.
 */
export async function applyAudioSenderBitrateCap(
  participant: unknown,
  maxBitrate: number,
): Promise<boolean> {
  const senders = extractSendersFromParticipant(participant);
  if (senders.length === 0) {
    return false;
  }

  let updated = false;
  for (const sender of senders) {
    try {
      const currentParams = sender.getParameters() ?? {};
      const existingEncodings = Array.isArray(currentParams.encodings)
        ? currentParams.encodings
        : [];
      const nextEncodings: RtpEncodingParametersLike[] =
        existingEncodings.length > 0
          ? existingEncodings.map((enc, idx) =>
              idx === 0 ? { ...enc, maxBitrate } : enc,
            )
          : [{ maxBitrate }];

      await sender.setParameters({
        ...currentParams,
        encodings: nextEncodings,
      });
      updated = true;
    } catch {
      // Ignore WebRTC sender parameter errors on unsupported browsers/mocks
    }
  }

  return updated;
}

function shallowEqualSpeakingMap(a: SpeakingMap, b: SpeakingMap): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (Boolean(a[key]) !== Boolean(b[key])) {
      return false;
    }
  }
  return true;
}

interface LiveKitVoiceControllerProps {
  lowDataMode: boolean;
  micEnabled: boolean;
  onSpeakingMapChange?: (speakingByClientId: SpeakingMap) => void;
}

function LiveKitVoiceController({
  lowDataMode,
  micEnabled,
  onSpeakingMapChange,
}: LiveKitVoiceControllerProps) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const lastSpeakingMapRef = useRef<SpeakingMap>({});

  useEffect(() => {
    const nextMap: SpeakingMap = {};
    if (Array.isArray(participants)) {
      for (const participant of participants) {
        if (
          participant &&
          typeof participant.identity === 'string' &&
          participant.identity
        ) {
          nextMap[participant.identity] = Boolean(participant.isSpeaking);
        }
      }
    }

    if (!shallowEqualSpeakingMap(lastSpeakingMapRef.current, nextMap)) {
      lastSpeakingMapRef.current = nextMap;
      onSpeakingMapChange?.(nextMap);
    }
  }, [participants, onSpeakingMapChange]);

  const targetBitrate = lowDataMode
    ? VILLAGE_3G_AUDIO_BITRATE
    : STANDARD_AUDIO_BITRATE;

  useEffect(() => {
    if (!localParticipant) {
      return;
    }

    let cancelled = false;
    const syncMic = async () => {
      try {
        if (typeof localParticipant.setMicrophoneEnabled === 'function') {
          await localParticipant.setMicrophoneEnabled(
            micEnabled,
            AUDIO_CAPTURE_DEFAULTS,
            {
              dtx: true,
              red: true,
              forceStereo: false,
              audioPreset: {
                maxBitrate: targetBitrate,
              },
            },
          );
        }
        if (!cancelled && micEnabled) {
          await applyAudioSenderBitrateCap(localParticipant, targetBitrate);
        }
      } catch {
        // Prevent unhandled promise rejection if mic permission is denied
      }
    };

    void syncMic();
    return () => {
      cancelled = true;
    };
  }, [localParticipant, micEnabled, targetBitrate]);

  useEffect(() => {
    if (!localParticipant) {
      return;
    }
    void applyAudioSenderBitrateCap(localParticipant, targetBitrate);
  }, [localParticipant, targetBitrate]);

  return null;
}

interface PendingLocalChatEntry {
  message: ChatMessage;
  chatMessagesRef: ChatMessage[];
}

interface ToggleOverrideState {
  baseProp: boolean;
  value: boolean;
}

interface TokenFetchState {
  key: string;
  token: string | null;
  failed: boolean;
}

export function VoiceBar({
  roomCode,
  username,
  clientId,
  isLiveKitConfigured = false,
  lowDataMode = false,
  onToggleLowDataMode,
  rainEnabled = true,
  onToggleRain,
  chatMessages = [],
  onSendChat,
  onSpeakingMapChange,
  compact = false,
  onCopyRoomCode,
  copiedRoom = false,
}: VoiceBarProps) {
  const [lowDataOverride, setLowDataOverride] =
    useState<ToggleOverrideState | null>(null);
  const [rainOverride, setRainOverride] =
    useState<ToggleOverrideState | null>(null);
  const [isOpenMic, setIsOpenMic] = useState<boolean>(false);
  const [isHoldingPtt, setIsHoldingPtt] = useState<boolean>(false);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [chatDraft, setChatDraft] = useState<string>('');
  const [pendingLocalMessages, setPendingLocalMessages] = useState<
    PendingLocalChatEntry[]
  >([]);
  const [tokenState, setTokenState] = useState<TokenFetchState>({
    key: '',
    token: null,
    failed: false,
  });

  const effectiveLowDataMode =
    lowDataOverride !== null && lowDataOverride.baseProp === lowDataMode
      ? lowDataOverride.value
      : lowDataMode;

  const effectiveRainEnabled =
    rainOverride !== null && rainOverride.baseProp === rainEnabled
      ? rainOverride.value
      : rainEnabled;

  const targetBitrate = effectiveLowDataMode
    ? VILLAGE_3G_AUDIO_BITRATE
    : STANDARD_AUDIO_BITRATE;

  // Sync CSS rain overlay pause state across the document whenever Rain or Village 3G changes.
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const isRainPaused = !effectiveRainEnabled || effectiveLowDataMode;
    const rainNodes = document.querySelectorAll<HTMLElement>(
      '.rain-overlay, [data-testid="rain-overlay"], [data-rain-overlay]',
    );
    rainNodes.forEach((el) => {
      el.classList.toggle('rain-paused', isRainPaused);
      el.setAttribute('data-rain-paused', String(isRainPaused));
      el.style.animationPlayState = isRainPaused ? 'paused' : 'running';
    });
  }, [effectiveRainEnabled, effectiveLowDataMode]);

  const trimmedRoom = (roomCode ?? '').trim();
  const trimmedUser = (username ?? '').trim();
  const trimmedClient = (clientId ?? '').trim();
  const canRequestToken =
    Boolean(isLiveKitConfigured) &&
    trimmedRoom.length > 0 &&
    trimmedUser.length > 0 &&
    trimmedClient.length > 0;
  const requestKey = canRequestToken
    ? `${trimmedRoom}::${trimmedUser}::${trimmedClient}`
    : '';

  const activeToken =
    canRequestToken && tokenState.key === requestKey ? tokenState.token : null;
  const tokenFailed =
    canRequestToken && tokenState.key === requestKey
      ? tokenState.failed
      : false;
  const isFallbackMode = !canRequestToken || tokenFailed;

  // Reset speaking map to empty when LiveKit is unconfigured or in fallback mode.
  useEffect(() => {
    if (isFallbackMode) {
      onSpeakingMapChange?.({});
    }
  }, [isFallbackMode, onSpeakingMapChange]);

  // Fetch LiveKit JWT token ONLY when isLiveKitConfigured is true and params are non-empty.
  useEffect(() => {
    if (!canRequestToken || !requestKey) {
      return;
    }

    let cancelled = false;
    const fetchToken = async () => {
      try {
        const params = new URLSearchParams({
          room: trimmedRoom,
          username: trimmedUser,
          clientId: trimmedClient,
        });
        const response = await fetch(`/api/livekit/token?${params.toString()}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          if (!cancelled) {
            setTokenState({ key: requestKey, token: null, failed: true });
          }
          return;
        }

        const data = (await response.json()) as Partial<LiveKitTokenResponse>;
        if (!cancelled) {
          if (typeof data.token === 'string' && data.token.trim().length > 0) {
            setTokenState({
              key: requestKey,
              token: data.token.trim(),
              failed: false,
            });
          } else {
            setTokenState({ key: requestKey, token: null, failed: true });
          }
        }
      } catch {
        if (!cancelled) {
          setTokenState({ key: requestKey, token: null, failed: true });
        }
      }
    };

    void fetchToken();
    return () => {
      cancelled = true;
    };
  }, [canRequestToken, requestKey, trimmedClient, trimmedRoom, trimmedUser]);

  // Static memoized RoomOptions so toggling Village 3G never tears down LiveKitRoom.
  const roomOptions: RoomOptions = useMemo(
    () => ({
      adaptiveStream: false,
      dynacast: false,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      publishDefaults: {
        dtx: true,
        red: true,
        forceStereo: false,
        audioPreset: {
          maxBitrate: VILLAGE_3G_AUDIO_BITRATE,
        },
      },
    }),
    [],
  );

  // Release Hold-to-Talk safely on window blur, pointerup, mouseup, or pointercancel.
  const releasePtt = useCallback(() => {
    setIsHoldingPtt(false);
  }, []);

  const engagePtt = useCallback(() => {
    setIsHoldingPtt(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleWindowBlur = () => {
      setIsHoldingPtt(false);
    };
    const handleGlobalPointerUp = () => {
      setIsHoldingPtt(false);
    };

    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('mouseup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    window.addEventListener('touchend', handleGlobalPointerUp);
    window.addEventListener('touchcancel', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
      window.removeEventListener('touchend', handleGlobalPointerUp);
      window.removeEventListener('touchcancel', handleGlobalPointerUp);
    };
  }, []);

  const handleToggleLowData = useCallback(() => {
    setLowDataOverride((prev) => {
      const current =
        prev !== null && prev.baseProp === lowDataMode
          ? prev.value
          : lowDataMode;
      return { baseProp: lowDataMode, value: !current };
    });
    onToggleLowDataMode?.();
  }, [lowDataMode, onToggleLowDataMode]);

  const handleToggleRain = useCallback(() => {
    setRainOverride((prev) => {
      const current =
        prev !== null && prev.baseProp === rainEnabled
          ? prev.value
          : rainEnabled;
      return { baseProp: rainEnabled, value: !current };
    });
    onToggleRain?.();
  }, [onToggleRain, rainEnabled]);

  const handleToggleOpenMic = useCallback(() => {
    setIsOpenMic((prev) => !prev);
  }, []);

  const handleToggleChatDrawer = useCallback(() => {
    setIsChatOpen((prev) => !prev);
  }, []);

  const displayedMessages = useMemo(() => {
    const base = Array.isArray(chatMessages) ? chatMessages : [];
    const activeLocal = pendingLocalMessages
      .filter((entry) => entry.chatMessagesRef === chatMessages)
      .map((entry) => entry.message);
    return [...base, ...activeLocal];
  }, [chatMessages, pendingLocalMessages]);

  const handleSendMessage = useCallback(
    (rawText: string, isBanter = false) => {
      const trimmed = rawText.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
      if (!trimmed) {
        return;
      }

      const fallbackMessage: ChatMessage = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        senderId: clientId || 'local-client',
        seatIndex: null,
        username: username || 'Player',
        text: trimmed,
        timestamp: Date.now(),
        isBanter,
      };

      setPendingLocalMessages((prev) => [
        ...prev,
        { message: fallbackMessage, chatMessagesRef: chatMessages },
      ]);
      onSendChat?.(trimmed, isBanter);
    },
    [chatMessages, clientId, onSendChat, username],
  );

  const handleChatFormSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = chatDraft.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
      if (!trimmed) {
        return;
      }
      handleSendMessage(trimmed, false);
      setChatDraft('');
    },
    [chatDraft, handleSendMessage],
  );

  const publicLiveKitUrl = getPublicEnv().livekitUrl;
  const serverUrl = publicLiveKitUrl || 'wss://localhost:7880';
  const shouldMountLiveKitRoom =
    canRequestToken && Boolean(activeToken) && !tokenFailed;
  const isMicActive = isOpenMic || isHoldingPtt;

  const chatListRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (!isChatOpen) return;
    const list = chatListRef.current;
    if (!list) return;
    if (typeof list.scrollTo === 'function') {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    } else {
      list.scrollTop = list.scrollHeight;
    }
  }, [displayedMessages.length, isChatOpen]);

  const formatMsgTime = (ts: number): string => {
    try {
      return new Date(ts).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  if (compact) {
    return (
      <div
        data-testid="voice-bar"
        data-low-data-mode={String(effectiveLowDataMode)}
        data-audio-bitrate={String(targetBitrate)}
        data-rain-paused={String(!effectiveRainEnabled || effectiveLowDataMode)}
        className="relative z-30 flex flex-col items-end"
      >
        {shouldMountLiveKitRoom && activeToken ? (
          <LiveKitRoom
            serverUrl={serverUrl}
            token={activeToken}
            connect={true}
            audio={AUDIO_CAPTURE_DEFAULTS}
            video={false}
            options={roomOptions}
            onError={(err) => {
              const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
              if (/NotFoundError|NotAllowedError|Permission|Device|Overconstrained|AbortError/i.test(msg)) {
                return;
              }
              setTokenState({ key: requestKey, token: null, failed: true });
            }}
          >
            <RoomAudioRenderer />
            <LiveKitVoiceController
              lowDataMode={effectiveLowDataMode}
              micEnabled={isMicActive}
              onSpeakingMapChange={onSpeakingMapChange}
            />
          </LiveKitRoom>
        ) : null}

        {/* Floating Chat Drawer above bottom-right dock */}
        {isChatOpen && (
          <section
            data-testid="chat-drawer"
            role="region"
            aria-label="Bangla and Banglish Chat Drawer"
            className="glass-pill animate-panel-enter mb-2.5 flex w-[295px] flex-col overflow-hidden rounded-2xl border-amber-300/25 text-[#faf3e6] shadow-2xl sm:w-[330px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 bg-black/30 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-amber-300" />
                <span className="text-xs font-bold tracking-wide text-[#faf3e6]">
                  Table Chat
                </span>
                {displayedMessages.length > 0 && (
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#d8c7ae]">
                    {displayedMessages.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleToggleChatDrawer}
                aria-label="Close chat"
                className="rounded-md px-1.5 py-0.5 text-xs font-bold text-[#cbb89d] transition hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Auto-scrolling Message Bubbles */}
            <ul
              ref={chatListRef}
              data-testid="chat-history-list"
              className="chat-scroll flex max-h-44 min-h-[112px] flex-col gap-2 overflow-y-auto px-3 py-2.5"
            >
              {displayedMessages.length === 0 ? (
                <li className="my-auto py-4 text-center text-[11px] text-[#cbb89d]/85">
                  Send a quick Bangla banter or message below.
                </li>
              ) : (
                displayedMessages.map((msg) => {
                  const isMine =
                    msg.senderId === clientId ||
                    (msg.senderId === 'local-client' && msg.username === username);
                  return (
                    <li
                      key={msg.id}
                      data-chat-message="true"
                      data-testid="chat-message-item"
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div className="mb-0.5 flex items-center gap-1.5 px-1 text-[10px] text-[#cbb89d]/85">
                        <span className="font-semibold text-amber-200/95">
                          {isMine ? 'You' : msg.username}
                        </span>
                        <span className="opacity-65">
                          {formatMsgTime(msg.timestamp)}
                        </span>
                      </div>
                      <div
                        className={`max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-xs leading-snug shadow-sm ${
                          isMine
                            ? 'rounded-tr-sm border border-amber-300/35 bg-amber-400/20 text-[#fff6e5]'
                            : 'rounded-tl-sm border border-white/12 bg-white/10 text-[#f5ecdf]'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>

            {/* Quick Bangla Banter Chips */}
            <div
              data-testid="banter-chips-row"
              className="flex flex-wrap gap-1 border-t border-white/10 bg-black/20 px-2.5 py-2"
            >
              {BANTER_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  data-testid={`banter-chip-${chip}`}
                  onClick={() => handleSendMessage(chip, true)}
                  className="rounded-full border border-amber-300/30 bg-amber-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-400 hover:text-[#1b1108] active:scale-95"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Pill Input Row */}
            <form
              onSubmit={handleChatFormSubmit}
              className="flex items-center gap-1.5 border-t border-white/10 bg-black/35 p-2"
            >
              <input
                type="text"
                aria-label="Chat message"
                placeholder="Type Bangla or Banglish…"
                maxLength={MAX_CHAT_MESSAGE_LENGTH}
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                data-testid="chat-draft-input"
                className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white placeholder:text-stone-400 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Send"
                data-testid="chat-send-button"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[#1b1108] transition hover:bg-amber-300 active:scale-95"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </section>
        )}

        {/* Floating Audio / Village 3G / Rain Popover above bottom-right dock */}
        {isSettingsOpen && (
          <div className="glass-pill mb-2.5 w-[250px] space-y-2 rounded-2xl p-3 text-xs text-[#faf3e6] shadow-2xl">
            <div className="flex items-center justify-between text-[11px] text-amber-200/90">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Radio className="h-3.5 w-3.5" />
                {isFallbackMode ? 'Voice: Local Fallback' : 'Voice: Connected'}
              </span>
              <span className="opacity-75">
                {effectiveLowDataMode ? '16kbps' : '24kbps'}
              </span>
            </div>

            <button
              type="button"
              data-testid="hold-to-talk-button"
              aria-label="Hold to Talk (PTT)"
              aria-pressed={isHoldingPtt}
              onPointerDown={engagePtt}
              onPointerUp={releasePtt}
              onPointerCancel={releasePtt}
              onPointerLeave={releasePtt}
              className={`flex w-full touch-none select-none items-center justify-center gap-1.5 rounded-xl border px-3 py-2 font-semibold transition ${
                isHoldingPtt
                  ? 'border-amber-300 bg-amber-400 text-[#1b1108]'
                  : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <Mic className="h-3.5 w-3.5" />
              <span>{isHoldingPtt ? 'Talking (PTT)...' : 'Hold to Talk'}</span>
            </button>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                data-testid="village-3g-toggle"
                aria-pressed={effectiveLowDataMode}
                onClick={handleToggleLowData}
                className={`flex items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-[11px] font-semibold transition ${
                  effectiveLowDataMode
                    ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                    : 'border-white/15 bg-white/5 text-stone-300 hover:bg-white/10'
                }`}
              >
                <SignalLow className="h-3.5 w-3.5" />
                <span>3G: {effectiveLowDataMode ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                data-testid="rain-toggle"
                aria-pressed={effectiveRainEnabled}
                onClick={handleToggleRain}
                className={`flex items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-[11px] font-semibold transition ${
                  effectiveRainEnabled
                    ? 'border-sky-400/50 bg-sky-500/20 text-sky-200'
                    : 'border-white/15 bg-white/5 text-stone-300 hover:bg-white/10'
                }`}
              >
                <CloudRain className="h-3.5 w-3.5" />
                <span>Rain: {effectiveRainEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Sleek Bottom-Right Glass Dock */}
        <div className="glass-pill flex shrink-0 items-center gap-1 rounded-2xl px-1.5 py-1 sm:gap-1.5 sm:px-2 sm:py-1.5 md:flex-col md:gap-2 md:px-3 md:py-2.5">
          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
            {/* Mic Button */}
            <button
              type="button"
              data-testid="open-mic-button"
              aria-label="Open Mic Mute Toggle"
              aria-pressed={isOpenMic}
              data-active={String(isOpenMic)}
              data-state={isOpenMic ? 'unmuted' : 'muted'}
              onClick={handleToggleOpenMic}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border transition sm:h-9 sm:w-9 md:h-12 md:w-14 md:flex-col md:gap-0.5 ${
                isMicActive
                  ? 'border-emerald-400/80 bg-emerald-500/20 text-emerald-100'
                  : 'border-white/15 bg-white/10 text-[#faf3e6] hover:bg-white/15'
              }`}
            >
              {isMicActive ? (
                <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              ) : (
                <MicOff className="h-3.5 w-3.5 opacity-90 sm:h-4 sm:w-4" />
              )}
              <span className="hidden text-[10px] font-semibold leading-none md:inline">
                Mic
              </span>
            </button>

            {/* Chat Button */}
            <button
              type="button"
              data-testid="chat-toggle-button"
              aria-label="Toggle Chat Drawer"
              aria-expanded={isChatOpen}
              aria-pressed={isChatOpen}
              data-active={String(isChatOpen)}
              data-state={isChatOpen ? 'open' : 'closed'}
              onClick={() => {
                setIsSettingsOpen(false);
                handleToggleChatDrawer();
              }}
              className={`relative flex h-8 w-8 items-center justify-center rounded-xl border transition sm:h-9 sm:w-9 md:h-12 md:w-14 md:flex-col md:gap-0.5 ${
                isChatOpen
                  ? 'border-amber-300/80 bg-amber-400/20 text-amber-100'
                  : 'border-white/15 bg-white/10 text-[#faf3e6] hover:bg-white/15'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden text-[10px] font-semibold leading-none md:inline">
                Chat
              </span>
              {displayedMessages.length > 0 && !isChatOpen && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-[#1b1108]">
                  {displayedMessages.length}
                </span>
              )}
            </button>
          </div>

          {/* Room Code + Audio Settings Trigger */}
          <div className="flex items-center gap-0.5 sm:gap-1 md:w-full md:justify-between md:px-0.5">
            <button
              type="button"
              onClick={onCopyRoomCode}
              data-testid="table-room-code"
              title="Copy room invite link"
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-white/5 px-1.5 py-1 text-[9.5px] font-semibold tracking-tight text-[#f2e6d3]/90 hover:text-amber-300 sm:px-2 sm:text-[10px] md:bg-transparent md:p-0 md:text-[11px] md:tracking-wide"
            >
              <span className="hidden md:inline">Room: </span>
              <span>{roomCode}</span>
              {copiedRoom ? (
                <Check className="h-2.5 w-2.5 shrink-0 text-emerald-400 sm:h-3 sm:w-3" />
              ) : (
                <Copy className="h-2.5 w-2.5 shrink-0 opacity-60" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsChatOpen(false);
                setIsSettingsOpen((prev) => !prev);
              }}
              aria-label="Voice & Village 3G settings"
              title="Voice, Village 3G & Rain settings"
              className={`rounded-lg p-1 transition sm:p-1.5 md:p-1 ${
                isSettingsOpen
                  ? 'bg-amber-400/25 text-amber-200'
                  : 'text-[#d7c4a3]/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="voice-bar"
      data-low-data-mode={String(effectiveLowDataMode)}
      data-audio-bitrate={String(targetBitrate)}
      data-rain-paused={String(!effectiveRainEnabled || effectiveLowDataMode)}
      className="relative z-30 w-full max-w-full"
    >
      {shouldMountLiveKitRoom && activeToken ? (
        <LiveKitRoom
          serverUrl={serverUrl}
          token={activeToken}
          connect={true}
          audio={AUDIO_CAPTURE_DEFAULTS}
          video={false}
          options={roomOptions}
          onError={(err) => {
            const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
            if (/NotFoundError|NotAllowedError|Permission|Device|Overconstrained|AbortError/i.test(msg)) {
              return;
            }
            setTokenState({ key: requestKey, token: null, failed: true });
          }}
        >
          <RoomAudioRenderer />
          <LiveKitVoiceController
            lowDataMode={effectiveLowDataMode}
            micEnabled={isMicActive}
            onSpeakingMapChange={onSpeakingMapChange}
          />
        </LiveKitRoom>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-900/50 bg-stone-950/90 px-3 py-2 text-amber-100 shadow-lg backdrop-blur-sm">
        {/* Status / Unconfigured Fallback Banner */}
        <div className="flex items-center gap-2 text-xs">
          {isFallbackMode ? (
            <div
              data-testid="livekit-fallback-banner"
              role="status"
              className="flex items-center gap-1.5 rounded-lg border border-amber-700/60 bg-amber-950/70 px-2.5 py-1 text-[11px] font-medium text-amber-200"
            >
              <Radio className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span>
                LiveKit Voice unconfigured — text &amp; bot fallback active
                (configure .env.local)
              </span>
            </div>
          ) : (
            <div
              data-testid="livekit-connected-banner"
              role="status"
              className="flex items-center gap-1.5 rounded-lg border border-emerald-700/60 bg-emerald-950/70 px-2.5 py-1 text-[11px] font-medium text-emerald-200"
            >
              <Radio className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span>
                LiveKit Voice connected (
                {effectiveLowDataMode ? '16kbps' : '24kbps'} Opus)
              </span>
            </div>
          )}
        </div>

        {/* Voice, Village 3G, Rain & Chat Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Open Mic Toggle Button */}
          <button
            type="button"
            data-testid="open-mic-button"
            aria-label="Open Mic Mute Toggle"
            aria-pressed={isOpenMic}
            data-active={String(isOpenMic)}
            data-state={isOpenMic ? 'unmuted' : 'muted'}
            onClick={handleToggleOpenMic}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              isOpenMic
                ? 'border-emerald-400 bg-emerald-700/90 text-white shadow-sm'
                : 'border-stone-700 bg-stone-900/90 text-stone-200 hover:border-amber-700/70'
            }`}
          >
            {isOpenMic ? (
              <Mic className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <MicOff className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>{isOpenMic ? 'Open Mic: ON' : 'Open Mic: Muted'}</span>
          </button>

          {/* Mobile Thumb-Friendly Hold-to-Talk (PTT) Button (>= 44x40px) */}
          <button
            type="button"
            data-testid="hold-to-talk-button"
            aria-label="Hold to Talk (PTT)"
            aria-pressed={isHoldingPtt}
            data-active={String(isHoldingPtt)}
            data-state={isHoldingPtt ? 'talking' : 'idle'}
            onPointerDown={engagePtt}
            onPointerUp={releasePtt}
            onPointerCancel={releasePtt}
            onPointerLeave={releasePtt}
            onMouseDown={engagePtt}
            onMouseUp={releasePtt}
            onMouseLeave={releasePtt}
            onTouchStart={engagePtt}
            onTouchEnd={releasePtt}
            onTouchCancel={releasePtt}
            className={`inline-flex min-h-[42px] min-w-[52px] touch-none select-none items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              isHoldingPtt
                ? 'border-amber-300 bg-amber-600 text-stone-950 shadow-md ring-2 ring-amber-400/70'
                : 'border-amber-800/80 bg-stone-900/90 text-amber-100 hover:border-amber-600'
            }`}
          >
            <Mic className="h-3.5 w-3.5 shrink-0" />
            <span>{isHoldingPtt ? 'Talking (PTT)...' : 'Hold to Talk'}</span>
          </button>

          {/* Village 3G / Low-Data Mode Toggle */}
          <button
            type="button"
            data-testid="village-3g-toggle"
            aria-label="Village 3G Low-Data Mode"
            aria-pressed={effectiveLowDataMode}
            data-active={String(effectiveLowDataMode)}
            data-state={effectiveLowDataMode ? 'active' : 'inactive'}
            data-low-data-mode={String(effectiveLowDataMode)}
            data-audio-bitrate={String(targetBitrate)}
            onClick={handleToggleLowData}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              effectiveLowDataMode
                ? 'border-amber-400 bg-amber-800/90 text-amber-50 shadow-sm'
                : 'border-stone-700 bg-stone-900/90 text-stone-300 hover:border-amber-700/70'
            }`}
          >
            <SignalLow className="h-3.5 w-3.5 shrink-0" />
            <span>
              {effectiveLowDataMode
                ? 'Village 3G: ON (16kbps)'
                : 'Village 3G: OFF (24kbps)'}
            </span>
          </button>

          {/* Rain Toggle Button */}
          <button
            type="button"
            data-testid="rain-toggle"
            aria-label="Rain Effect Toggle"
            aria-pressed={effectiveRainEnabled}
            data-active={String(effectiveRainEnabled)}
            data-state={effectiveRainEnabled ? 'active' : 'inactive'}
            onClick={handleToggleRain}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              effectiveRainEnabled
                ? 'border-sky-500/80 bg-sky-950/90 text-sky-100 shadow-sm'
                : 'border-stone-700 bg-stone-900/90 text-stone-400 hover:border-stone-500'
            }`}
          >
            <CloudRain className="h-3.5 w-3.5 shrink-0" />
            <span>{effectiveRainEnabled ? 'Rain: ON' : 'Rain: OFF'}</span>
          </button>

          {/* Collapsible Bangla/Banglish Chat Drawer Toggle */}
          <button
            type="button"
            data-testid="chat-toggle-button"
            aria-label="Toggle Chat Drawer"
            aria-expanded={isChatOpen}
            aria-pressed={isChatOpen}
            data-active={String(isChatOpen)}
            data-state={isChatOpen ? 'open' : 'closed'}
            onClick={handleToggleChatDrawer}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              isChatOpen
                ? 'border-amber-400 bg-amber-700/90 text-stone-950 shadow-sm'
                : 'border-stone-700 bg-stone-900/90 text-amber-100 hover:border-amber-700'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
            <span>Chat</span>
          </button>
        </div>
      </div>

      {/* Collapsible Bangla/Banglish Chat Drawer */}
      {isChatOpen ? (
        <section
          data-testid="chat-drawer"
          role="region"
          aria-label="Bangla and Banglish Chat Drawer"
          className="animate-panel-enter mt-2 w-full max-w-full overflow-hidden rounded-2xl border border-amber-300/25 bg-[#19100c]/95 text-[#faf3e6] shadow-2xl backdrop-blur-md"
        >
          {/* Auto-scrolling Message Bubbles */}
          <ul
            ref={chatListRef}
            data-testid="chat-history-list"
            className="chat-scroll flex max-h-44 min-h-[96px] w-full max-w-full flex-col gap-2 overflow-y-auto overflow-x-hidden px-3 py-2.5"
          >
            {displayedMessages.length === 0 ? (
              <li className="my-auto py-3 text-center text-xs text-[#cbb89d]/85">
                Tap a quick banter chip or send a message below.
              </li>
            ) : (
              displayedMessages.map((msg) => {
                const isMine =
                  msg.senderId === clientId ||
                  (msg.senderId === 'local-client' && msg.username === username);
                return (
                  <li
                    key={msg.id}
                    data-chat-message="true"
                    data-testid="chat-message-item"
                    className={`flex max-w-full flex-col overflow-x-hidden break-all [overflow-wrap:anywhere] ${
                      isMine ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div className="mb-0.5 flex items-center gap-1.5 px-1 text-[10px] text-[#cbb89d]/85">
                      <span className="font-semibold text-amber-200/95">
                        {msg.username}
                      </span>
                      <span className="opacity-65">
                        {formatMsgTime(msg.timestamp)}
                      </span>
                    </div>
                    <div
                      className={`max-w-[85%] overflow-x-hidden break-all [overflow-wrap:anywhere] rounded-2xl px-3 py-1.5 text-xs leading-snug ${
                        isMine
                          ? 'rounded-tr-sm border border-amber-300/35 bg-amber-400/20 text-[#fff6e5]'
                          : 'rounded-tl-sm border border-white/12 bg-white/10 text-[#f5ecdf]'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </li>
                );
              })
            )}
          </ul>

          {/* 4 1-Tap Bangla/Banglish Quick-Banter Chips */}
          <div
            data-testid="banter-chips-row"
            className="flex flex-wrap items-center gap-1.5 border-t border-white/10 bg-black/25 px-3 py-2"
          >
            {BANTER_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                data-testid={`banter-chip-${chip}`}
                onClick={() => handleSendMessage(chip, true)}
                className="rounded-full border border-amber-300/30 bg-amber-500/12 px-2.5 py-0.5 text-xs font-medium text-amber-200 transition hover:bg-amber-400 hover:text-[#1b1108] active:scale-95"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Custom Chat Input Row */}
          <form
            onSubmit={handleChatFormSubmit}
            className="flex w-full max-w-full items-center gap-2 border-t border-white/10 bg-black/35 p-2.5"
          >
            <input
              type="text"
              aria-label="Chat message"
              placeholder="Type Bangla or Banglish banter…"
              maxLength={MAX_CHAT_MESSAGE_LENGTH}
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              data-testid="chat-draft-input"
              className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/50 px-3.5 py-1.5 text-xs text-white placeholder:text-stone-400 focus:border-amber-400 focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Send"
              data-testid="chat-send-button"
              className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-[#1b1108] transition hover:bg-amber-300 active:scale-95"
            >
              <Send className="h-3 w-3 shrink-0" />
              <span>Send</span>
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

export default VoiceBar;

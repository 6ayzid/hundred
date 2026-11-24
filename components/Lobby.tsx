'use client';

import React, { useRef, useState, useSyncExternalStore } from 'react';
import {
  Bot,
  Check,
  Copy,
  Crown,
  Dices,
  Globe,
  Link2,
  LogOut,
  Pencil,
  Play,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { BrandMark } from '@/components/BrandLogo';
import type {
  AvatarConfig,
  ChatMessage,
  GameAction,
  GameState,
  SeatIndex,
  SyncMode,
} from '@/lib/types';
import {
  AVATAR_BGS,
  AVATAR_CHARACTERS,
  AVATAR_OUTFITS,
  AVATAR_SKINS,
  DEFAULT_AVATAR,
  getPresetAvatarForSeat,
  pickRandomAvatar,
  pickRandomName,
} from '@/lib/avatar';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '@/lib/gameEngine';
import { unlockAudio } from '@/lib/soundEngine';
import { TEXTS, localizeDisplayName, type Lang } from '@/lib/i18n';
import { SeatAvatarGraphic } from '@/components/SeatHub';
import { VoiceBar } from '@/components/VoiceBar';

export interface LobbyProps {
  nickname: string;
  onNicknameChange: (name: string) => void;
  onRandomName?: () => void;
  avatar?: AvatarConfig;
  onAvatarChange?: (avatar: AvatarConfig) => void;
  onRandomAvatar?: () => void;
  profileCustomized?: boolean;
  onCompleteProfileSetup?: () => void;
  joinCodeInput: string;
  onJoinCodeInputChange: (code: string) => void;
  activeRoomCode: string | null;
  roomNotice?: string | null;
  onDismissNotice?: () => void;
  state: GameState | null;
  clientId: string;
  mySeatIndex: number | null;
  hostSeatIndex: number | null;
  syncMode: SyncMode;
  supabaseConfigured: boolean;
  livekitConfigured: boolean;
  lowDataMode: boolean;
  onToggleLowDataMode: () => void;
  rainEnabled: boolean;
  onToggleRain: () => void;
  chatMessages: ChatMessage[];
  onSendChat: (text: string) => void;
  onSpeakingMapChange: (speakingMap: Record<string, boolean>) => void;
  onEnterRoom: (roomCode: string, mode: 'create' | 'join') => void;
  onQuickPlaySolo?: () => void;
  onLeaveRoom: () => void;
  onDispatchAction: (action: GameAction) => void;
  availableCardScans?: number[] | string[];
  lang?: Lang;
  onToggleLang?: () => void;
}

const noopSubscribe = () => () => {};
const getCanShareSnapshot = () =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';
const getCanShareServer = () => false;

export function Lobby({
  nickname,
  onNicknameChange,
  onRandomName,
  avatar = DEFAULT_AVATAR,
  onAvatarChange,
  onRandomAvatar,
  profileCustomized = false,
  onCompleteProfileSetup,
  joinCodeInput,
  onJoinCodeInputChange,
  activeRoomCode,
  roomNotice,
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
  onQuickPlaySolo,
  onLeaveRoom,
  onDispatchAction,
  lang = 'bn',
  onToggleLang,
}: LobbyProps) {
  const t = TEXTS[lang];
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [customizerOverride, setCustomizerOverride] = useState<boolean | null>(null);
  const canNativeShare = useSyncExternalStore(
    noopSubscribe,
    getCanShareSnapshot,
    getCanShareServer,
  );
  const nicknameInputRef = useRef<HTMLInputElement | null>(null);

  const currentAvatar = avatar ?? DEFAULT_AVATAR;
  const isCustomizerOpen = customizerOverride ?? !profileCustomized;

  const ensureValidName = (): boolean => {
    if (!nickname.trim()) {
      setCustomizerOverride(true);
      setErrorMsg(t.errEmptyName);
      window.setTimeout(() => nicknameInputRef.current?.focus(), 0);
      return false;
    }
    setErrorMsg(null);
    return true;
  };

  const handleDoneCustomizing = () => {
    if (!ensureValidName()) return;
    onCompleteProfileSetup?.();
    setCustomizerOverride(false);
  };

  const handleRandomNameClick = () => {
    setErrorMsg(null);
    if (onRandomName) {
      onRandomName();
      return;
    }
    onNicknameChange(pickRandomName(lang, nickname));
  };

  const handleRandomAvatarClick = () => {
    if (onRandomAvatar) {
      onRandomAvatar();
      return;
    }
    onAvatarChange?.(pickRandomAvatar());
  };

  const handleQuickSoloClick = () => {
    unlockAudio();
    if (!ensureValidName()) return;
    onCompleteProfileSetup?.();
    setCustomizerOverride(false);
    if (onQuickPlaySolo) {
      onQuickPlaySolo();
      return;
    }
    onEnterRoom(generateRoomCode(), 'create');
  };

  const handleCreateRoom = () => {
    unlockAudio();
    if (!ensureValidName()) return;
    onEnterRoom(generateRoomCode(), 'create');
  };

  const handleJoinRoom = (event: React.FormEvent) => {
    event.preventDefault();
    unlockAudio();
    if (!ensureValidName()) return;
    const normalized = normalizeRoomCode(joinCodeInput);
    if (!isValidRoomCode(normalized)) {
      setErrorMsg(t.errInvalidCode);
      return;
    }
    setErrorMsg(null);
    onEnterRoom(normalized, 'join');
  };

  const buildInviteUrl = (roomCode: string): string => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`;
    }
    return `/?room=${encodeURIComponent(roomCode)}`;
  };

  const handleCopyInvite = async () => {
    if (!state?.roomCode) return;
    const inviteUrl = buildInviteUrl(state.roomCode);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
        return;
      }
    } catch {
      // Fallback below
    }
    if (typeof window !== 'undefined') {
      window.prompt(t.shareUrlPrompt, inviteUrl);
    }
  };

  const handleNativeShare = async () => {
    if (!state?.roomCode || typeof navigator === 'undefined' || !navigator.share) {
      return;
    }
    const inviteUrl = buildInviteUrl(state.roomCode);
    try {
      await navigator.share({
        title: 'হানডেট HUNDRED',
        text: `${t.roomCodeLabel}: ${state.roomCode}`,
        url: inviteUrl,
      });
    } catch {
      // User dismissed native share sheet
    }
  };

  const effectiveMySeat =
    state && mySeatIndex !== null
      ? mySeatIndex
      : state
        ? state.seats.findIndex((s) => s.clientId === clientId)
        : -1;
  const effectiveHostSeat =
    hostSeatIndex !== null
      ? hostSeatIndex
      : state
        ? (state.seats.find((s) => s.type === 'HUMAN')?.seatIndex ?? 0)
        : 0;
  const isMeHost = Boolean(
    state && effectiveMySeat >= 0 && effectiveMySeat === effectiveHostSeat,
  );
  const hostSeatObj = state?.seats[effectiveHostSeat];
  const hostDisplayName = hostSeatObj?.username
    ? localizeDisplayName(hostSeatObj.username, lang)
    : t.player;

  const filledSeatCount = state
    ? state.seats.filter((s) => s.type !== 'EMPTY').length
    : 0;
  const emptySeatCount = 4 - filledSeatCount;
  const allSeatsFilled = Boolean(state && emptySeatCount === 0);

  return (
    <div
      data-testid="lobby-root"
      className="bg-tabletop-photo relative flex min-h-screen w-full flex-col items-center justify-start overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6"
    >
      <div className="table-vignette fixed inset-0 z-0" aria-hidden="true" />
      <div className="lantern-glow fixed inset-0 z-0" aria-hidden="true" />

      <div
        data-testid="rain-overlay"
        aria-hidden="true"
        className={`rain-overlay pointer-events-none fixed inset-0 z-10 ${
          rainEnabled ? '' : 'rain-hidden'
        }`}
      />

      <main className="relative z-20 flex w-full max-w-2xl flex-col gap-3.5 sm:gap-4">
        {/* Top Kawaii Header Bar */}
        <header className="flex items-center justify-between gap-1.5 rounded-3xl border-2 border-[#ffd4df] bg-[#fffaf7]/92 px-2.5 py-2.5 shadow-[0_6px_0_#f4cbd4,0_12px_24px_rgba(145,84,96,0.14)] backdrop-blur-sm sm:gap-2 sm:px-5 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <BrandMark
              size={44}
              className="animate-cute-float h-9 w-9 shrink-0 drop-shadow-[0_3px_6px_rgba(216,53,99,0.22)] sm:h-11 sm:w-11"
            />

            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <h1 className="truncate font-sans text-[14.5px] font-extrabold tracking-tight text-[#4a2e2b] sm:text-2xl">
                  হানডেট{' '}
                  <span className="text-[#e04872]">HUNDRED</span>
                </h1>
              </div>
              <p className="truncate text-[10px] font-semibold text-[#8a6562] sm:text-xs">
                {t.subtitle}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {!activeRoomCode && (
              <button
                type="button"
                onClick={() => setCustomizerOverride(!isCustomizerOpen)}
                data-testid="profile-chip-btn"
                aria-expanded={isCustomizerOpen}
                aria-label={t.editProfile}
                title={t.editProfile}
                className={`inline-flex items-center gap-1.5 rounded-full border-2 py-1 pl-1 pr-2.5 text-xs font-extrabold transition active:translate-y-[1px] ${
                  isCustomizerOpen
                    ? 'border-[#e04872] bg-[#ffe7ee] text-[#b5234d] shadow-[0_3px_0_#e04872]'
                    : 'border-[#ffd4df] bg-white text-[#4a2e2b] shadow-[0_3px_0_#efccd4] hover:border-[#ff8fab] hover:bg-[#fff7f9]'
                }`}
              >
                <div className="h-[26px] w-[26px] shrink-0 overflow-hidden rounded-full border border-[#ffd4df] bg-[#fff4f6]">
                  <SeatAvatarGraphic avatar={currentAvatar} size={26} />
                </div>
                <span className="max-w-[66px] truncate sm:max-w-[115px]">
                  {nickname.trim() || t.player}
                </span>
                <Pencil className="h-3 w-3 shrink-0 text-[#c93e65]" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={onToggleLang}
              data-testid="lang-toggle-btn"
              aria-label={t.toggleLangLabel}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[#f4c6d0] bg-[#fff3f6] px-2.5 py-1.5 text-xs font-extrabold text-[#c93e65] shadow-[0_3px_0_#eec0ca] transition hover:bg-[#ffe7ee] active:translate-y-[1px] sm:gap-1.5 sm:px-3"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{t.toggleLangText}</span>
            </button>
          </div>
        </header>

        {/* Optional Room Notice */}
        {roomNotice && (
          <div
            data-testid="lobby-notice"
            role="status"
            className="flex items-center justify-between gap-2 rounded-2xl border-2 border-[#ffd57e] bg-[#fff7dc] px-4 py-2.5 text-xs font-bold text-[#7c5008] shadow-sm sm:text-sm"
          >
            <span>{roomNotice}</span>
            {onDismissNotice && (
              <button
                type="button"
                onClick={onDismissNotice}
                aria-label="Close"
                className="rounded-full p-1 text-[#9a6a12] transition hover:bg-[#ffe8a6]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Joining Loading Card */}
        {activeRoomCode && !state && (
          <section
            data-testid="joining-room-card"
            className="flex flex-col items-center gap-3 rounded-3xl border-2 border-[#f4c6d0] bg-[#fffaf7]/95 p-6 text-center shadow-[0_8px_0_#efccd4,0_16px_30px_rgba(145,84,96,0.16)]"
          >
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ffd1dd] border-t-[#e04872]" />
            <div className="space-y-1">
              <p className="text-base font-extrabold text-[#4a2e2b]">
                {t.joiningRoom}
              </p>
              <p className="text-xs font-semibold text-[#8a6562]">
                {activeRoomCode} • {t.joiningWait}
              </p>
            </div>
            <button
              type="button"
              onClick={onLeaveRoom}
              className="rounded-full border-2 border-[#f0c7d0] bg-[#fff2f5] px-4 py-1.5 text-xs font-bold text-[#b84665] transition hover:bg-[#ffe4eb]"
            >
              {t.cancel}
            </button>
          </section>
        )}

        {/* Pre-Room Home Screen */}
        {!activeRoomCode && (
          <>
            {/* Block 1: Collapsible Identity & Visual Avatar Customizer */}
            {isCustomizerOpen && (
            <section
              data-testid="profile-customizer-panel"
              className="animate-panel-enter rounded-3xl border-2 border-[#ffd4df] bg-[#fffaf7]/95 p-4 shadow-[0_7px_0_#f2cad3,0_14px_28px_rgba(145,84,96,0.14)] sm:p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {/* Large Live Avatar Preview */}
                <div className="flex shrink-0 flex-col items-center gap-1.5 self-center">
                  <div className="rounded-full border-4 border-[#fff] bg-[#fff4f6] p-1 shadow-[0_6px_16px_rgba(224,72,114,0.2)]">
                    <SeatAvatarGraphic avatar={currentAvatar} size={76} />
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#b7e4c7] bg-[#eaf9ef] px-2.5 py-0.5 text-[10px] font-extrabold text-[#26734d]">
                    <Check className="h-3 w-3" />
                    {t.savedBadge}
                  </span>
                </div>

                {/* Right Column: Name Input + Look Label */}
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <label
                    htmlFor="hundred-nickname-input"
                    className="flex items-center justify-between gap-2 text-sm font-extrabold text-[#4a2e2b] sm:text-base"
                  >
                    <span>{t.nicknameLabel}</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <input
                      id="hundred-nickname-input"
                      ref={nicknameInputRef}
                      type="text"
                      maxLength={18}
                      value={nickname}
                      onChange={(e) => {
                        onNicknameChange(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      placeholder={t.nicknamePlaceholder}
                      data-testid="nickname-input"
                      className="min-w-0 flex-1 rounded-2xl border-2 border-[#f2c6d2] bg-white px-3.5 py-2.5 text-base font-extrabold text-[#4a2e2b] placeholder:text-[#bfa3a0] focus:border-[#ff7597] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleRandomNameClick}
                      data-testid="random-name-btn"
                      title={t.randomName}
                      aria-label={t.randomName}
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border-2 border-[#ffd57e] bg-[#fff4d6] px-3 text-xs font-extrabold text-[#825209] shadow-[0_3px_0_#e4b54a] transition hover:bg-[#ffeaa8] active:translate-y-[1px]"
                    >
                      <Dices className="h-4 w-4" />
                      <span className="hidden sm:inline">{t.randomName}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Visual Avatar Picker */}
              <div
                data-testid="avatar-customizer"
                className="mt-4 rounded-2xl border-2 border-[#fbe0e7] bg-[#fff5f8] p-3"
              >
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-extrabold text-[#5c3936] sm:text-sm">
                    <Sparkles className="h-3.5 w-3.5 text-[#ff7597]" />
                    {t.lookLabel}
                  </span>
                  <button
                    type="button"
                    onClick={handleRandomAvatarClick}
                    data-testid="random-avatar-btn"
                    className="inline-flex items-center gap-1 rounded-full border border-[#e6c4f4] bg-[#f7ecff] px-2.5 py-1 text-[11px] font-extrabold text-[#77489d] transition hover:bg-[#eedcff] active:scale-95"
                  >
                    <Dices className="h-3.5 w-3.5" />
                    <span>{t.randomLook}</span>
                  </button>
                </div>

                {/* 6 Clickable Cute Character Style Previews */}
                <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
                  {AVATAR_CHARACTERS.map((charId) => {
                    const selected = currentAvatar.character === charId;
                    return (
                      <button
                        key={charId}
                        type="button"
                        onClick={() =>
                          onAvatarChange?.({
                            ...currentAvatar,
                            character: charId,
                          })
                        }
                        data-testid={`avatar-char-${charId}`}
                        aria-label={charId}
                        aria-pressed={selected}
                        className={`relative flex items-center justify-center rounded-2xl p-1.5 transition ${
                          selected
                            ? 'scale-105 border-2 border-[#e04872] bg-white shadow-[0_3px_0_#e04872]'
                            : 'border-2 border-transparent bg-white/75 hover:border-[#f8c4d2] hover:bg-white'
                        }`}
                      >
                        <SeatAvatarGraphic
                          avatar={{ ...currentAvatar, character: charId }}
                          size={42}
                        />
                        {selected && (
                          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#e04872] text-white shadow">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Visual Color Dots Strip (No Reading Required) */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-[#f7d8e0] pt-2.5">
                  {/* Pastel Backgrounds */}
                  <div className="flex items-center gap-1.5" role="group" aria-label="Background color">
                    <span
                      className="mr-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] shadow-xs"
                      aria-hidden="true"
                    >
                      🎨
                    </span>
                    {AVATAR_BGS.map((bg) => {
                      const active = currentAvatar.bg === bg.id;
                      return (
                        <button
                          key={bg.id}
                          type="button"
                          onClick={() =>
                            onAvatarChange?.({ ...currentAvatar, bg: bg.id })
                          }
                          data-testid={`avatar-bg-${bg.id}`}
                          aria-label={`Background ${bg.id}`}
                          aria-pressed={active}
                          style={{ backgroundColor: bg.base }}
                          className={`h-6 w-6 rounded-full border-2 transition ${
                            active
                              ? 'scale-110 border-[#4a2e2b] ring-2 ring-[#ff8fab]/60'
                              : 'border-white shadow-xs hover:scale-105'
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* Outfit Colors */}
                  <div className="flex items-center gap-1.5" role="group" aria-label="Outfit color">
                    <span
                      className="mr-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] shadow-xs"
                      aria-hidden="true"
                    >
                      👕
                    </span>
                    {AVATAR_OUTFITS.map((outfit) => {
                      const active = currentAvatar.outfit === outfit.id;
                      return (
                        <button
                          key={outfit.id}
                          type="button"
                          onClick={() =>
                            onAvatarChange?.({
                              ...currentAvatar,
                              outfit: outfit.id,
                            })
                          }
                          data-testid={`avatar-outfit-${outfit.id}`}
                          aria-label={`Outfit ${outfit.id}`}
                          aria-pressed={active}
                          style={{ backgroundColor: outfit.fill }}
                          className={`h-6 w-6 rounded-full border-2 transition ${
                            active
                              ? 'scale-110 border-[#4a2e2b] ring-2 ring-[#ff8fab]/60'
                              : 'border-white shadow-xs hover:scale-105'
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* Skin Tones */}
                  <div className="flex items-center gap-1.5" role="group" aria-label="Skin tone">
                    <span
                      className="mr-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] shadow-xs"
                      aria-hidden="true"
                    >
                      😊
                    </span>
                    {AVATAR_SKINS.map((skin) => {
                      const active = currentAvatar.skin === skin.id;
                      return (
                        <button
                          key={skin.id}
                          type="button"
                          onClick={() =>
                            onAvatarChange?.({
                              ...currentAvatar,
                              skin: skin.id,
                            })
                          }
                          data-testid={`avatar-skin-${skin.id}`}
                          aria-label={`Skin ${skin.id}`}
                          aria-pressed={active}
                          style={{ backgroundColor: skin.fill }}
                          className={`h-6 w-6 rounded-full border-2 transition ${
                            active
                              ? 'scale-110 border-[#4a2e2b] ring-2 ring-[#ff8fab]/60'
                              : 'border-white shadow-xs hover:scale-105'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-3.5 flex justify-end">
                <button
                  type="button"
                  onClick={handleDoneCustomizing}
                  data-testid="profile-done-btn"
                  className="inline-flex items-center gap-1.5 rounded-2xl border-2 border-[#39996d] bg-[#52b788] px-4 py-2 text-xs font-extrabold text-white shadow-[0_3px_0_#2b7c56] transition hover:bg-[#46a87b] active:translate-y-[1px] sm:text-sm"
                >
                  <span>{t.doneCustomizing}</span>
                </button>
              </div>
            </section>
            )}

            {/* Block 2: Crystal-Clear Play Modes (Solo 1-Tap vs Friends) */}
            <section className="flex flex-col gap-3">
              {/* Hero 1-Tap Solo Play Button */}
              <button
                type="button"
                onClick={handleQuickSoloClick}
                data-testid="quick-solo-btn"
                className="group relative flex w-full items-center justify-between gap-3 rounded-3xl border-2 border-[#39996d] bg-gradient-to-r from-[#52b788] via-[#48af80] to-[#3ca172] px-4 py-3.5 text-left text-white shadow-[0_7px_0_#2b7c56,0_14px_26px_rgba(43,124,86,0.28)] transition hover:brightness-[1.03] active:translate-y-[3px] active:shadow-[0_4px_0_#2b7c56] sm:px-5 sm:py-4"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
                  {/* Visual Matchup Graphic: [User Avatar] vs [Bots x3] */}
                  <div className="flex shrink-0 items-center gap-1 rounded-2xl bg-white/20 p-1.5 backdrop-blur-xs">
                    <div className="h-[34px] w-[34px] shrink-0 overflow-hidden rounded-full border-2 border-white bg-white shadow-xs">
                      <SeatAvatarGraphic avatar={currentAvatar} size={34} />
                    </div>
                    <span className="px-0.5 text-[10px] font-black text-[#fff3c4] sm:text-[11px]">
                      VS
                    </span>
                    <div className="flex -space-x-2">
                      {([1, 2, 3] as const satisfies readonly SeatIndex[]).map((slot) => (
                        <div
                          key={slot}
                          className="h-[26px] w-[26px] shrink-0 overflow-hidden rounded-full border-2 border-white bg-[#d7f5ef] shadow-xs"
                        >
                          <SeatAvatarGraphic
                            seat={{
                              seatIndex: slot,
                              type: 'AI',
                              clientId: `bot-${slot}`,
                              username: `Bot ${slot}`,
                              isOnline: true,
                              avatar: getPresetAvatarForSeat(slot),
                              hand: [],
                              call: null,
                              capturedPoints: 0,
                              tricksWon: 0,
                              totalScore: 0,
                            }}
                            size={26}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="inline-flex items-center gap-1 rounded-full bg-[#ffd166] px-2 py-0.5 text-[10px] font-black text-[#4a2e2b]">
                      <Sparkles className="h-3 w-3" />
                      <span>{t.soloPlayBadge}</span>
                    </div>
                    <p className="mt-1 text-sm font-extrabold leading-tight text-white sm:text-xl">
                      {t.soloPlayTitle}
                    </p>
                  </div>
                </div>

                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#2e855c] shadow-[0_3px_0_#b7e4c7] transition group-hover:scale-105">
                  <Play className="h-5 w-5 fill-current" />
                </div>
              </button>

              {/* Friends Room Card (Create Invite Link OR Enter Room Code) */}
              <div className="rounded-3xl border-2 border-[#cfe0ff] bg-[#f8fbff]/95 p-4 shadow-[0_7px_0_#cadbff,0_14px_26px_rgba(92,126,196,0.14)] sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#dce9ff] text-[#3563c9]">
                    <Users className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-extrabold text-[#2b3f6b] sm:text-base">
                    {t.friendsSectionTitle}
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Create Friend Room + Link */}
                  <button
                    type="button"
                    onClick={handleCreateRoom}
                    data-testid="create-room-btn"
                    className="flex items-center justify-between gap-2 rounded-2xl border-2 border-[#4e7ef2] bg-[#6c9bf5] px-4 py-3 text-left text-white shadow-[0_5px_0_#4371de] transition hover:bg-[#5b8ef2] active:translate-y-[2px] active:shadow-[0_3px_0_#4371de]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold sm:text-base">
                        {t.createRoom}
                      </p>
                      <p className="truncate text-[11px] font-semibold text-[#edf4ff]">
                        {t.createRoomSub}
                      </p>
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/25 text-white">
                      <Link2 className="h-4 w-4" />
                    </div>
                  </button>

                  {/* Join Friend's Room Code */}
                  <form
                    onSubmit={handleJoinRoom}
                    className="flex items-center gap-2 rounded-2xl border-2 border-[#d4e2ff] bg-white p-1.5 shadow-inner"
                  >
                    <input
                      type="text"
                      value={joinCodeInput}
                      onChange={(e) => {
                        onJoinCodeInputChange(e.target.value.toUpperCase());
                        if (errorMsg) setErrorMsg(null);
                      }}
                      placeholder={t.joinCodePlaceholder}
                      data-testid="join-room-input"
                      aria-label={t.joinCodePlaceholder}
                      className="min-w-0 flex-1 rounded-xl bg-transparent px-2.5 py-2 text-center font-mono text-sm font-extrabold uppercase tracking-wider text-[#2b3f6b] placeholder:font-sans placeholder:text-xs placeholder:font-bold placeholder:tracking-normal placeholder:text-[#96a9cc] focus:outline-none"
                    />
                    <button
                      type="submit"
                      data-testid="join-room-btn"
                      className="shrink-0 rounded-xl bg-[#ff8fab] px-3.5 py-2 text-xs font-extrabold text-white shadow-[0_3px_0_#db5e7f] transition hover:bg-[#ff789b] active:translate-y-[1px] sm:text-sm"
                    >
                      {t.joinRoom}
                    </button>
                  </form>
                </div>
              </div>

              {/* Validation Error Banner */}
              {errorMsg && (
                <div
                  data-testid="lobby-error"
                  role="alert"
                  className="rounded-2xl border-2 border-[#ffb3c6] bg-[#fff0f4] px-4 py-2.5 text-center text-xs font-extrabold text-[#c72c58] sm:text-sm"
                >
                  {errorMsg}
                </div>
              )}
            </section>
          </>
        )}

        {/* Active Room Lobby View */}
        {activeRoomCode && state && (
          <section
            data-testid="room-lobby"
            className="flex flex-col gap-3.5 rounded-3xl border-2 border-[#ffd4df] bg-[#fffaf7]/95 p-4 shadow-[0_8px_0_#efccd4,0_16px_32px_rgba(145,84,96,0.16)] sm:p-5"
          >
            {/* Prominent Friend Invite Header */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border-2 border-[#dbe8ff] bg-[#f4f8ff] px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#5b74a8]">
                    {t.roomCodeLabel}
                  </p>
                  <p
                    data-testid="lobby-room-code"
                    className="font-mono text-xl font-black tracking-widest text-[#2b3f6b] sm:text-2xl"
                  >
                    {state.roomCode}
                  </p>
                </div>

                <span className="rounded-full border border-[#b7e4c7] bg-[#eaf9ef] px-2.5 py-1 text-xs font-extrabold text-[#26734d]">
                  {t.seatedProgress(filledSeatCount)}
                </span>

                <span
                  aria-label={supabaseConfigured ? 'Cloud sync' : 'Relay sync'}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#526996] shadow-xs"
                >
                  <Wifi className="h-3 w-3 text-[#52b788]" />
                  <span>{syncMode === 'supabase' ? t.syncLive : t.syncRelay}</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyInvite()}
                  data-testid="copy-invite-btn"
                  className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#9ec0ff] bg-white px-3 py-1.5 text-xs font-extrabold text-[#3059b8] transition hover:bg-[#ebf2ff] active:scale-95"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#3ca172]" />
                      <span>{t.copied}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>{t.copyInvite}</span>
                    </>
                  )}
                </button>

                {canNativeShare && (
                  <button
                    type="button"
                    onClick={() => void handleNativeShare()}
                    className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#ffadc2] bg-[#fff0f4] px-3 py-1.5 text-xs font-extrabold text-[#c93e65] transition hover:bg-[#ffe1ea]"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    <span>{t.shareInvite}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onLeaveRoom}
                  data-testid="lobby-leave-btn"
                  className="inline-flex items-center gap-1 rounded-xl border-2 border-[#f2c6d2] bg-white px-3 py-1.5 text-xs font-extrabold text-[#9e475c] transition hover:bg-[#fff0f3]"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>{t.leave}</span>
                </button>
              </div>
            </div>

            {/* 4-Seat Visual Grid */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {state.seats.map((seat) => {
                const isMe =
                  seat.type === 'HUMAN' &&
                  (seat.clientId === clientId || seat.seatIndex === effectiveMySeat);
                const isSeatHost =
                  seat.type === 'HUMAN' && seat.seatIndex === effectiveHostSeat;
                const seatTitle =
                  seat.type === 'EMPTY'
                    ? t.emptySeat(seat.seatIndex + 1)
                    : localizeDisplayName(seat.username, lang);
                const seatAvatar =
                  seat.type === 'HUMAN'
                    ? isMe
                      ? currentAvatar
                      : seat.avatar ?? getPresetAvatarForSeat(seat.seatIndex)
                    : seat.avatar ?? getPresetAvatarForSeat(seat.seatIndex);

                return (
                  <div
                    key={seat.seatIndex}
                    data-testid={`lobby-seat-${seat.seatIndex}`}
                    className={`flex items-center justify-between gap-2.5 rounded-2xl border-2 px-3 py-2.5 transition ${
                      seat.type === 'EMPTY'
                        ? 'border-dashed border-[#eac2cc] bg-[#fffdfd]'
                        : isMe
                          ? 'border-[#52b788] bg-[#f1fbf5] shadow-[0_3px_0_#b7e4c7]'
                          : seat.type === 'AI'
                            ? 'border-[#b9e6e0] bg-[#f1fbfa]'
                            : 'border-[#ffd4df] bg-white shadow-[0_3px_0_#f4d5dc]'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      {seat.type === 'EMPTY' ? (
                        <div className="flex h-[52px] w-[52px] shrink-0 animate-pulse items-center justify-center rounded-full border-2 border-dashed border-[#eabac7] bg-[#fff5f7] text-[#c78b9b]">
                          <Users className="h-5 w-5" />
                        </div>
                      ) : (
                        <div className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-full">
                          <SeatAvatarGraphic
                            seat={seat}
                            avatar={seatAvatar}
                            size={52}
                          />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-extrabold text-[#4a2e2b]">
                          {seatTitle}
                        </p>

                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {isMe && isSeatHost && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-[#ffd166] px-2 py-0.5 text-[10px] font-black text-[#4a2e2b]">
                              <Crown className="h-2.5 w-2.5" />
                              {t.youHost}
                            </span>
                          )}
                          {isMe && !isSeatHost && (
                            <span className="rounded-full bg-[#d8f3dc] px-2 py-0.5 text-[10px] font-black text-[#1d6b43]">
                              {t.you}
                            </span>
                          )}
                          {!isMe && isSeatHost && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-[#fff1c2] px-2 py-0.5 text-[10px] font-black text-[#8f5b08]">
                              <Crown className="h-2.5 w-2.5" />
                              {t.host}
                            </span>
                          )}
                          {seat.type === 'AI' && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-[#d7f5ef] px-2 py-0.5 text-[10px] font-black text-[#166d66]">
                              <Bot className="h-2.5 w-2.5" />
                              {t.aiBot}
                            </span>
                          )}
                          {seat.type === 'EMPTY' && (
                            <span className="rounded-full bg-[#fff0f4] px-2 py-0.5 text-[10px] font-bold text-[#a66e7d]">
                              {t.openSeat}
                            </span>
                          )}
                        </div>
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
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[#ffd57e] bg-[#fff5d6] px-2.5 py-1 text-xs font-bold text-[#8a5808] transition hover:bg-[#ffc857] hover:text-[#4a2e2b]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{t.addBot.replace(/^\+\s*/, '')}</span>
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
                        aria-label={`${t.removeBot} ${seatTitle}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#f8b4c4] bg-[#fff0f4] px-2.5 py-1 text-xs font-bold text-[#c73e65] transition hover:bg-[#ffdce5]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{t.removeBot}</span>
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
                    <span>{t.fillBotsStart}</span>
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
                  <span>{t.startMatch}</span>
                </button>
              </div>
            ) : (
              <div
                data-testid="waiting-for-host-banner"
                className="flex items-center justify-center gap-2 rounded-2xl border border-[#ffd88a] bg-[#fff8e4] px-4 py-2.5 text-xs font-bold text-[#7a5010]"
              >
                <Crown className="h-3.5 w-3.5 text-[#f59e0b]" />
                <span>{t.waitingHost(hostDisplayName)}</span>
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
                lang={lang}
              />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default Lobby;

'use client';

import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { GameTable } from '@/components/GameTable';
import { Lobby } from '@/components/Lobby';
import { useGameSync } from '@/hooks/useGameSync';
import {
  AVATAR_STORAGE_KEY,
  DEFAULT_AVATAR,
  LOW_DATA_STORAGE_KEY,
  NICKNAME_STORAGE_KEY,
  normalizeAvatarConfig,
  pickRandomAvatar,
  pickRandomName,
  PROFILE_DONE_STORAGE_KEY,
  RAIN_STORAGE_KEY,
} from '@/lib/avatar';
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from '@/lib/gameEngine';
import {
  DEFAULT_LANG,
  LANG_STORAGE_KEY,
  localizeRoomNotice,
  type Lang,
} from '@/lib/i18n';
import type { AvatarConfig, SpeakingMap } from '@/lib/types';

function subscribeStorage(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getStoredNicknameSnapshot(): string {
  if (typeof window === 'undefined') return '';
  try {
    const val = window.localStorage.getItem(NICKNAME_STORAGE_KEY)?.trim() ?? '';
    return val === 'Player' ? '' : val;
  } catch {
    return '';
  }
}

function getServerNicknameSnapshot(): string {
  return '';
}

const DEFAULT_AVATAR_JSON = JSON.stringify(DEFAULT_AVATAR);

function getStoredAvatarJsonSnapshot(): string {
  if (typeof window === 'undefined') return DEFAULT_AVATAR_JSON;
  try {
    return window.localStorage.getItem(AVATAR_STORAGE_KEY) || DEFAULT_AVATAR_JSON;
  } catch {
    return DEFAULT_AVATAR_JSON;
  }
}

function getServerAvatarJsonSnapshot(): string {
  return DEFAULT_AVATAR_JSON;
}

function parseAvatarJson(raw: string): AvatarConfig {
  try {
    return normalizeAvatarConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AVATAR };
  }
}

function getStoredLangSnapshot(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  try {
    const raw = window.localStorage.getItem(LANG_STORAGE_KEY);
    return raw === 'en' ? 'en' : 'bn';
  } catch {
    return DEFAULT_LANG;
  }
}

function getServerLangSnapshot(): Lang {
  return DEFAULT_LANG;
}

function getStoredBoolSnapshot(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export interface HundredAppProps {
  initialRoom?: string;
  supabaseConfigured: boolean;
  livekitConfigured: boolean;
  availableCardScans?: number[];
}

export function HundredApp({
  initialRoom = '',
  supabaseConfigured,
  livekitConfigured,
  availableCardScans = [],
}: HundredAppProps) {
  const normalizedInitial = initialRoom ? normalizeRoomCode(initialRoom) : '';

  const hasInitialRoomParam = initialRoom.trim().length > 0;
  const isInitialRoomValid = Boolean(
    normalizedInitial && isValidRoomCode(normalizedInitial),
  );

  const storedNickname = useSyncExternalStore(
    subscribeStorage,
    getStoredNicknameSnapshot,
    getServerNicknameSnapshot,
  );
  const [nicknameDraft, setNicknameDraft] = useState<string | null>(null);
  const nickname = nicknameDraft ?? storedNickname;

  const storedAvatarJson = useSyncExternalStore(
    subscribeStorage,
    getStoredAvatarJsonSnapshot,
    getServerAvatarJsonSnapshot,
  );
  const [avatarDraft, setAvatarDraft] = useState<AvatarConfig | null>(null);
  const avatar = avatarDraft ?? parseAvatarJson(storedAvatarJson);

  const storedLang = useSyncExternalStore(
    subscribeStorage,
    getStoredLangSnapshot,
    getServerLangSnapshot,
  );
  const [langDraft, setLangDraft] = useState<Lang | null>(null);
  const lang: Lang = langDraft ?? storedLang;

  const storedLowData = useSyncExternalStore(
    subscribeStorage,
    () => getStoredBoolSnapshot(LOW_DATA_STORAGE_KEY, false),
    () => false,
  );
  const [lowDataDraft, setLowDataDraft] = useState<boolean | null>(null);
  const lowDataMode = lowDataDraft ?? storedLowData;

  const storedRain = useSyncExternalStore(
    subscribeStorage,
    () => getStoredBoolSnapshot(RAIN_STORAGE_KEY, true),
    () => true,
  );
  const [rainDraft, setRainDraft] = useState<boolean | null>(null);
  const rainEnabled = rainDraft ?? storedRain;

  const storedProfileDone = useSyncExternalStore(
    subscribeStorage,
    () => getStoredBoolSnapshot(PROFILE_DONE_STORAGE_KEY, false),
    () => false,
  );
  const [profileDoneDraft, setProfileDoneDraft] = useState<boolean | null>(null);
  const profileCustomized = profileDoneDraft ?? storedProfileDone;

  // Initialize random cute identity & look once in browser localStorage for first-time visitors
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      let seeded = false;
      const existingName = window.localStorage.getItem(NICKNAME_STORAGE_KEY)?.trim() ?? '';
      if (!existingName || existingName === 'Player') {
        const currentLang = window.localStorage.getItem(LANG_STORAGE_KEY) === 'en' ? 'en' : 'bn';
        const generated = pickRandomName(currentLang);
        window.localStorage.setItem(NICKNAME_STORAGE_KEY, generated);
        seeded = true;
      }
      if (!window.localStorage.getItem(AVATAR_STORAGE_KEY)) {
        const generatedAvatar = pickRandomAvatar();
        window.localStorage.setItem(
          AVATAR_STORAGE_KEY,
          JSON.stringify(generatedAvatar),
        );
        seeded = true;
      }
      if (seeded) {
        window.dispatchEvent(new Event('storage'));
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const [joinCodeInput, setJoinCodeInput] = useState<string>(
    isInitialRoomValid ? normalizedInitial : '',
  );
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(
    isInitialRoomValid ? normalizedInitial : null,
  );
  const [joinOnlyMode, setJoinOnlyMode] = useState<boolean>(isInitialRoomValid);
  const [pendingSoloRoom, setPendingSoloRoom] = useState<string | null>(null);
  const [roomNotice, setRoomNotice] = useState<string | null>(
    hasInitialRoomParam && !isInitialRoomValid
      ? 'Invalid invite link — check the room code.'
      : null,
  );
  const [speakingByClientId, setSpeakingByClientId] = useState<SpeakingMap>({});

  const handleNicknameChange = useCallback((value: string) => {
    setNicknameDraft(value);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(NICKNAME_STORAGE_KEY, value);
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  const handleAvatarChange = useCallback((nextAvatar: AvatarConfig) => {
    const clean = normalizeAvatarConfig(nextAvatar);
    setAvatarDraft(clean);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(clean));
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  const handleCompleteProfileSetup = useCallback(() => {
    setProfileDoneDraft(true);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(PROFILE_DONE_STORAGE_KEY, '1');
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  const handleRandomName = useCallback(() => {
    const next = pickRandomName(lang, nickname);
    handleNicknameChange(next);
  }, [lang, nickname, handleNicknameChange]);

  const handleRandomAvatar = useCallback(() => {
    handleAvatarChange(pickRandomAvatar());
  }, [handleAvatarChange]);

  const handleToggleLang = useCallback(() => {
    const next: Lang = lang === 'bn' ? 'en' : 'bn';
    setLangDraft(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LANG_STORAGE_KEY, next);
      } catch {
        // Ignore storage errors
      }
    }
  }, [lang]);

  const syncUrlRoomParam = useCallback((roomCode: string | null) => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (roomCode) {
        url.searchParams.set('room', roomCode);
      } else {
        url.searchParams.delete('room');
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      // Ignore history API errors
    }
  }, []);

  const handleEnterRoom = useCallback(
    (roomCode: string, mode: 'create' | 'join' = 'create') => {
      const normalized = normalizeRoomCode(roomCode);
      if (!isValidRoomCode(normalized)) return;
      handleCompleteProfileSetup();
      setRoomNotice(null);
      setPendingSoloRoom(null);
      setJoinOnlyMode(mode === 'join');
      setActiveRoomCode(normalized);
      syncUrlRoomParam(normalized);
    },
    [handleCompleteProfileSetup, syncUrlRoomParam],
  );

  const handleQuickPlaySolo = useCallback(() => {
    const code = generateRoomCode();
    handleCompleteProfileSetup();
    setRoomNotice(null);
    setJoinOnlyMode(false);
    setPendingSoloRoom(code);
    setJoinCodeInput(code);
    setActiveRoomCode(code);
    syncUrlRoomParam(code);
  }, [handleCompleteProfileSetup, syncUrlRoomParam]);

  const effectiveUsername = nickname.trim() || (lang === 'bn' ? 'অতিথি' : 'Guest');

  const {
    state,
    clientId,
    mySeatIndex,
    hostSeatIndex,
    isHost,
    syncMode,
    chatMessages,
    remainingMs,
    connectionStatus,
    roomUnavailableReason,
    dispatchAction,
    sendChat,
    leaveRoom,
  } = useGameSync({
    roomCode: activeRoomCode ?? '',
    username: effectiveUsername,
    avatar,
    enabled: Boolean(activeRoomCode),
    joinOnly: joinOnlyMode,
  });

  // 1-tap Solo Start: automatically fill 3 bots and launch as soon as host room initializes
  useEffect(() => {
    if (
      !pendingSoloRoom ||
      !activeRoomCode ||
      pendingSoloRoom !== activeRoomCode ||
      !state ||
      state.roomCode !== pendingSoloRoom ||
      state.phase !== 'LOBBY' ||
      !isHost
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      dispatchAction({ type: 'FILL_BOTS_AND_START' });
      setPendingSoloRoom(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pendingSoloRoom, activeRoomCode, state, isHost, dispatchAction]);

  const handleLeaveRoom = useCallback(() => {
    leaveRoom();
    setActiveRoomCode(null);
    setJoinOnlyMode(false);
    setPendingSoloRoom(null);
    setSpeakingByClientId({});
    syncUrlRoomParam(null);
  }, [leaveRoom, syncUrlRoomParam]);

  // If an invite/join room wasn't found, is full, or already started, return cleanly to Lobby with notice
  useEffect(() => {
    if (!roomUnavailableReason) return;
    const reason = roomUnavailableReason;
    const t = window.setTimeout(() => {
      leaveRoom();
      setActiveRoomCode(null);
      setJoinOnlyMode(false);
      setPendingSoloRoom(null);
      setSpeakingByClientId({});
      syncUrlRoomParam(null);
      setRoomNotice(reason);
    }, 0);
    return () => window.clearTimeout(t);
  }, [roomUnavailableReason, leaveRoom, syncUrlRoomParam]);

  const handleToggleLowDataMode = useCallback(() => {
    const next = !lowDataMode;
    setLowDataDraft(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOW_DATA_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
    }
  }, [lowDataMode]);

  const handleToggleRain = useCallback(() => {
    const next = !rainEnabled;
    setRainDraft(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(RAIN_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
    }
  }, [rainEnabled]);

  const handleSpeakingMapChange = useCallback((map: SpeakingMap) => {
    setSpeakingByClientId(map);
  }, []);

  const localizedNotice = roomNotice ? localizeRoomNotice(roomNotice, lang) : null;

  const inActiveMatch = Boolean(
    activeRoomCode && state && state.phase !== 'LOBBY',
  );

  if (inActiveMatch && state) {
    return (
      <GameTable
        state={state}
        clientId={clientId}
        username={effectiveUsername}
        mySeatIndex={mySeatIndex}
        hostSeatIndex={hostSeatIndex}
        syncMode={syncMode}
        connectionStatus={connectionStatus}
        remainingMs={remainingMs}
        isLiveKitConfigured={livekitConfigured}
        lowDataMode={lowDataMode}
        onToggleLowDataMode={handleToggleLowDataMode}
        rainEnabled={rainEnabled}
        onToggleRain={handleToggleRain}
        chatMessages={chatMessages}
        onSendChat={sendChat}
        speakingByClientId={speakingByClientId}
        onSpeakingMapChange={handleSpeakingMapChange}
        onDispatchAction={dispatchAction}
        onLeaveRoom={handleLeaveRoom}
        availableCardScans={availableCardScans}
        lang={lang}
        onToggleLang={handleToggleLang}
      />
    );
  }

  return (
    <Lobby
      nickname={nickname}
      onNicknameChange={handleNicknameChange}
      onRandomName={handleRandomName}
      avatar={avatar}
      onAvatarChange={handleAvatarChange}
      onRandomAvatar={handleRandomAvatar}
      profileCustomized={profileCustomized}
      onCompleteProfileSetup={handleCompleteProfileSetup}
      joinCodeInput={joinCodeInput}
      onJoinCodeInputChange={setJoinCodeInput}
      activeRoomCode={activeRoomCode}
      roomNotice={localizedNotice}
      onDismissNotice={() => setRoomNotice(null)}
      state={state}
      clientId={clientId}
      mySeatIndex={mySeatIndex}
      hostSeatIndex={hostSeatIndex}
      syncMode={syncMode}
      supabaseConfigured={supabaseConfigured}
      livekitConfigured={livekitConfigured}
      lowDataMode={lowDataMode}
      onToggleLowDataMode={handleToggleLowDataMode}
      rainEnabled={rainEnabled}
      onToggleRain={handleToggleRain}
      chatMessages={chatMessages}
      onSendChat={sendChat}
      onSpeakingMapChange={handleSpeakingMapChange}
      onEnterRoom={handleEnterRoom}
      onQuickPlaySolo={handleQuickPlaySolo}
      onLeaveRoom={handleLeaveRoom}
      onDispatchAction={dispatchAction}
      availableCardScans={availableCardScans}
      lang={lang}
      onToggleLang={handleToggleLang}
    />
  );
}

export default HundredApp;

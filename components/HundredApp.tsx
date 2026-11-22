'use client';

import React, { useCallback, useState, useSyncExternalStore } from 'react';
import { GameTable } from '@/components/GameTable';
import { Lobby } from '@/components/Lobby';
import { useGameSync } from '@/hooks/useGameSync';
import { isValidRoomCode, normalizeRoomCode } from '@/lib/gameEngine';
import type { SpeakingMap } from '@/lib/types';

const NICKNAME_STORAGE_KEY = 'hundred_nickname';

function subscribeNicknameStorage(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getStoredNicknameSnapshot(): string {
  if (typeof window === 'undefined') return 'Player';
  try {
    return window.localStorage.getItem(NICKNAME_STORAGE_KEY)?.trim() || 'Player';
  } catch {
    return 'Player';
  }
}

function getServerNicknameSnapshot(): string {
  return 'Player';
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

  const storedNickname = useSyncExternalStore(
    subscribeNicknameStorage,
    getStoredNicknameSnapshot,
    getServerNicknameSnapshot,
  );
  const [nicknameDraft, setNicknameDraft] = useState<string | null>(null);
  const nickname = nicknameDraft ?? storedNickname;

  const [joinCodeInput, setJoinCodeInput] = useState<string>(normalizedInitial);
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [lowDataMode, setLowDataMode] = useState<boolean>(false);
  const [rainEnabled, setRainEnabled] = useState<boolean>(true);
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
    (roomCode: string) => {
      const normalized = normalizeRoomCode(roomCode);
      if (!isValidRoomCode(normalized)) return;
      setActiveRoomCode(normalized);
      syncUrlRoomParam(normalized);
    },
    [syncUrlRoomParam],
  );

  const {
    state,
    clientId,
    mySeatIndex,
    hostSeatIndex,
    syncMode,
    chatMessages,
    remainingMs,
    connectionStatus,
    dispatchAction,
    sendChat,
    leaveRoom,
  } = useGameSync({
    roomCode: activeRoomCode ?? '',
    username: nickname.trim() || 'Player',
    enabled: Boolean(activeRoomCode),
  });

  const handleLeaveRoom = useCallback(() => {
    leaveRoom();
    setActiveRoomCode(null);
    setSpeakingByClientId({});
    syncUrlRoomParam(null);
  }, [leaveRoom, syncUrlRoomParam]);

  const handleToggleLowDataMode = useCallback(() => {
    setLowDataMode((prev) => !prev);
  }, []);

  const handleToggleRain = useCallback(() => {
    setRainEnabled((prev) => !prev);
  }, []);

  const handleSpeakingMapChange = useCallback((map: SpeakingMap) => {
    setSpeakingByClientId(map);
  }, []);

  const inActiveMatch = Boolean(
    activeRoomCode && state && state.phase !== 'LOBBY',
  );

  if (inActiveMatch && state) {
    return (
      <GameTable
        state={state}
        clientId={clientId}
        username={nickname.trim() || 'Player'}
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
      />
    );
  }

  return (
    <Lobby
      nickname={nickname}
      onNicknameChange={handleNicknameChange}
      joinCodeInput={joinCodeInput}
      onJoinCodeInputChange={setJoinCodeInput}
      activeRoomCode={activeRoomCode}
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
      onLeaveRoom={handleLeaveRoom}
      onDispatchAction={dispatchAction}
      availableCardScans={availableCardScans}
    />
  );
}

export default HundredApp;

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameTable } from '@/components/GameTable';
import { Lobby } from '@/components/Lobby';
import { PlayingCard } from '@/components/PlayingCard';
import { SeatHub } from '@/components/SeatHub';
import { applyAction, createInitialLobbyState } from '@/lib/gameEngine';
import type { GameState } from '@/lib/types';

afterEach(() => {
  cleanup();
});

function createBiddingState(): GameState {
  const lobby = createInitialLobbyState('TNG-AB12', 'client-0', 'Rafiq', 1000);
  return applyAction(lobby, { type: 'FILL_BOTS_AND_START' }, 1100);
}

describe('PlayingCard', () => {
  it('renders plain off-white #faf7f0 visiting card with centered number and no UNO badges', () => {
    render(<PlayingCard value={75} />);
    const el = screen.getByTestId('table-card-75');
    expect(el.className).toContain('bg-[#faf7f0]');
    expect(el.className).not.toContain('card-tier-');
  });

  it('renders dark-navy face-down card back when faceDown is true', () => {
    render(<PlayingCard faceDown />);
    const back = screen.getByTestId('card-back');
    expect(back.className).toContain('bg-[#13223b]');
  });
});

describe('SeatHub', () => {
  it('shows green speaking ring, Call/Score pills, opponent fan, and single crimson captured stack', () => {
    const state = createBiddingState();
    render(
      <SeatHub
        seat={state.seats[1]}
        position="top"
        isMe={false}
        isHost={false}
        isActiveTurn={false}
        isSpeaking={true}
      />,
    );

    const avatar = screen.getByTestId('seat-avatar-1');
    expect(avatar.getAttribute('data-speaking')).toBe('true');
    expect(avatar.className).toContain('ring-emerald-400');
    expect(screen.getByTestId('opponent-fan-top')).toBeTruthy();
    expect(screen.getByTestId('captured-stack-1').textContent).toContain('0 Pts');
  });
});

describe('Lobby', () => {
  it('creates a room with valid TNG-XX + 2 digits format and validates join input', () => {
    const onEnterRoom = vi.fn();

    render(
      <Lobby
        nickname="Rafiq"
        onNicknameChange={vi.fn()}
        joinCodeInput="INVALID"
        onJoinCodeInputChange={vi.fn()}
        activeRoomCode={null}
        state={null}
        clientId="client-0"
        mySeatIndex={null}
        hostSeatIndex={null}
        syncMode="local"
        supabaseConfigured={false}
        livekitConfigured={false}
        lowDataMode={false}
        onToggleLowDataMode={vi.fn()}
        rainEnabled={true}
        onToggleRain={vi.fn()}
        chatMessages={[]}
        onSendChat={vi.fn()}
        onSpeakingMapChange={vi.fn()}
        onEnterRoom={onEnterRoom}
        onLeaveRoom={vi.fn()}
        onDispatchAction={vi.fn()}
      />,
    );

    expect(screen.getByText(/হানডেট/)).toBeTruthy();
    expect(screen.getByText('HUNDRED')).toBeTruthy();

    fireEvent.click(screen.getByTestId('join-room-btn'));
    expect(screen.getByTestId('lobby-error')).toBeTruthy();
    expect(onEnterRoom).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('create-room-btn'));
    expect(onEnterRoom).toHaveBeenCalledTimes(1);
    const createdCode = onEnterRoom.mock.calls[0][0] as string;
    expect(createdCode).toMatch(/^TNG-[A-Z]{2}\d{2}$/);
  });
});

describe('GameTable', () => {
  it('renders হানডেট HUNDRED, স্কোরবোর্ড modal, transient bidding (min 50), and dispatches PLACE_CALL', () => {
    const state = createBiddingState();
    const onDispatchAction = vi.fn();

    render(
      <GameTable
        state={state}
        clientId="client-0"
        username="Rafiq"
        mySeatIndex={state.activeSeat}
        hostSeatIndex={0}
        syncMode="local"
        connectionStatus="local"
        remainingMs={24_000}
        isLiveKitConfigured={false}
        lowDataMode={true}
        onToggleLowDataMode={vi.fn()}
        rainEnabled={true}
        onToggleRain={vi.fn()}
        chatMessages={[]}
        onSendChat={vi.fn()}
        speakingByClientId={{}}
        onSpeakingMapChange={vi.fn()}
        onDispatchAction={onDispatchAction}
        onLeaveRoom={vi.fn()}
      />,
    );

    expect(screen.getByText('হানডেট')).toBeTruthy();
    expect(screen.getByText('HUNDRED')).toBeTruthy();
    expect(screen.getByTestId('arena-status-pill').textContent).toContain('Round 1/10');
    expect(screen.queryByTestId('quick-call-0')).toBeNull();

    // Open fullscreen scoreboard
    fireEvent.click(screen.getByTestId('scoreboard-btn'));
    expect(screen.getByTestId('scoreboard-modal')).toBeTruthy();
    fireEvent.click(screen.getByTestId('back-to-table-btn'));
    expect(screen.queryByTestId('scoreboard-modal')).toBeNull();

    // Click quick-call pill 150
    fireEvent.click(screen.getByTestId('quick-call-150'));
    expect(onDispatchAction).toHaveBeenCalledWith({
      type: 'PLACE_CALL',
      seatIndex: state.activeSeat,
      call: 150,
    });
  });
});

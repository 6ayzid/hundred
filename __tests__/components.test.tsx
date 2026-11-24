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
  it('shows green speaking ring, Call/Score pills, opponent fan, and single crimson captured stack (Bangla primary + EN)', () => {
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
    const fan = screen.getByTestId('opponent-fan-top');
    expect(fan).toBeTruthy();
    // Visual-only opponent card fan: zero numeric badge or text
    expect((fan.textContent ?? '').trim()).toBe('');
    // Starts with empty placeholder when 0 captured points
    const emptyStack = screen.getByTestId('captured-stack-1');
    expect(emptyStack.getAttribute('data-empty')).toBe('true');
    expect((emptyStack.textContent ?? '').trim()).toBe('');

    // Renders numeric dark-navy card stack in Bangla numerals by default once points are won
    const wonSeat = { ...state.seats[1], capturedPoints: 36, tricksWon: 1 };
    const { container } = render(
      <SeatHub
        seat={wonSeat}
        position="right"
        isMe={false}
        isHost={false}
        isActiveTurn={false}
        isSpeaking={false}
      />,
    );
    const filledStack = container.querySelector('[data-testid="captured-stack-1"]');
    expect(filledStack?.getAttribute('data-empty')).toBe('false');
    expect(filledStack?.textContent?.trim()).toBe('৩৬');

    // English mode renders ASCII numerals
    const { container: enContainer } = render(
      <SeatHub
        seat={wonSeat}
        position="right"
        isMe={false}
        isHost={false}
        isActiveTurn={false}
        isSpeaking={false}
        lang="en"
      />,
    );
    expect(
      enContainer.querySelector('[data-testid="captured-stack-1"]')?.textContent?.trim(),
    ).toBe('36');
  });
});

describe('Lobby', () => {
  it('creates a room with valid TNG-XX + 2 digits format in Bangla primary and supports EN toggle', () => {
    const onEnterRoom = vi.fn();
    const onToggleLang = vi.fn();

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
        onToggleLang={onToggleLang}
      />,
    );

    expect(screen.getByText(/হানডেট/)).toBeTruthy();
    expect(screen.getByText('HUNDRED')).toBeTruthy();
    expect(screen.getByTestId('create-room-btn').textContent).toContain('নতুন রুম + লিংক');

    fireEvent.click(screen.getByTestId('lang-toggle-btn'));
    expect(onToggleLang).toHaveBeenCalledTimes(1);

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
  it('renders হানডেট HUNDRED in primary Bangla, switches via EN toggle, opens হিসাব খাতা modal, and dispatches PLACE_CALL', () => {
    const state = createBiddingState();
    const onDispatchAction = vi.fn();

    function GameTableHarness() {
      const [lang, setLang] = React.useState<'bn' | 'en'>('bn');
      return (
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
          lang={lang}
          onToggleLang={() => setLang((prev) => (prev === 'bn' ? 'en' : 'bn'))}
        />
      );
    }

    render(<GameTableHarness />);

    expect(screen.getByText('হানডেট')).toBeTruthy();
    expect(screen.getByText('HUNDRED')).toBeTruthy();
    expect(screen.getByTestId('arena-status-pill').textContent).toContain('রাউন্ড ১/১০');
    expect(screen.getByTestId('scoreboard-btn').textContent).toContain('হিসাব খাতা');
    expect(screen.queryByTestId('quick-call-0')).toBeNull();

    // Open fullscreen scoreboard in Bangla
    fireEvent.click(screen.getByTestId('scoreboard-btn'));
    expect(screen.getByTestId('scoreboard-modal')).toBeTruthy();
    fireEvent.click(screen.getByTestId('back-to-table-btn'));
    expect(screen.queryByTestId('scoreboard-modal')).toBeNull();

    // Toggle EN -> switches visible HUD text to English
    fireEvent.click(screen.getByTestId('lang-toggle-btn'));
    expect(screen.getByTestId('arena-status-pill').textContent).toContain('Round 1/10');
    expect(screen.getByTestId('scoreboard-btn').textContent).toContain('Scoreboard');

    // Click quick-call pill 150
    fireEvent.click(screen.getByTestId('quick-call-150'));
    expect(onDispatchAction).toHaveBeenCalledWith({
      type: 'PLACE_CALL',
      seatIndex: state.activeSeat,
      call: 150,
    });
  });
});

describe('Lobby visual onboarding, customizer, and Bangla bot suffix', () => {
  it('supports random-name-btn, avatar-customizer selections, quick-solo-btn, visual-guide-strip, and Bangla বট names', () => {
    const onNicknameChange = vi.fn();
    const onRandomName = vi.fn();
    const onAvatarChange = vi.fn();
    const onRandomAvatar = vi.fn();
    const onQuickPlaySolo = vi.fn();
    const baseAvatar = {
      character: 'kitty' as const,
      bg: 'mint' as const,
      outfit: 'emerald' as const,
      skin: 'warm' as const,
    };

    const onCompleteProfileSetup = vi.fn();

    const { rerender } = render(
      <Lobby
        nickname="মিতু"
        onNicknameChange={onNicknameChange}
        onRandomName={onRandomName}
        avatar={baseAvatar}
        onAvatarChange={onAvatarChange}
        onRandomAvatar={onRandomAvatar}
        profileCustomized={false}
        onCompleteProfileSetup={onCompleteProfileSetup}
        joinCodeInput=""
        onJoinCodeInputChange={vi.fn()}
        activeRoomCode={null}
        state={null}
        clientId="host-1"
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
        onEnterRoom={vi.fn()}
        onQuickPlaySolo={onQuickPlaySolo}
        onLeaveRoom={vi.fn()}
        onDispatchAction={vi.fn()}
        lang="bn"
        onToggleLang={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('visual-guide-strip')).toBeNull();
    expect(screen.queryByLabelText('Environment readiness')).toBeNull();
    expect(screen.getByTestId('profile-chip-btn')).toBeTruthy();
    expect(screen.getByTestId('profile-customizer-panel')).toBeTruthy();

    fireEvent.click(screen.getByTestId('random-name-btn'));
    expect(onRandomName).toHaveBeenCalledTimes(1);

    const crownBtn = screen.getByTestId('avatar-char-crown');
    expect(crownBtn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(crownBtn);
    expect(onAvatarChange).toHaveBeenCalledWith({
      ...baseAvatar,
      character: 'crown',
    });

    fireEvent.click(screen.getByTestId('avatar-bg-sunny'));
    expect(onAvatarChange).toHaveBeenCalledWith({
      ...baseAvatar,
      bg: 'sunny',
    });

    fireEvent.click(screen.getByTestId('random-avatar-btn'));
    expect(onRandomAvatar).toHaveBeenCalledTimes(1);

    // Completing customization minimizes panel into top-right profile chip
    fireEvent.click(screen.getByTestId('profile-done-btn'));
    expect(onCompleteProfileSetup).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('profile-customizer-panel')).toBeNull();

    // Tapping top-right profile chip opens it again, and tapping again minimizes it
    fireEvent.click(screen.getByTestId('profile-chip-btn'));
    expect(screen.getByTestId('profile-customizer-panel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('profile-chip-btn'));
    expect(screen.queryByTestId('profile-customizer-panel')).toBeNull();

    fireEvent.click(screen.getByTestId('quick-solo-btn'));
    expect(onQuickPlaySolo).toHaveBeenCalledTimes(1);

    // Rerender in room-lobby with an AI bot to confirm Bangla bot name ends with বট
    let roomState = createInitialLobbyState('TNG-BN99', 'host-1', 'মিতু', 1_000, baseAvatar);
    roomState = applyAction(roomState, { type: 'ADD_BOT', seatIndex: 1 }, 1_100);

    rerender(
      <Lobby
        nickname="মিতু"
        onNicknameChange={onNicknameChange}
        avatar={{ ...baseAvatar, character: 'crown' }}
        onAvatarChange={onAvatarChange}
        joinCodeInput=""
        onJoinCodeInputChange={vi.fn()}
        activeRoomCode="TNG-BN99"
        state={roomState}
        clientId="host-1"
        mySeatIndex={0}
        hostSeatIndex={0}
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
        onEnterRoom={vi.fn()}
        onQuickPlaySolo={onQuickPlaySolo}
        onLeaveRoom={vi.fn()}
        onDispatchAction={vi.fn()}
        lang="bn"
        onToggleLang={vi.fn()}
      />,
    );

    const botSeat = screen.getByTestId('lobby-seat-1');
    expect(botSeat.textContent).toContain('বট');
  });
});

describe('Round-end ranking and distinct per-rank icons', () => {
  it('displays sorted post-round rankings, #1 leader banner, and distinct icons per total score across ROUND_SUMMARY and SeatHub', () => {
    const base = createBiddingState();
    const rankedState: GameState = {
      ...base,
      phase: 'ROUND_SUMMARY',
      round: 2,
      seats: [
        { ...base.seats[0], totalScore: 100 },
        { ...base.seats[1], totalScore: -50 },
        { ...base.seats[2], totalScore: 200 },
        { ...base.seats[3], totalScore: -150 },
      ],
      roundHistory: [
        {
          round: 2,
          entries: [
            {
              seatIndex: 0,
              username: base.seats[0].username,
              call: 100,
              capturedPoints: 110,
              pointsAwarded: 100,
              totalAfter: 100,
            },
            {
              seatIndex: 1,
              username: base.seats[1].username,
              call: 100,
              capturedPoints: 60,
              pointsAwarded: -100,
              totalAfter: -50,
            },
            {
              seatIndex: 2,
              username: base.seats[2].username,
              call: 150,
              capturedPoints: 165,
              pointsAwarded: 150,
              totalAfter: 200,
            },
            {
              seatIndex: 3,
              username: base.seats[3].username,
              call: 100,
              capturedPoints: 0,
              pointsAwarded: -100,
              totalAfter: -150,
            },
          ],
        },
      ],
    };

    render(
      <GameTable
        state={rankedState}
        clientId="client-0"
        username="Rafiq"
        mySeatIndex={0}
        hostSeatIndex={0}
        syncMode="local"
        connectionStatus="local"
        remainingMs={5_000}
        isLiveKitConfigured={false}
        lowDataMode={true}
        onToggleLowDataMode={vi.fn()}
        rainEnabled={true}
        onToggleRain={vi.fn()}
        chatMessages={[]}
        onSendChat={vi.fn()}
        speakingByClientId={{}}
        onSpeakingMapChange={vi.fn()}
        onDispatchAction={vi.fn()}
        onLeaveRoom={vi.fn()}
        lang="bn"
        onToggleLang={vi.fn()}
      />,
    );

    const modal = screen.getByTestId('round-summary-modal');
    expect(modal).toBeTruthy();

    const leaderBanner = screen.getByTestId('round-summary-leader-banner');
    expect(leaderBanner.textContent).toContain('আপন বট');
    expect(leaderBanner.textContent).toContain('২০০');
    expect(
      screen.getByTestId('round-summary-leader-badge').getAttribute('data-rank-icon'),
    ).toBe('crown');

    // Verify table rows are ordered by rank (2 -> 0 -> 1 -> 3)
    const rowIds = Array.from(
      modal.querySelectorAll('tbody tr'),
    ).map((tr) => tr.getAttribute('data-testid'));
    expect(rowIds).toEqual([
      'round-summary-row-2',
      'round-summary-row-0',
      'round-summary-row-1',
      'round-summary-row-3',
    ]);

    // Distinct per-rank icons in ROUND_SUMMARY modal
    expect(
      screen.getByTestId('round-summary-rank-badge-2').getAttribute('data-rank-icon'),
    ).toBe('crown');
    expect(
      screen.getByTestId('round-summary-rank-badge-0').getAttribute('data-rank-icon'),
    ).toBe('medal');
    expect(
      screen.getByTestId('round-summary-rank-badge-1').getAttribute('data-rank-icon'),
    ).toBe('award');
    expect(
      screen.getByTestId('round-summary-rank-badge-3').getAttribute('data-rank-icon'),
    ).toBe('sprout');

    // Tabletop SeatHub avatars also show matching distinct rank icons
    expect(
      screen.getAllByTestId('seat-rank-badge-2')[0].getAttribute('data-rank-icon'),
    ).toBe('crown');
    expect(
      screen.getAllByTestId('seat-rank-badge-0')[0].getAttribute('data-rank-icon'),
    ).toBe('medal');
    expect(
      screen.getAllByTestId('seat-rank-badge-1')[0].getAttribute('data-rank-icon'),
    ).toBe('award');
    expect(
      screen.getAllByTestId('seat-rank-badge-3')[0].getAttribute('data-rank-icon'),
    ).toBe('sprout');
  });

  it('does not show misleading rank icons on SeatHub before any round finishes', () => {
    const biddingState = createBiddingState();
    render(
      <SeatHub
        seat={biddingState.seats[0]}
        position="bottom-left"
        isMe={true}
        isHost={true}
        isActiveTurn={false}
        isSpeaking={false}
        rank={null}
      />,
    );
    expect(screen.queryByTestId('seat-rank-badge-0')).toBeNull();
  });

  it('uses custom 100 BrandMark logo instead of old ১ card mark in Lobby', () => {
    render(
      <Lobby
        nickname="কবির"
        onNicknameChange={vi.fn()}
        joinCodeInput=""
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
        onEnterRoom={vi.fn()}
        onLeaveRoom={vi.fn()}
        onDispatchAction={vi.fn()}
        onToggleLang={vi.fn()}
      />,
    );

    const logoMark = screen.getByTestId('brand-logo-mark');
    expect(logoMark.tagName.toLowerCase()).toBe('svg');
    const header = logoMark.closest('header');
    expect(header?.textContent).not.toContain('১');
    expect(header?.textContent).not.toContain('★');
  });
});

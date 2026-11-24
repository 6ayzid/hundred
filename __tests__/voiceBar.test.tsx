import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BANTER_CHIPS, type ChatMessage } from '@/lib/types';

interface MockParticipant {
  identity: string;
  isSpeaking: boolean;
}

const livekitMockState = {
  participants: [] as MockParticipant[],
  setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
  senderGetParameters: vi.fn().mockReturnValue({
    encodings: [{ maxBitrate: 24_000 }],
  }),
  senderSetParameters: vi.fn().mockResolvedValue(undefined),
  lastRoomProps: null as Record<string, unknown> | null,
};

vi.mock('@livekit/components-react', () => {
  return {
    LiveKitRoom: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
      livekitMockState.lastRoomProps = props;
      return <div data-testid="mock-livekit-room">{props.children}</div>;
    },
    RoomAudioRenderer: () => <div data-testid="mock-room-audio-renderer" />,
    useParticipants: () => livekitMockState.participants,
    useLocalParticipant: () => ({
      localParticipant: {
        identity: 'cli-1',
        setMicrophoneEnabled: livekitMockState.setMicrophoneEnabled,
        getTrackPublication: () => ({
          track: {
            sender: {
              getParameters: livekitMockState.senderGetParameters,
              setParameters: livekitMockState.senderSetParameters,
            },
          },
        }),
      },
    }),
  };
});

import {
  STANDARD_AUDIO_BITRATE,
  VILLAGE_3G_AUDIO_BITRATE,
  VoiceBar,
  applyAudioSenderBitrateCap,
  type VoiceBarProps,
} from '@/components/VoiceBar';

function snapshotButton(el: HTMLElement) {
  const dataAttrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith('data-')) {
      dataAttrs[attr.name] = attr.value;
    }
  }
  return {
    ariaPressed: el.getAttribute('aria-pressed'),
    ariaLabel: el.getAttribute('aria-label'),
    dataActive: el.getAttribute('data-active'),
    dataState: el.getAttribute('data-state'),
    dataAttrs: JSON.stringify(dataAttrs),
    text: (el.textContent ?? '').trim(),
    className: el.className,
  };
}

function createDefaultProps(
  overrides: Partial<VoiceBarProps> = {},
): VoiceBarProps {
  return {
    roomCode: 'TNG-KM47',
    username: 'ChatGuard',
    clientId: 'cli-1',
    isLiveKitConfigured: false,
    lowDataMode: false,
    onToggleLowDataMode: vi.fn(),
    rainEnabled: true,
    onToggleRain: vi.fn(),
    chatMessages: [],
    onSendChat: vi.fn(),
    onSpeakingMapChange: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  livekitMockState.participants = [];
  livekitMockState.setMicrophoneEnabled.mockClear();
  livekitMockState.senderGetParameters.mockClear();
  livekitMockState.senderSetParameters.mockClear();
  livekitMockState.lastRoomProps = null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('components/VoiceBar (F-18, F-19, F-20, F-21, F-22)', () => {
  it('renders unconfigured setup banner without calling fetch(/api/livekit/token) and emits zero active speaking rings', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onSpeakingMapChange = vi.fn();

    const { container } = render(
      <VoiceBar
        {...createDefaultProps({
          isLiveKitConfigured: false,
          onSpeakingMapChange,
          lang: 'en',
        })}
      />,
    );

    const banner = screen.getByTestId('livekit-fallback-banner');
    expect(banner.textContent).toMatch(/livekit/i);
    expect(banner.textContent).toMatch(/\.env\.local/i);
    expect(banner.textContent).toMatch(/text\s*&\s*bot\s*fallback/i);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-speaking="true"]').length).toBe(0);
    expect(onSpeakingMapChange).toHaveBeenCalledWith({});
  });

  it('toggles Village 3G (16000 bps vs 24000 bps) and Rain while syncing .rain-overlay pause state and preserving explicit Rain OFF', () => {
    const rainOverlay = document.createElement('div');
    rainOverlay.className = 'rain-overlay';
    rainOverlay.setAttribute('data-testid', 'rain-overlay');
    document.body.appendChild(rainOverlay);

    try {
      const onToggleLowDataMode = vi.fn();
      const onToggleRain = vi.fn();

      render(
        <VoiceBar
          {...createDefaultProps({
            lowDataMode: false,
            rainEnabled: true,
            onToggleLowDataMode,
            onToggleRain,
          })}
        />,
      );

      const village3gBtn = screen.getByTestId('village-3g-toggle');
      const rainBtn = screen.getByTestId('rain-toggle');

      // Initial baseline: Village 3G OFF (24000 bps), Rain ON (running)
      const v3gOffSnap = snapshotButton(village3gBtn);
      const rainOnSnap = snapshotButton(rainBtn);
      expect(village3gBtn.getAttribute('data-audio-bitrate')).toBe(
        String(STANDARD_AUDIO_BITRATE),
      );
      expect(rainOverlay.getAttribute('data-rain-paused')).toBe('false');
      expect(rainOverlay.classList.contains('rain-paused')).toBe(false);
      expect(rainOverlay.style.animationPlayState).toBe('running');

      // Click Village 3G ON -> 16000 bps and pauses CSS rain
      fireEvent.click(village3gBtn);
      expect(onToggleLowDataMode).toHaveBeenCalledTimes(1);
      const v3gOnSnap = snapshotButton(village3gBtn);
      expect(v3gOnSnap).not.toEqual(v3gOffSnap);
      expect(village3gBtn.getAttribute('data-audio-bitrate')).toBe(
        String(VILLAGE_3G_AUDIO_BITRATE),
      );
      expect(rainOverlay.getAttribute('data-rain-paused')).toBe('true');
      expect(rainOverlay.classList.contains('rain-paused')).toBe(true);
      expect(rainOverlay.style.animationPlayState).toBe('paused');

      // Click Rain toggle while Village 3G is ON -> explicitly turns Rain OFF
      fireEvent.click(rainBtn);
      expect(onToggleRain).toHaveBeenCalledTimes(1);
      const rainOffSnap = snapshotButton(rainBtn);
      expect(rainOffSnap).not.toEqual(rainOnSnap);

      // Click Village 3G OFF -> restores Village 3G button snapshot, but keeps Rain paused because Rain is explicitly OFF
      fireEvent.click(village3gBtn);
      expect(snapshotButton(village3gBtn)).toEqual(v3gOffSnap);
      expect(rainOverlay.getAttribute('data-rain-paused')).toBe('true');
      expect(rainOverlay.style.animationPlayState).toBe('paused');

      // Click Rain toggle back ON -> resumes rain animation
      fireEvent.click(rainBtn);
      expect(snapshotButton(rainBtn)).toEqual(rainOnSnap);
      expect(rainOverlay.getAttribute('data-rain-paused')).toBe('false');
      expect(rainOverlay.style.animationPlayState).toBe('running');
    } finally {
      rainOverlay.remove();
    }
  });

  it('toggles Open Mic Mute/Unmute and restores the exact initial snapshot on second click', () => {
    render(<VoiceBar {...createDefaultProps({ lang: 'en' })} />);

    const openMicBtn = screen.getByTestId('open-mic-button');
    const initialSnap = snapshotButton(openMicBtn);
    expect(initialSnap.ariaPressed).toBe('false');
    expect(initialSnap.dataState).toBe('muted');

    fireEvent.click(openMicBtn);
    const activeSnap = snapshotButton(openMicBtn);
    expect(activeSnap).not.toEqual(initialSnap);
    expect(activeSnap.ariaPressed).toBe('true');
    expect(activeSnap.dataState).toBe('unmuted');

    fireEvent.click(openMicBtn);
    const restoredSnap = snapshotButton(openMicBtn);
    expect(restoredSnap).toEqual(initialSnap);
  });

  it('engages Hold-to-Talk (PTT) on pointerdown and releases cleanly on pointerup, pointercancel, pointerleave, and window blur without mutating Open Mic', () => {
    render(<VoiceBar {...createDefaultProps({ lang: 'en' })} />);

    const pttBtn = screen.getByTestId('hold-to-talk-button');
    const openMicBtn = screen.getByTestId('open-mic-button');

    const pttIdleSnap = snapshotButton(pttBtn);
    const micIdleSnap = snapshotButton(openMicBtn);
    expect(pttIdleSnap.ariaPressed).toBe('false');
    expect(pttIdleSnap.dataState).toBe('idle');

    // 1. pointerdown -> pointerup
    fireEvent.pointerDown(pttBtn);
    expect(snapshotButton(pttBtn)).not.toEqual(pttIdleSnap);
    expect(pttBtn.getAttribute('aria-pressed')).toBe('true');
    expect(pttBtn.getAttribute('data-state')).toBe('talking');

    fireEvent.pointerUp(pttBtn);
    expect(snapshotButton(pttBtn)).toEqual(pttIdleSnap);
    expect(snapshotButton(openMicBtn)).toEqual(micIdleSnap);

    // 2. pointerdown -> pointercancel
    fireEvent.pointerDown(pttBtn);
    expect(pttBtn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.pointerCancel(pttBtn);
    expect(snapshotButton(pttBtn)).toEqual(pttIdleSnap);
    expect(snapshotButton(openMicBtn)).toEqual(micIdleSnap);

    // 3. pointerdown -> pointerleave
    fireEvent.pointerDown(pttBtn);
    expect(pttBtn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.pointerLeave(pttBtn);
    expect(snapshotButton(pttBtn)).toEqual(pttIdleSnap);
    expect(snapshotButton(openMicBtn)).toEqual(micIdleSnap);

    // 4. pointerdown -> window blur
    fireEvent.pointerDown(pttBtn);
    expect(pttBtn.getAttribute('aria-pressed')).toBe('true');
    fireEvent(window, new Event('blur'));
    expect(snapshotButton(pttBtn)).toEqual(pttIdleSnap);
    expect(snapshotButton(openMicBtn)).toEqual(micIdleSnap);
  });

  it('supports collapsible Bangla/Banglish chat drawer, 4 banter chips, custom messages, blank rejection, no username leak before send, and 350-char wrapping', () => {
    const onSendChat = vi.fn();
    render(
      <VoiceBar
        {...createDefaultProps({
          username: 'ChatGuard',
          onSendChat,
          lang: 'en',
        })}
      />,
    );

    const chatToggle = screen.getByTestId('chat-toggle-button');
    expect(screen.queryByTestId('chat-drawer')).toBeNull();

    // Open drawer
    fireEvent.click(chatToggle);
    const drawer = screen.getByTestId('chat-drawer');
    expect(drawer).toBeTruthy();

    // Crucial negative check: username must NOT appear in empty drawer before sending
    expect(drawer.textContent ?? '').not.toContain('ChatGuard');
    expect(drawer.querySelectorAll('[data-chat-message]').length).toBe(0);

    // Blank / whitespace submissions must be ignored
    const input = screen.getByTestId('chat-draft-input') as HTMLInputElement;
    const sendBtn = screen.getByTestId('chat-send-button');

    fireEvent.change(input, { target: { value: '   \t  ' } });
    fireEvent.click(sendBtn);
    expect(onSendChat).not.toHaveBeenCalled();
    expect(drawer.querySelectorAll('[data-chat-message]').length).toBe(0);
    expect(drawer.textContent ?? '').not.toContain('ChatGuard');

    // Click all 4 exact banter chips
    for (const chip of BANTER_CHIPS) {
      const chipBtn = screen.getByRole('button', { name: chip });
      fireEvent.click(chipBtn);
      expect(onSendChat).toHaveBeenCalledWith(chip, true);
    }
    expect(onSendChat).toHaveBeenCalledTimes(BANTER_CHIPS.length);

    // Send a 350-character unbroken message and verify wrapping classes
    const longMsg = `${'LongBanter_'.repeat(31)}123456789`;
    expect(longMsg).toHaveLength(350);
    fireEvent.change(input, { target: { value: longMsg } });
    fireEvent.click(sendBtn);

    expect(onSendChat).toHaveBeenCalledWith(longMsg, false);
    expect(input.value).toBe('');

    const messageItems = drawer.querySelectorAll('li[data-chat-message="true"]');
    expect(messageItems.length).toBe(BANTER_CHIPS.length + 1);
    const lastItem = messageItems[messageItems.length - 1];
    expect(lastItem.textContent).toContain('ChatGuard');
    expect(lastItem.textContent).toContain(longMsg);
    expect(lastItem.className).toContain('break-all');
    expect(lastItem.className).toContain('[overflow-wrap:anywhere]');

    // Collapse drawer -> hides banter chips; re-open -> preserves message history
    fireEvent.click(chatToggle);
    expect(screen.queryByTestId('chat-drawer')).toBeNull();

    fireEvent.click(chatToggle);
    expect(screen.getByTestId('chat-drawer').textContent).toContain(longMsg);
  });

  it('fetches token when isLiveKitConfigured=true, mounts LiveKitRoom with DSP options, emits live speaking map, and caps bitrate at 16000 bps without breaking roomOptions reference', async () => {
    vi.stubEnv('NEXT_PUBLIC_LIVEKIT_URL', 'wss://test.livekit.cloud');
    livekitMockState.participants = [
      { identity: 'cli-1', isSpeaking: true },
      { identity: 'cli-2', isSpeaking: false },
    ];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'mock.jwt.token' }),
    } as Response);

    const onSpeakingMapChange = vi.fn();
    const props = createDefaultProps({
      isLiveKitConfigured: true,
      lowDataMode: false,
      onSpeakingMapChange,
    });

    const { rerender } = render(<VoiceBar {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-livekit-room')).toBeTruthy();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain(
      '/api/livekit/token?room=TNG-KM47&username=ChatGuard&clientId=cli-1',
    );
    expect(screen.getByTestId('mock-room-audio-renderer')).toBeTruthy();

    // Verify DSP audio capture options and initial roomOptions reference
    const firstRoomProps = livekitMockState.lastRoomProps;
    expect(firstRoomProps?.audio).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    });
    expect(firstRoomProps?.video).toBe(false);
    const initialOptionsRef = firstRoomProps?.options;

    // Verify speaking map emission from useParticipants()
    await waitFor(() => {
      expect(onSpeakingMapChange).toHaveBeenCalledWith({
        'cli-1': true,
        'cli-2': false,
      });
    });

    // Verify RTCRtpSender.setParameters called with 24000 bps initially
    await waitFor(() => {
      expect(livekitMockState.senderSetParameters).toHaveBeenCalledWith({
        encodings: [{ maxBitrate: STANDARD_AUDIO_BITRATE }],
      });
    });

    // Rerender with lowDataMode=true -> updates RTCRtpSender to 16000 bps while keeping roomOptions reference identical
    rerender(<VoiceBar {...props} lowDataMode={true} />);

    await waitFor(() => {
      expect(livekitMockState.senderSetParameters).toHaveBeenCalledWith({
        encodings: [{ maxBitrate: VILLAGE_3G_AUDIO_BITRATE }],
      });
    });
    expect(livekitMockState.lastRoomProps?.options).toBe(initialOptionsRef);
  });

  it('falls back gracefully to setup banner without console.error when token endpoint returns 503', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: 'LiveKit voice credentials are not configured on this server.',
        configured: false,
      }),
    } as Response);

    const existingMessage: ChatMessage = {
      id: 'msg-1',
      senderId: 'cli-2',
      seatIndex: 1,
      username: 'Tariq',
      text: 'Call koto?',
      timestamp: 1000,
      isBanter: true,
    };

    render(
      <VoiceBar
        {...createDefaultProps({
          isLiveKitConfigured: true,
          chatMessages: [existingMessage],
          lang: 'en',
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('livekit-fallback-banner')).toBeTruthy();
    });
    expect(screen.queryByTestId('mock-livekit-room')).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    // Open chat drawer and verify controlled chatMessages render
    fireEvent.click(screen.getByTestId('chat-toggle-button'));
    expect(screen.getByTestId('chat-drawer').textContent).toContain('Tariq');
    expect(screen.getByTestId('chat-drawer').textContent).toContain(
      'Call koto?',
    );
  });

  it('renders simple natural Bangla labels and Bangla banter chips by default when lang is omitted', () => {
    const onSendChat = vi.fn();
    render(<VoiceBar {...createDefaultProps({ onSendChat })} />);

    expect(screen.getByTestId('livekit-fallback-banner').textContent).toContain(
      'ভয়েস কল সেট করা নাই',
    );
    expect(screen.getByTestId('hold-to-talk-button').textContent).toContain(
      'চেপে ধরে বলো',
    );

    fireEvent.click(screen.getByTestId('chat-toggle-button'));
    const drawer = screen.getByTestId('chat-drawer');
    expect(drawer.getAttribute('aria-label')).toBe('আড্ডার চ্যাট');
    expect(drawer.textContent).toContain('পাঠাও');
    const firstChip = screen.getByTestId('banter-chip-১০০ ছাড়লাম!');
    fireEvent.click(firstChip);
    expect(onSendChat).toHaveBeenCalledWith('১০০ ছাড়লাম!', true);
  });

  it('applyAudioSenderBitrateCap helper safely updates RTCRtpSender encodings and handles missing senders', async () => {
    expect(await applyAudioSenderBitrateCap(null, 16_000)).toBe(false);
    expect(await applyAudioSenderBitrateCap({}, 16_000)).toBe(false);

    const setParameters = vi.fn().mockResolvedValue(undefined);
    const mockParticipant = {
      audioTrackPublications: new Map([
        [
          'mic-pub',
          {
            track: {
              sender: {
                getParameters: () => ({ encodings: [] }),
                setParameters,
              },
            },
          },
        ],
      ]),
    };

    const updated = await applyAudioSenderBitrateCap(
      mockParticipant,
      VILLAGE_3G_AUDIO_BITRATE,
    );
    expect(updated).toBe(true);
    expect(setParameters).toHaveBeenCalledWith({
      encodings: [{ maxBitrate: VILLAGE_3G_AUDIO_BITRATE }],
    });
  });
});

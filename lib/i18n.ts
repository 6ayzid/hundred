export type Lang = 'bn' | 'en';

export const DEFAULT_LANG: Lang = 'bn';
export const LANG_STORAGE_KEY = 'hundred_lang';

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;

export function toBanglaDigits(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => BANGLA_DIGITS[Number(digit)] ?? digit);
}

export function formatNum(value: number, lang: Lang): string {
  return lang === 'bn' ? toBanglaDigits(value) : String(value);
}

const BOT_NAME_BANGLA: Record<string, string> = {
  'siam bot': 'সিয়াম বট',
  'apon bot': 'আপন বট',
  'nabil bot': 'নাবিল বট',
  'rafi bot': 'রাফি বট',
  'tariq bot': 'তারিক বট',
  'nadia bot': 'নাদিয়া বট',
  'mitu bot': 'মিতু বট',
  siam: 'সিয়াম বট',
  apon: 'আপন বট',
  nabil: 'নাবিল বট',
  rafi: 'রাফি বট',
  'bot 1': '১ নং বট',
  'bot 2': '২ নং বট',
  'bot 3': '৩ নং বট',
  'bot 4': '৪ নং বট',
};

export function localizeDisplayName(username: string, lang: Lang): string {
  const clean = username.trim();
  if (lang === 'en') {
    return clean;
  }
  const key = clean.toLowerCase();
  if (BOT_NAME_BANGLA[key]) {
    return BOT_NAME_BANGLA[key];
  }
  const botMatch = /^(.+?)\s*bot$/i.exec(clean);
  if (botMatch) {
    return `${botMatch[1].trim()} বট`;
  }
  return clean;
}

export function localizeRoomNotice(reason: string, lang: Lang): string {
  if (lang === 'en') {
    return reason;
  }
  const notFound = /^Room\s+([A-Z0-9-]+)\s+wasn't found/i.exec(reason);
  if (notFound) {
    return `${notFound[1]} রুমটা পাওয়া যায় নাই বা ক্লোজ হয়ে গেছে।`;
  }
  const inProgress = /^Room\s+([A-Z0-9-]+)\s+is already in progress/i.exec(reason);
  if (inProgress) {
    return `${inProgress[1]} রুমে খেলা অলরেডি চলতেছে।`;
  }
  const full = /^Room\s+([A-Z0-9-]+)\s+is full/i.exec(reason);
  if (full) {
    return `${full[1]} রুম ফুল (৪/৪ জন)।`;
  }
  if (/invalid invite link/i.test(reason)) {
    return 'ইনভাইট লিংকটা ঠিক নাই — কোডটা চেক করো।';
  }
  return reason;
}

export const BANGLA_BANTER_CHIPS = [
  '১০০ দিলাম!',
  'কল কত?',
  'এই রাউন্ড আমার!',
  'জোস চাল!',
] as const;

export function getBanterChips(lang: Lang): readonly string[] {
  return lang === 'bn'
    ? BANGLA_BANTER_CHIPS
    : ['100 charlam!', 'Call koto?', 'Ei bar baji jitbo!', 'Chales!'];
}

export const TEXTS = {
  bn: {
    subtitle: '৪ জন • কার্ড গেম',
    ruleTip: '১ ট্যাপেই শুরু — বট বা ফ্রেন্ডদের সাথে খেলো!',
    nicknameLabel: 'তোমার নাম কী?',
    nicknamePlaceholder: 'নাম লেখো…',
    lookLabel: 'লুক কেমন দিবা?',
    randomName: 'অন্য নাম',
    randomLook: 'অন্য লুক',
    savedBadge: 'সেভ হইছে ✓',
    doneCustomizing: 'সেভ ✓',
    editProfile: 'প্রোফাইল এডিট',
    soloPlayTitle: 'একা খেলো (বটের সাথে)',
    soloPlayBadge: '১ ট্যাপেই শুরু',
    friendsSectionTitle: 'ফ্রেন্ডদের সাথে খেলো',
    createRoom: 'নতুন রুম + লিংক',
    createRoomSub: 'ফ্রেন্ডদের ডাকতে লিংক পাবা',
    joinCodePlaceholder: 'কোড (TNG-AB12)',
    joinRoom: 'জয়েন',
    errEmptyName: 'আগে তোমার নাম লেখো!',
    errInvalidCode: 'কোডটা ঠিকমতো দাও (যেমন: TNG-AB12)',
    guideStep1: '১ থাকলে শুরু',
    guideStep2: 'কল মিললে +',
    guideStep3: 'বড় কার্ড জিতে',
    joiningRoom: 'রুমে ঢুকতেছে…',
    joiningWait: 'একটু ওয়েট করো…',
    cancel: 'ক্যানসেল',
    roomCodeLabel: 'ফ্রেন্ডদের এই কোড বা লিংক পাঠাও',
    seatedProgress: (filled: number) => `${toBanglaDigits(filled)}/৪ জন রেডি`,
    syncLive: 'লাইভ',
    syncRelay: 'রিলে',
    copyInvite: 'লিংক কপি',
    shareInvite: 'শেয়ার',
    copied: 'কপি হইছে!',
    leave: 'বের হও',
    shareUrlPrompt: 'এই লিংকটা ফ্রেন্ডদের পাঠাও:',
    emptySeat: (n: number) => `খালি সিট ${toBanglaDigits(n)}`,
    openSeat: 'ফ্রেন্ড আসতেছে…',
    aiBot: 'বট',
    youHost: 'তুমি (হোস্ট)',
    you: 'তুমি',
    host: 'হোস্ট',
    player: 'প্লেয়ার',
    addBot: '+ বট',
    removeBot: 'সরাও',
    fillBotsStart: 'বট দিয়ে শুরু করো',
    startMatch: 'সবাই রেডি — স্টার্ট!',
    waitingHost: (name: string) => `${name} স্টার্ট দিলেই খেলা শুরু হবে…`,
    setupTipTitle: '',
    setupTipBody: '',
    roundPill: (r: number, total: number) =>
      `রাউন্ড ${toBanglaDigits(r)}/${toBanglaDigits(total)}`,
    scoreboardBtn: 'হিসাব খাতা',
    soundOn: 'সাউন্ড অন',
    soundOff: 'সাউন্ড অফ',
    muteSfxLabel: 'সাউন্ড অফ করো',
    unmuteSfxLabel: 'সাউন্ড অন করো',
    leaveRoomLabel: 'রুম থেকে বের হও',
    dealingCards: 'কার্ড বাঁটা হচ্ছে…',
    declareCall: 'কল কত দিবা? (৫০ – ৫০০)',
    callLocked: (call: number) => `তোমার কল: ${toBanglaDigits(call)}`,
    simultaneousCall: 'সবাই একসাথে কল দাও',
    confirmCall: 'কল দাও',
    allCallingCount: (count: number) =>
      `সবাই কল দিচ্ছে (${toBanglaDigits(count)}/৪)`,
    waitingCallsCount: (count: number) =>
      `বাকিদের কলের ওয়েট (${toBanglaDigits(count)}/৪)…`,
    autoPlayOneMine: 'তোমার ১ অটো খেলছে…',
    autoPlayOneOther: (name: string) => `${name}-এর ১ দিয়ে শুরু হচ্ছে…`,
    autoPlayLastMine: 'শেষ কার্ড অটো খেলছে…',
    yourTurnTap: 'তোমার চাল',
    meTag: ' (আমি)',
    callWord: 'কল',
    scoreWord: 'স্কোর',
    offline: 'অফলাইন',
    faceDownCard: 'উল্টানো কার্ড',
    roundSummaryTitle: (r: number, total: number) =>
      `রাউন্ড ${toBanglaDigits(r)}/${toBanglaDigits(total)} শেষ`,
    fullScoreboard: 'সব হিসাব',
    rankCol: 'র‍্যাংক',
    rankOrdinal: (rank: number) => {
      switch (rank) {
        case 1:
          return '১ম';
        case 2:
          return '২য়';
        case 3:
          return '৩য়';
        case 4:
          return '৪র্থ';
        default:
          return `${toBanglaDigits(rank)}`;
      }
    },
    leadingNow: 'এখন ১ নং:',
    tiedFirstNow: 'একসাথে ১ নং:',
    colPlayer: 'প্লেয়ার',
    colCall: 'কল',
    colWon: 'পাইছে',
    colDelta: '+ / -',
    colScore: 'মোট',
    viewPodium: 'ফাইনাল রেজাল্ট',
    nextRound: (r: number) => `রাউন্ড ${toBanglaDigits(r)} শুরু`,
    winnerLabel: 'উইনার:',
    ptsUnit: 'পয়েন্ট',
    backToLobby: 'লবিতে যাও',
    playAgain: 'আবার খেলো',
    scoreboardHeader: 'হিসাব খাতা — হানডেট',
    scoreboardSub: (r: number, total: number, code: string) =>
      `রাউন্ড ${toBanglaDigits(r)}/${toBanglaDigits(total)} • রুম ${code}`,
    backToTable: 'গেমে ফিরো',
    callPrefix: 'কল:',
    colRound: 'রাউন্ড',
    colCallWonTotal: 'কল / পাইছে / মোট',
    tableChat: 'গেম চ্যাট',
    closeChat: 'চ্যাট বন্ধ করো',
    emptyChatCompact: 'নিচের বাটনে চাপো বা মেসেজ লেখো।',
    emptyChatFull: 'নিচের রেডি মেসেজ চাপো বা নিজে লেখো।',
    chatPlaceholder: 'মেসেজ লেখো…',
    send: 'সেন্ড',
    voiceLocal: 'ভয়েস: লোকাল',
    voiceConnected: 'ভয়েস: অন',
    holdToTalk: 'চেপে ধরে কথা বলো',
    talkingPtt: 'কথা হচ্ছে…',
    lowDataShort: (on: boolean) => `3G: ${on ? 'অন' : 'অফ'}`,
    rainShort: (on: boolean) => `বৃষ্টি: ${on ? 'অন' : 'অফ'}`,
    micLabel: 'মাইক',
    chatLabel: 'চ্যাট',
    roomLabel: 'রুম: ',
    fallbackBanner:
      'ভয়েস কল সেট করা নাই — চ্যাট আর বট অন আছে (.env.local দেখো)',
    connectedBanner: (kbps: number) => `ভয়েস কল কানেক্টেড (${kbps}kbps)`,
    openMicOn: 'মাইক: অন',
    openMicMuted: 'মাইক: মিউট',
    village3gFull: (on: boolean, kbps: number) =>
      `3G মোড: ${on ? 'অন' : 'অফ'} (${kbps}kbps)`,
    rainFull: (on: boolean) => `বৃষ্টি: ${on ? 'অন' : 'অফ'}`,
    toggleLangLabel: 'Switch to English',
    toggleLangText: 'EN',
  },
  en: {
    subtitle: '4 Players • Easy Card Game',
    ruleTip: 'Tap & play with bots or invite friends!',
    nicknameLabel: "What's your name?",
    nicknamePlaceholder: 'Type your name…',
    lookLabel: 'Pick your look',
    randomName: 'Random Name',
    randomLook: 'Random Look',
    savedBadge: 'Saved ✓',
    doneCustomizing: 'Save & Done ✓',
    editProfile: 'Edit profile',
    soloPlayTitle: 'Play Solo (vs Bots)',
    soloPlayBadge: '1-Tap Start',
    friendsSectionTitle: 'Play with Friends',
    createRoom: 'New Room + Link',
    createRoomSub: 'Get a link to invite friends',
    joinCodePlaceholder: 'Code (TNG-AB12)',
    joinRoom: 'Join',
    errEmptyName: 'Please enter a name first!',
    errInvalidCode: 'Enter a valid room code (like TNG-AB12).',
    guideStep1: '1 leads first',
    guideStep2: 'Hit call = +',
    guideStep3: 'Top card wins',
    joiningRoom: 'Joining room',
    joiningWait: 'Connecting to host…',
    cancel: 'Cancel',
    roomCodeLabel: 'Share Code or Link with Friends',
    seatedProgress: (filled: number) => `${filled}/4 Ready`,
    syncLive: 'Live',
    syncRelay: 'Relay',
    copyInvite: 'Copy Link',
    shareInvite: 'Share',
    copied: 'Copied!',
    leave: 'Leave',
    shareUrlPrompt: 'Share this invite URL:',
    emptySeat: (n: number) => `Empty Seat ${n}`,
    openSeat: 'Waiting for friend…',
    aiBot: 'Bot',
    youHost: 'You (Host)',
    you: 'You',
    host: 'Host',
    player: 'Friend',
    addBot: '+ Bot',
    removeBot: 'Remove',
    fillBotsStart: 'Fill Bots & Play Now',
    startMatch: 'Everyone Ready — Start!',
    waitingHost: (name: string) => `Waiting for ${name} to press Start…`,
    setupTipTitle: '',
    setupTipBody: '',
    roundPill: (r: number, total: number) => `Round ${r}/${total}`,
    scoreboardBtn: 'Scoreboard',
    soundOn: 'Sound ON',
    soundOff: 'Sound OFF',
    muteSfxLabel: 'Mute sound effects',
    unmuteSfxLabel: 'Unmute sound effects',
    leaveRoomLabel: 'Leave Room',
    dealingCards: 'Dealing cards…',
    declareCall: 'Declare Your Call (50 – 500)',
    callLocked: (call: number) => `Call Locked: ${call}`,
    simultaneousCall: 'Simultaneous Call',
    confirmCall: 'Confirm',
    allCallingCount: (count: number) =>
      `All players call simultaneously (${count}/4 locked)`,
    waitingCallsCount: (count: number) =>
      `Waiting for other players to lock their call (${count}/4)…`,
    autoPlayOneMine: 'You hold 1 — auto-playing 1…',
    autoPlayOneOther: (name: string) => `${name} starts with 1…`,
    autoPlayLastMine: 'Auto-playing last card…',
    yourTurnTap: 'Your turn',
    meTag: ' (Me)',
    callWord: 'Call',
    scoreWord: 'Score',
    offline: 'Offline',
    faceDownCard: 'Face-down card',
    roundSummaryTitle: (r: number, total: number) => `Round ${r} / ${total}`,
    fullScoreboard: 'Scoreboard',
    rankCol: 'Rank',
    rankOrdinal: (rank: number) => `#${rank}`,
    leadingNow: 'Leading #1:',
    tiedFirstNow: 'Tied #1:',
    colPlayer: 'Player',
    colCall: 'Call',
    colWon: 'Won',
    colDelta: '+/-',
    colScore: 'Score',
    viewPodium: 'View Final Podium',
    nextRound: (r: number) => `Start Round ${r}`,
    winnerLabel: 'Winner:',
    ptsUnit: 'pts',
    backToLobby: 'Back to Lobby',
    playAgain: 'Play Again',
    scoreboardHeader: 'Scoreboard — হানডেট',
    scoreboardSub: (r: number, total: number, code: string) =>
      `Round ${r} of ${total} • Room ${code}`,
    backToTable: 'Back to Table',
    callPrefix: 'Call:',
    colRound: 'Round',
    colCallWonTotal: 'Call / Won / Total',
    tableChat: 'Table Chat',
    closeChat: 'Close chat',
    emptyChatCompact: 'Send a quick Bangla banter or message below.',
    emptyChatFull: 'Tap a quick banter chip or send a message below.',
    chatPlaceholder: 'Type Bangla or Banglish…',
    send: 'Send',
    voiceLocal: 'Voice: Local Fallback',
    voiceConnected: 'Voice: Connected',
    holdToTalk: 'Hold to Talk',
    talkingPtt: 'Talking (PTT)...',
    lowDataShort: (on: boolean) => `3G: ${on ? 'ON' : 'OFF'}`,
    rainShort: (on: boolean) => `Rain: ${on ? 'ON' : 'OFF'}`,
    micLabel: 'Mic',
    chatLabel: 'Chat',
    roomLabel: 'Room: ',
    fallbackBanner:
      'LiveKit Voice unconfigured — text & bot fallback active (configure .env.local)',
    connectedBanner: (kbps: number) =>
      `LiveKit Voice connected (${kbps}kbps Opus)`,
    openMicOn: 'Open Mic: ON',
    openMicMuted: 'Open Mic: Muted',
    village3gFull: (on: boolean, kbps: number) =>
      `Village 3G: ${on ? 'ON' : 'OFF'} (${kbps}kbps)`,
    rainFull: (on: boolean) => `Rain: ${on ? 'ON' : 'OFF'}`,
    toggleLangLabel: 'বাংলায় দেখুন',
    toggleLangText: 'বাংলা',
  },
} as const;

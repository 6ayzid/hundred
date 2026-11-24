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
    return `${notFound[1]} ঘরটা পাওয়া যায় নাই বা বন্ধ হয়ে গেছে।`;
  }
  const inProgress = /^Room\s+([A-Z0-9-]+)\s+is already in progress/i.exec(reason);
  if (inProgress) {
    return `${inProgress[1]} ঘরে খেলা আগে থেকেই চলছে।`;
  }
  const full = /^Room\s+([A-Z0-9-]+)\s+is full/i.exec(reason);
  if (full) {
    return `${full[1]} ঘর ভরে গেছে (৪/৪ জন)।`;
  }
  if (/invalid invite link/i.test(reason)) {
    return 'দাওয়াতের লিংকটা ঠিক নাই — কোডটা দেখে নাও।';
  }
  return reason;
}

export const BANGLA_BANTER_CHIPS = [
  '১০০ ছাড়লাম!',
  'কল কত দিলা?',
  'এই বাজি আমার!',
  'দারুণ চাল!',
] as const;

export function getBanterChips(lang: Lang): readonly string[] {
  return lang === 'bn'
    ? BANGLA_BANTER_CHIPS
    : ['100 charlam!', 'Call koto?', 'Ei bar baji jitbo!', 'Chales!'];
}

export const TEXTS = {
  bn: {
    subtitle: '৪ জন • কার্ডের সহজ খেলা',
    ruleTip: '১ টিপেই খেলা — বট বা বন্ধু নিয়ে খেলুন!',
    nicknameLabel: 'আপনার নাম কী?',
    nicknamePlaceholder: 'নাম লিখুন…',
    lookLabel: 'আপনাকে কীভাবে দেখতে চান?',
    randomName: 'নতুন নাম',
    randomLook: 'নতুন সাজ',
    savedBadge: 'সেভ আছে ✓',
    doneCustomizing: 'সেভ ও শেষ ✓',
    editProfile: 'নাম ও ছবি বদলাও',
    soloPlayTitle: 'একা খেলুন (বটের সাথে)',
    soloPlayBadge: '১ টিপেই শুরু',
    friendsSectionTitle: 'বন্ধুদের সাথে খেলুন',
    createRoom: 'নতুন ঘর + লিংক',
    createRoomSub: 'বন্ধু ডাকতে লিংক পাবেন',
    joinCodePlaceholder: 'কোড (TNG-AB12)',
    joinRoom: 'ঢোকো',
    errEmptyName: 'আগে তোমার একটা নাম লেখো!',
    errInvalidCode: 'ঠিকমতো কোড দাও (যেমন: TNG-AB12)।',
    guideStep1: '১ থাকলে শুরু',
    guideStep2: 'কল মিললে +',
    guideStep3: 'বড় কার্ড জিতে',
    joiningRoom: 'ঘরে ঢোকা হচ্ছে',
    joiningWait: 'একটু অপেক্ষা করো…',
    cancel: 'বাতিল',
    roomCodeLabel: 'বন্ধুকে এই কোড বা লিংক দিন',
    seatedProgress: (filled: number) => `${toBanglaDigits(filled)}/৪ জন রেডি`,
    syncLive: 'লাইভ',
    syncRelay: 'রিলে',
    copyInvite: 'লিংক কপি',
    shareInvite: 'পাঠান',
    copied: 'কপি হইছে!',
    leave: 'বের হও',
    shareUrlPrompt: 'এই লিংকটা বন্ধুদের পাঠাও:',
    emptySeat: (n: number) => `খালি জায়গা ${toBanglaDigits(n)}`,
    openSeat: 'বন্ধু আসতেছে…',
    aiBot: 'বট',
    youHost: 'আপনি (মালিক)',
    you: 'আপনি',
    host: 'মালিক',
    player: 'বন্ধু',
    addBot: '+ বট',
    removeBot: 'সরাও',
    fillBotsStart: 'বট বসিয়ে এখনই শুরু করো',
    startMatch: 'সবাই রেডি — শুরু করো!',
    waitingHost: (name: string) => `${name} শুরু করলেই খেলা চালু হবে…`,
    setupTipTitle: '',
    setupTipBody: '',
    roundPill: (r: number, total: number) =>
      `রাউন্ড ${toBanglaDigits(r)}/${toBanglaDigits(total)}`,
    scoreboardBtn: 'হিসাব খাতা',
    soundOn: 'সাউন্ড চালু',
    soundOff: 'সাউন্ড বন্ধ',
    muteSfxLabel: 'সাউন্ড বন্ধ করো',
    unmuteSfxLabel: 'সাউন্ড চালু করো',
    leaveRoomLabel: 'ঘর থেকে বের হও',
    dealingCards: 'কার্ড বাঁটা হচ্ছে…',
    declareCall: 'কত কল দিবা? (৫০ – ৫০০)',
    callLocked: (call: number) => `তোমার কল: ${toBanglaDigits(call)}`,
    simultaneousCall: 'সবাই মিলে কল দাও',
    confirmCall: 'কল দাও',
    allCallingCount: (count: number) =>
      `সবাই একসাথে কল দিচ্ছে (${toBanglaDigits(count)}/৪ জন দিছে)`,
    waitingCallsCount: (count: number) =>
      `বাকিদের কলের অপেক্ষা (${toBanglaDigits(count)}/৪ জন দিছে)…`,
    autoPlayOneMine: 'তোমার কাছে ১ আছে — অটো ১ চালা হচ্ছে…',
    autoPlayOneOther: (name: string) => `${name}-এর ১ দিয়ে খেলা শুরু হচ্ছে…`,
    yourTurnTap: 'তোমার চাল — একটা কার্ড ছুঁয়ে দাও',
    meTag: ' (আমি)',
    callWord: 'কল',
    scoreWord: 'মোট',
    offline: 'লাইন নাই',
    faceDownCard: 'উল্টানো কার্ড',
    roundSummaryTitle: (r: number, total: number) =>
      `রাউন্ড ${toBanglaDigits(r)} / ${toBanglaDigits(total)} শেষ`,
    fullScoreboard: 'পুরা হিসাব',
    rankCol: 'স্থান',
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
    leadingNow: 'এখন ১ম:',
    tiedFirstNow: 'যৌথভাবে ১ম:',
    colPlayer: 'খেলোয়াড়',
    colCall: 'কল',
    colWon: 'পাইছে',
    colDelta: 'যোগ/বাদ',
    colScore: 'মোট',
    viewPodium: 'ফাইনাল রেজাল্ট দেখো',
    nextRound: (r: number) => `পরের রাউন্ড (${toBanglaDigits(r)})`,
    winnerLabel: 'জিতছে:',
    ptsUnit: 'পয়েন্ট',
    backToLobby: 'লবিতে ফিরো',
    playAgain: 'আবার খেলো',
    scoreboardHeader: 'হিসাব খাতা — হানডেট',
    scoreboardSub: (r: number, total: number, code: string) =>
      `রাউন্ড ${toBanglaDigits(r)} / ${toBanglaDigits(total)} • ঘর ${code}`,
    backToTable: 'টেবিলে ফিরো',
    callPrefix: 'কল:',
    colRound: 'রাউন্ড',
    colCallWonTotal: 'কল / পাইছে / মোট',
    tableChat: 'আড্ডার চ্যাট',
    closeChat: 'চ্যাট বন্ধ করো',
    emptyChatCompact: 'নিচের বাটন টিপে বা লিখে কথা বলো।',
    emptyChatFull: 'নিচের যেকোনো একটা কথা টিপো বা নিজে লিখে পাঠাও।',
    chatPlaceholder: 'বাংলা বা বাংলিশ লেখো…',
    send: 'পাঠাও',
    voiceLocal: 'ভয়েস: লোকাল',
    voiceConnected: 'ভয়েস: চালু',
    holdToTalk: 'চেপে ধরে বলো',
    talkingPtt: 'কথা বলছো…',
    lowDataShort: (on: boolean) => `3G: ${on ? 'চালু' : 'বন্ধ'}`,
    rainShort: (on: boolean) => `বৃষ্টি: ${on ? 'চালু' : 'বন্ধ'}`,
    micLabel: 'মাইক',
    chatLabel: 'চ্যাট',
    roomLabel: 'ঘর: ',
    fallbackBanner:
      'ভয়েস কল সেট করা নাই — চ্যাট আর বট চালু আছে (.env.local দেখো)',
    connectedBanner: (kbps: number) => `ভয়েস কল চালু (${kbps}kbps)`,
    openMicOn: 'মাইক: চালু',
    openMicMuted: 'মাইক: বন্ধ',
    village3gFull: (on: boolean, kbps: number) =>
      `গ্রামের 3G: ${on ? 'চালু' : 'বন্ধ'} (${kbps}kbps)`,
    rainFull: (on: boolean) => `বৃষ্টি: ${on ? 'চালু' : 'বন্ধ'}`,
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
    yourTurnTap: 'Your turn — tap a card',
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

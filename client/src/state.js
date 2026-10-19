// Local mirror of this player's progress. The server owns the real values:
// public stats arrive through the room state, private ones in "profile" and "v" messages.
export const S = {
    wins: 0, totalWins: 0, venom: 0, venomAll: 0, rate: 1, vAt: 0, onPad: -1, rebirths: 0, escapes: 0, best: 0, deaths: 0, playtime: 0,
    stage: -1, maxStage: 0, syms: {}, wear: '', pads: {}, passes: {},
    boostUntil: 0, venomBoostUntil: 0, daily: null, codes: {},
    firstPlay: Date.now(), giftClaimed: {}, sessionSecs: 0, joinedAt: Date.now(), name: '', friends: 0,
    profileAt: Date.now(),
};

// Game actions that world objects (pads, statues, portals) trigger; filled in by main.js / ui.js
export const actions = {};

export const net = {
    room: null,
    offset: 0,
    send(type, msg) { if (this.room) this.room.send(type, msg || {}); },
    // Server clock in ms, so moving obstacles line up for everyone (QA runs can pin it)
    fixedNow: null,
    now() { return this.fixedNow ?? Date.now() + this.offset; },
};

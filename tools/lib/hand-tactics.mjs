// Specialist play follows the same hand, Reserve slots and next-card preview as the interface.
export function handTactic(c, build, P, busy) {
  if (busy) return null;
  const hand = c.hand.filter(Boolean);
  const def = (uid) => c.def(uid);
  const basic = (uid) => def(uid).category === 'basic';
  const reserve = (uid) => def(uid).tags.includes('reserve');

  if (build === 'reserve') {
    const stored = c.reserve.filter((uid) => c.check(uid).ok);
    if (P.open) {
      const support = stored.find((uid) => def(uid).category === 'support' &&
        !def(uid).targetHero && c.supportPerformer(def(uid)) !== P.hero &&
        c.flowLeft() > 1.8 && (c.hp < c.maxHp - 3 || def(uid).id === 'signal_case'));
      if (support) return { type: 'play', uid: support };
      const finish = stored.find((uid) => def(uid).category === 'arte' && reserve(uid));
      if (finish) return { type: 'play', uid: finish };
      return null;
    }
    const openers = stored.filter(basic).sort((a, b) => c.effRank(a) - c.effRank(b));
    const blockers = stored.filter((uid) => def(uid).category === 'arte' || def(uid).category === 'support');
    const entryReady = hand.some((uid) => basic(uid) && c.check(uid).ok);
    if (openers.length && (!entryReady || c.effRank(openers[0]) <= 2)) return { type: 'play', uid: openers[0] };
    const spare = hand.filter((uid) => basic(uid) && c.canStash(uid));
    const cache = !blockers.length && hand.find((uid) => reserve(uid) && !basic(uid) &&
      !def(uid).targetHero && c.canStash(uid));
    const tool = hand.find((uid) => basic(uid) && reserve(uid) && c.canStash(uid) && c.effRank(uid) < 3);
    const stash = tool || (entryReady && cache) || (c.reserve.length === 0 && spare.length >= 3 ? spare[0] : null);
    if (stash) return { type: 'stash', uid: stash };
    return null;
  }

  if (build === 'churn' && !P.open && c.phase === 'PRE') {
    const cache = c._botOpeningChurn;
    if (cache?.chain === c.history.length) {
      if (hand.includes(cache.uid) && basic(cache.uid) && c.check(cache.uid).ok) return { type:'play', uid:cache.uid };
      return null;
    }
    const preview = c.nextCard();
    if (preview && basic(preview) && c.effRank(preview) <= 2 && c.churn.charges > 0 && c.churnJamUntil <= c.t &&
        (def(preview).tags.includes('churn') || !hand.some((uid) => basic(uid) && c.effRank(uid) === 1))) {
      const dead = hand.find((uid) => !c.isLocked(uid) && def(uid).category === 'arte' && !c.heroReady(def(uid).owner)) ||
        hand.find((uid) => !c.isLocked(uid) && def(uid).category === 'arte' && c.effRank(uid) >= 5 && !def(uid).tags.includes('churn'));
      if (dead) {
        c._botOpeningChurn = { chain:c.history.length, uid:preview };
        return { type:'churn', uid:dead };
      }
    }
  }

  if (build === 'churn' && P.open) {
    const marker = c.combo?.log.findLast((entry) => entry.k === 'churn' && entry.drew);
    const uid = marker?.drew;
    if (uid && hand.includes(uid) && !c.combo.cards.some((entry) => entry.uid === uid) &&
        (c.combo.churnDraws?.has(uid) ?? true) && c.check(uid).ok && def(uid).category !== 'support') {
      return { type: 'play', uid };
    }
  }
  if (build !== 'churn' || !P.open || P.seg < 1 || P.finish || c.churnJamUntil > c.t ||
      c.churn.charges < 1 || c.flowLeft() <= 1.5 || c.combo.log.some((entry) => entry.k === 'churn')) return null;
  const next = c.nextCard();
  if (!next) return null;
  const f = def(next);
  const fits = f.category === 'basic' || (f.category === 'arte' && f.owner === P.hero && P.hasBasic && f.cost <= c.available());
  if (!fits || c.effRank(next) <= P.rank) return null;
  const discard = hand.find((uid) => !c.isLocked(uid) && c.check(uid).reason !== 'momentum' &&
    (!c.check(uid).ok || (def(uid).category === 'support' && !def(uid).tags.includes('guard')) &&
     !def(uid).tags.includes('churn')));
  return discard ? { type: 'churn', uid: discard } : null;
}

// Dip-buy mean-reversion bot for make.fun btc-race-24h-20261117-0603.
//
// Strategy: long only, single asset CBBTC (Coinbase Wrapped BTC vs USDC),
// one full-size position at a time, minute by minute.
//
//   - Indicators: SMA90, the mean of the last 90 closes. No trading before
//     90 closes exist.
//   - Entry (flat, not warming up, a fresh CBBTC bar in this batch, and past
//     the post-exit cooldown): the close is more than 80 bps below SMA90,
//     i.e. close < SMA90 * 0.992. Buy with all cash.
//   - Exit (holding): sell the whole position if any of these holds at the
//     close — the position is worth at least 2% over its cost (take profit),
//     at most 1% under its cost (stop loss), or it has been held for 300
//     bars (time stop). The profit/loss tests are exact bigint comparisons
//     (value * 100n against cost * 102n / cost * 99n), never floats.
//   - After an exit, no re-entry for 10 bars.
//
// Execution notes: orders decided on a bar's close fill at the next bar's
// open, so every signal is read off closes already seen. All indicator math
// is float64 in a fixed order; the bot never reads the wall clock, the
// environment, files, or any randomness, so two runs on the same bars answer
// identically. Every order caps slippage at 100 bps from the latest close.
//
// Dev-window result (frozen 24 h window in the kit, local grade):
// net PnL +$34.28 on $1,000 start, 6 trades, max drawdown 0.72%,
// fees $2.45. The house rsi-bollinger baseline loses $24.25 on the
// same window.

import { runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const SMA_BARS = 90;
const DIP_BPS = 0.992; // enter when close < SMA90 * 0.992 (80 bps dip)
const TAKE_PROFIT_NUM = 102n; // exit when value * 100 >= cost * 102 (+2%)
const STOP_LOSS_NUM = 99n; // exit when value * 100 <= cost * 99 (-1%)
const MAX_HOLD_BARS = 300; // exit after 300 bars held
const COOLDOWN_BARS = 10; // bars to wait after an exit before re-entering
const MAX_SLIPPAGE_BPS = 100; // cap every order's slippage at 1% past the close

/** The last SMA_BARS closes, oldest first. */
const closes: number[] = [];
/** Seq of the batch on which the current position's buy was decided, -1 when flat. */
let entrySeq = -1;
/** First seq on which a new entry is allowed again after an exit. */
let cooldownUntil = 0;

function push(bar: Bar): void {
  closes.push(Number(bar.c));
  if (closes.length > SMA_BARS) closes.shift();
}

/** The mean of the last SMA_BARS closes, or null before SMA_BARS bars. */
function sma90(): number | null {
  if (closes.length < SMA_BARS) return null;
  let sum = 0;
  for (const c of closes) sum += c;
  return sum / SMA_BARS;
}

await runBars({
  onBatch(state: BarsState, batch: { bars: Bar[] }): (BuyInput | SellInput)[] {
    let fresh = false;
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) {
        push(bar);
        fresh = true;
      }
    }
    if (state.warmingUp || !fresh) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      const value = state.value(SYMBOL, held.qty);
      const barsHeld = entrySeq < 0 ? 0 : state.seq - entrySeq;
      if (
        value * 100n >= held.cost * TAKE_PROFIT_NUM
        || value * 100n <= held.cost * STOP_LOSS_NUM
        || barsHeld >= MAX_HOLD_BARS
      ) {
        cooldownUntil = state.seq + COOLDOWN_BARS;
        entrySeq = -1;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: look for a dip below the 90-bar mean to buy.
    if (closes.length < SMA_BARS) return [];
    if (state.seq < cooldownUntil) return [];
    const mean = sma90();
    if (mean === null) return [];
    const close = closes[closes.length - 1] as number;
    if (!(close < mean * DIP_BPS)) return [];
    // Never send a buy the market would refuse for being below the minimum
    // notional (a buy must spend at least fees.min_notional_quote_units).
    if (state.cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    entrySeq = state.seq;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});

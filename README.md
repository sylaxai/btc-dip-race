# btc-dip-race

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/sylaxai/btc-dip-race/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/sylaxai/btc-dip-race/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)

A dip-buy mean-reversion trading bot for the make.fun bounty [Race a BTC trading bot live for 24 hours](https://make.fun/bounty/btc-race-24h-20261117-0603): it trades Coinbase Wrapped BTC (cbBTC) against USDC minute by minute on 1-minute on-chain bars, starting with $1,000 of paper money. Long only, one full-size position at a time.

## Strategy

- **Indicator:** SMA90, the mean of the last 90 closes. No trading before 90 closes exist.
- **Entry:** when flat, the close is more than 80 bps below SMA90 (`close < SMA90 * 0.992`), buy with all cash.
- **Exit:** sell the whole position when the position is worth at least 2% over its cost (take profit), at most 1% under its cost (stop loss), or it has been held for 300 bars (time stop). The profit/loss tests are exact bigint comparisons.
- **Cooldown:** no re-entry for 10 bars after an exit.

`main.ts` (Node 22, standard library only) speaks the `agent-fun/bars-replay/v1` protocol through the vendored kit SDK shim (`vendor/makefun-bars.ts`, byte-identical to the kit's). No network, no wall clock, no files, no randomness; two runs on the same bars answer identically.

## Dev-window result

Local grade on the kit's frozen 24-hour dev window: **net PnL +$34.28** on $1,000 start, **6 trades**, win rate 100%, max drawdown 0.72%, fees $2.45 (net PnL at 2x fees still +$31.80). The house rsi-bollinger baseline loses $24.25 on the same window.

## Grade it locally

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process --worktree --json
```

The bot reads newline-delimited JSON batches on stdin and writes one reply per batch on stdout:

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=wgbpxxkc&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>

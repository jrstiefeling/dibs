# Working on Dibs

## Run the tests

    node test/run-real.mjs      # storage, listings, the scan loop
    node test/run-real2.mjs     # negotiation arc, red flags, two-buyer escalation
    node test/run-real3.mjs     # graduation, guardrails, scheduler, ledger
    node test/run-content.mjs   # messenger.js against a DOM shim
    node test/regress.mjs       # attribution cannot be fooled
    node test/money-real.mjs    # offer parsing
    TZ=Asia/Tokyo node test/quiet.mjs

All of them together, from the repo root:

    for f in test/run-*.mjs test/regress.mjs test/money-real.mjs; do node "$f" || exit 1; done

Requires Node 18+. No dependencies, no install step.

## The one rule

**Tests import the real modules.** They never reimplement app logic. Two rounds
of testing were thrown away because they tested a copy of the logic and passed
while the app was broken. `test/chrome-mock.mjs` provides the `chrome` API and
`test/dom-shim.mjs` provides enough DOM to run `messenger.js` unmodified.

## Load it in Chrome

`chrome://extensions` → Developer mode → Load unpacked → pick this folder.
Put the folder somewhere permanent; Chrome reads from that path on every launch.

## Before changing messenger.js

Read the reader section of `HANDOFF.md`. The failure mode must stay *silence*,
never a wrong message. If you loosen an attribution threshold, add a case to
`test/regress.mjs` proving it can't be fooled.

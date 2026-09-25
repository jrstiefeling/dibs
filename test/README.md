# Test suite

These load the **real shipped modules** and run them against a mocked `chrome`
API and a hand-built DOM. Nothing in here reimplements app logic — that was the
flaw in the first round of testing, and it's why bugs got through while the
tests were green.

    node test/run-real.mjs      # storage, listings, the scan loop
    node test/run-real2.mjs     # negotiation arc, red flags, two-buyer escalation
    node test/run-real3.mjs     # graduation ladder, guards, scheduler, ledger
    node test/run-content.mjs   # messenger.js against a real DOM
    node test/regress.mjs       # attribution cannot be fooled
    node test/money-real.mjs    # offer parsing, real readAmount
    TZ=Asia/Tokyo node test/quiet.mjs   # quiet hours in both branches

199 assertions, all passing.

`chrome-mock.mjs` implements storage.local, tabs, runtime, notifications,
alarms, action, sidePanel and identity, plus a fetch that records every call —
so tests can assert that prompt caching is on and that no raw transcript is
sent to the API.

`dom-shim.mjs` is a small DOM (selector engine with descendant combinators and
comma lists, getBoundingClientRect, contenteditable, execCommand) sufficient to
run `messenger.js` unmodified. It also simulates what Messenger does on Enter —
clear the box, append an outgoing row — so the send path can be verified end to
end rather than stubbed.

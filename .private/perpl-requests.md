# Requests to Perpl

## gvan, Perpl (Head of Growth): API enrollment and testnet funds

> **Hi gvan,**
>
> OpenCash is a web/phone app for trading Monad perps and assets on Perpl: you pick a theme or rule-based strategy, test it on real Perpl history and with fake money, then run it under a hard spending cap. A public leaderboard ranks traders so verified users can copy them, and bins group assets by narrative so you trade inside a theme.
>
> We're building the bot lane on Perpl's API keys: a server holds a trade-only Ed25519 key per user, orders go through `POST /v1/trading/orders`, and the user turns on One-Click Trading once. The signer, enrollment and order client are written and tested against your documented formats, but not against your servers. Three things would unblock us:
>
> 1. **Origin whitelisting for key enrollment.** For `/api/v1/api-key/payload` and `/enroll`, could you whitelist `https://monad.opencash.in` (our production frontend) on mainnet and testnet, and `http://localhost:4321` on testnet for development?
> 2. **Testnet funds.** We can't find a faucet. Could you send testnet AUSD and a little MON to `<our test wallet address>` so we can run the full path: create account, enable forwarding, enroll the key, place and cancel one small order?
> 3. **Two checks we'd rather confirm than guess:**
>    - Do `p` and `s` in an API order use the same price and lot decimals as the on-chain order fields?
>    - Can stop and take-profit orders rest on the exchange through the API, so a position stays protected if our runner is offline?
>
> **Who is the right person for the whitelisting request if it isn't you?**
>
> Thanks, and happy to share the code or show a demo.

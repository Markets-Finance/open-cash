# Access instructions

No login credentials are needed. Accounts are created with a passkey, so each judge makes their own in under a minute.

## Web

1. Open https://hl.opencash.in and click **Launch terminal**.
2. Click **Create an account**, enter any name and email (they only label the passkey), and approve the passkey prompt. Use Chrome, Edge or Safari with Google Password Manager, iCloud Keychain or 1Password; the passkey must support the PRF extension.

## Android app

1. On an Android phone, open https://hl.opencash.in and tap **Download app**, or download `OpenCash.apk` from the latest release at https://github.com/Markets-Finance/open-cash/releases.
2. Open the downloaded file and allow installing from your browser when Android asks (the app is not on the Play Store).
3. Open OpenCash, tap **Create an account**, enter a name and email, and approve the passkey with Google Password Manager. Already have a Hyperliquid wallet? Tap **Import a wallet** and paste its private key instead; it is encrypted by your passkey and never leaves the phone.

## Without depositing

After signing in you can browse every market with live Hyperliquid prices, open any bin to see how it would be sized, backtest strategies on real Hyperliquid history and run paper bots with fake money.

## To trade (real money, Hyperliquid mainnet)

1. Tap **Deposit** and copy your address.
2. Send at least 5 USDC to it on **Arbitrum One**. It must be native USDC, not USDC.e.
3. Back in the app, tap **Deposit** and approve with your passkey. Our relayer pays the gas, so you need no ETH, and the funds appear in your Hyperliquid balance within a minute.
4. Hyperliquid's smallest order is $10. With $10 you can trade any single market with leverage (up to 50x on the S&P 500) or open the **Gold and silver** or **Oil shock** bins. Larger bins such as **Trump lovers** or **AI lovers** need about $35.
5. **Withdraw** returns USDC to the same address on Arbitrum One.

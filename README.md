# Profit Calculator

Investment profit calculator with multi-coin tracking and Google Sheets sync.

## Google Sheets setup

1. Create or open a Google Sheet
2. **Extensions → Apps Script**
3. Paste the contents of [`google-apps-script/Code.gs`](google-apps-script/Code.gs) and save
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployment URL
6. Paste it into **Google Sheets sync** at the top of the calculator

The sheet gets headers on first sync. Each instance row includes coin name, invested amount, entry/target prices, live P/L, status, and closing data.

## Sheet columns

| Column | Description |
|--------|-------------|
| Entry ID | Internal key (auto-managed) |
| Coin name | Coin instance name |
| Invested amount | Amount invested |
| Entry price | Entry price |
| Target price | Target price |
| Profit/loss | At current price (open entries) |
| Percentage | At current price |
| Total value at target | Portfolio value at target |
| Status | `open` or `closed` |
| Closing date | Date entry was closed |
| Profit/loss at closing | P/L when closed |

## Usage

- Entries auto-sync to the sheet on every field change (500ms debounce)
- Click **Sync** to pull all rows from the sheet into the app (replaces local data)
- Click **Close** on an instance to mark it closed and record closing P/L
- **Remove** deletes the row from the sheet

After updating `Code.gs`, create a **new deployment** so pull (GET) works.

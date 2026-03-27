# iisauh wallet

**This is a website, not a downloaded app.** You use it through your browser. It is optimized for iPhone.

---

## How to Add It to Your iPhone Home Screen

This makes it feel and behave like a real app you tap to open.

1. Open **https://iisauha.github.io/iisauhwallet/** in Safari on your iPhone
2. Tap the three dots in the bottom right of the screen (right next to the website URL bar)
3. Tap **Share** at the top of the menu that pops up
4. Tap **View More** (the button that looks like an upside-down chevron)
5. Tap **Add to Home Screen** (a square icon with a + inside it)
6. Name the app whatever you want. The creator named it iisauhwallet but feel free to call it anything :)
7. **IMPORTANT: Uncheck "Open as Web App"**
8. Tap **Add** in the top right

The app icon now lives on your home screen and opens the website when tapped. It will feel just like a real app.

**Why uncheck "Open as Web App"?** The app was built and tested to work as a regular Safari website. Leaving that option checked causes the app to behave differently and can cause it to malfunction. Always keep it unchecked.

---

## Security: What You Need to Know (Plain English)

### What protects your data

The app sits behind a **6-digit passcode** that you create the first time you open it. Nobody gets into the app without that code. The data itself is stored in your browser's local storage (think of it like a locked filing cabinet that lives inside Safari on your phone) and never gets sent to any server. The creator of this app cannot see your data, ever.

### What encryption actually does

When you export your data as a JSON backup, you can choose to encrypt it with your passcode. Here is what encryption means in plain terms: it scrambles your data into complete gibberish that is unreadable without the exact passcode. Without your passcode, the exported file looks something like this:

```
U2FsdGVkX1+kZ3xQ8pM2V7nRtYwJhF0B...4gX9cLm1pQ6nWsKdA8vBzRy
```

There is no way to reverse that back into real data without the correct passcode. This also protects you against brute-force attacks (someone just trying every combination) because the encryption is intentionally slow and computationally expensive to crack.

### How safe is it really

Think about what a bad actor would actually have to do to get to your data:

1. **They would need your physical phone.** Your phone's own lock screen (Face ID, fingerprint, PIN) is the first wall.
2. **Then they would need to know this app exists and find it.** It is not a famous app with millions of users. It is a personal tool hosted on GitHub.
3. **Then they would need to get past the passcode screen.** 6 digits with lockout after too many attempts. After 10 wrong tries the app locks for 24 hours or wipes itself.
4. **If somehow they bypassed all of that and opened browser developer tools** (which is genuinely difficult on a mobile phone) the raw data in local storage is encrypted.
5. **And after all of that, what they would find is** a personal finance journal with balances you typed in by hand. Not your actual bank credentials. Not your card numbers. Not your Social Security number. Not your login info for anything.

There is no connection to any bank. Nothing here could be used to access your accounts.

### IMPORTANT: What NOT to put in this app

**Do not type your actual card numbers, account numbers, routing numbers, passwords, Social Security number, or any real login credentials into this app.** The app is designed for you to track dollar amounts and account names (like "Chase Checking" or "Amex Gold") not the sensitive numbers behind those accounts. A balance of $4,200 is useful information. Your 16-digit card number is not needed and should not be here.

---

## Personalize the Look and Feel

Before diving into all the features, here is what you can customize. Go to **Settings** (tap your avatar or name in the top bar) and then tap **App Customization**.

**Themes:** Choose from over a dozen color themes: Royal (deep navy and gold, the default), Midnight, Aurora, Jade, Plum, Copper, Mocha, Steel, and more. There are also light themes: Light, Arctic, Sakura, and others. Each theme changes the background, card surfaces, borders, and accent colors all at once.

**Fonts:** Pick from dozens of fonts organized by style: modern system fonts like SF Pro, clean web fonts like Inter, Roboto, or DM Sans, classic options like Helvetica and Georgia, and display fonts like Playfair and Raleway. Tap any to preview it instantly.

**Font Size:** Choose Small, Medium, or Large to adjust how big text appears throughout the app.

**Surface Style:** Switch between a standard look and a frosted glass style where cards have a blur effect that lets the animated background show through.

**Accent Color:** The accent color is used for buttons, highlights, and active states. You can pick any custom hex color on top of a theme.

**Tab Management:** Go to Settings and tap **Manage Tabs** to hide tabs you do not use or drag them into a different order.

---

## How the App Works: Tab by Tab

### Snapshot

This is your main financial dashboard and the first thing you see when you open the app. It shows where your money is right now.

**Cash section:** Shows all your bank accounts. Tap the section header to expand and see each account with its current balance. Swipe left and right to scroll through your accounts if you have more than one. Tap **+ Add** to create a new bank account and enter a starting balance. Tap any account card to edit its balance. Use the **Hide $0 balances** toggle to clean up the view.

**Credit Cards section:** Same idea: shows all your credit cards and their current balances (what you owe). Swipe through cards. Tap **+ Add** to add a new card. Tap a card to edit its balance or set up reward tracking (cashback, miles, or points) for spending suggestions.

**Pending Inbound section:** Money that is on its way to you but has not arrived yet. For example: a transfer you sent from a bank that takes 2-3 days, a Venmo payment someone owes you, or a paycheck that cleared but you have not updated the balance yet. Tap **+ Add** to create a pending item. When the money actually arrives, tap **Post** and choose which account it goes into. The balance updates automatically.

**Pending Outbound section:** Money you have sent but that has not fully cleared. A bill payment, a credit card payment, a transfer out. Tap **+ Add** to create one. Tap **Post** when it clears and the appropriate account balance updates. For loan payments, you can see the breakdown of how the payment splits between interest and principal.

**Net Cash:** At the bottom of the Snapshot page is your final net cash. Basically your total bank balances minus your total credit card debt, adjusted for pending items. This tells you "if everything settled right now, how much money do I actually have?"

**Recent Activity:** A small widget near the top shows your last few transactions and balance changes so you can see what changed recently.

---

### Spending

Track every purchase you make. Log it manually: merchant name, amount, date, what category it falls under, and notes if needed.

**Adding a purchase:** Tap the "+" button in the bottom right corner of the screen and choose "Log a purchase." Fill in the details. The app will suggest which card to use based on which one earns the best rewards for that category of spending.

**Categories and subcategories:** Organize your spending by category (Food, Transportation, Entertainment, etc.) and subcategory. You can create your own categories in Settings under Manage Categories.

**Viewing your spending:** Switch between "Categories" view (a pie chart breaking down where your money goes) and "By Card" view (a bar chart showing which card you spent on most). You can also toggle to a Rewards view to see your current cashback/points/miles balances across all your cards.

**Date ranges:** Filter spending by this month, last month, all time, or pick a custom date range.

**Searching purchases:** Tap the magnifying glass icon to search by merchant name, category, or subcategory. You can even use a regex pattern (like `/coffee|tea/`) for advanced searches.

**Editing and deleting:** Tap any purchase in the list to edit the details. Purchases marked as reimbursable (like a work expense your company will pay back) are excluded from your personal spending totals.

**Reward tracking:** When you log a purchase on a rewards card, the app shows how many points/miles/cashback you earned and lets you confirm or adjust the amount before adding it to that card's reward balance.

---

### Upcoming

This tab is like a calendar for your money. It looks ahead at the next 14, 21, 30, or 45 days and shows you every expected paycheck or bill coming up. At a glance you can see how much you will have left after your upcoming expenses.

**Expected Income section:** Automatically populated from your recurring income items (like a salary that hits every two weeks). You can also add one-time expected income items here. Each item shows how many days away it is and the amount highlighted in green.

**Expected Costs section:** Bills, subscriptions, rent, loan payments. Anything in your recurring expenses list shows up here on its expected date. Add one-time costs too. Amounts are shown in red. You can adjust an expected amount for a specific occurrence (useful if this month's electric bill is higher than usual) without changing your permanent recurring setup.

**Move to Pending:** When you want to track a specific item as "in motion" (you already sent the payment and are waiting for it to clear), tap the button next to it to promote it to a Pending item in the Snapshot tab.

**Dismissing an occurrence:** If a specific occurrence does not apply to you this time, dismiss it without affecting the underlying recurring item.

**Summary:** At the top, the page shows your current cash balance, adds expected income, subtracts expected costs, and shows what you will be left with. If any items have a range (min/max), the summary shows that range.

---

### Recurring

This is the planning layer. Set up anything that repeats (income or expenses) and it will flow automatically into the Upcoming tab and optionally into Snapshot.

**Recurring Income:** Add income streams like your salary, freelance checks, side income, rental income, or any money that comes in regularly. For each item you set: the name, amount, frequency (monthly, weekly, biweekly, yearly, or every X days), start date, and which account it goes into. Toggle "autopay" to automatically create a Pending Inbound item when it is due.

**Recurring Expenses:** Add anything that repeats: rent, subscriptions, gym membership, insurance, loan payments, groceries on autopay, etc. Same setup as income but amounts show in red. You can link a recurring expense to a loan so it always uses the current estimated payment amount. The "Apply to Snapshot" toggle means running "Process Recurring" will actually update your account balances for that item.

**Editing details:** Each item can have a category (for spending tracking), payment source (which card or bank account), notes, and a split amount (if you share an expense with a roommate and only owe half).

**Monthly totals:** The tab shows total monthly income and total monthly expenses based on everything in the list, normalized to a monthly basis regardless of frequency.

**457(b) Optimizer:** An optional tool that uses your recurring income data to estimate take-home pay after taxes, 457(b) contributions, and expenses. Useful for fine-tuning your retirement contribution strategy.

---

### Loans

Track your student loans and private loans in one place.

**Federal (Public) Loans:** Add your federal student loans. The app calculates estimated monthly payments for different repayment plans (Standard, Income-Driven, PAYE, SAVE, IBR, ICR, etc.) and shows how many years until potential loan forgiveness for each plan. You can also log when you are in school, grace period, deferment, or forbearance.

**Private Loans:** Add any private loans with a balance, interest rate, and payment setup. The app supports multiple payment modes: custom monthly amount, full amortized repayment (pays off by a specific date), interest-only, or deferred (no payments, interest accrues). You can also set up date ranges for different modes. For example, deferred through graduation, then interest-only for a year, then full repayment.

**Swipe for more:** Each loan card has two views you can swipe between. The main card showing balance and payment info, and a second card showing notes and additional details.

**Loan Tools:** Tap "Loan Tools" for a calculator where you can experiment with different payment scenarios without changing your actual loan data.

**Summary at top:** Shows your total monthly loan payment, total outstanding balance across all loans, and the weighted average interest rate.

**Posting loan payments:** When you make a loan payment, you can create a Pending Outbound item directly from the Loans tab. For multiple private loans, it shows how the payment is split and you can adjust the allocation per loan.

---

### Investing

Track all your investment accounts: HYSA (high-yield savings), Roth IRA, 401(k), Traditional IRA, and general brokerage. Includes a Coast FIRE retirement calculator.

**Updating balances:** Tap any account to enter its current balance. You log these manually. The app does not connect to any brokerage.

**HYSA sub-buckets:** Each HYSA account has two internal buckets. Reserved (long-term savings you are not touching) and Bills (money you are setting aside to pay upcoming bills). The "Bills" portion is what the Upcoming tab uses when calculating your available liquid cash. Use the Allocate feature to move money between the two buckets without changing the total HYSA balance.

**Transferring between accounts:** Tap "Transfer" to move money between a bank account and an investing account. This creates a Pending Outbound in Snapshot so you can track the transfer while it is in motion.

**Interest accrual:** For HYSA accounts, tap "Accrue Interest" to manually add the monthly interest based on the current APY. The app calculates it for you.

**Coast FIRE Calculator:** A retirement planning tool that answers: "If I stop contributing today, will I have enough money by retirement?" Coast FIRE means you have invested enough that compound growth alone will get you to your retirement goal, even if you stop adding money now.

Set your current age, target retirement age, expected annual spending in retirement, safe withdrawal rate, expected market return, and inflation. The calculator shows your target portfolio size (your FIRE Number), whether you have already hit Coast FIRE, and projects your portfolio growth year by year on a chart.

---

### Bonuses

Track credit card sign-up bonuses. These bonuses typically require you to spend a certain amount in the first few months of having a card to earn a large reward.

**Adding a tracker:** Tap **+ Add**, pick the card, set the spending deadline, and define the reward tiers. For example: spend $500 to get 50,000 points, spend $1,000 to get another 25,000 points.

**Tracking progress:** Enter how much you have spent on the card so far toward the bonus. The tracker shows which tiers you have unlocked, how much more you need for the next tier, and how many days remain.

**Completing a bonus:** When you have hit your target, tap **Complete**. Choose which tiers you earned and the app logs the reward (points, miles, or cash) to your rewards balance.

**Completed bonuses:** All your past sign-up bonuses are saved in the Completed section. You can see the full history of cards you have gotten bonuses from and the total value earned.

---

### Settings

**Profile:** Set your display name and upload a profile photo. The photo is stored on your device only and used for the header and welcome screen.

**App Customization:** Themes, fonts, font size, accent color, and surface style. See the "Personalize the Look and Feel" section above for full details.

**Manage Tabs:** Reorder or hide tabs in the navigation bar.

**Edit Account Names:** Rename any bank, credit card, or investing account across the whole app without losing any data.

**Manage Categories:** Create, rename, and delete spending categories and subcategories.

**Security Settings (if passcode is set):**
- Pause or resume passcode protection
- Reset your passcode (requires your current one or recovery method)
- Set auto-lock time (1, 2, 5, 10, 15, or 30 minutes of inactivity, or never)

**Export JSON:** Back up all your data to a JSON file. You can encrypt it with your passcode for extra protection. This is your safety net. If anything happens to your browser storage, you can restore from this file.

**Import JSON:** Restore from a previously exported backup. Replaces all current data.

**Export Monthly Purchases CSV:** Downloads this month's purchases as a spreadsheet-compatible CSV file.

**FAQ and App Guide:** In-app help and explanations.

---

## Backing Up Your Data

- Export a JSON backup regularly (Settings > Export JSON). Once a week is a good habit.
- Save the backup file to iCloud Drive or another safe place outside your phone.
- If you export with encryption, remember that you need your passcode to open it again.
- If you switch phones or clear browser data, you can restore everything from a backup.
- The app stores data in Safari's local storage. Clearing Safari data or switching browsers will remove your data unless you have a backup.

---

## Source and Contact

- Source: https://github.com/iisauha/iisauhwallet
- Contact: iisauhaguilar@gmail.com
- Official site: https://iisauha.github.io/iisauhwallet/

For security and privacy details, see Settings > Security Policy inside the app.

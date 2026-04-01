import { Link } from 'react-router-dom';

const OFFICIAL_SITE = 'https://iisauha.github.io/iisauhwallet/';

export function PrivacyPage() {
  return (
    <div className="tab-panel active" style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 80 }}>
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Security &amp; Privacy Policy - iisauh wallet
        </h1>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))' }}>Last updated: March 2026</p>
      </div>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Quick summary (what could worry you)
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          iisauh wallet keeps your information on <strong>your device, inside your browser</strong>. Nothing you type is
          sent to our servers for storage. Think of it like a notebook that lives in your phone or computer’s browser. The
          main risk is <strong>someone else getting into that device or into those saved files</strong>, or you sharing a
          backup file you did not mean to share.
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          Even if something went wrong, remember what the app actually holds: <strong>amounts and labels you entered
          yourself</strong> for your own tracking. It is <strong>not</strong> hooked up to your bank to pull account
          numbers or passwords. It does <strong>not</strong> store your real bank login. Someone who only saw your backup or
          browser data would mostly see a <strong>personal money diary</strong>, not a key that lets them log into your bank
          or spend your real money.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Stored locally: what that means
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          “Local” means the app saves your data in the same place websites usually save settings:{' '}
          <strong>browser storage for this site</strong> on the device you are using. It stays on your phone, tablet, or
          computer until you clear it, export it, or reset the app. There is no company-side database of your balances for
          this app’s normal use.
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          That also means <strong>you are responsible for backups</strong> if you care about not losing data (for example,
          Settings → Export JSON). Moving to a new device usually means bringing a backup file with you or starting fresh.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          What the app stores on your device
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          For example: banks and cards as <strong>names and balances you typed</strong>, pending money in and out,
          purchases, recurring income and bills, loans, investing and HYSA-style buckets, reward settings, categories,
          passcodes and recovery helpers, and UI preferences. Your Settings profile may include:
        </p>
        <ul style={{ margin: '10px 0 0 0', paddingLeft: 20, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.7 }}>
          <li><strong>Display name</strong> (plain text)</li>
          <li><strong>Profile photo</strong> (resized to a small JPEG and stored as a short data string)</li>
        </ul>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          You might call an account “Chase checking” and type a balance. That is <strong>your label and your number</strong>.
          The app is not receiving secret account numbers from the bank.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Passcode and recovery (how access works)
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          You can set a <strong>six digit passcode</strong> so the app asks for it before showing your tabs. That is a{' '}
          <strong>lock on the app screen</strong>. It helps when someone picks up your unlocked phone, because they still
          need your code to use the app.
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          During setup you can also save a <strong>hint</strong>, answer <strong>two security questions</strong>, and write
          down a <strong>recovery key</strong> the app shows once. Those exist so you can get back in if you forget the
          passcode, using the flows the app gives you. The app keeps only scrambled checks (not your raw passcode in
          readable form) so a quick glance at storage does not print your exact code in plain text.
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          <strong>Important:</strong> that lock is <strong>not full-disk encryption</strong> of everything in the browser.
          Someone with deep access to the device and enough skill could still try to read what the browser saved, the same
          way they might dig through any other local app data. The passcode is there to <strong>stop casual use</strong> of
          the app and to match how people expect a finance screen to behave, not to promise military-grade secrecy of every
          byte on the phone.
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          You can <strong>pause</strong> passcode protection in Settings. While paused, anyone who opens the app on that
          device can see it without the code. Turn protection back on when you are done.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Realistic risk (if someone “got your stuff”)
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          For someone to learn what you track in iisauh wallet, they would generally need several stars to line up:
        </p>
        <ol style={{ margin: '10px 0 0 0', paddingLeft: 20, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.7 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Access to your device or browser</strong> where you use the app (or a copy of an export file you made),
            for example the phone itself, a shared computer, or a backup you emailed to yourself.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Getting past the lock you use</strong>, which usually means guessing or knowing your passcode, or you
            having paused protection, or them using technical tools to read browser storage or open a JSON backup. That second
            path takes more know-how than simply opening the app.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Even then</strong>, what they see is mostly what <strong>you manually entered</strong>: nicknames for
            accounts, dollar amounts, categories, and notes. It is sensitive in a personal privacy sense (your habits and
            balances), but it is <strong>not the same as handing over bank passwords or full card numbers from a bank</strong>.
            It is not a tool that can move money or log into your financial institutions by itself.
          </li>
        </ol>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          So the honest picture is: <strong>protect your device</strong>, <strong>use the passcode</strong>,{' '}
          <strong>be careful with backup files</strong>, and <strong>do not expect the app to hide your data from a
          determined expert with full access to your unlocked phone</strong>.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Backups and exports (treat as sensitive)
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          <strong>Export JSON</strong> saves a backup of what the export includes from your local data (balances, purchases,
          settings keys, and similar). It can still feel very personal. Treat exports like a private document.
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          Profile name and photo live locally, but the JSON export may not bundle every profile field. If you rely on them,
          assume you might need to set them again after a restore.
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          <strong>Import JSON</strong> replaces the app’s saved data on this device with the file you pick. Only import files
          you trust.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Creator access limitations
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          The person who built iisauh wallet does <strong>not</strong> have access to your information. Your balances,
          purchases, settings, passcode, recovery setup, and profile are <strong>not</strong> uploaded to the creator or
          stored on a central server they can open. They stay in <strong>your browser’s saved storage on your own
          device</strong> (the same kind of place a website keeps login preferences), until you export a file yourself or
          clear the site’s data.
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          So even though someone wrote the app, they cannot browse everyone’s notebooks: <strong>there is no shared
          database of your wallet</strong> in normal use. The creator will never ask you for your passcode, recovery key, or
          financial data. The official site is:
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--accent)', fontWeight: 600, wordBreak: 'break-all' }}>
          {OFFICIAL_SITE}
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Security tips
        </h2>
        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.7 }}>
          <li>Use a passcode and avoid leaving protection paused on a shared device.</li>
          <li>Save your recovery key when the app shows it. It is not shown in full again the same way.</li>
          <li>Export JSON backups if you care about not losing data, and store those files somewhere safe.</li>
          <li>Only import backups you trust.</li>
          <li>Use only the official site link above.</li>
          <li>If you suspect exposure, you can use “Reset All Data” in Settings to clear this site’s storage on the device.</li>
        </ul>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Transparency
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          This application is a personal finance tracking tool. It does not provide financial advice and is not a financial institution.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Questions &amp; contact
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          If you have questions about this Security &amp; Privacy Policy, contact:<br />
          <a href="mailto:iisauhaguilar@gmail.com" style={{ color: 'var(--accent)' }}>iisauhaguilar@gmail.com</a>
        </p>
      </section>

      <p style={{ textAlign: 'center', marginBottom: 24 }}>
        <Link to="/" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          Back to app
        </Link>
      </p>
    </div>
  );
}

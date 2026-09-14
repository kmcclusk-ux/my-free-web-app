export function FullAppUpgrade() {
  return (
    <section className="full-app-upgrade" aria-labelledby="full-app-title">
      <div className="full-app-upgrade__intro">
        <p className="full-app-upgrade__eyebrow">Your next step · Free full app</p>
        <h2 id="full-app-title">Two investments are the start.<br />See your whole income picture.</h2>
        <p>Bring your accounts, income, and what-ifs together in AfterTax US.</p>
      </div>
      <ul className="full-app-upgrade__benefits">
        <li>
          <strong>One multi-account portfolio</strong>
          <p>See investments and income across accounts in one place.</p>
        </li>
        <li>
          <strong>Income exclusions, tax impact retained</strong>
          <p>Exclude an account from displayed after-tax income while keeping its income in tax calculations.</p>
        </li>
        <li>
          <strong>Saved what-if scenarios + a baseline</strong>
          <p>Save scenarios and set a baseline to compare changes.</p>
        </li>
        <li>
          <strong>Beyond federal + state</strong>
          <p>This quick calculator estimates federal and state taxes only. The full app adds supported local and W-2 payroll taxes.</p>
        </li>
      </ul>
      <div className="full-app-upgrade__footer">
        <div className="full-app-upgrade__actions">
          <a className="full-app-upgrade__primary" href="https://aftertaxus.com/app/" rel="noreferrer" referrerPolicy="no-referrer" aria-describedby="full-app-save-note">Open free full app <span aria-hidden="true">→</span></a>
          <a className="full-app-upgrade__secondary" href="https://aftertaxus.com/app/?auth=create" rel="noreferrer" referrerPolicy="no-referrer" aria-describedby="full-app-save-note">Create free account</a>
        </div>
        <div className="full-app-upgrade__notes">
          <p id="full-app-save-note">A free account is required to save your portfolio and scenarios. No paid upgrade.</p>
          <p>These links do not transfer your calculator inputs.</p>
        </div>
      </div>
    </section>
  );
}

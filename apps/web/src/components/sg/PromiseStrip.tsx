/**
 * The three brand promises, under the hero.
 *
 * This is the one place the design lets Cormorant carry a sentence rather
 * than a headline, because these ARE the headline -- the three things the
 * product claims. The eyebrow above each is Cinzel, the promise is Cormorant
 * at 26/32, and the supporting line is Manrope.
 *
 * COPY NOTE. The handoff's preview writes the first promise's detail as "No
 * surge after you book. Ever." That wording is kept: "No surge after you
 * book" is the single sanctioned use of the word in the brief's copy rules,
 * precisely because it is the promise and not a boast.
 *
 * None of this is placeholder content. These three claims are things the
 * platform does: the fare is locked at quote time by the pricing service,
 * drivers are KYC-verified before a first trip, and every ride has a pickup
 * PIN, live tracking and an SOS path to operations.
 */
const PROMISES = [
  {
    eyebrow: 'Fare locked',
    promise: 'The price you see is the price you pay.',
    detail: 'No surge after you book. Ever.',
  },
  {
    eyebrow: 'Verified Saaradhis',
    promise: 'Every driver, checked and rated.',
    detail: 'Verified, trained, and rated after every trip.',
  },
  {
    eyebrow: 'Safe every mile',
    promise: 'Share your trip in one tap.',
    detail: 'Ride PIN, live tracking and a safety button on every ride.',
  },
];

export function PromiseStrip() {
  return (
    <section aria-labelledby="promises">
      {/* The strip has no visible heading in the design -- the three
          promises ARE the heading. It still needs one in the outline, or the
          three `h3`s below hang off nothing and anyone navigating by headings
          cannot tell where this section starts. */}
      <h2 id="promises" className="sr-only">
        What SaaradhiGo promises
      </h2>
      <div className="sg-promise">
        {PROMISES.map((p) => (
          <div key={p.eyebrow}>
            <h3>{p.eyebrow}</h3>
            <p>{p.promise}</p>
            <span>{p.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

import credits from '../../../public/photography/CREDITS.json';

/**
 * Photograph attribution.
 *
 * NOT OPTIONAL. All three site photographs are Creative Commons Attribution:
 * commercial use is granted on condition that the author, the licence and
 * the source are credited. This component is that condition being met, so it
 * belongs wherever the images ship -- deleting it to tidy the footer would
 * put the site outside its licence.
 *
 * It reads `public/photography/CREDITS.json`, which is written by the asset
 * install step, so adding a photograph updates the credits automatically.
 */
type Credit = {
  file: string; title: string; author: string;
  licence: string; licence_url: string; source: string;
};

export function PhotoCredits() {
  const list = credits as Credit[];
  if (list.length === 0) return null;

  return (
    <details className="hp-credits">
      <summary>Photography credits</summary>
      <ul>
        {list.map((c) => (
          <li key={c.file}>
            <a href={c.source} target="_blank" rel="noopener noreferrer">
              {c.title.replace(/\.(jpg|jpeg|png)$/i, '')}
            </a>
            {' — '}
            {c.author}
            {', '}
            <a href={c.licence_url} target="_blank" rel="noopener noreferrer">
              {c.licence}
            </a>
            {', via Wikimedia Commons'}
          </li>
        ))}
      </ul>
    </details>
  );
}

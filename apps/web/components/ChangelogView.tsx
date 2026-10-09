import type { ChangelogEntry } from "../lib/changelog";

/** Una versión del historial de novedades: número, fecha, título y cambios. */
export function ChangelogEntryView({ entry }: { entry: ChangelogEntry }) {
  return <article className="side-changelog-entry">
    <header><strong>v{entry.version}</strong><time dateTime={entry.date}>{entry.date}</time></header>
    <p>{entry.title}</p>
    <ul>{entry.items.map((item) => <li key={item}>{item}</li>)}</ul>
  </article>;
}

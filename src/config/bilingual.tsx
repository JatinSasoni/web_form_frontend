/**
 * Turkey boat show — TEMPORARY.
 *
 * While this is true the Turkish wording is the main label and the English sits
 * in brackets beside it. After the show, set it to false: every label, section
 * title, dropdown option and screen reverts to English only, and nothing else
 * needs editing. To remove it for good, delete this file, its imports and the
 * .label-alt CSS block in YachtCharterForm.css.
 */
export const SHOW_TURKISH = false;

/** Label content: Turkish leads, English in brackets. */
export const bilingual = (en: string, tr: string) =>
  SHOW_TURKISH ? (
    <>
      {tr} <span className="label-alt">({en})</span>
    </>
  ) : (
    <>{en}</>
  );

/** Same, for text that has to be a plain string (options, placeholders). */
export const bilingualOption = (en: string, tr: string) =>
  SHOW_TURKISH ? `${tr} (${en})` : en;

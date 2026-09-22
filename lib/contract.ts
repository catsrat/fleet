import type { Rider } from "@prisma/client";
import { COMPANY, WERKSTUDENT_WEEKLY_HOURS, type EmploymentType } from "./constants";
import { CONTENT_WIDTH, renderPdf, wrapText, type PdfLine } from "./pdf";
import { fullName } from "./rider";

/**
 * Builds the employment contract PDF from the rider's own details.
 *
 * The wording below is a STARTING POINT, not legal advice: a German employment lawyer must review and
 * replace it before you issue it to anyone. Everything that varies per rider is filled in from the
 * database, so once the text is approved you only edit it here in one place.
 */

export const CONTRACT_VERSION = 1;

/** The contract is written in German, so it needs German labels rather than the admin UI's English ones. */
const EMPLOYMENT_LABEL_DE: Record<EmploymentType, string> = {
  MINIJOB: "Geringfügige Beschäftigung (Minijob)",
  WERKSTUDENT: "Werkstudentin / Werkstudent",
  SHORT_TERM: "Kurzfristige Beschäftigung",
};

const fmt = (d: Date | null | undefined): string => (d ? d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : "__________");

export interface ContractInput {
  rider: Rider;
  employmentType: EmploymentType;
  startDate: Date | null;
  hourlyCents: number | null;
}

function clauses(i: ContractInput): { heading: string; body: string }[] {
  const weekly =
    i.employmentType === "WERKSTUDENT"
      ? `Die regelmäßige Arbeitszeit beträgt während der Vorlesungszeit höchstens ${WERKSTUDENT_WEEKLY_HOURS} Stunden pro Woche. Außerhalb der Vorlesungszeit kann sie nach Absprache erhöht werden.`
      : i.employmentType === "MINIJOB"
        ? "Die Beschäftigung wird als geringfügige Beschäftigung (Minijob) geführt. Die monatliche Vergütung überschreitet die jeweils geltende Geringfügigkeitsgrenze nicht."
        : "Die Beschäftigung ist von vornherein auf einen kurzen Zeitraum befristet (kurzfristige Beschäftigung).";

  const pay =
    i.hourlyCents != null
      ? `Die Vergütung beträgt ${(i.hourlyCents / 100).toFixed(2).replace(".", ",")} EUR brutto je Stunde und wird monatlich abgerechnet. Es gilt mindestens der jeweils geltende gesetzliche Mindestlohn.`
      : "Die Vergütung richtet sich nach der gesondert vereinbarten Stundenvergütung, mindestens jedoch nach dem jeweils geltenden gesetzlichen Mindestlohn. Die Abrechnung erfolgt monatlich.";

  return [
    {
      heading: "§ 1 Tätigkeit und Einsatzort",
      body: `Der/die Beschäftigte wird als Kurierfahrer:in im Liefergeschäft eingesetzt. Einsatzort ist ${i.rider.city}. Die Auslieferung erfolgt mit einem Pedelec (Tretunterstützung bis 25 km/h, Motorleistung bis 250 W).`,
    },
    { heading: "§ 2 Beginn des Arbeitsverhältnisses", body: `Das Arbeitsverhältnis beginnt am ${fmt(i.startDate)}.` },
    { heading: "§ 3 Arbeitszeit", body: `${weekly}\nDie konkrete Lage der Arbeitszeit wird über die im Portal hinterlegte Verfügbarkeit abgestimmt. Es gelten die Vorgaben des Arbeitszeitgesetzes, insbesondere die tägliche Höchstarbeitszeit und die Ruhezeit von 11 Stunden zwischen zwei Arbeitstagen.` },
    { heading: "§ 4 Vergütung", body: pay },
    {
      heading: "§ 5 Aufenthalts- und Arbeitserlaubnis",
      body: "Der/die Beschäftigte versichert, zur Aufnahme dieser Beschäftigung berechtigt zu sein, und legt die erforderlichen Nachweise vor. Änderungen des Aufenthaltstitels oder des Studierendenstatus sind unverzüglich mitzuteilen. Bei Studierenden aus Nicht-EU-Staaten ist die jeweils zulässige Zahl an Arbeitstagen pro Kalenderjahr einzuhalten; hierzu zählen auch Tätigkeiten bei anderen Arbeitgebern.",
    },
    { heading: "§ 6 Arbeitsmittel", body: "Sofern ein Dienst-Pedelec überlassen wird, bleibt es Eigentum des Arbeitgebers und ist pfleglich zu behandeln. Schäden und Mängel sind unverzüglich zu melden. Bei Beendigung des Arbeitsverhältnisses ist das Arbeitsmittel vollständig zurückzugeben." },
    { heading: "§ 7 Urlaub", body: "Es besteht Anspruch auf den gesetzlichen Mindesturlaub nach dem Bundesurlaubsgesetz, anteilig entsprechend der vereinbarten Arbeitszeit." },
    { heading: "§ 8 Arbeitsverhinderung", body: "Eine Arbeitsunfähigkeit ist unverzüglich anzuzeigen. Ein ärztliches Attest ist spätestens am darauffolgenden Arbeitstag vorzulegen." },
    { heading: "§ 9 Kündigung", body: "Es gelten die gesetzlichen Kündigungsfristen. Die Kündigung bedarf der Schriftform." },
    { heading: "§ 10 Datenschutz", body: `Die Verarbeitung personenbezogener Daten erfolgt nach Art. 6 Abs. 1 lit. b und c DSGVO sowie § 26 BDSG. Einzelheiten ergeben sich aus dem Datenschutzhinweis, abrufbar im Portal.` },
    { heading: "§ 11 Schlussbestimmungen", body: "Änderungen und Ergänzungen bedürfen der Textform. Sollte eine Bestimmung unwirksam sein, bleibt der übrige Vertrag wirksam." },
  ];
}

export function buildContractPdf(i: ContractInput): Buffer {
  const lines: PdfLine[] = [];
  const para = (text: string, opts: { size?: number; bold?: boolean; spaceBefore?: number } = {}) => {
    const size = opts.size ?? 10.5;
    const wrapped = wrapText(text, size, CONTENT_WIDTH);
    wrapped.forEach((l, idx) => lines.push({ text: l, size, bold: opts.bold, spaceBefore: idx === 0 ? opts.spaceBefore : 0 }));
  };

  para("Arbeitsvertrag", { size: 17, bold: true });
  para(`${COMPANY.legalName} (nachfolgend „Arbeitgeber“)`, { size: 10, spaceBefore: 10 });
  para("und", { size: 10 });
  para(`${fullName(i.rider)}, geboren am ${fmt(i.rider.dateOfBirth)}, wohnhaft in ${i.rider.city} (nachfolgend „Beschäftigte:r“)`, { size: 10 });
  para(`Beschäftigungsart: ${EMPLOYMENT_LABEL_DE[i.employmentType]}`, { size: 10, spaceBefore: 8 });

  for (const c of clauses(i)) {
    para(c.heading, { size: 11.5, bold: true, spaceBefore: 16 });
    para(c.body, { spaceBefore: 4 });
  }

  para("Zustimmung", { size: 11.5, bold: true, spaceBefore: 22 });
  para(
    "Dieser Vertrag wird im Portal elektronisch bestätigt. Mit der Bestätigung erklärt der/die Beschäftigte, den Vertrag gelesen zu haben und mit seinem Inhalt einverstanden zu sein. Datum, Uhrzeit und Konto der Bestätigung werden protokolliert.",
    { spaceBefore: 4 },
  );
  para(`Erstellt am ${fmt(new Date())} · Fassung ${CONTRACT_VERSION}`, { size: 9, spaceBefore: 18 });
  para("ENTWURF – vor Verwendung durch eine Fachanwältin oder einen Fachanwalt für Arbeitsrecht prüfen lassen.", { size: 9, bold: true, spaceBefore: 6 });

  return renderPdf(lines);
}

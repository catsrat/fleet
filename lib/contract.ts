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
 *
 * The clauses deliberately restate the statutory position rather than trying to improve on it. That is the
 * safest posture for a draft and the easiest thing for a lawyer to work from. Two patterns common in
 * delivery-fleet contracts are left out on purpose:
 *   - a fee charged to the employee for ending the contract early (a Vertragsstrafe in substance, and
 *     unenforceable outright if the amount is not stated), and
 *   - a minimum order-acceptance quota enforced by Abmahnung, which turns continuously collected platform
 *     metrics into disciplinary evidence and runs into § 26 BDSG.
 */

export const CONTRACT_VERSION = 2;

/** The contract is written in German, so it needs German labels rather than the admin UI's English ones. */
const EMPLOYMENT_LABEL_DE: Record<EmploymentType, string> = {
  MINIJOB: "Geringfügige Beschäftigung (Minijob)",
  WERKSTUDENT: "Werkstudentin / Werkstudent",
  SHORT_TERM: "Kurzfristige Beschäftigung",
};

const BLANK = "__________";
const fmt = (d: Date | null | undefined): string => (d ? d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : BLANK);

export interface ContractInput {
  rider: Rider;
  employmentType: EmploymentType;
  startDate: Date | null;
  hourlyCents: number | null;
}

function clauses(i: ContractInput): { heading: string; body: string }[] {
  const weekly =
    i.employmentType === "WERKSTUDENT"
      ? `Die regelmäßige Arbeitszeit beträgt während der Vorlesungszeit höchstens ${WERKSTUDENT_WEEKLY_HOURS} Stunden pro Woche. Außerhalb der Vorlesungszeit kann sie im Rahmen der gesetzlichen Bestimmungen nach vorheriger Absprache erhöht werden.`
      : i.employmentType === "MINIJOB"
        ? "Die Beschäftigung wird als geringfügige Beschäftigung (Minijob) geführt. Die monatliche Vergütung überschreitet die jeweils geltende Geringfügigkeitsgrenze nicht."
        : "Die Beschäftigung ist von vornherein auf einen kurzen Zeitraum befristet (kurzfristige Beschäftigung).";

  const pay =
    i.hourlyCents != null
      ? `Die Vergütung beträgt ${(i.hourlyCents / 100).toFixed(2).replace(".", ",")} EUR brutto je Stunde. Es gilt mindestens der jeweils geltende gesetzliche Mindestlohn; Anpassungen des Mindestlohns bleiben unberührt.`
      : "Die Vergütung richtet sich nach der gesondert vereinbarten Stundenvergütung, mindestens jedoch nach dem jeweils geltenden gesetzlichen Mindestlohn.";

  const equipment =
    i.rider.bikeMode === "FLEET_BIKE"
      ? "Wird ein Dienst-Pedelec oder sonstiges Arbeitsmittel überlassen, bleibt es Eigentum des Arbeitgebers, ist pfleglich zu behandeln und ausschließlich für dienstliche Zwecke zu verwenden. Schäden und Mängel sind unverzüglich zu melden. Bei Beendigung des Arbeitsverhältnisses sind sämtliche Arbeitsmittel vollständig und in ordnungsgemäßem Zustand zurückzugeben."
      : "Die Auslieferung erfolgt mit dem eigenen Pedelec des/der Beschäftigten. Der/die Beschäftigte hält das Fahrrad in verkehrssicherem Zustand und stellt sicher, dass es die Anforderungen an ein Pedelec erfüllt (Tretunterstützung bis 25 km/h, Nenndauerleistung bis 250 W). S-Pedelecs und Kleinkrafträder sind für diese Tätigkeit nicht zugelassen. Vom Arbeitgeber überlassene Arbeitsmittel, insbesondere Lieferausrüstung und Zugangsdaten, bleiben dessen Eigentum und sind bei Beendigung des Arbeitsverhältnisses vollständig zurückzugeben.";

  return [
    {
      heading: "§ 1 Tätigkeit und Einsatzort",
      body: `Der/die Beschäftigte wird als Kurierfahrer:in im Liefergeschäft eingesetzt. Zu den Aufgaben gehören die Annahme und ordnungsgemäße Durchführung der zugewiesenen Lieferaufträge, die sorgfältige und pünktliche Auslieferung von Speisen, Getränken und Waren sowie der sorgfältige Umgang mit den überlassenen Arbeitsmitteln. Regelmäßiger Einsatzort ist ${i.rider.city || BLANK}. Ein Einsatz an einem anderen Standort erfolgt nach vorheriger Absprache.`,
    },
    { heading: "§ 2 Beginn des Arbeitsverhältnisses", body: `Das Arbeitsverhältnis beginnt am ${fmt(i.startDate)}. Es wird auf unbestimmte Zeit geschlossen. Eine Befristung müsste vor Arbeitsantritt schriftlich vereinbart werden (§ 14 Abs. 4 TzBfG).` },
    { heading: "§ 3 Probezeit", body: "Die ersten sechs Monate gelten als Probezeit. Während der Probezeit kann das Arbeitsverhältnis beiderseits mit einer Frist von zwei Wochen gekündigt werden (§ 622 Abs. 3 BGB)." },
    {
      heading: "§ 4 Arbeitszeit",
      body: `${weekly}\nDie konkrete Lage der Arbeitszeit wird über die im Portal hinterlegte Verfügbarkeit abgestimmt. Bestätigte Schichten sind wahrzunehmen; eine Verhinderung ist unverzüglich und nach Möglichkeit vor Schichtbeginn mitzuteilen. Ein Anspruch auf bestimmte Schichten besteht nicht. Arbeit außerhalb der abgestimmten Verfügbarkeit bedarf der vorherigen Zustimmung des Arbeitgebers. Es gelten die Vorgaben des Arbeitszeitgesetzes, insbesondere die tägliche Höchstarbeitszeit, die Ruhepausen und die Ruhezeit von elf Stunden zwischen zwei Arbeitstagen.`,
    },
    { heading: "§ 5 Arbeitszeiterfassung", body: "Die Arbeitszeit wird über das Portal erfasst. Die Erfassung obliegt dem Arbeitgeber; der/die Beschäftigte wirkt daran mit, indem Beginn und Ende der Arbeitszeit vollständig und wahrheitsgemäß festgehalten werden. Unrichtige Angaben können arbeitsrechtliche Konsequenzen haben." },
    { heading: "§ 6 Vergütung", body: `${pay}\nDie Abrechnung und Auszahlung erfolgt monatlich auf das vom/von der Beschäftigten benannte Konto. Über die Lieferplattform oder den Arbeitgeber abgerechnete Trinkgelder werden mit der monatlichen Abrechnung ausgezahlt. Vergütet wird die gesamte Arbeitszeit, einschließlich der Zeiten zwischen den Aufträgen. Überstunden bedürfen der vorherigen Anordnung oder Genehmigung.` },
    { heading: "§ 7 Sozialversicherung und Steuern", body: `Das Arbeitsverhältnis wird als „${EMPLOYMENT_LABEL_DE[i.employmentType]}“ geführt. Die sozialversicherungs- und steuerrechtliche Behandlung richtet sich nach den jeweils geltenden gesetzlichen Bestimmungen. Der Arbeitgeber führt die gesetzlich vorgeschriebenen Beiträge und die Lohnsteuer ab. Der/die Beschäftigte legt die erforderlichen Unterlagen vollständig und rechtzeitig vor und teilt Änderungen der persönlichen oder sozialversicherungsrechtlichen Verhältnisse unverzüglich mit.` },
    {
      heading: "§ 8 Aufenthalts- und Arbeitserlaubnis",
      body: "Der/die Beschäftigte versichert, zur Aufnahme dieser Beschäftigung berechtigt zu sein, und legt die erforderlichen Nachweise vor. Änderungen des Aufenthaltstitels oder des Studierendenstatus sind unverzüglich mitzuteilen. Bei Studierenden aus Nicht-EU-Staaten ist die jeweils zulässige Zahl an Arbeitstagen pro Kalenderjahr einzuhalten; hierzu zählen auch Tätigkeiten bei anderen Arbeitgebern.",
    },
    { heading: "§ 9 Studierendenstatus", body: "Voraussetzung dieser Beschäftigung ist die ordentliche Immatrikulation an einer staatlichen oder staatlich anerkannten Hochschule. Eine gültige Immatrikulationsbescheinigung ist vor Arbeitsbeginn und zu Beginn jedes Semesters unaufgefordert vorzulegen. Exmatrikulation, Studienabbruch, Hochschulwechsel oder Studienabschluss sind unverzüglich mitzuteilen. Entfällt der Status, prüfen die Parteien, ob das Arbeitsverhältnis angepasst oder fortgeführt werden kann." },
    { heading: "§ 10 Arbeitsmittel und Fahrzeug", body: equipment },
    { heading: "§ 11 Nutzung der Lieferplattform", body: "Für die Tätigkeit sind ausschließlich die vom Arbeitgeber vorgegebenen Lieferplattformen zu nutzen. Die Zugangsdaten sind höchstpersönlich und dürfen nicht an Dritte weitergegeben werden; eine Nutzung des Kontos durch andere Personen ist ausgeschlossen. Während der Arbeitszeit ist ein einsatzbereites Mobiltelefon mit ausreichendem Ladestand und Datenverbindung bereitzuhalten. Technische Störungen sind unverzüglich zu melden." },
    { heading: "§ 12 Nebentätigkeit", body: "Eine entgeltliche Nebentätigkeit ist vor Aufnahme anzuzeigen. Der Arbeitgeber kann ihr nur widersprechen, soweit berechtigte betriebliche Interessen entgegenstehen, insbesondere wenn die Arbeitsleistung oder die Einhaltung der gesetzlichen Arbeitszeitgrenzen beeinträchtigt wird. Während der vereinbarten Arbeitszeit ist eine gleichzeitige Tätigkeit für andere Lieferdienste oder Flotten ausgeschlossen." },
    { heading: "§ 13 Verhalten im Dienst", body: "Gegenüber Kundinnen und Kunden, Restaurantpartnern und Kolleginnen und Kollegen ist höflich, respektvoll und professionell aufzutreten. Während der Arbeitszeit sind der Konsum von Alkohol und anderen berauschenden Mitteln sowie das Ausüben der Tätigkeit unter deren Einfluss untersagt. Es gelten die Vorschriften der Straßenverkehrsordnung; Verstöße gehen zulasten des/der Beschäftigten." },
    { heading: "§ 14 Hygiene und Arbeitsschutz", body: "Die gesetzlichen Hygienevorschriften und die betrieblichen Vorgaben für den Transport von Lebensmitteln sind einzuhalten. Lieferungen sind sauber und temperaturgerecht zu transportieren. Die geltenden Arbeitsschutz- und Sicherheitsvorschriften sind zu beachten; Gefährdungen sind unverzüglich zu melden." },
    { heading: "§ 15 Unfall- und Schadensmeldung", body: "Unfälle, Sach- und Personenschäden sowie sonstige außergewöhnliche Ereignisse während der Arbeitszeit sind dem Arbeitgeber unverzüglich zu melden; soweit erforderlich ist die Polizei zu verständigen. Der/die Beschäftigte unterstützt die Aufklärung des Sachverhalts. Für die Haftung gelten die Grundsätze des innerbetrieblichen Schadensausgleichs." },
    { heading: "§ 16 Urlaub", body: "Es besteht Anspruch auf den gesetzlichen Mindesturlaub nach dem Bundesurlaubsgesetz, bei einer Fünf-Tage-Woche mithin 20 Arbeitstage im Kalenderjahr, anteilig entsprechend der vereinbarten Arbeitszeit und bei unterjährigem Beginn oder Ende des Arbeitsverhältnisses. Urlaub ist rechtzeitig zu beantragen und vor Antritt zu genehmigen." },
    { heading: "§ 17 Arbeitsunfähigkeit", body: "Eine Arbeitsunfähigkeit ist unverzüglich, möglichst vor Beginn der geplanten Schicht, anzuzeigen. Eine ärztliche Arbeitsunfähigkeitsbescheinigung ist spätestens am dritten Kalendertag vorzulegen; der Arbeitgeber kann sie bereits ab dem ersten Tag verlangen. Über die voraussichtliche Dauer und jede Verlängerung ist unverzüglich zu informieren." },
    { heading: "§ 18 Weisungsrecht", body: "Der Arbeitgeber bestimmt im Rahmen des billigen Ermessens (§ 106 GewO) Inhalt, Ort und Zeit der Arbeitsleistung, insbesondere die Einteilung der Arbeitszeit innerhalb der abgestimmten Verfügbarkeit, den Einsatzort und die Arbeitsorganisation." },
    { heading: "§ 19 Verschwiegenheit", body: "Über betriebliche Angelegenheiten, Geschäfts- und Betriebsgeheimnisse sowie personenbezogene Daten von Kundinnen und Kunden, Restaurantpartnern und Beschäftigten ist Stillschweigen zu bewahren. Die Verpflichtung gilt nach Beendigung des Arbeitsverhältnisses fort, soweit gesetzlich zulässig." },
    { heading: "§ 20 Kündigung", body: "Nach Ablauf der Probezeit gelten die gesetzlichen Kündigungsfristen nach § 622 BGB. Die Kündigung bedarf der Schriftform; die elektronische Form ist ausgeschlossen (§ 623 BGB). Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt. Will der/die Beschäftigte geltend machen, dass eine Kündigung unwirksam ist, muss innerhalb von drei Wochen nach Zugang der schriftlichen Kündigung Klage beim Arbeitsgericht erhoben werden (§ 4 KSchG)." },
    { heading: "§ 21 Rückgabe", body: "Spätestens am letzten Arbeitstag sind sämtliche Arbeitsmittel, Lieferausrüstung, Schlüssel, Zugangsdaten und sonstiges Eigentum des Arbeitgebers vollständig und in ordnungsgemäßem Zustand zurückzugeben." },
    { heading: "§ 22 Datenschutz", body: "Die Verarbeitung personenbezogener Daten erfolgt nach Art. 6 Abs. 1 lit. b und c DSGVO sowie § 26 BDSG, soweit dies für die Durchführung des Arbeitsverhältnisses oder zur Erfüllung gesetzlicher Pflichten erforderlich ist. Eine darüber hinausgehende Verhaltens- oder Leistungskontrolle, insbesondere eine dauerhafte Standortüberwachung, findet nicht statt. Einzelheiten ergeben sich aus dem Datenschutzhinweis, abrufbar im Portal." },
    { heading: "§ 23 Schlussbestimmungen", body: "Änderungen und Ergänzungen bedürfen der Textform. Sollte eine Bestimmung unwirksam sein, bleibt der übrige Vertrag wirksam. Es gilt das Recht der Bundesrepublik Deutschland." },
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
  para(`${COMPANY.employer.legalName || BLANK} (nachfolgend „Arbeitgeber“)`, { size: 10, spaceBefore: 10 });
  // § 2 Nachweisgesetz requires the employer's address, so print a visible gap rather than silently omitting it.
  for (const line of COMPANY.employer.addressLines.length ? COMPANY.employer.addressLines : [BLANK]) {
    para(line, { size: 10 });
  }
  para("und", { size: 10, spaceBefore: 6 });
  para(`${fullName(i.rider)}, geboren am ${fmt(i.rider.dateOfBirth)}, wohnhaft in ${i.rider.city || BLANK} (nachfolgend „Beschäftigte:r“)`, { size: 10 });
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

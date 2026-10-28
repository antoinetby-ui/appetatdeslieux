import nodemailer from 'nodemailer';

// Envoi par SMTP (Gmail, Outlook, OVH, Brevo…). Variables :
// SMTP_HOST, SMTP_PORT (587 par défaut), SMTP_USER, SMTP_PASS, MAIL_FROM (facultatif).
const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;

export const mailConfigure = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transport;

const dateFr = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export async function envoyerEdl({ edl, destinataires, pdf, nomFichier }) {
  transport ??= nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  const type = edl.type === 'sortie' ? 'de sortie' : "d'entrée";
  const signe = edl.sig_bailleur && edl.sig_locataire;
  const adresse = [edl.bien.adresse, [edl.bien.code_postal, edl.bien.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  await transport.sendMail({
    from: MAIL_FROM,
    to: destinataires,
    subject: `État des lieux ${type}${signe ? ' signé' : ''} — ${edl.bien.nom} — ${dateFr(edl.date)}`,
    text: [
      'Bonjour,',
      '',
      `Veuillez trouver ci-joint l'état des lieux ${type}${signe ? ', signé par les deux parties,' : ''} du logement`,
      `« ${edl.bien.nom} »${adresse ? ` (${adresse})` : ''}, établi le ${dateFr(edl.date)}.`,
      '',
      'Nous vous conseillons de conserver ce document.',
      '',
      'Cordialement,',
    ].join('\n'),
    attachments: [{ filename: nomFichier, content: pdf, contentType: 'application/pdf' }],
  });
}

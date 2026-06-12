/** Transactional emails (SPEC §13) — Spanish, simple layout. */

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;border-top:4px solid #4f46e5;padding:32px;">
        <tr><td style="font-size:20px;font-weight:bold;color:#18181b;padding-bottom:16px;">
          Trainer <span style="color:#4f46e5;">Arena</span>
        </td></tr>
        <tr><td style="font-size:17px;font-weight:bold;color:#18181b;padding-bottom:12px;">${title}</td></tr>
        <tr><td style="font-size:14px;color:#3f3f46;line-height:1.6;">${body}</td></tr>
        <tr><td style="font-size:12px;color:#a1a1aa;padding-top:24px;">
          Este es un mensaje automático, no respondas a este correo.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${url}" style="background:#4f46e5;color:#ffffff;text-decoration:none;
       padding:12px 24px;border-radius:6px;display:inline-block;font-weight:bold;">${label}</a>
  </p>
  <p style="font-size:12px;color:#71717a;">Si el botón no funciona, copia y pega esta URL en tu navegador:<br>${url}</p>`;
}

/** 1. Account verification. */
export function verificationEmail(to: string, name: string, url: string): MailMessage {
  return {
    to,
    subject: 'Verifica tu dirección de email',
    html: layout(
      'Verifica tu dirección de email',
      `<p>Hola ${name}:</p>
       <p>Gracias por registrarte en Trainer Arena. Pulsa el botón para verificar tu dirección de email.
       El enlace caduca en 60 minutos.</p>
       ${button(url, 'Verificar email')}
       <p>Si no creaste esta cuenta, puedes ignorar este mensaje.</p>`
    ),
  };
}

/** 2. Password recovery (60 min link). */
export function passwordResetEmail(to: string, name: string, url: string): MailMessage {
  return {
    to,
    subject: 'Recuperación de contraseña',
    html: layout(
      'Recuperación de contraseña',
      `<p>Hola ${name}:</p>
       <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.
       El enlace caduca en 60 minutos.</p>
       ${button(url, 'Restablecer contraseña')}
       <p>Si no solicitaste el cambio, ignora este mensaje; tu contraseña no se modificará.</p>`
    ),
  };
}

/** 3. Registration confirmed (free flow). */
export function registrationConfirmedEmail(
  to: string,
  fullName: string,
  tournamentName: string,
  startAt: Date,
  tournamentUrl: string
): MailMessage {
  const fecha = startAt.toLocaleString('es-ES', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  });
  return {
    to,
    subject: `Inscripción confirmada — ${tournamentName}`,
    html: layout(
      'Inscripción confirmada',
      `<p>Hola ${fullName}:</p>
       <p>Tu inscripción en <strong>${tournamentName}</strong> está confirmada.</p>
       <p>Comienzo: <strong>${fecha}</strong>.</p>
       <p>Recuerda enviar tu decklist antes de que empiece la primera ronda.</p>
       ${button(tournamentUrl, 'Ver torneo')}`
    ),
  };
}

/** 3b. Paid tournament: request received, seat reserved pending manual confirmation. */
export function registrationPendingEmail(
  to: string,
  fullName: string,
  tournamentName: string,
  feeCents: number,
  currency: string,
  paymentInstructions: string | null,
  tournamentUrl: string
): MailMessage {
  return {
    to,
    subject: `Solicitud recibida — ${tournamentName}`,
    html: layout(
      'Solicitud recibida: pendiente de confirmación',
      `<p>Hola ${fullName}:</p>
       <p>Tu plaza en <strong>${tournamentName}</strong> está reservada, pendiente de que el
       organizador confirme tu pago de <strong>${formatAmount(feeCents, currency)}</strong>.</p>
       ${
         paymentInstructions
           ? `<p style="background:#f4f4f5;border-radius:8px;padding:12px 16px;"><strong>Cómo pagar:</strong><br>${paymentInstructions}</p>`
           : ''
       }
       <p>Recibirás otro email cuando el organizador confirme tu inscripción.</p>
       ${button(tournamentUrl, 'Ver torneo')}`
    ),
  };
}

/** 3c. Paid tournament: request rejected by the organizer (seat freed). */
export function registrationRejectedEmail(
  to: string,
  fullName: string,
  tournamentName: string,
  tournamentUrl: string
): MailMessage {
  return {
    to,
    subject: `Inscripción no confirmada — ${tournamentName}`,
    html: layout(
      'Inscripción no confirmada',
      `<p>Hola ${fullName}:</p>
       <p>El organizador de <strong>${tournamentName}</strong> no ha confirmado tu inscripción
       y tu reserva de plaza se ha liberado. Si crees que es un error (por ejemplo, si ya
       realizaste el pago), responde al organizador o vuelve a inscribirte.</p>
       ${button(tournamentUrl, 'Ver torneo')}`
    ),
  };
}

/** Cents → "1.234,56 EUR" (es-ES). */
export function formatAmount(cents: number, currency: string): string {
  const formatted = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${formatted} ${currency}`;
}

/** 4. Payment confirmed (webhook completed). */
export function paymentConfirmedEmail(
  to: string,
  fullName: string,
  tournamentName: string,
  amountCents: number,
  currency: string,
  tournamentUrl: string
): MailMessage {
  return {
    to,
    subject: `Pago confirmado — ${tournamentName}`,
    html: layout(
      'Pago confirmado',
      `<p>Hola ${fullName}:</p>
       <p>Hemos recibido tu pago de <strong>${formatAmount(amountCents, currency)}</strong>
       y tu inscripción en <strong>${tournamentName}</strong> está confirmada.</p>
       ${button(tournamentUrl, 'Ver torneo')}`
    ),
  };
}

import { Resend } from 'resend';
import { getEnv, requireEnv } from './config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function sendOtpEmail(params: { to: string; code: string }): Promise<void> {
  const provider = (getEnv('OTP_EMAIL_PROVIDER') ?? 'resend').toLowerCase();

  if (provider === 'console') {
    // Local/dev convenience: print code to server console instead of sending an email.
    // Never use this in production.
    console.log(`[OTP][console] to=${params.to} code=${params.code}`);
    return;
  }

  if (provider === 'resend') {
    const apiKey = requireEnv('RESEND_API_KEY');
    const from = requireEnv('FROM_EMAIL');
    const resend = new Resend(apiKey);

    const subject = 'Cartiva - Giriş Doğrulama Kodu';

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const logoPath = path.join(__dirname, 'cartiva-small.png');

    const inlineLogoContentId = 'cartiva-logo';
    let logoHtml = `
              <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                <span style="font-size: 36px; font-weight: 700; color: #ffffff; line-height: 80px;">C</span>
              </div>
    `.trim();

    let attachments: Array<{
      content?: string | Buffer;
      filename?: string | false | undefined;
      path?: string;
      contentType?: string;
      inlineContentId?: string;
    }> | undefined;

    try {
      const logoBuffer = await readFile(logoPath);
      attachments = [
        {
          filename: 'cartiva.png',
          contentType: 'image/png',
          inlineContentId: inlineLogoContentId,
          content: logoBuffer,
        },
      ];

      logoHtml = `
              <img src="cid:${inlineLogoContentId}" alt="Cartiva" width="80" height="80" style="border-radius: 50%; display: block;" />
      `.trim();
    } catch {
      // Fall back to the placeholder logo if the file isn't available.
    }
    
    const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 400px; background-color: #1e293b; border-radius: 16px; overflow: hidden;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding: 32px 24px 16px;">
              ${logoHtml}
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td align="center" style="padding: 0 24px 24px;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: #ffffff;">Giriş Doğrulama</h1>
            </td>
          </tr>
          <!-- Code Box -->
          <tr>
            <td align="center" style="padding: 0 24px 24px;">
              <div style="background-color: #334155; border-radius: 12px; padding: 20px 32px; display: inline-block;">
                <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #3b82f6;">${params.code}</span>
              </div>
            </td>
          </tr>
          <!-- Message -->
          <tr>
            <td align="center" style="padding: 0 24px 32px;">
              <p style="margin: 0 0 12px; font-size: 14px; color: #94a3b8; line-height: 1.5;">
                Bu kod <strong style="color: #ffffff;">10 dakika</strong> içinde geçerliliğini yitirecektir.
              </p>
              <p style="margin: 0; font-size: 13px; color: #64748b;">
                Bu kodu kimseyle paylaşmayın.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 16px 24px; background-color: #0f172a; border-top: 1px solid #334155;">
              <p style="margin: 0; font-size: 11px; color: #475569;">
                Bu e-posta Cartiva tarafından gönderilmiştir.<br/>
                © ${new Date().getFullYear()} nelit.com.tr
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const text = `Cartiva Giriş Kodu: ${params.code}\n\nBu kod 10 dakika içinde geçerliliğini yitirecektir.\n\nBu kodu kimseyle paylaşmayın.`;

    const result = await resend.emails.send({
      from,
      to: params.to,
      subject,
      html,
      text,
      ...(attachments ? { attachments } : {}),
    });

    console.log(`[OTP][resend] to=${params.to} id=${(result as any)?.data?.id ?? (result as any)?.id ?? 'unknown'}`);
    return;
  }

  throw new Error(`Unsupported OTP_EMAIL_PROVIDER: ${provider}`);
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 1) return '***';
  const name = email.slice(0, at);
  const domain = email.slice(at + 1);
  const maskedName = `${name[0]}***${name[name.length - 1] ?? ''}`;
  const parts = domain.split('.');
  const maskedDomain = parts.length >= 2 ? `${parts[0]?.[0] ?? '*'}***.${parts.slice(1).join('.')}` : `${domain[0] ?? '*'}***`;
  return `${maskedName}@${maskedDomain}`;
}

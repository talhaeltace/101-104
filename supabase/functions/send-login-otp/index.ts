// @ts-nocheck
// Supabase Edge Function: send-login-otp
// - Validates username/password via authenticate_app_user RPC
// - Creates an OTP challenge in DB
// - Sends the code to the user's email
//
// NOTE:
// This runs in the Supabase Edge Functions (Deno) runtime.
// VS Code's default TypeScript server may show errors for `Deno` globals and
// remote URL imports (e.g. https://esm.sh/...). Those are expected in Deno.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Body = {
  username: string;
  password: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });
}

function empty(status = 204) {
  return new Response(null, {
    status,
    headers: {
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });
}

function maskEmail(email: string) {
  const at = email.indexOf('@');
  if (at <= 1) return '***';
  const name = email.slice(0, at);
  const domain = email.slice(at + 1);
  const maskedName = `${name[0]}***${name[name.length - 1] ?? ''}`;
  const domainParts = domain.split('.');
  const maskedDomain = domainParts.length >= 2
    ? `${domainParts[0]?.[0] ?? '*'}***.${domainParts.slice(1).join('.')}`
    : `${domain[0] ?? '*'}***`;
  return `${maskedName}@${maskedDomain}`;
}

function randomOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendViaResend(to: string, code: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('FROM_EMAIL');
  if (!apiKey || !from) {
    throw new Error('Email provider is not configured. Set RESEND_API_KEY and FROM_EMAIL in Edge Function env.');
  }

  const subject = 'MapFlow giriş kodu';
  const text = `MapFlow giriş kodunuz: ${code}\n\nBu kod kısa süre içinde sona erer.\n\nBu kodu kimseyle paylaşmayın.`;
  const html = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>MapFlow giriş kodu</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e9ebf2;">
            <tr>
              <td style="padding:22px 22px 10px 22px;text-align:center;">
                <div style="font-size:18px;font-weight:700;color:#111827;">MapFlow giriş kodu</div>
                <div style="margin-top:6px;font-size:13px;color:#6b7280;">Hesabınıza giriş yapmak için aşağıdaki kodu kullanın.</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px 8px 22px;">
                <div style="text-align:center;font-size:34px;letter-spacing:6px;font-weight:800;color:#111827;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:14px 12px;">
                  ${code}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 22px 22px 22px;text-align:center;">
                <div style="font-size:12px;color:#6b7280;line-height:1.5;">
                  Bu kod kısa süre içinde sona erer.<br />
                  Bu kodu kimseyle paylaşmayın.
                </div>
              </td>
            </tr>
          </table>
          <div style="max-width:520px;margin-top:12px;font-size:11px;color:#9ca3af;text-align:center;">
            Bu e-postayı siz istemediyseniz görmezden gelebilirsiniz.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      html,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Failed to send email (resend): ${resp.status} ${errText}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return empty(204);
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const username = String(body?.username ?? '').trim();
  const password = String(body?.password ?? '');
  if (!username || !password) return json(400, { error: 'username and password are required' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });

  const admin = createClient(url, serviceKey);

  // Validate credentials
  const { data: userData, error: authError } = await admin.rpc('authenticate_app_user', {
    p_username: username,
    p_password: password,
  });

  if (authError) {
    console.error('authenticate_app_user failed', { authError });
    return json(401, { error: 'Giriş başarısız' });
  }

  const user = Array.isArray(userData) ? userData[0] : userData;
  if (!user?.id) return json(401, { error: 'Kullanıcı adı veya parola hatalı' });

  // If OTP is not required for this user, allow direct login.
  // We intentionally return the same user payload as authenticate_app_user.
  if (user.otp_required === false) {
    return json(200, {
      bypassOtp: true,
      user,
    });
  }

  const email: string | null = user.email ?? null;
  if (!email || String(email).trim() === '') {
    return json(400, { error: 'Bu kullanıcı için e-posta tanımlı değil. Yönetici panelinden e-posta ekleyin.' });
  }

  const code = randomOtpCode();

  // Create challenge
  const { data: challengeId, error: chError } = await admin.rpc('create_login_otp_challenge', {
    p_user_id: user.id,
    p_email: email,
    p_code: code,
    p_ttl_seconds: 600,
  });

  if (chError || !challengeId) {
    console.error('create_login_otp_challenge failed', {
      chError,
      challengeId,
      userId: user?.id,
      email,
    });

    const msg = String((chError as any)?.message ?? '');
    const msgLower = msg.toLowerCase();

    if (msgLower.includes('permission denied') || msgLower.includes('not allowed') || msgLower.includes('insufficient')) {
      return json(500, {
        error:
          'OTP oluşturulamadı: yetki hatası. Edge Function Secrets içinde SUPABASE_SERVICE_ROLE_KEY doğru mu kontrol edin (anon key değil, service_role key olmalı).',
      });
    }

    if (msg.includes('function') && msg.includes('does not exist')) {
      return json(500, {
        error:
          'OTP oluşturulamadı: RPC bulunamadı (veya imza uyuşmuyor / şema cache). SQL Editor\'da create_login_otp_challenge fonksiyonunun PUBLIC şemasında ve parametre adlarının p_user_id, p_email, p_code, p_ttl_seconds olduğunu doğrulayın. Yeni oluşturduysanız 1-2 dk bekleyin veya projeyi restart edin.',
      });
    }

    return json(500, { error: 'OTP oluşturulamadı' });
  }

  try {
    await sendViaResend(email, code);
  } catch (e) {
    return json(500, { error: (e as Error)?.message ?? 'E-posta gönderilemedi' });
  }

  return json(200, {
    challengeId,
    emailMasked: maskEmail(email),
    ttlSeconds: 600,
  });
});

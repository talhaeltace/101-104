import React, { useEffect, useMemo, useState } from 'react';
import type { AuthUser } from '../lib/authUser';
import { requestOtp, verifyOtp, registerUser } from '../lib/apiAuth';
import { setAuthToken } from '../lib/apiClient';
import { User, Lock, Loader2, Mail, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import OtpCodeInput from './auth/OtpCodeInput';

interface Props {
  onSuccess: (user: AuthUser, token: string) => void;
  onCancel: () => void;
}

const LoginForm: React.FC<Props> = ({ onSuccess, onCancel }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginStep, setLoginStep] = useState<'credentials' | 'otp'>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [otpEmailMasked, setOtpEmailMasked] = useState<string | null>(null);
  const [otpCooldownUntil, setOtpCooldownUntil] = useState<number>(0);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const otpSecondsLeft = useMemo(() => {
    const ms = otpCooldownUntil - Date.now();
    return Math.max(0, Math.ceil(ms / 1000));
  }, [otpCooldownUntil]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('last_username_v1');
      if (saved && !username) setUsername(saved);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getInvokeErrorMessage = async (invokeError: unknown) => {
    const e: any = invokeError;
    const ctx = e?.context;

    const response: Response | null =
      typeof Response !== 'undefined' && ctx instanceof Response
        ? ctx
        : typeof Response !== 'undefined' && ctx?.response instanceof Response
          ? ctx.response
          : null;

    if (response) {
      try {
        const cloned = response.clone();
        const text = await cloned.text();
        if (text) {
          try {
            const parsed = JSON.parse(text);
            const serverMsg = parsed?.error ?? parsed?.message;
            if (typeof serverMsg === 'string' && serverMsg.trim()) {
              return `${serverMsg} (HTTP ${response.status})`;
            }
            return `Sunucu hatası (HTTP ${response.status})`;
          } catch {
            return `${text} (HTTP ${response.status})`;
          }
        }
        return `Sunucu hatası (HTTP ${response.status})`;
      } catch {
        // ignore
      }
    }

    const ctxError =
      ctx?.error ??
      ctx?.message ??
      ctx?.body?.error ??
      ctx?.body?.message ??
      ctx?.data?.error ??
      ctx?.data?.message;

    if (typeof ctxError === 'string' && ctxError.trim()) return ctxError;
    if (typeof ctx === 'string' && ctx.trim()) return ctx;
    if (typeof e?.message === 'string' && e.message.trim()) return e.message;
    return 'Giriş başarısız';
  };

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setOtpCode('');
    setOtpChallengeId(null);
    setOtpEmailMasked(null);
    setOtpCooldownUntil(0);
    setLoginStep('credentials');
    setConfirmPassword('');
    setFullName('');
    setEmail('');
    setError(null);
    setSuccess(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      try { localStorage.setItem('last_username_v1', username); } catch { /* ignore */ }
      const data = await requestOtp({ username, password });

      // Some users are allowed to login without OTP (admin-controlled).
      if (data?.bypassOtp && data?.user && data?.token) {
        setAuthToken(String(data.token));
        onSuccess(data.user, String(data.token));
        return;
      }

      if (!data?.challengeId) {
        setError('Doğrulama kodu gönderilemedi');
        setLoading(false);
        return;
      }

      setOtpChallengeId(String(data.challengeId));
      setOtpEmailMasked(data.emailMasked ? String(data.emailMasked) : null);
      setOtpCode('');
      setLoginStep('otp');
      // basic cooldown to reduce accidental re-sends
      setOtpCooldownUntil(Date.now() + 30_000);
    } catch (err: any) {
      setError(await getInvokeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!otpChallengeId) {
        setError('Doğrulama oturumu bulunamadı. Lütfen tekrar giriş yapın.');
        setLoading(false);
        return;
      }

      const code = otpCode.trim();
      if (!/^\d{6}$/.test(code)) {
        setError('Kod 6 haneli olmalıdır');
        setLoading(false);
        return;
      }

      const res = await verifyOtp({ challengeId: otpChallengeId, code });
      if (!res?.token || !res?.user) {
        setError('Kod hatalı veya süresi doldu');
        setLoading(false);
        return;
      }
      onSuccess(res.user, String(res.token));
    } catch (err: any) {
      setError(await getInvokeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (loading) return;
    if (Date.now() < otpCooldownUntil) return;
    setError(null);
    setLoading(true);
    try {
      const data = await requestOtp({ username, password });
      if (data?.challengeId) setOtpChallengeId(String(data.challengeId));
      if (data?.emailMasked) setOtpEmailMasked(String(data.emailMasked));
      setOtpCooldownUntil(Date.now() + 30_000);
      setSuccess('Kod tekrar gönderildi');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err: any) {
      setError(await getInvokeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (password !== confirmPassword) {
      setError('Parolalar eşleşmiyor');
      return;
    }
    if (password.length < 6) {
      setError('Parola en az 6 karakter olmalıdır');
      return;
    }
    if (username.length < 3) {
      setError('Kullanıcı adı en az 3 karakter olmalıdır');
      return;
    }

    setLoading(true);
    try {
      await registerUser({ username, password, fullName, email });

      setSuccess('Kayıt başarılı! Şimdi giriş yapabilirsiniz.');
      setTimeout(() => {
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setFullName('');
        setEmail('');
        setSuccess(null);
      }, 2000);
    } catch (err: any) {
      const msg = String(await getInvokeErrorMessage(err));
      if (msg.toLowerCase().includes('zaten') || msg.toLowerCase().includes('kullanılıyor') || msg.toLowerCase().includes('unique')) {
        setError('Bu kullanıcı adı zaten kullanılıyor');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* App Logo */}
      <div className="mb-6 flex justify-center">
        <img
          src="/cartiva.png"
          alt="Cartiva"
          className="h-24 w-24 rounded-full object-cover shadow-lg shadow-black/30"
        />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex overflow-hidden rounded-xl bg-gray-100 border border-gray-200">
          <button
            type="button"
            onClick={() => {
              resetForm();
              setMode('login');
            }}
            className={
              mode === 'login'
                ? 'flex-1 py-2.5 text-sm font-semibold text-gray-800 bg-white shadow-sm'
                : 'flex-1 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition'
            }
          >
            Giriş
          </button>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setMode('register');
            }}
            className={
              mode === 'register'
                ? 'flex-1 py-2.5 text-sm font-semibold text-gray-800 bg-white shadow-sm'
                : 'flex-1 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition'
            }
          >
            Kayıt
          </button>
        </div>

        {mode === 'login' ? (
          <>


            {loginStep === 'credentials' ? (
              <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kullanıcı Adı</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    className="block w-full rounded-xl bg-gray-50 border border-gray-200 px-10 py-3 text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="kullanıcı adı"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Parola</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="block w-full rounded-xl bg-gray-50 border border-gray-200 px-10 py-3 pr-12 text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="parola"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Giriş yapılıyor...
                  </>
                ) : (
                  'Giriş Yap'
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  try { onCancel(); } catch { /* ignore */ }
                }}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-[0.98]"
              >
                Vazgeç
              </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-600">
                  {otpEmailMasked
                    ? `Kod ${otpEmailMasked} adresine gönderildi.`
                    : 'Kod e-posta adresinize gönderildi.'}
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-600">Doğrulama Kodu</label>
                  <OtpCodeInput value={otpCode} onChange={setOtpCode} disabled={loading} />
                </div>

                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-600">
                    {success}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Doğrulanıyor...
                    </>
                  ) : (
                    'Doğrula'
                  )}
                </button>

                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSuccess(null);
                      setOtpCode('');
                      setOtpChallengeId(null);
                      setLoginStep('credentials');
                    }}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Geri
                  </button>

                  <button
                    type="button"
                    disabled={loading || Date.now() < otpCooldownUntil}
                    onClick={handleResendOtp}
                    className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40"
                  >
                    {otpSecondsLeft > 0 ? `${otpSecondsLeft}s` : 'Tekrar gönder'}
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <>


            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ad Soyad</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="block w-full rounded-xl bg-gray-50 border border-gray-200 px-10 py-3 text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="ad soyad"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">E-posta</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="email"
                    className="block w-full rounded-xl bg-gray-50 border border-gray-200 px-10 py-3 text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="e-posta"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kullanıcı Adı</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    className="block w-full rounded-xl bg-gray-50 border border-gray-200 px-10 py-3 text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="kullanıcı adı"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Parola</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="block w-full rounded-xl bg-gray-50 border border-gray-200 px-10 py-3 text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="parola"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Parola Tekrar</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="block w-full rounded-xl bg-gray-50 border border-gray-200 px-10 py-3 text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="parola tekrar"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-600">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Kayıt yapılıyor...
                  </>
                ) : (
                  'Kayıt Ol'
                )}
              </button>

              <p className="mt-4 text-center text-xs text-gray-500">
                Kayıt sonrası yetkiler yönetici onayı gerektirir.
              </p>
            </form>
          </>
        )}
    </div>
  );
};

export default LoginForm;

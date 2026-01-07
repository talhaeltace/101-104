import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AuthUser } from '../lib/authUser';
import { User, Lock, LogIn, Loader2, UserPlus, Mail, ArrowLeft } from 'lucide-react';

interface Props {
  onSuccess: (user: AuthUser) => void;
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
      // Step 1: validate credentials + send OTP email via Edge Function
      const { data, error } = await supabase.functions.invoke('send-login-otp', {
        body: { username, password },
      });

      if (error) {
        setError(await getInvokeErrorMessage(error));
        setLoading(false);
        return;
      }

      // Some users are allowed to login without OTP (admin-controlled).
      if (data?.bypassOtp) {
        const directUser = (data as any)?.user;
        if (!directUser) {
          setError('Giriş tamamlanamadı');
          setLoading(false);
          return;
        }
        onSuccess(directUser);
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
      setError(err?.message ?? 'Bilinmeyen hata');
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

      const { data, error } = await supabase.rpc('verify_login_otp', {
        p_challenge_id: otpChallengeId,
        p_code: code,
      });

      if (error) {
        setError(error.message || 'Kod doğrulanamadı');
        setLoading(false);
        return;
      }

      const user = Array.isArray(data) ? data[0] : data;
      if (!user) {
        setError('Kod hatalı veya süresi doldu');
        setLoading(false);
        return;
      }

      onSuccess(user);
    } catch (err: any) {
      setError(err?.message ?? 'Bilinmeyen hata');
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
      const { data, error } = await supabase.functions.invoke('send-login-otp', {
        body: { username, password },
      });
      if (error) {
        setError((await getInvokeErrorMessage(error)) || 'Kod gönderilemedi');
        return;
      }
      if (data?.challengeId) setOtpChallengeId(String(data.challengeId));
      if (data?.emailMasked) setOtpEmailMasked(String(data.emailMasked));
      setOtpCooldownUntil(Date.now() + 30_000);
      setSuccess('Kod tekrar gönderildi');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err: any) {
      setError(err?.message ?? 'Bilinmeyen hata');
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
      const { data, error } = await supabase.rpc('register_app_user', { 
        p_username: username, 
        p_password: password,
        p_full_name: fullName,
        p_email: email
      });
      
      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          setError('Bu kullanıcı adı zaten kullanılıyor');
        } else {
          setError(error.message || 'Kayıt başarısız');
        }
        setLoading(false);
        return;
      }

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
      setError(err?.message ?? 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
      <div className="p-8">
        {mode === 'login' ? (
          <>
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-gray-800">Hoş Geldiniz</h3>
              <p className="text-gray-500 mt-2">Devam etmek için giriş yapın</p>
            </div>

            {loginStep === 'credentials' ? (
              <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="Kullanıcı adınızı girin"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parola</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                    Giriş yapılıyor...
                  </>
                ) : (
                  <>
                    <LogIn className="-ml-1 mr-2 h-5 w-5" />
                    Giriş Yap
                  </>
                )}
              </button>

              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  Hesabınız yok mu?{' '}
                  <button
                    onClick={() => { resetForm(); setMode('register'); }}
                    className="font-medium text-blue-600 hover:text-blue-500"
                  >
                    Kayıt Ol
                  </button>
                </p>
              </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <p className="text-sm text-blue-700">
                    {otpEmailMasked
                      ? `Doğrulama kodu ${otpEmailMasked} adresine gönderildi.`
                      : 'Doğrulama kodu e-posta adresinize gönderildi.'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-posta Kodu</label>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="6 haneli kod"
                    maxLength={6}
                    required
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
                    <p className="text-sm text-green-700">{success}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                      Doğrulanıyor...
                    </>
                  ) : (
                    <>Doğrula</>
                  )}
                </button>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSuccess(null);
                      setOtpCode('');
                      setOtpChallengeId(null);
                      setLoginStep('credentials');
                    }}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Geri
                  </button>

                  <button
                    type="button"
                    disabled={loading || Date.now() < otpCooldownUntil}
                    onClick={handleResendOtp}
                    className="text-sm font-medium text-blue-600 hover:text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Tekrar kod gönder
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-gray-800">Kayıt Ol</h3>
              <p className="text-gray-500 mt-2">Yeni hesap oluşturun</p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ad Soyad</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="Adınız Soyadınız"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="ornek@email.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="kullanici_adi"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parola</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parola Tekrar</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {success && (
                <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
                  <p className="text-sm text-green-700">{success}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                    Kayıt yapılıyor...
                  </>
                ) : (
                  <>
                    <UserPlus className="-ml-1 mr-2 h-5 w-5" />
                    Kayıt Ol
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => { resetForm(); setMode('login'); }}
                className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-800"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Giriş sayfasına dön
              </button>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700 text-center">
                📋 Kayıt olduğunuzda hesabınız <strong>herhangi bir yetki olmadan</strong> oluşturulur. 
                Görüntüleme ve diğer tüm yetkiler için yönetici ile iletişime geçin.
              </p>
            </div>
          </>
        )}
      </div>
      <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 text-center">
        <p className="text-xs text-gray-500">
          &copy; {new Date().getFullYear()} Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  );
};

export default LoginForm;

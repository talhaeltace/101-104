import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Lock, LogIn, Loader2 } from 'lucide-react';

interface Props {
  onSuccess: (user: { id: string; username: string; role: string }) => void;
  onCancel: () => void;
}

const LoginForm: React.FC<Props> = ({ onSuccess, onCancel }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('authenticate_app_user', { p_username: username, p_password: password });
      if (error) {
        setError(error.message || 'Giriş başarısız');
        setLoading(false);
        return;
      }
      // rpc returns array or single row
      const user = Array.isArray(data) ? data[0] : data;
      if (!user) {
        setError('Kullanıcı adı veya parola hatalı');
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

  return (
    <div className="w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
      <div className="p-8">
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold text-gray-800">Hoş Geldiniz</h3>
          <p className="text-gray-500 mt-2">Devam etmek için giriş yapın</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
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
        </form>
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

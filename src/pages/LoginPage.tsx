import React from 'react';
import { useNavigate } from 'react-router-dom';
import LoginForm from '../components/LoginForm';
import { MapPin } from 'lucide-react';

interface Props {
  onLogin: (user: { id: string; username: string; role: string }) => void;
}

const LoginPage: React.FC<Props> = ({ onLogin }) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md mb-8 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-600 mb-6 ring-4 ring-blue-100">
          <MapPin className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">MapFlow</h1>
        <p className="text-gray-600 mt-2 text-lg">Saha Operasyon Yönetimi</p>
      </div>
      
      <div className="w-full max-w-md">
        <LoginForm
          onSuccess={(user) => {
            onLogin(user);
            navigate('/');
          }}
          onCancel={() => {
            // stay on login page
          }}
        />
      </div>
    </div>
  );
};

export default LoginPage;

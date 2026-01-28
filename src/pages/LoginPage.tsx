import React from 'react';
import { useNavigate } from 'react-router-dom';
import LoginForm from '../components/LoginForm';
import type { AuthUser } from '../lib/authUser';
import AuthLayout from '../components/auth/AuthLayout';

interface Props {
  onLogin: (user: AuthUser, token: string) => void;
}

const LoginPage: React.FC<Props> = ({ onLogin }) => {
  const navigate = useNavigate();

  return (
    <AuthLayout>
      <LoginForm
        onSuccess={(user, token) => {
          onLogin(user, token);
          navigate('/');
        }}
        onCancel={() => {
          // stay on login page
        }}
      />
    </AuthLayout>
  );
};

export default LoginPage;

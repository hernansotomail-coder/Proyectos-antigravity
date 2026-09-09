import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';

export default function Login({ children }) {
  const { isAuthenticated, login } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    const success = login(username, password);
    if (success) {
      toast.success('Sesión iniciada correctamente');
    } else {
      toast.error('Credenciales incorrectas');
    }
  };

  if (isAuthenticated) {
    return children;
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-100px)]">
      <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-100 w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-100 p-4 rounded-full text-blue-600">
            <ShieldCheck size={48} />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Acceso Restringido</h2>
        <p className="text-slate-500 mb-8">Ingresa tus credenciales de administrador para continuar.</p>
        
        <form onSubmit={handleLogin} className="space-y-4 text-left">
          <Input 
            label="Usuario" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
          <Input 
            type="password"
            label="Contraseña" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <div className="pt-4">
            <Button type="submit" className="w-full h-12 text-lg">
              Iniciar Sesión
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { toast } from 'sonner';
import { ShieldCheck, Lock, ArrowRight, User } from 'lucide-react';

export default function Login({ children }) {
  const { isAuthenticated, login } = useAuthStore();
  const [lockedUser, setLockedUser] = useState(() => sessionStorage.getItem('keylogistics_locked_username') || '');
  const [username, setUsername] = useState(() => sessionStorage.getItem('keylogistics_locked_username') || '');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const savedLocked = sessionStorage.getItem('keylogistics_locked_username');
    if (savedLocked) {
      setLockedUser(savedLocked);
      setUsername(savedLocked);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    const success = await login(username, password);
    setIsLoading(false);
    
    if (success) {
      sessionStorage.removeItem('keylogistics_locked_username');
      setLockedUser('');
      toast.success(lockedUser ? 'Sesión desbloqueada correctamente' : 'Sesión iniciada correctamente');
    } else {
      toast.error('Credenciales incorrectas');
    }
  };

  const handleSwitchUser = () => {
    sessionStorage.removeItem('keylogistics_locked_username');
    setLockedUser('');
    setUsername('');
    setPassword('');
  };

  if (isAuthenticated) {
    return children;
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-100px)] p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-md text-center animate-in fade-in duration-300">
        
        {lockedUser ? (
          <>
            <div className="flex justify-center mb-4">
              <div className="bg-amber-100 p-4 rounded-full text-amber-600 shadow-inner">
                <Lock size={44} />
              </div>
            </div>
            <span className="inline-block text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-3 py-1 rounded-full mb-2 border border-amber-200">
              Bloqueo por Inactividad (10 min)
            </span>
            <h2 className="text-2xl font-black text-slate-800 mb-1">Sesión Bloqueada</h2>
            <p className="text-xs text-slate-500 mb-6">
              Hola <strong className="font-bold text-slate-800">{lockedUser}</strong>, por seguridad tu sesión se suspendió tras 10 minutos sin actividad. Ingresa tu contraseña para reanudar.
            </p>
            
            <form onSubmit={handleLogin} className="space-y-4 text-left">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <User size={14} className="text-slate-400" />
                  <span>Usuario: <strong className="font-bold text-slate-800">{lockedUser}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={handleSwitchUser}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                >
                  Cambiar cuenta
                </button>
              </div>

              <Input 
                type="password"
                label="Contraseña de Desbloqueo" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
              />

              <div className="pt-2">
                <Button type="submit" className="w-full h-11 text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-2" disabled={isLoading}>
                  {isLoading ? 'Desbloqueando...' : (
                    <>
                      <span>Desbloquear y Continuar</span>
                      <ArrowRight size={15} />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="flex justify-center mb-6">
              <div className="bg-blue-100 p-4 rounded-full text-blue-600">
                <ShieldCheck size={48} />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Acceso Restringido</h2>
            <p className="text-slate-500 mb-8">Ingresa tus credenciales para continuar.</p>
            
            <form onSubmit={handleLogin} className="space-y-4 text-left">
              <Input 
                label="Usuario" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="Nombre de usuario"
              />
              <Input 
                type="password"
                label="Contraseña" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Contraseña"
              />
              <div className="pt-4">
                <Button type="submit" className="w-full h-12 text-lg font-bold" disabled={isLoading}>
                  {isLoading ? 'Iniciando...' : 'Iniciar Sesión'}
                </Button>
              </div>
            </form>
          </>
        )}

      </div>
    </div>
  );
}

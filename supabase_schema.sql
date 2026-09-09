-- Copia y pega esto en el SQL Editor de tu Dashboard de Supabase para crear las tablas

-- Tabla de Dotación (staff)
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rut TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Conductor', 'Auxiliar', 'Movilizador')),
    status TEXT NOT NULL DEFAULT 'Activo' CHECK (status IN ('Activo', 'Inactivo')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security) - Por ahora permitimos todo para desarrollo
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todo a staff anonimo" ON public.staff FOR ALL USING (true);


-- Tabla de Asistencia (attendance)
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    service_type TEXT NOT NULL CHECK (service_type IN ('Trabajando', 'Licencia', 'Disponible', 'Ausente', 'Vacaciones', 'Baja', 'Permiso con goce', 'Permiso sin goce')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(staff_id, date) -- Evita registrar doble asistencia en un mismo día para la misma persona
);

-- Habilitar RLS (Row Level Security) - Por ahora permitimos todo para desarrollo
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todo a attendance anonimo" ON public.attendance FOR ALL USING (true);

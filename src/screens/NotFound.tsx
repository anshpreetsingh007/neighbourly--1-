import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Button, GlassCard } from '../components/UI';
import { Compass } from 'lucide-react';

export const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-md w-full"
      >
        <GlassCard className="p-10 space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-amber-accent rounded-2xl flex items-center justify-center shadow-xl shadow-amber-500/20">
              <Compass className="text-slate-900 w-8 h-8" />
            </div>
          </div>
          <div>
            <h1 className="text-4xl font-display font-bold mb-2">404</h1>
            <p className="text-white/50">This page doesn't exist, or it moved.</p>
          </div>
          <Button className="w-full" onClick={() => navigate('/')}>Back to Home</Button>
        </GlassCard>
      </motion.div>
    </div>
  );
};

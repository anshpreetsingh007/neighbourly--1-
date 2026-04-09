import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Button, GlassCard } from '../../components/UI';
import { Shield, MapPin, Hammer } from 'lucide-react';

export const Welcome: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-md w-full"
      >
        <div className="mb-8 flex justify-center">
          <div className="w-20 h-20 bg-amber-accent rounded-3xl flex items-center justify-center shadow-2xl shadow-amber-500/20">
            <Hammer className="text-slate-900 w-10 h-10" />
          </div>
        </div>

        <h1 className="text-5xl font-display font-bold mb-4 tracking-tight">
          Neighbourly
        </h1>
        <p className="text-white/60 text-lg mb-12">
          The hyperlocal handyman marketplace for your community.
        </p>

        <div className="space-y-4">
          <GlassCard className="p-4 flex items-start gap-4 text-left">
            <div className="bg-emerald-status/20 p-2 rounded-lg">
              <Shield className="text-emerald-status w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold">Secure Escrow</h3>
              <p className="text-sm text-white/50">Payments are held safely until the job is done.</p>
            </div>
          </GlassCard>

          <GlassCard className="p-4 flex items-start gap-4 text-left">
            <div className="bg-sky-status/20 p-2 rounded-lg">
              <MapPin className="text-sky-status w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold">Hyperlocal</h3>
              <p className="text-sm text-white/50">Find help right in your own neighbourhood.</p>
            </div>
          </GlassCard>
        </div>

        <div className="mt-12 space-y-4">
          <Button 
            className="w-full" 
            size="lg"
            onClick={() => navigate('/sign-in')}
          >
            Get Started
          </Button>
          <Button 
            variant="secondary" 
            className="w-full" 
            size="lg"
            onClick={() => navigate('/sign-in')}
          >
            Sign In
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

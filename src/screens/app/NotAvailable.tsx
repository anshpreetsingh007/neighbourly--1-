import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { GlassCard, Button } from '../../components/UI';
import { ChevronLeft, Construction } from 'lucide-react';

const COPY: Record<string, { title: string; description: string }> = {
  '/account/payments': {
    title: 'Payments & Payouts',
    description: "This isn't set up yet. Neighbourly doesn't process real payments or payouts until Stripe is connected and configured.",
  },
  '/account/verification': {
    title: 'ID Verification',
    description: "This isn't set up yet. Identity verification will run through a third-party provider once it's connected.",
  },
  '/account/devices': {
    title: 'Connected Devices',
    description: "This isn't set up yet. There's no session/device tracking built in the app right now.",
  },
};

export const NotAvailable: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const copy = COPY[location.pathname] || {
    title: 'Coming Soon',
    description: "This feature isn't available yet.",
  };

  return (
    <div className="p-6 min-h-screen flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <GlassCard className="p-10 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
              <Construction className="w-8 h-8 text-white/40" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold mb-2">{copy.title}</h1>
            <p className="text-white/50 text-sm leading-relaxed">{copy.description}</p>
          </div>
          <Button variant="secondary" className="w-full gap-2" onClick={() => navigate('/account')}>
            <ChevronLeft className="w-4 h-4" />
            Back to Account
          </Button>
        </GlassCard>
      </motion.div>
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { formatMoney } from '../../lib/money';
import { formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';
import {
  Briefcase,
  Check,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  MapPin,
  MessageSquare,
  Users,
} from 'lucide-react';
import { GlassCard, Button } from '../../components/UI';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Avatar } from '../../components/Avatar';
import { useToast } from '../../components/Toast';

/**
 * date-fns throws on an invalid date, and an uncaught throw during render
 * blanks the whole app. Never let a bad timestamp take the page down.
 */
const relativeTime = (value: unknown) => {
  try {
    if (!value) return 'recently';
    const date = new Date(value as string);
    if (Number.isNaN(date.getTime())) return 'recently';
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return 'recently';
  }
};

const STATUS_STYLES: Record<string, string> = {
  ACCEPTED: 'bg-emerald-status/20 text-emerald-status border-emerald-status/30',
  REJECTED: 'bg-surface-1 text-faint border-hairline',
  PENDING: 'bg-amber-accent/15 text-amber-accent border-amber-accent/30',
};

export const MyJobs: React.FC = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [pendingHire, setPendingHire] = useState<{ jobId: string; application: any } | null>(null);
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const { showToast } = useToast();

  const loadJobs = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/jobs/mine');
      setJobs(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load your jobs:', err);
      setError('Could not load your jobs. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleMessage = async (job: any, application: any) => {
    setMessagingId(application.id);
    try {
      const { data: me } = await axios.get('/api/users/me');
      const { data: conversation } = await axios.post('/api/conversations', {
        job_id: job.id,
        participant_ids: [me.id, application.helper_id],
      });
      navigate(`/chat/${conversation.id}`);
    } catch (err) {
      console.error('Failed to open conversation:', err);
      showToast('Could not open that conversation. Please try again.', 'error');
    } finally {
      setMessagingId(null);
    }
  };

  const handleAccept = async (jobId: string, application: any) => {
    setAcceptingId(application.id);
    try {
      await axios.post(`/api/jobs/${jobId}/applications/${application.id}/accept`);
      await loadJobs();
      setPendingHire(null);
    } catch (err: any) {
      console.error('Failed to accept application:', err);
      setError(err.response?.data?.error || 'Could not accept that application.');
      setPendingHire(null);
    } finally {
      setAcceptingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 opacity-50">
        <Loader2 className="w-8 h-8 text-amber-accent animate-spin" />
        <p className="text-sm font-bold uppercase tracking-widest">Loading your jobs…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate('/account')}
          aria-label="Back to account"
          className="p-2.5 rounded-2xl bg-surface-1 border border-hairline hover:bg-surface-2 transition-all active:scale-90"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-display font-bold">Your Jobs</h1>
          <p className="text-muted text-sm font-medium">Review who applied and pick someone</p>
        </div>
      </header>

      {error && (
        <div className="bg-rose-status/20 border border-rose-status/40 text-rose-status p-4 rounded-2xl text-sm font-medium">
          {error}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-30">
          <Briefcase className="w-16 h-16" />
          <p className="font-bold uppercase tracking-widest text-sm">You haven't posted any jobs</p>
          <Button onClick={() => navigate('/post-job')} className="mt-2">
            Post a job
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {jobs.map((job) => {
            const applications = job.applications || [];
            const accepted = applications.find((a: any) => a.status === 'ACCEPTED');

            return (
              <GlassCard key={job.id} className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-lg truncate">{job.title}</h2>
                    <p className="text-muted text-xs font-medium flex items-center gap-1.5 mt-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{job.address || 'Location hidden'}</span>
                    </p>
                  </div>
                  <span
                    className={clsx(
                      'shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border',
                      job.status === 'OPEN'
                        ? 'bg-sky-status/15 text-sky-status border-sky-status/30'
                        : 'bg-emerald-status/20 text-emerald-status border-emerald-status/30'
                    )}
                  >
                    {job.status}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-muted text-xs font-bold uppercase tracking-widest">
                  <Users className="w-3.5 h-3.5" />
                  {applications.length === 0
                    ? 'No applicants yet'
                    : `${applications.length} applicant${applications.length === 1 ? '' : 's'}`}
                </div>

                {applications.length > 0 && (
                  <div className="space-y-3 pt-1">
                    {applications.map((application: any) => (
                      <motion.div
                        key={application.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={clsx(
                          'rounded-2xl p-4 border bg-surface-1',
                          application.status === 'ACCEPTED'
                            ? 'border-emerald-status/30'
                            : 'border-hairline',
                          application.status === 'REJECTED' && 'opacity-40'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={application.helper?.name}
                            avatarUrl={application.helper?.avatar_url}
                            seed={application.helper_id}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold truncate">
                              {application.helper?.name || 'Neighbour'}
                            </p>
                            <p className="text-faint text-[11px] font-medium">
                              Applied {relativeTime(application.created_at)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-display font-bold text-amber-accent text-lg">
                              {formatMoney(application.proposed_price)}
                            </p>
                            <span
                              className={clsx(
                                'text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border',
                                STATUS_STYLES[application.status] || STATUS_STYLES.PENDING
                              )}
                            >
                              {application.status}
                            </span>
                          </div>
                        </div>

                        {application.message && (
                          <p className="text-muted text-sm mt-3 leading-relaxed">
                            {application.message}
                          </p>
                        )}

                        <div className="flex gap-2 mt-4">
                          <Button
                            variant="secondary"
                            className="flex-1 text-xs py-3 rounded-xl border border-hairline"
                            isLoading={messagingId === application.id}
                            onClick={() => handleMessage(job, application)}
                          >
                            <MessageSquare className="w-4 h-4 mr-2" /> Message
                          </Button>

                          {application.status === 'ACCEPTED' ? (
                            <div className="flex-1 flex items-center justify-center gap-2 text-emerald-status text-xs font-bold uppercase tracking-widest">
                              <CheckCircle2 className="w-4 h-4" /> Hired
                            </div>
                          ) : (
                            <Button
                              className="flex-1 text-xs py-3 rounded-xl"
                              disabled={!!accepted || acceptingId === application.id}
                              isLoading={acceptingId === application.id}
                              onClick={() => setPendingHire({ jobId: job.id, application })}
                            >
                              <Check className="w-4 h-4 mr-2" /> Hire
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      {pendingHire && (
        <ConfirmDialog
          title={`Hire ${pendingHire.application.helper?.name || 'this neighbour'}?`}
          body={`They'll be paid ${formatMoney(pendingHire.application.proposed_price)}. Everyone else who applied will be declined, and this person will be shown the exact address.`}
          confirmLabel="Hire them"
          onCancel={() => setPendingHire(null)}
          onConfirm={() => handleAccept(pendingHire.jobId, pendingHire.application)}
        />
      )}
    </div>
  );
};

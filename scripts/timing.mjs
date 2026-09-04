/**
 * Times each remote call in requireAuth separately, so we stop guessing which
 * one owns the ~800ms. Run with: $env:TOKEN="..."; node scripts/timing.mjs
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('Set TOKEN first.');
  process.exit(1);
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);
const prisma = new PrismaClient();

const ROUNDS = 10;

async function time(label, fn) {
  const samples = [];
  for (let i = 0; i < ROUNDS; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  console.log(
    `  ${label.padEnd(34)} median ${median.toFixed(0).padStart(5)} ms   ` +
    `min ${samples[0].toFixed(0)}  max ${samples[samples.length - 1].toFixed(0)}`
  );
  return median;
}

console.log(`\nEach call, ${ROUNDS} times:\n`);

// The first call of each kind pays connection setup, so warm up first and
// leave it out of the numbers.
await supabase.auth.getUser(TOKEN);
await prisma.$queryRaw`SELECT 1`;

const auth = await time('supabase.auth.getUser(token)', () => supabase.auth.getUser(TOKEN));
const ping = await time('prisma SELECT 1 (round trip only)', () => prisma.$queryRaw`SELECT 1`);
const user = await time('prisma findUnique(User)', () =>
  prisma.user.findFirst({ where: { supabase_uid: { not: '' } } })
);
const jobs = await time('prisma Job.findMany (the feed)', () =>
  prisma.job.findMany({ where: { status: 'OPEN' }, include: { photos: true, poster: true }, take: 20 })
);

console.log(`\n  ${'≈ total per /api/jobs request'.padEnd(34)} ${(auth + user + jobs).toFixed(0)} ms`);
console.log(`  ${'of which pure network (SELECT 1)'.padEnd(34)} ${ping.toFixed(0)} ms per DB call\n`);

await prisma.$disconnect();

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    try {
        const users = await prisma.user.findMany();
        console.log('USERS_JSON:' + JSON.stringify(users));

        const jobs = await prisma.job.findMany();
        console.log('JOBS_JSON:' + JSON.stringify(jobs));
    } catch (err) {
        console.error('Check failed:', err);
    } finally {
        await prisma.$disconnect();
    }
}

check();

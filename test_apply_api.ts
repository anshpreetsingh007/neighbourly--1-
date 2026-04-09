import axios from 'axios';

async function testApply() {
    try {
        // Find a job first
        const { data: jobs } = await axios.get('http://localhost:3000/api/jobs');
        if (jobs.length === 0) {
            console.log('No jobs found to test application.');
            return;
        }

        const job = jobs[0];
        console.log('Testing apply for job:', job.id);

        const applyData = {
            helper_supabase_uid: 'test-user-uuid',
            proposed_price: job.budget_min
        };

        const res = await axios.post(`http://localhost:3000/api/jobs/${job.id}/apply`, applyData);
        console.log('Apply Success:', res.status, res.data);
    } catch (err: any) {
        console.error('Apply Failed:', err.response?.status, err.response?.data || err.message);
    }
}

testApply();

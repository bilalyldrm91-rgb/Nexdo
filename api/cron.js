export default async function handler(req, res) {
  // Vercel cron veya manuel tetikleme için
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !supabaseKey || !resendKey) {
    return res.status(500).json({ error: 'Eksik environment variables' });
  }

  try {
    // Yarın deadline olan görevleri getir
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const tasksRes = await fetch(
      `${supabaseUrl}/rest/v1/tasks?deadline=eq.${tomorrowStr}&status=neq.tamamlandi&status=neq.iptal&select=*`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
    );
    const tasks = await tasksRes.json();

    if (!tasks.length) {
      return res.status(200).json({ message: 'Yarın deadline olan görev yok', count: 0 });
    }

    // Her görev için atanan kişileri getir ve mail at
    let sent = 0;
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

    for (const task of tasks) {
      // Atanan kişileri getir
      const assigneesRes = await fetch(
        `${supabaseUrl}/rest/v1/task_assignees?task_id=eq.${task.id}&select=*`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      );
      const assignees = await assigneesRes.json();

      for (const assignee of assignees) {
        if (!assignee.user_email || !assignee.user_email.includes('@')) continue;

        // Daha önce bu gün bildirim gönderildi mi kontrol et
        const today = new Date().toISOString().split('T')[0];
        const logRes = await fetch(
          `${supabaseUrl}/rest/v1/notifications_log?task_id=eq.${task.id}&user_email=eq.${assignee.user_email}&type=eq.deadline&sent_at=gte.${today}T00:00:00`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
        );
        const logs = await logRes.json();
        if (logs.length > 0) continue; // Zaten gönderilmiş

        // Mail gönder
        const emailRes = await fetch(`${baseUrl}/api/notify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'deadline',
            to: assignee.user_email,
            taskTitle: task.title,
            deadline: task.deadline,
            priority: task.priority
          })
        });

        if (emailRes.ok) {
          // Log kaydet
          await fetch(`${supabaseUrl}/rest/v1/notifications_log`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              task_id: task.id,
              user_email: assignee.user_email,
              type: 'deadline'
            })
          });
          sent++;
        }
      }
    }

    return res.status(200).json({ success: true, emailsSent: sent, tasksChecked: tasks.length });

  } catch (e) {
    return res.status(500).json({ error: 'Cron hatası: ' + e.message });
  }
}

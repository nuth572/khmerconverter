/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const GM_API = 'https://api.guerrillamail.com/ajax.php';
const GM_AGENT = 'KhmerSubAI_BrowserApp';

export interface Mailbox {
  id: string;
  address: string;
  sidToken: string;
  createdAt: number;
  unread: number;
  expired?: boolean;
}

export interface MailMessage {
  id: string;
  from: string;
  subject: string;
  excerpt: string;
  body: string;
  date: string;
  timestamp: number;
  read: boolean;
  contentType: string;
}

async function gmRequest(func: string, params: Record<string, string> = {}): Promise<any> {
  const q = new URLSearchParams({ f: func, agent: GM_AGENT, ...params });
  const res = await fetch(`${GM_API}?${q.toString()}`);
  if (!res.ok) throw new Error(`Mail server error (${res.status})`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function createNewMailbox(customUsername?: string): Promise<Mailbox> {
  const data = await gmRequest('get_email_address');
  if (!data || !data.email_addr) throw new Error('Could not generate disposable email address.');

  let address = data.email_addr;
  let sidToken = data.sid_token;

  const clean = (customUsername || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (clean) {
    const domain = address.split('@')[1] || 'sharklasers.com';
    try {
      const renamed = await gmRequest('set_email_user', {
        email_user: clean,
        email_domain: domain,
        sid_token: sidToken,
        lang: 'en',
      });
      if (renamed && renamed.email_addr) {
        address = renamed.email_addr;
        sidToken = renamed.sid_token || sidToken;
      }
    } catch {
      // Keep original address if rename fails
    }
  }

  return {
    id: 'mb_' + Date.now() + Math.random().toString(36).slice(2, 6),
    address,
    sidToken,
    createdAt: Date.now(),
    unread: 0,
  };
}

export async function checkMailboxMessages(mailbox: Mailbox): Promise<{ messages: MailMessage[]; expired: boolean }> {
  try {
    const data = await gmRequest('check_email', { seq: '0', sid_token: mailbox.sidToken });
    if (!data || data.error) {
      return { messages: [], expired: true };
    }

    const list: MailMessage[] = (data.list || []).map((m: any) => ({
      id: String(m.mail_id),
      from: m.mail_from || 'Unknown',
      subject: m.mail_subject || '(no subject)',
      excerpt: (m.mail_excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      body: m.mail_body || '',
      date: m.mail_date || '',
      timestamp: m.mail_timestamp || 0,
      read: !!m.mail_read,
      contentType: m.content_type || 'text',
    }));

    return { messages: list, expired: false };
  } catch {
    return { messages: [], expired: false };
  }
}

export async function fetchFullEmail(mailbox: Mailbox, mailId: string): Promise<string> {
  try {
    const data = await gmRequest('fetch_email', { email_id: mailId, sid_token: mailbox.sidToken });
    return data?.mail_body || '';
  } catch {
    return '';
  }
}

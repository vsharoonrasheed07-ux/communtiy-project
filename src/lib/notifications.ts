import { prisma } from '@/lib/prisma';

export interface SmsSendParams {
  to: string;
  body: string;
  channel: 'SMS' | 'WHATSAPP';
  studentId?: string;
}

export interface SmsProvider {
  name: string;
  send(params: SmsSendParams): Promise<{ ok: boolean; externalId?: string }>;
}

class MockSmsProvider implements SmsProvider {
  name = 'mock';

  async send(params: SmsSendParams) {
    const externalId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await prisma.communicationLog.create({
      data: {
        provider: this.name,
        channel: params.channel,
        recipient: params.to,
        studentId: params.studentId ?? null,
        body: params.body,
        status: 'LOGGED_MOCK',
        externalId,
      },
    });
    return { ok: true, externalId };
  }
}

class TwilioSmsProvider implements SmsProvider {
  name = 'twilio';

  async send(params: SmsSendParams) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from =
      params.channel === 'WHATSAPP'
        ? process.env.TWILIO_WHATSAPP_FROM
        : process.env.TWILIO_FROM_NUMBER;

    if (!sid || !token || !from) {
      throw new Error('Twilio environment variables are not fully configured');
    }

    const toFormatted = params.channel === 'WHATSAPP' ? `whatsapp:${params.to}` : params.to;
    const authHeader = Buffer.from(`${sid}:${token}`).toString('base64');
    const form = new URLSearchParams({
      To: toFormatted,
      From: from,
      Body: params.body,
    });

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const data = (await res.json()) as { sid?: string; message?: string };
    const status = res.ok ? 'SENT' : 'FAILED';
    await prisma.communicationLog.create({
      data: {
        provider: this.name,
        channel: params.channel,
        recipient: params.to,
        studentId: params.studentId ?? null,
        body: params.body,
        status,
        externalId: data.sid ?? null,
      },
    });
    return { ok: res.ok, externalId: data.sid };
  }
}

class Msg91SmsProvider implements SmsProvider {
  name = 'msg91';

  async send(params: SmsSendParams) {
    const authKey = process.env.MSG91_AUTH_KEY;
    const senderId = process.env.MSG91_SENDER_ID || 'STAYIN';
    const templateId = process.env.MSG91_TEMPLATE_ID || '';

    if (!authKey) {
      throw new Error('MSG91_AUTH_KEY is not configured');
    }

    const res = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        authkey: authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_id: templateId,
        sender: senderId,
        short_url: '0',
        mobiles: params.to.replace(/^\+/, ''),
        message: params.body,
      }),
    });

    const data = (await res.json()) as { request_id?: string };
    await prisma.communicationLog.create({
      data: {
        provider: this.name,
        channel: params.channel,
        recipient: params.to,
        studentId: params.studentId ?? null,
        body: params.body,
        status: res.ok ? 'SENT' : 'FAILED',
        externalId: data.request_id ?? null,
      },
    });
    return { ok: res.ok, externalId: data.request_id };
  }
}

export function getSmsProvider(): SmsProvider {
  const choice = (process.env.SMS_PROVIDER || 'mock').toLowerCase();
  if (choice === 'twilio') return new TwilioSmsProvider();
  if (choice === 'msg91') return new Msg91SmsProvider();
  return new MockSmsProvider();
}

export interface EmailSendParams {
  to: string;
  subject: string;
  body: string;
}

export interface EmailProvider {
  name: string;
  send(params: EmailSendParams): Promise<{ ok: boolean; externalId?: string }>;
}

class MockEmailProvider implements EmailProvider {
  name = 'email-mock';

  async send(params: EmailSendParams) {
    const externalId = `email-mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await prisma.communicationLog.create({
      data: {
        provider: this.name,
        channel: 'EMAIL',
        recipient: params.to,
        subject: params.subject,
        body: params.body,
        status: 'LOGGED_MOCK',
        externalId,
      },
    });
    return { ok: true, externalId };
  }
}

class ResendEmailProvider implements EmailProvider {
  name = 'resend';

  async send(params: EmailSendParams) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || 'noreply@stayinschool.org';
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        text: params.body,
      }),
    });

    const data = (await res.json()) as { id?: string };
    await prisma.communicationLog.create({
      data: {
        provider: this.name,
        channel: 'EMAIL',
        recipient: params.to,
        subject: params.subject,
        body: params.body,
        status: res.ok ? 'SENT' : 'FAILED',
        externalId: data.id ?? null,
      },
    });
    return { ok: res.ok, externalId: data.id };
  }
}

export function getEmailProvider(): EmailProvider {
  const choice = (process.env.EMAIL_PROVIDER || 'mock').toLowerCase();
  if (choice === 'resend') return new ResendEmailProvider();
  return new MockEmailProvider();
}

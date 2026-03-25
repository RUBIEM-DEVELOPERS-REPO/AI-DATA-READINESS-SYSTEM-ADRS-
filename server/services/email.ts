import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { storage } from "../storage";

const ENV_HOST = process.env.SMTP_HOST;
const ENV_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : undefined;
const ENV_USER = process.env.SMTP_USER ?? "";
const ENV_PASS = process.env.SMTP_PASS ?? "";
const ENV_FROM_NAME = process.env.EMAIL_FROM_NAME ?? "ADRS Platform – AI Institute Africa";
const ENV_FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS ?? "";

let _transport: Transporter | null = null;
let _fromEmail = "";
let _fromName = ENV_FROM_NAME;
let _etherealReady = false;

// Reset cached transport (called after saving new config)
export function resetEmailTransport() {
  _transport = null;
  _fromEmail = "";
  _etherealReady = false;
}

async function loadSmtpConfig(): Promise<{ host: string; port: number; user: string; pass: string; fromEmail: string; fromName: string } | null> {
  // Env vars take priority
  if (ENV_USER && ENV_PASS) {
    return {
      host: ENV_HOST ?? "smtp.gmail.com",
      port: ENV_PORT ?? 587,
      user: ENV_USER,
      pass: ENV_PASS,
      fromEmail: ENV_FROM_EMAIL || ENV_USER,
      fromName: ENV_FROM_NAME,
    };
  }
  // Fall back to DB config
  try {
    const cfg = await storage.getAllSystemConfig();
    const user = cfg["smtp_user"] ?? "";
    const pass = cfg["smtp_pass"] ?? "";
    if (user && pass) {
      return {
        host: cfg["smtp_host"] ?? "smtp.gmail.com",
        port: parseInt(cfg["smtp_port"] ?? "587"),
        user,
        pass,
        fromEmail: cfg["smtp_from_email"] || user,
        fromName: cfg["smtp_from_name"] ?? ENV_FROM_NAME,
      };
    }
  } catch { /* storage not ready */ }
  return null;
}

async function getTransport(): Promise<Transporter> {
  if (_transport) return _transport;

  const cfg = await loadSmtpConfig();
  if (cfg) {
    _transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    _fromEmail = cfg.fromEmail;
    _fromName = cfg.fromName;
    _etherealReady = false;
    console.log(`[EMAIL] Using SMTP: ${cfg.host}:${cfg.port} as ${cfg.user}`);
    return _transport;
  }

  // Auto-create Ethereal test account
  try {
    const testAccount = await nodemailer.createTestAccount();
    _transport = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    _fromEmail = testAccount.user;
    _etherealReady = true;
    console.log("[EMAIL] Ethereal test account created — emails will NOT be delivered to real inboxes.");
    console.log(`[EMAIL] View sent messages at: https://ethereal.email (login: ${testAccount.user} / ${testAccount.pass})`);
    return _transport;
  } catch (err) {
    console.error("[EMAIL] Failed to create Ethereal account:", err);
    throw err;
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ previewUrl?: string }> {
  try {
    const transport = await getTransport();
    const info = await transport.sendMail({
      from: `"${_fromName}" <${_fromEmail}>`,
      to,
      subject,
      html,
    });
    if (_etherealReady) {
      const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      console.log(`[EMAIL] Sent to ${to} — preview: ${previewUrl}`);
      return { previewUrl: previewUrl ?? undefined };
    }
    console.log(`[EMAIL] Sent to ${to} — messageId: ${info.messageId}`);
    return {};
  } catch (err) {
    console.error("[EMAIL] Failed to send email:", err);
    return {};
  }
}

export async function testSmtpConnection(): Promise<{ ok: boolean; error?: string }> {
  // Reset so we re-load config
  resetEmailTransport();
  try {
    const transport = await getTransport();
    if (_etherealReady) return { ok: false, error: "No SMTP credentials configured — using test mode" };
    await transport.verify();
    return { ok: true };
  } catch (err: any) {
    resetEmailTransport();
    return { ok: false, error: err?.message ?? "Connection failed" };
  }
}

export async function sendAccessApprovedEmail(opts: {
  to: string;
  firstName: string;
  username: string;
  tempPassword: string;
  role: string;
}): Promise<{ previewUrl?: string }> {
  const subject = "Your ADRS Access Request has been Approved";
  const html = `
  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 32px; border-radius: 12px;">
    <div style="background: white; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
      <div style="margin-bottom: 24px;">
        <h1 style="color: #111827; font-size: 22px; margin: 0 0 4px 0;">Access Request Approved</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 0;">AI Data Readiness System (ADRS)</p>
      </div>
      <p style="color: #374151; font-size: 15px;">Hi <strong>${opts.firstName}</strong>,</p>
      <p style="color: #374151; font-size: 15px;">
        Your access request has been approved. Your account is ready. Here are your temporary login credentials:
      </p>
      <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #3b82f6;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 13px; width: 40%;">Username</td>
            <td style="padding: 6px 0; color: #111827; font-size: 13px; font-weight: 600; font-family: monospace;">${opts.username}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Temporary Password</td>
            <td style="padding: 6px 0; color: #111827; font-size: 13px; font-weight: 600; font-family: monospace;">${opts.tempPassword}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Role</td>
            <td style="padding: 6px 0; color: #111827; font-size: 13px; font-weight: 600;">${opts.role.replace("_", " ")}</td>
          </tr>
        </table>
      </div>
      <div style="background: #fef3c7; border-radius: 8px; padding: 16px; margin: 16px 0; border: 1px solid #f59e0b;">
        <p style="color: #92400e; font-size: 13px; margin: 0;">
          <strong>Important:</strong> For security, please change your password immediately after signing in. This temporary password expires in 48 hours.
        </p>
      </div>
      <p style="color: #374151; font-size: 14px;">Sign in at your organisation's ADRS platform and navigate to your profile to update your password.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">AI Institute Africa · ADRS Platform · Tenant TENANT-001</p>
    </div>
  </div>
  `;
  return sendEmail(opts.to, subject, html);
}

export async function sendAccessRejectedEmail(opts: {
  to: string;
  firstName: string;
  rejectionReason?: string;
}): Promise<{ previewUrl?: string }> {
  const subject = "Update on Your ADRS Access Request";
  const html = `
  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 32px; border-radius: 12px;">
    <div style="background: white; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
      <div style="margin-bottom: 24px;">
        <h1 style="color: #111827; font-size: 22px; margin: 0 0 4px 0;">Access Request Update</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 0;">AI Data Readiness System (ADRS)</p>
      </div>
      <p style="color: #374151; font-size: 15px;">Hi <strong>${opts.firstName}</strong>,</p>
      <p style="color: #374151; font-size: 15px;">
        Thank you for your interest in the ADRS platform. Unfortunately, we are unable to approve your access request at this time.
      </p>
      ${opts.rejectionReason ? `
      <div style="background: #fef2f2; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid #ef4444;">
        <p style="color: #7f1d1d; font-size: 13px; margin: 0 0 4px 0; font-weight: 600;">Reason:</p>
        <p style="color: #991b1b; font-size: 13px; margin: 0;">${opts.rejectionReason}</p>
      </div>
      ` : ""}
      <p style="color: #374151; font-size: 14px;">If you believe this was an error, please reach out to your system administrator.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">AI Institute Africa · ADRS Platform · Tenant TENANT-001</p>
    </div>
  </div>
  `;
  return sendEmail(opts.to, subject, html);
}

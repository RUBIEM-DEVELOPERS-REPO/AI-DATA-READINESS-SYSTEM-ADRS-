import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST ?? "smtp.ethereal.email";
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "587");
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const FROM_NAME = process.env.EMAIL_FROM_NAME ?? "ADRS Platform – AI Institute Africa";
const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS ?? "noreply@aiinstituteafrica.org";

function makeTransport() {
  if (SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return null;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const transport = makeTransport();
  if (!transport) {
    console.log(`[EMAIL] SMTP not configured — would send to: ${to}`);
    console.log(`[EMAIL] Subject: ${subject}`);
    return;
  }
  try {
    await transport.sendMail({ from: `"${FROM_NAME}" <${FROM_EMAIL}>`, to, subject, html });
  } catch (err) {
    console.error("[EMAIL] Failed to send email:", err);
  }
}

export async function sendAccessApprovedEmail(opts: {
  to: string;
  firstName: string;
  username: string;
  tempPassword: string;
  role: string;
}): Promise<void> {
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

      <p style="color: #374151; font-size: 14px;">
        Sign in at your organisation's ADRS platform and navigate to your profile to update your password.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">AI Institute Africa · ADRS Platform · Tenant TENANT-001</p>
    </div>
  </div>
  `;
  await sendEmail(opts.to, subject, html);
}

export async function sendAccessRejectedEmail(opts: {
  to: string;
  firstName: string;
  rejectionReason?: string;
}): Promise<void> {
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

      <p style="color: #374151; font-size: 14px;">
        If you believe this was an error or have additional information to provide, please reach out to your system administrator.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">AI Institute Africa · ADRS Platform · Tenant TENANT-001</p>
    </div>
  </div>
  `;
  await sendEmail(opts.to, subject, html);
}

/**
 * VETRA-PH1: Email templates for notification types.
 * Each returns { subject, text, html? }.
 */

interface EmailTemplate {
  subject: string;
  text: string;
  html?: string;
}

export function renderTaskAssignedEmail(taskTitle: string, projectName: string, link: string): EmailTemplate {
  return {
    subject: `وظیفه جدید: ${taskTitle}`,
    text: `وظیفه "${taskTitle}" در پروژه "${projectName}" به شما محول شد.\n\nمشاهده: ${link}`,
    html: `<p>وظیفه <strong>${taskTitle}</strong> در پروژه <strong>${projectName}</strong> به شما محول شد.</p><p><a href="${link}">مشاهده وظیفه</a></p>`,
  };
}

export function renderWorkflowApprovedEmail(entityTitle: string, link: string): EmailTemplate {
  return {
    subject: `درخواست شما تأیید شد: ${entityTitle}`,
    text: `درخواست "${entityTitle}" تأیید شد.\n\nمشاهده: ${link}`,
    html: `<p>درخواست <strong>${entityTitle}</strong> تأیید شد.</p><p><a href="${link}">مشاهده</a></p>`,
  };
}

export function renderWorkflowRejectedEmail(entityTitle: string, link: string): EmailTemplate {
  return {
    subject: `درخواست شما رد شد: ${entityTitle}`,
    text: `درخواست "${entityTitle}" رد شد.\n\nمشاهده: ${link}`,
    html: `<p>درخواست <strong>${entityTitle}</strong> رد شد.</p><p><a href="${link}">مشاهده</a></p>`,
  };
}

export function renderWorkflowRevisionRequestedEmail(entityTitle: string, link: string): EmailTemplate {
  return {
    subject: `درخواست بازبینی: ${entityTitle}`,
    text: `درخواست "${entityTitle}" نیاز به بازبینی دارد.\n\nمشاهده: ${link}`,
    html: `<p>درخواست <strong>${entityTitle}</strong> نیاز به بازبینی دارد.</p><p><a href="${link}">مشاهده</a></p>`,
  };
}

export function renderDocumentUploadedEmail(documentName: string, projectName: string, link: string): EmailTemplate {
  return {
    subject: `سند جدید: ${documentName}`,
    text: `سند "${documentName}" در پروژه "${projectName}" آپلود شد.\n\nمشاهده: ${link}`,
    html: `<p>سند <strong>${documentName}</strong> در پروژه <strong>${projectName}</strong> آپلود شد.</p><p><a href="${link}">مشاهده</a></p>`,
  };
}

export function renderPayrollPaidEmail(amount: string, period: string, link: string): EmailTemplate {
  return {
    subject: `حقوق پرداخت شد`,
    text: `حقوق شما برای دوره ${period} به مبلغ ${amount} پرداخت شد.\n\nمشاهده: ${link}`,
    html: `<p>حقوق شما برای دوره <strong>${period}</strong> به مبلغ <strong>${amount}</strong> پرداخت شد.</p><p><a href="${link}">مشاهده</a></p>`,
  };
}

export function renderLowStockEmail(materialName: string, currentStock: string, minStock: string, link: string): EmailTemplate {
  return {
    subject: `موجودی کم: ${materialName}`,
    text: `موجودی ${materialName} به ${currentStock} رسیده (حداقل: ${minStock}).\n\nمشاهده: ${link}`,
    html: `<p>موجودی <strong>${materialName}</strong> به <strong>${currentStock}</strong> رسیده است (حداقل: ${minStock}).</p><p><a href="${link}">مشاهده</a></p>`,
  };
}

export function renderWorkflowEscalatedEmail(entityTitle: string, link: string): EmailTemplate {
  return {
    subject: `تصعید گردش کار: ${entityTitle}`,
    text: `درخواست "${entityTitle}" به شما تصعید داده شد.\n\nمشاهده: ${link}`,
    html: `<p>درخواست <strong>${entityTitle}</strong> به شما تصعید داده شد.</p><p><a href="${link}">مشاهده</a></p>`,
  };
}

export function renderInvoiceDueEmail(invoiceNumber: string, amount: string, dueDate: string, link: string): EmailTemplate {
  return {
    subject: `سررسید فاکتور: ${invoiceNumber}`,
    text: `فاکتور ${invoiceNumber} به مبلغ ${amount} در تاریخ ${dueDate} سررسید می‌شود.\n\nمشاهده: ${link}`,
    html: `<p>فاکتور <strong>${invoiceNumber}</strong> به مبلغ <strong>${amount}</strong> در تاریخ <strong>${dueDate}</strong> سررسید می‌شود.</p><p><a href="${link}">مشاهده</a></p>`,
  };
}

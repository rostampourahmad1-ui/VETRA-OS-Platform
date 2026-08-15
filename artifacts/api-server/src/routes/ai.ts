import { Router } from "express";
import { requirePermission } from "../middlewares/permissions";
import { tenantId } from "../middlewares/tenant";

const router = Router();
router.post("/ai/assistant", requirePermission("ai.use"), async (req, res): Promise<void> => {
  const query = String(req.body?.query ?? "").trim();
  if (!query) { res.status(400).json({ error: "query is required" }); return; }
  if (process.env.OPENAI_API_KEY) {
    try {
      const base = (process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");
      const response = await fetch(`${base}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? "gpt-4o-mini", messages: [{ role: "system", content: `You are VETRA OS construction management assistant. Only discuss data for organization ${tenantId(req)} and do not invent records.` }, { role: "user", content: query }] }) });
      if (response.ok) { const data = await response.json() as any; res.json({ answer: data.choices?.[0]?.message?.content ?? "No answer generated.", source: "openai" }); return; }
    } catch { /* safe mock fallback */ }
  }
  res.json({ answer: `درخواست شما برای سازمان ${tenantId(req)} دریافت شد. این پاسخ آزمایشی است؛ برای پاسخ مبتنی بر داده‌های واقعی، OPENAI_API_KEY را تنظیم کنید.`, source: "mock" });
});
export default router;

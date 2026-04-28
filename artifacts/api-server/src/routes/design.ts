import { Router, type IRouter } from "express";
import { ReviewDesignBody, ReviewDesignResponse } from "@workspace/api-zod";
import { reviewDesign } from "../lib/design-reviewer";

const router: IRouter = Router();

router.post("/review-design", async (req, res): Promise<void> => {
  const parsed = ReviewDesignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = reviewDesign({
    architectureNotes: parsed.data.architectureNotes,
    systemName: parsed.data.systemName ?? null,
  });

  res.json(ReviewDesignResponse.parse(result));
});

export default router;
